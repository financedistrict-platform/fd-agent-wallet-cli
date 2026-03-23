const assert = require('node:assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
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
    const token = await this.authClient.getAccessToken();
    this._currentAccessToken = token;
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

    it('should return SESSION_EXPIRED when session is fully expired (proactive path)', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: {
          getAccessToken: async () => {
            const err = new Error('Session expired \u2014 run "fdx login" to re-authenticate');
            err.code = 'SESSION_EXPIRED';
            throw err;
          },
          refreshToken: async () => {
            throw new Error('should not be called');
          },
        },
      });

      // Simulate existing connection so #ensureFreshConnection runs
      client._client = { callTool: async () => ({ content: [] }) };
      client._transport = { close: async () => {} };
      client._currentAccessToken = 'stale-token';

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'SESSION_EXPIRED');
      assert.ok(result.error.message.includes('fdx login'));
    });

    it('should return SESSION_EXPIRED when 401 retry leads to expired refresh token', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: {
          getAccessToken: async () => 'test-token',
          refreshToken: async () => {
            const err = new Error('Session expired \u2014 run "fdx login" to re-authenticate');
            err.code = 'SESSION_EXPIRED';
            throw err;
          },
        },
      });

      injectMockSDKClient(client, async () => {
        const err = new Error('Unauthorized');
        err.httpStatusCode = 401;
        throw err;
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'SESSION_EXPIRED');
      assert.ok(result.error.message.includes('fdx login'));
    });

    it('should return SESSION_EXPIRED on first connect when tokens are fully expired', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: {
          getAccessToken: async () => {
            const err = new Error('Session expired \u2014 run "fdx login" to re-authenticate');
            err.code = 'SESSION_EXPIRED';
            throw err;
          },
          refreshToken: async () => {
            throw new Error('should not be called');
          },
        },
      });

      const result = await client.callTool('test');
      assert.strictEqual(result.error.code, 'SESSION_EXPIRED');
      assert.ok(result.error.message.includes('fdx login'));
    });

    it('should return REQUEST_ERROR when local token is missing (not retryable)', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: {
          getAccessToken: async () => {
            throw new Error('No access token available');
          },
          refreshToken: async () => {
            throw new Error('should not be called');
          },
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
          getAccessToken: async () => {
            throw new Error('OS credential store is unavailable');
          },
          refreshToken: async () => {
            throw new Error('should not be called');
          },
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
      assert.ok(
        result.error.message.includes('HTTP 500'),
        `expected HTTP 500 in message, got: ${result.error.message}`,
      );
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
        const token = await this.authClient.getAccessToken();
        this._currentAccessToken = token;
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

    it('should throw SESSION_EXPIRED when session is fully expired', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: {
          getAccessToken: async () => {
            const err = new Error('Session expired \u2014 run "fdx login" to re-authenticate');
            err.code = 'SESSION_EXPIRED';
            throw err;
          },
          refreshToken: async () => {
            throw new Error('should not be called');
          },
        },
      });

      await assert.rejects(
        () => client.listTools(),
        (err) => {
          assert.strictEqual(err.code, 'SESSION_EXPIRED');
          return true;
        },
      );
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

  describe('proactive token refresh', () => {
    it('should reconnect when getAccessToken returns a new token', async () => {
      let currentToken = 'token-v1';
      let connectCount = 0;
      const auth = {
        getAccessToken: async () => currentToken,
        refreshToken: async () => {},
      };
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: auth,
      });

      client.connect = async function () {
        connectCount++;
        const token = await this.authClient.getAccessToken();
        this._currentAccessToken = token;
        this._client = {
          callTool: async () => ({ content: [{ type: 'text', text: '"ok"' }] }),
          listTools: async () => ({ tools: [] }),
        };
        this._transport = { close: async () => {} };
      };

      // First call — connect
      await client.callTool('test');
      assert.strictEqual(connectCount, 1);

      // Second call — same token, no reconnect
      await client.callTool('test');
      assert.strictEqual(connectCount, 1);

      // Simulate token refresh
      currentToken = 'token-v2';

      // Third call — new token detected, should reconnect
      await client.callTool('test');
      assert.strictEqual(connectCount, 2);
      assert.strictEqual(client._currentAccessToken, 'token-v2');
    });

    it('should reconnect for listTools when token changes', async () => {
      let currentToken = 'token-v1';
      let connectCount = 0;
      const auth = {
        getAccessToken: async () => currentToken,
        refreshToken: async () => {},
      };
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: auth,
      });

      client.connect = async function () {
        connectCount++;
        const token = await this.authClient.getAccessToken();
        this._currentAccessToken = token;
        this._client = {
          callTool: async () => ({ content: [{ type: 'text', text: '"ok"' }] }),
          listTools: async () => ({ tools: [{ name: 'refreshedTool' }] }),
        };
        this._transport = { close: async () => {} };
      };

      // First call — connect
      await client.listTools();
      assert.strictEqual(connectCount, 1);

      // Token changes
      currentToken = 'token-v2';

      // Second call — should reconnect
      const tools = await client.listTools();
      assert.strictEqual(connectCount, 2);
      assert.deepStrictEqual(tools, [{ name: 'refreshedTool' }]);
    });

    it('should continue with existing connection when getAccessToken fails', async () => {
      let failGetToken = false;
      let callCount = 0;
      const auth = {
        getAccessToken: async () => {
          if (failGetToken) throw new Error('credential store locked');
          return 'token-v1';
        },
        refreshToken: async () => {},
      };
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: auth,
      });

      client.connect = async function () {
        const token = await this.authClient.getAccessToken();
        this._currentAccessToken = token;
        this._client = {
          callTool: async () => {
            callCount++;
            return { content: [{ type: 'text', text: '"ok"' }] };
          },
          listTools: async () => ({ tools: [] }),
        };
        this._transport = { close: async () => {} };
      };

      // First call — connect succeeds
      await client.callTool('test');
      assert.strictEqual(callCount, 1);

      // getAccessToken now fails (e.g., credential store locked)
      failGetToken = true;

      // Second call — ensureFreshConnection fails silently, existing connection is used
      const result = await client.callTool('test');
      assert.strictEqual(callCount, 2);
      assert.deepStrictEqual(result, { data: 'ok' });
    });
  });

  describe('tools cache', () => {
    async function tmpCachePath() {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fdx-cache-'));
      return path.join(dir, 'tools-cache.json');
    }

    it('should write and read tools from file cache', async () => {
      const cachePath = await tmpCachePath();
      let connectCount = 0;

      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        toolsCachePath: cachePath,
      });

      client.connect = async function () {
        connectCount++;
        const token = await this.authClient.getAccessToken();
        this._currentAccessToken = token;
        this._client = {
          listTools: async () => ({ tools: [{ name: 'cachedTool' }] }),
          callTool: async () => ({ content: [] }),
        };
        this._transport = { close: async () => {} };
      };

      // First call — cache miss, fetches from server
      const tools1 = await client.listTools();
      assert.deepStrictEqual(tools1, [{ name: 'cachedTool' }]);
      assert.strictEqual(connectCount, 1);

      // Create a new client instance (simulates new process)
      const client2 = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        toolsCachePath: cachePath,
      });

      let client2Connected = false;
      client2.connect = async function () {
        client2Connected = true;
        this._client = {
          listTools: async () => ({ tools: [{ name: 'freshTool' }] }),
          callTool: async () => ({ content: [] }),
        };
        this._transport = { close: async () => {} };
      };

      // Second client — should use file cache, no connect
      const tools2 = await client2.listTools();
      assert.deepStrictEqual(tools2, [{ name: 'cachedTool' }]);
      assert.strictEqual(client2Connected, false);

      await fs.rm(path.dirname(cachePath), { recursive: true });
    });

    it('should fetch from server when cache is expired', async () => {
      const cachePath = await tmpCachePath();

      // Write an expired cache entry
      const expired = {
        'https://example.com': {
          tools: [{ name: 'oldTool' }],
          cachedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        },
      };
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(expired));

      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        toolsCachePath: cachePath,
      });
      injectMockSDKClient(client);

      const tools = await client.listTools();
      assert.deepStrictEqual(tools, [{ name: 'testTool' }]);

      await fs.rm(path.dirname(cachePath), { recursive: true });
    });

    it('should cache per server URL', async () => {
      const cachePath = await tmpCachePath();

      const client1 = new MCPClient({
        mcpServerUrl: 'https://wallet.example.com',
        authClient: mockAuthClient(),
        toolsCachePath: cachePath,
      });
      client1.connect = async function () {
        this._currentAccessToken = 'tok';
        this._client = {
          listTools: async () => ({ tools: [{ name: 'walletTool' }] }),
          callTool: async () => ({ content: [] }),
        };
        this._transport = { close: async () => {} };
      };

      const client2 = new MCPClient({
        mcpServerUrl: 'https://prism.example.com',
        authClient: mockAuthClient(),
        toolsCachePath: cachePath,
      });
      client2.connect = async function () {
        this._currentAccessToken = 'tok';
        this._client = {
          listTools: async () => ({ tools: [{ name: 'prismTool' }] }),
          callTool: async () => ({ content: [] }),
        };
        this._transport = { close: async () => {} };
      };

      await client1.listTools();
      await client2.listTools();

      // New clients reading from cache
      const reader1 = new MCPClient({
        mcpServerUrl: 'https://wallet.example.com',
        authClient: mockAuthClient(),
        toolsCachePath: cachePath,
      });
      const reader2 = new MCPClient({
        mcpServerUrl: 'https://prism.example.com',
        authClient: mockAuthClient(),
        toolsCachePath: cachePath,
      });

      assert.deepStrictEqual(await reader1.listTools(), [{ name: 'walletTool' }]);
      assert.deepStrictEqual(await reader2.listTools(), [{ name: 'prismTool' }]);

      await fs.rm(path.dirname(cachePath), { recursive: true });
    });

    it('should skip cache when no toolsCachePath is provided', async () => {
      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
      });
      injectMockSDKClient(client);

      // Should fetch from server (no caching)
      const tools = await client.listTools();
      assert.deepStrictEqual(tools, [{ name: 'testTool' }]);
    });

    it('should gracefully handle corrupted cache file', async () => {
      const cachePath = await tmpCachePath();
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, 'not valid json!!!');

      const client = new MCPClient({
        mcpServerUrl: 'https://example.com',
        authClient: mockAuthClient(),
        toolsCachePath: cachePath,
      });
      injectMockSDKClient(client);

      const tools = await client.listTools();
      assert.deepStrictEqual(tools, [{ name: 'testTool' }]);

      await fs.rm(path.dirname(cachePath), { recursive: true });
    });
  });
});
