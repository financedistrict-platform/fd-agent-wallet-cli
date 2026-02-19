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
    },
    get refreshCalled() {
      return refreshCalled;
    },
  };
}

/**
 * Override connect() to inject a mock SDK client, bypassing real transport.
 */
function injectMockSDKClient(mcpClient, callToolHandler) {
  mcpClient.connect = async function () {
    await this.authClient.getAccessToken();
    this._client = {
      callTool: callToolHandler || (async () => ({ content: [{ type: 'text', text: '"ok"' }] })),
      listTools: async () => ({ tools: [{ name: 'testTool' }] }),
    };
    this._transport = { close: async () => {} };
  };
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
      });
      assert.strictEqual(client.mcpServerUrl, 'https://example.com');
    });
  });

  describe('callTool', () => {
    it('should throw if toolName is missing', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });
      await assert.rejects(() => client.callTool(null), /toolName is required/);
    });

    it('should call SDK client with correct name and arguments', async () => {
      let captured;
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });
      injectMockSDKClient(client, async (params) => {
        captured = params;
        return { content: [{ type: 'text', text: '{"status":"ok"}' }] };
      });

      const result = await client.callTool('getMyInfo', { key: 'value' });

      assert.deepStrictEqual(captured, { name: 'getMyInfo', arguments: { key: 'value' } });
      assert.deepStrictEqual(result, { data: { status: 'ok' } });
    });

    it('should default to empty args when none provided', async () => {
      let captured;
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });
      injectMockSDKClient(client, async (params) => {
        captured = params;
        return { content: [{ type: 'text', text: '"ok"' }] };
      });

      await client.callTool('test');
      assert.deepStrictEqual(captured.arguments, {});
    });

    it('should parse JSON text content', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });
      injectMockSDKClient(client, async () => ({
        content: [{ type: 'text', text: '{"status":"ok"}' }],
      }));

      const result = await client.callTool('test');
      assert.deepStrictEqual(result, { data: { status: 'ok' } });
    });

    it('should return text as string when not valid JSON', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });
      injectMockSDKClient(client, async () => ({
        content: [{ type: 'text', text: 'plain text response' }],
      }));

      const result = await client.callTool('test');
      assert.strictEqual(result.data, 'plain text response');
    });

    it('should return TOOL_ERROR when isError is set', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });
      injectMockSDKClient(client, async () => ({
        isError: true,
        content: [{ type: 'text', text: 'Something went wrong' }],
      }));

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'TOOL_ERROR');
      assert.strictEqual(result.error.message, 'Something went wrong');
    });

    it('should return content array when no text items found', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });
      injectMockSDKClient(client, async () => ({
        content: [{ type: 'image', data: 'base64...' }],
      }));

      const result = await client.callTool('test');
      assert.deepStrictEqual(result.data, [{ type: 'image', data: 'base64...' }]);
    });

    it('should retry once on 401 then succeed', async () => {
      let callCount = 0;
      const auth = mockAuthClient();
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: auth,
      });

      injectMockSDKClient(client, async () => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('Unauthorized');
          err.httpStatusCode = 401;
          throw err;
        }
        return { content: [{ type: 'text', text: '"ok"' }] };
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.data, 'ok');
      assert.strictEqual(callCount, 2);
      assert.strictEqual(auth.refreshCalled, true);
    });

    it('should not retry more than once on 401', async () => {
      let callCount = 0;
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });

      injectMockSDKClient(client, async () => {
        callCount++;
        const err = new Error('Unauthorized');
        err.httpStatusCode = 401;
        throw err;
      });

      const result = await client.callTool('test');
      assert.strictEqual(callCount, 2);
      assert.strictEqual(result.error.code, 'AUTH_ERROR');
    });

    it('should return AUTH_REFRESH_FAILED when refresh throws', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient({ refreshFails: true }),
      });

      injectMockSDKClient(client, async () => {
        const err = new Error('Unauthorized');
        err.httpStatusCode = 401;
        throw err;
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'AUTH_REFRESH_FAILED');
    });

    it('should return REQUEST_ERROR when local token is missing (not retryable)', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: {
          getAccessToken: async () => { throw new Error('No access token available'); },
          refreshToken: async () => { throw new Error('should not be called'); },
        },
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'REQUEST_ERROR');
      assert.ok(result.error.message.includes('No access token'));
    });

    it('should return REQUEST_ERROR when credential store is unavailable (not retryable)', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: {
          getAccessToken: async () => { throw new Error('OS credential store is unavailable'); },
          refreshToken: async () => { throw new Error('should not be called'); },
        },
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'REQUEST_ERROR');
      assert.ok(result.error.message.includes('credential store'));
    });

    it('should return REQUEST_ERROR for non-auth errors', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });

      injectMockSDKClient(client, async () => {
        throw new Error('Connection timeout');
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'REQUEST_ERROR');
      assert.ok(result.error.message.includes('Connection timeout'));
    });

    it('should retry on StreamableHTTPError with code 401 (real SDK error shape)', async () => {
      let callCount = 0;
      const auth = mockAuthClient();
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: auth,
      });

      injectMockSDKClient(client, async () => {
        callCount++;
        if (callCount === 1) {
          // Simulate the real StreamableHTTPError from @modelcontextprotocol/sdk
          const err = new Error('Streamable HTTP error: Error POSTing to endpoint: ');
          err.code = 401;
          throw err;
        }
        return { content: [{ type: 'text', text: '"ok"' }] };
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.data, 'ok');
      assert.strictEqual(callCount, 2);
      assert.strictEqual(auth.refreshCalled, true);
    });

    it('should include HTTP status code in REQUEST_ERROR message', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });

      injectMockSDKClient(client, async () => {
        const err = new Error('Streamable HTTP error: Error POSTing to endpoint: ');
        err.code = 500;
        throw err;
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'REQUEST_ERROR');
      assert.ok(result.error.message.includes('HTTP 500'), `expected HTTP 500 in message, got: ${result.error.message}`);
    });
  });

  describe('listTools', () => {
    it('should return tools from SDK client', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });
      injectMockSDKClient(client);

      const tools = await client.listTools();
      assert.deepStrictEqual(tools, [{ name: 'testTool' }]);
    });

    it('should retry on 401 then succeed', async () => {
      let callCount = 0;
      const auth = mockAuthClient();
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: auth,
      });

      client.connect = async function () {
        await this.authClient.getAccessToken();
        this._client = {
          listTools: async () => {
            callCount++;
            if (callCount === 1) {
              const err = new Error('Unauthorized');
              err.httpStatusCode = 401;
              throw err;
            }
            return { tools: [{ name: 'retried' }] };
          },
          callTool: async () => ({ content: [] }),
        };
        this._transport = { close: async () => {} };
      };

      const tools = await client.listTools();
      assert.deepStrictEqual(tools, [{ name: 'retried' }]);
      assert.strictEqual(auth.refreshCalled, true);
    });
  });

  describe('close', () => {
    it('should reset client and transport', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });
      injectMockSDKClient(client);
      await client.connect();

      assert.ok(client._client);
      assert.ok(client._transport);

      await client.close();
      assert.strictEqual(client._client, null);
      assert.strictEqual(client._transport, null);
    });

    it('should handle close when not connected', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });

      // Should not throw
      await client.close();
      assert.strictEqual(client._client, null);
    });
  });
});
