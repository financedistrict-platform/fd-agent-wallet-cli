const assert = require('node:assert');
const { describe, it } = require('node:test');

const { MCPClient } = require('../src/mcp-client');

function mockAuthClient({ token = 'test-token', refreshFails = false } = {}) {
  let refreshCalled = false;
  return {
    getAccessToken: async () => token,
    refreshToken: async () => {
      refreshCalled = true;
      if (refreshFails) throw new Error('refresh failed');
      return 'refreshed-token';
    },
    get refreshCalled() {
      return refreshCalled;
    },
  };
}

function mockHttpClient(handler) {
  return { post: handler };
}

describe('MCPClient', () => {
  describe('constructor', () => {
    it('should throw if mcpServerUrl is missing', () => {
      assert.throws(() => new MCPClient({ authClient: {} }), /mcpServerUrl is required/);
    });

    it('should throw if authClient is missing', () => {
      assert.throws(
        () => new MCPClient({ mcpServerUrl: 'https://example.com' }),
        /authClient is required/,
      );
    });

    it('should strip trailing slash from mcpServerUrl', () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com/',
        authClient: mockAuthClient(),
        httpClient: {},
      });
      assert.strictEqual(client.mcpServerUrl, 'https://example.com');
    });
  });

  describe('callTool', () => {
    it('should throw if toolName is missing', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        httpClient: mockHttpClient(),
      });
      await assert.rejects(() => client.callTool(null), /toolName is required/);
    });

    it('should send JSON-RPC payload with auth header', async () => {
      let capturedUrl, capturedPayload, capturedConfig;
      const http = mockHttpClient(async (url, payload, config) => {
        capturedUrl = url;
        capturedPayload = payload;
        capturedConfig = config;
        return {
          data: {
            result: {
              content: [{ type: 'text', text: '{"status":"ok"}' }],
            },
          },
        };
      });

      const client = new MCPClient({
        mcpServerUrl: 'https://mcp.example.com',
        authClient: mockAuthClient({ token: 'my-token' }),
        httpClient: http,
      });

      const result = await client.callTool('getMyInfo', { key: 'value' });

      assert.strictEqual(capturedUrl, 'https://mcp.example.com');
      assert.strictEqual(capturedPayload.jsonrpc, '2.0');
      assert.strictEqual(capturedPayload.method, 'tools/call');
      assert.strictEqual(capturedPayload.params.name, 'getMyInfo');
      assert.deepStrictEqual(capturedPayload.params.arguments, { key: 'value' });
      assert.strictEqual(capturedConfig.headers.Authorization, 'Bearer my-token');
      assert.deepStrictEqual(result, { data: { status: 'ok' } });
    });

    it('should increment request ID across calls', async () => {
      const ids = [];
      const http = mockHttpClient(async (_url, payload) => {
        ids.push(payload.id);
        return { data: { result: { content: [{ type: 'text', text: '"ok"' }] } } };
      });

      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        httpClient: http,
      });

      await client.callTool('a');
      await client.callTool('b');
      await client.callTool('c');

      assert.deepStrictEqual(ids, [1, 2, 3]);
    });

    it('should return AUTH_ERROR when getAccessToken fails', async () => {
      const auth = {
        getAccessToken: async () => {
          throw new Error('no token');
        },
      };
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: auth,
        httpClient: mockHttpClient(),
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'AUTH_ERROR');
      assert.ok(result.error.message.includes('no token'));
    });

    it('should parse SSE response format', async () => {
      const http = mockHttpClient(async () => ({
        data: 'event: message\ndata: {"result":{"content":[{"type":"text","text":"{\\"v\\":1}"}]}}\n\n',
      }));

      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        httpClient: http,
      });

      const result = await client.callTool('test');
      assert.deepStrictEqual(result, { data: { v: 1 } });
    });

    it('should return error from JSON-RPC error response', async () => {
      const http = mockHttpClient(async () => ({
        data: { error: { code: -32600, message: 'Invalid Request' } },
      }));

      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        httpClient: http,
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, -32600);
    });

    it('should return text as string when not valid JSON', async () => {
      const http = mockHttpClient(async () => ({
        data: { result: { content: [{ type: 'text', text: 'plain text response' }] } },
      }));

      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        httpClient: http,
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.data, 'plain text response');
    });

    it('should retry once on 401 then succeed', async () => {
      let callCount = 0;
      const http = mockHttpClient(async () => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('Unauthorized');
          err.response = { status: 401 };
          throw err;
        }
        return { data: { result: { content: [{ type: 'text', text: '"ok"' }] } } };
      });

      const auth = mockAuthClient();
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: auth,
        httpClient: http,
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.data, 'ok');
      assert.strictEqual(callCount, 2);
      assert.strictEqual(auth.refreshCalled, true);
    });

    it('should not retry more than once on 401', async () => {
      let callCount = 0;
      const http = mockHttpClient(async () => {
        callCount++;
        const err = new Error('Unauthorized');
        err.response = { status: 401 };
        throw err;
      });

      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        httpClient: http,
      });

      const result = await client.callTool('test');
      // First call fails with 401, refresh happens, second call also 401 but no more retries
      assert.strictEqual(callCount, 2);
      assert.strictEqual(result.error.code, 'REQUEST_ERROR');
    });

    it('should return AUTH_REFRESH_FAILED when refresh throws', async () => {
      const http = mockHttpClient(async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401 };
        throw err;
      });

      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient({ refreshFails: true }),
        httpClient: http,
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'AUTH_REFRESH_FAILED');
    });

    it('should return REQUEST_ERROR for non-401 HTTP errors', async () => {
      const http = mockHttpClient(async () => {
        const err = new Error('Server Error');
        err.response = { status: 500, data: { message: 'Internal Error' } };
        throw err;
      });

      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        httpClient: http,
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'REQUEST_ERROR');
      assert.strictEqual(result.error.message, 'Internal Error');
    });
  });
});
