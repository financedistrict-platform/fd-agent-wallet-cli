const assert = require('node:assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { MCPAuthClient } = require('../src/mcp-auth');

function mockCredentialStore(available = true) {
  const secrets = {};
  return {
    isSupported: () => available,
    getSecret: (account) => secrets[account] || null,
    setSecret: (account, secret) => {
      if (!available) return false;
      secrets[account] = secret;
      return true;
    },
    deleteSecret: (account) => {
      delete secrets[account];
    },
    _secrets: secrets,
  };
}

function mockHttpClient(handlers = {}) {
  return {
    get: handlers.get || (async () => ({ data: {} })),
    post: handlers.post || (async () => ({ data: {} })),
  };
}

function createClient(tmpDir, credStore, httpClient) {
  const storePath = path.join(tmpDir, 'auth.json');
  const client = new MCPAuthClient({
    mcpServerUrl: 'https://mcp.test.example.com',
    storePath,
    httpClient: httpClient || mockHttpClient(),
    credentialStore: credStore,
  });

  return { client, storePath };
}

function createInitializedClient(tmpDir, credStore) {
  const { client, storePath } = createClient(tmpDir, credStore);

  client.oauthServerUrl = 'https://auth.example.com';
  client.tokenEndpoint = 'https://auth.example.com/token';
  client.deviceAuthorizationEndpoint = 'https://auth.example.com/devicecode';
  client.clientId = 'test-client-id';
  client._initialized = true;
  client._discovered = true;

  return { client, storePath };
}

describe('MCPAuthClient - Credential Store Integration', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fdx-credtest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should store tokens in credential store when available', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    client.httpClient.post = async () => ({
      data: {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid',
      },
    });

    await client.pollDeviceToken({ deviceCode: 'test-device-code', interval: 0 });

    const secret = JSON.parse(credStore._secrets['mcp.test.example.com']);
    assert.strictEqual(secret.accessToken, 'access-123');
    assert.strictEqual(secret.refreshToken, 'refresh-456');

    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.tokens.accessToken, undefined);
    assert.strictEqual(file.tokens.refreshToken, undefined);
    assert.strictEqual(file.tokens.credentialStore, true);
    assert.strictEqual(file.tokens.tokenType, 'Bearer');
  });

  it('should fall back to file when credential store is not available', async () => {
    const credStore = mockCredentialStore(false);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    const warnings = [];
    const handler = (w) => warnings.push(w);
    process.on('warning', handler);

    client.httpClient.post = async () => ({
      data: {
        access_token: 'access-plain',
        refresh_token: 'refresh-plain',
        token_type: 'Bearer',
        expires_in: 3600,
      },
    });

    await client.pollDeviceToken({ deviceCode: 'test-device-code', interval: 0 });

    process.removeListener('warning', handler);

    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.tokens.accessToken, 'access-plain');
    assert.strictEqual(file.tokens.refreshToken, 'refresh-plain');
    assert.strictEqual(file.tokens.credentialStore, undefined);

    assert.ok(warnings.length > 0);
    assert.ok(warnings[0].message.includes('plaintext'));
  });

  it('should read tokens from credential store when credentialStore flag is set', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    credStore._secrets['mcp.test.example.com'] = JSON.stringify({
      accessToken: 'keychain-access',
      refreshToken: 'keychain-refresh',
    });

    await fs.writeFile(
      storePath,
      JSON.stringify({
        tokens: {
          credentialStore: true,
          expiresAt: Date.now() + 3600000,
          tokenType: 'Bearer',
        },
      }),
    );

    const token = await client.getAccessToken();
    assert.strictEqual(token, 'keychain-access');
  });

  it('should read tokens from file in legacy mode (no credentialStore flag)', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    await fs.writeFile(
      storePath,
      JSON.stringify({
        tokens: {
          accessToken: 'file-access',
          refreshToken: 'file-refresh',
          expiresAt: Date.now() + 3600000,
          tokenType: 'Bearer',
        },
      }),
    );

    const token = await client.getAccessToken();
    assert.strictEqual(token, 'file-access');
  });

  it('should throw when credential store has no data and flag is set', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    await fs.writeFile(
      storePath,
      JSON.stringify({
        tokens: {
          credentialStore: true,
          expiresAt: Date.now() + 3600000,
        },
      }),
    );

    await assert.rejects(() => client.getAccessToken(), /credential store is unavailable/);
  });

  it('should throw when credential store read fails after setup', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    // Simulate: setup stored tokens in credential store, then keyring becomes unavailable
    credStore.getSecret = () => null;

    await fs.writeFile(
      storePath,
      JSON.stringify({
        tokens: {
          credentialStore: true,
          expiresAt: Date.now() + 3600000,
          tokenType: 'Bearer',
        },
      }),
    );

    await assert.rejects(
      () => client.getAccessToken(),
      /credential store is unavailable/,
    );
  });

  it('should throw when credential store throws during read', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    credStore.getSecret = () => { throw new Error('dbus connection failed'); };

    await fs.writeFile(
      storePath,
      JSON.stringify({
        tokens: {
          credentialStore: true,
          expiresAt: Date.now() + 3600000,
          tokenType: 'Bearer',
        },
      }),
    );

    await assert.rejects(
      () => client.getAccessToken(),
      /credential store is unavailable/,
    );
  });

  it('should preserve refresh token during token refresh', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    credStore._secrets['mcp.test.example.com'] = JSON.stringify({
      accessToken: 'old-access',
      refreshToken: 'original-refresh',
    });

    await fs.writeFile(
      storePath,
      JSON.stringify({
        tokens: {
          credentialStore: true,
          expiresAt: Date.now() - 60000,
          tokenType: 'Bearer',
        },
      }),
    );

    client.httpClient.post = async () => ({
      data: {
        access_token: 'new-access',
        token_type: 'Bearer',
        expires_in: 3600,
      },
    });

    const newToken = await client.refreshToken();
    assert.strictEqual(newToken, 'new-access');

    const secret = JSON.parse(credStore._secrets['mcp.test.example.com']);
    assert.strictEqual(secret.accessToken, 'new-access');
    assert.strictEqual(secret.refreshToken, 'original-refresh');
  });

  it('should refresh using clientId from store', async () => {
    let postCount = 0;
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createClient(tmpDir, credStore, mockHttpClient({
      post: async (_url, body) => {
        postCount++;
        const params = new URLSearchParams(body);
        assert.strictEqual(params.get('grant_type'), 'refresh_token', 'only refresh_token grant expected');
        return { data: { access_token: 'new-at', token_type: 'Bearer', expires_in: 3600 } };
      },
    }));

    client.oauthServerUrl = 'https://auth.example.com';
    client.tokenEndpoint = 'https://auth.example.com/token';
    client.clientId = 'my-client-id';
    client._initialized = true;
    client._discovered = true;

    credStore._secrets['mcp.test.example.com'] = JSON.stringify({
      accessToken: 'old-at',
      refreshToken: 'my-refresh-token',
    });
    await fs.writeFile(
      storePath,
      JSON.stringify({ mcpAuth: { clientId: 'my-client-id' }, tokens: { credentialStore: true } }),
    );

    const newToken = await client.refreshToken();
    assert.strictEqual(newToken, 'new-at');
    assert.strictEqual(postCount, 1, 'only one POST');
  });

  it('should refresh using legacy deviceClientId from store', async () => {
    let postCount = 0;
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createClient(tmpDir, credStore, mockHttpClient({
      post: async (_url, body) => {
        postCount++;
        const params = new URLSearchParams(body);
        assert.strictEqual(params.get('grant_type'), 'refresh_token');
        return { data: { access_token: 'new-device-at', token_type: 'Bearer', expires_in: 3600 } };
      },
    }));

    client.oauthServerUrl = 'https://auth.example.com';
    client.tokenEndpoint = 'https://auth.example.com/token';
    client._discovered = true;

    credStore._secrets['mcp.test.example.com'] = JSON.stringify({
      accessToken: 'old-at',
      refreshToken: 'device-refresh-token',
    });
    await fs.writeFile(
      storePath,
      JSON.stringify({ mcpAuth: { deviceClientId: 'device-client-id' }, tokens: { credentialStore: true } }),
    );

    const newToken = await client.refreshToken();
    assert.strictEqual(newToken, 'new-device-at');
    assert.strictEqual(postCount, 1);
  });

  it('should throw when clientId is not available during refresh', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createClient(tmpDir, credStore);

    client.oauthServerUrl = 'https://auth.example.com';
    client.tokenEndpoint = 'https://auth.example.com/token';
    client._discovered = true;

    credStore._secrets['mcp.test.example.com'] = JSON.stringify({
      accessToken: 'old-at',
      refreshToken: 'my-refresh-token',
    });
    await fs.writeFile(
      storePath,
      JSON.stringify({ tokens: { credentialStore: true } }),
    );

    await assert.rejects(() => client.refreshToken(), /No client ID/);
  });

  describe('getTokenState', () => {
    it('should return authenticated state from credential store', async () => {
      const credStore = mockCredentialStore(true);
      const { client, storePath } = createInitializedClient(tmpDir, credStore);

      credStore._secrets['mcp.test.example.com'] = JSON.stringify({
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      await fs.writeFile(
        storePath,
        JSON.stringify({
          tokens: {
            credentialStore: true,
            expiresAt: Date.now() + 3600000,
          },
          mcpAuth: { clientId: 'my-client' },
        }),
      );

      const state = await client.getTokenState();
      assert.strictEqual(state.authenticated, true);
      assert.strictEqual(state.expired, false);
      assert.strictEqual(state.hasRefresh, true);
      assert.strictEqual(state.clientId, 'my-client');
      assert.strictEqual(state.usingCredentialStore, true);
    });

    it('should return not-authenticated when no tokens exist', async () => {
      const credStore = mockCredentialStore(true);
      const { client } = createInitializedClient(tmpDir, credStore);

      const state = await client.getTokenState();
      assert.strictEqual(state.authenticated, false);
      assert.strictEqual(state.usingCredentialStore, false);
    });

    it('should return not-authenticated when credential store is unavailable', async () => {
      const credStore = mockCredentialStore(true);
      const { client, storePath } = createInitializedClient(tmpDir, credStore);

      // Simulate keyring locked / dbus unavailable
      credStore.getSecret = () => null;

      await fs.writeFile(
        storePath,
        JSON.stringify({
          tokens: {
            credentialStore: true,
            expiresAt: Date.now() + 3600000,
          },
          mcpAuth: { clientId: 'my-client' },
        }),
      );

      const state = await client.getTokenState();
      assert.strictEqual(state.authenticated, false);
      assert.strictEqual(state.usingCredentialStore, true);
      assert.strictEqual(state.clientId, 'my-client');
    });

    it('should report expired tokens', async () => {
      const credStore = mockCredentialStore(true);
      const { client, storePath } = createInitializedClient(tmpDir, credStore);

      credStore._secrets['mcp.test.example.com'] = JSON.stringify({
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      await fs.writeFile(
        storePath,
        JSON.stringify({
          tokens: {
            credentialStore: true,
            expiresAt: Date.now() - 60000,
          },
        }),
      );

      const state = await client.getTokenState();
      assert.strictEqual(state.authenticated, true);
      assert.strictEqual(state.expired, true);
    });
  });
});

describe('MCPAuthClient - initialize()', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fdx-inittest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should discover endpoints and register client via DCR', async () => {
    const requests = { gets: [], posts: [] };
    const http = mockHttpClient({
      get: async (url) => {
        requests.gets.push(url);
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: ['https://auth.example.com'] } };
        }
        if (url.includes('oauth-authorization-server')) {
          return {
            data: {
              token_endpoint: 'https://auth.example.com/token',
              registration_endpoint: 'https://auth.example.com/register',
              device_authorization_endpoint: 'https://auth.example.com/devicecode',
            },
          };
        }
        return { data: {} };
      },
      post: async (url, body) => {
        requests.posts.push({ url, body });
        return { data: { client_id: 'registered-client-123' } };
      },
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);
    await client.initialize();

    assert.strictEqual(client.clientId, 'registered-client-123');
    assert.strictEqual(client.tokenEndpoint, 'https://auth.example.com/token');

    assert.ok(requests.gets.some((u) => u.includes('oauth-protected-resource')));
    assert.ok(requests.gets.some((u) => u.includes('oauth-authorization-server')));

    assert.strictEqual(requests.posts.length, 1);
    assert.ok(requests.posts[0].url.includes('/register'));

    // Should use device_code grant type
    const body = typeof requests.posts[0].body === 'string'
      ? JSON.parse(requests.posts[0].body)
      : requests.posts[0].body;
    assert.deepStrictEqual(body.grant_types, ['urn:ietf:params:oauth:grant-type:device_code']);
  });

  it('should use cached metadata on second call', async () => {
    let getCount = 0;
    const http = mockHttpClient({
      get: async (url) => {
        getCount++;
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: ['https://auth.example.com'] } };
        }
        return {
          data: {
            token_endpoint: 'https://auth.example.com/token',
            registration_endpoint: 'https://auth.example.com/register',
            device_authorization_endpoint: 'https://auth.example.com/devicecode',
          },
        };
      },
      post: async () => ({ data: { client_id: 'cached-client' } }),
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);
    await client.initialize();
    const firstGetCount = getCount;

    await client.initialize();
    assert.strictEqual(getCount, firstGetCount);
  });

  it('should not make duplicate registrations on concurrent calls', async () => {
    let postCount = 0;
    const http = mockHttpClient({
      get: async (url) => {
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: ['https://auth.example.com'] } };
        }
        return {
          data: {
            token_endpoint: 'https://auth.example.com/token',
            registration_endpoint: 'https://auth.example.com/register',
            device_authorization_endpoint: 'https://auth.example.com/devicecode',
          },
        };
      },
      post: async () => {
        postCount++;
        await new Promise((r) => setTimeout(r, 10));
        return { data: { client_id: 'concurrent-client' } };
      },
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);

    await Promise.all([client.initialize(), client.initialize(), client.initialize()]);

    assert.strictEqual(postCount, 1);
  });

  it('should throw when server does not support device flow', async () => {
    const http = mockHttpClient({
      get: async (url) => {
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: ['https://auth.example.com'] } };
        }
        return {
          data: {
            token_endpoint: 'https://auth.example.com/token',
          },
        };
      },
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);
    await assert.rejects(() => client.initialize(), /not supported/);
  });

  it('should reject non-HTTPS endpoints from discovery', async () => {
    const http = mockHttpClient({
      get: async (url) => {
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: ['http://evil.example.com'] } };
        }
        return {
          data: {
            token_endpoint: 'http://evil.example.com/token',
            device_authorization_endpoint: 'http://evil.example.com/devicecode',
          },
        };
      },
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);
    await assert.rejects(() => client.initialize(), /must use HTTPS/);
  });

  it('should reject non-HTTPS token endpoint from metadata', async () => {
    const http = mockHttpClient({
      get: async (url) => {
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: ['https://auth.example.com'] } };
        }
        return {
          data: {
            token_endpoint: 'http://evil.example.com/token',
            device_authorization_endpoint: 'https://auth.example.com/devicecode',
          },
        };
      },
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);
    await assert.rejects(() => client.initialize(), /must use HTTPS/);
  });

  it('should throw when no authorization server is found', async () => {
    const http = mockHttpClient({
      get: async (url) => {
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: [] } };
        }
        return { data: {} };
      },
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);
    await assert.rejects(() => client.initialize(), /No authorization server/);
  });

  it('should re-discover when cached metadata lacks deviceAuthorizationEndpoint', async () => {
    let discoveryCount = 0;
    const http = mockHttpClient({
      get: async (url) => {
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: ['https://auth.example.com'] } };
        }
        if (url.includes('oauth-authorization-server')) {
          discoveryCount++;
          return {
            data: {
              token_endpoint: 'https://auth.example.com/token',
              registration_endpoint: 'https://auth.example.com/register',
              device_authorization_endpoint: 'https://auth.example.com/devicecode',
            },
          };
        }
        return { data: {} };
      },
      post: async () => ({ data: { client_id: 'rediscovered-client' } }),
    });

    const { client, storePath } = createClient(tmpDir, mockCredentialStore(), http);

    await fs.writeFile(
      storePath,
      JSON.stringify({
        mcpAuth: {
          oauthServerUrl: 'https://auth.example.com',
          tokenEndpoint: 'https://auth.example.com/token',
          registrationEndpoint: 'https://auth.example.com/register',
        },
      }),
    );

    await client.initialize();

    assert.strictEqual(client.deviceAuthorizationEndpoint, 'https://auth.example.com/devicecode');
    assert.strictEqual(client.clientId, 'rediscovered-client');
    assert.strictEqual(discoveryCount, 1);
  });

  it('should reuse cached clientId without re-registering', async () => {
    let postCount = 0;
    const http = mockHttpClient({
      get: async (url) => {
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: ['https://auth.example.com'] } };
        }
        return {
          data: {
            token_endpoint: 'https://auth.example.com/token',
            device_authorization_endpoint: 'https://auth.example.com/devicecode',
          },
        };
      },
      post: async () => {
        postCount++;
        return { data: { client_id: 'should-not-register' } };
      },
    });

    const { client, storePath } = createClient(tmpDir, mockCredentialStore(), http);
    await fs.writeFile(
      storePath,
      JSON.stringify({
        mcpAuth: {
          oauthServerUrl: 'https://auth.example.com',
          tokenEndpoint: 'https://auth.example.com/token',
          deviceAuthorizationEndpoint: 'https://auth.example.com/devicecode',
          clientId: 'cached-client-id',
        },
      }),
    );

    await client.initialize();

    assert.strictEqual(client.clientId, 'cached-client-id');
    assert.strictEqual(postCount, 0);
  });

  it('should support legacy deviceClientId in store', async () => {
    let postCount = 0;
    const http = mockHttpClient({
      post: async () => {
        postCount++;
        return { data: { client_id: 'should-not-register' } };
      },
    });

    const { client, storePath } = createClient(tmpDir, mockCredentialStore(), http);
    await fs.writeFile(
      storePath,
      JSON.stringify({
        mcpAuth: {
          oauthServerUrl: 'https://auth.example.com',
          tokenEndpoint: 'https://auth.example.com/token',
          deviceAuthorizationEndpoint: 'https://auth.example.com/devicecode',
          deviceClientId: 'legacy-device-id',
        },
      }),
    );

    await client.initialize();

    assert.strictEqual(client.clientId, 'legacy-device-id');
    assert.strictEqual(postCount, 0);
  });

  it('should fall back to openid-configuration when oauth-authorization-server is not available', async () => {
    const requests = { gets: [] };
    const http = mockHttpClient({
      get: async (url) => {
        requests.gets.push(url);
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: ['https://auth.example.com'] } };
        }
        if (url.includes('oauth-authorization-server')) {
          return { data: {} };
        }
        if (url.includes('openid-configuration')) {
          return {
            data: {
              token_endpoint: 'https://auth.example.com/token',
              registration_endpoint: 'https://auth.example.com/register',
              device_authorization_endpoint: 'https://auth.example.com/devicecode',
            },
          };
        }
        return { data: {} };
      },
      post: async () => ({ data: { client_id: 'oidc-fallback-client' } }),
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);
    await client.initialize();

    assert.strictEqual(client.clientId, 'oidc-fallback-client');
    assert.strictEqual(client.tokenEndpoint, 'https://auth.example.com/token');
    assert.strictEqual(client.deviceAuthorizationEndpoint, 'https://auth.example.com/devicecode');

    assert.ok(requests.gets.some((u) => u.includes('oauth-authorization-server')));
    assert.ok(requests.gets.some((u) => u.includes('openid-configuration')));
  });

  it('should merge device_authorization_endpoint from OIDC when RFC 8414 omits it', async () => {
    const requests = { gets: [] };
    const http = mockHttpClient({
      get: async (url) => {
        requests.gets.push(url);
        if (url.includes('oauth-protected-resource')) {
          return { data: { authorization_servers: ['https://auth.example.com'] } };
        }
        if (url.includes('oauth-authorization-server')) {
          return {
            data: {
              token_endpoint: 'https://auth.example.com/token',
              registration_endpoint: 'https://auth.example.com/register',
            },
          };
        }
        if (url.includes('openid-configuration')) {
          return {
            data: {
              token_endpoint: 'https://auth.example.com/token',
              device_authorization_endpoint: 'https://auth.example.com/devicecode',
            },
          };
        }
        return { data: {} };
      },
      post: async () => ({ data: { client_id: 'merged-client' } }),
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);
    await client.initialize();

    assert.strictEqual(client.deviceAuthorizationEndpoint, 'https://auth.example.com/devicecode');
    assert.strictEqual(client.tokenEndpoint, 'https://auth.example.com/token');
    assert.strictEqual(client.registrationEndpoint, 'https://auth.example.com/register');

    assert.ok(requests.gets.some((u) => u.includes('oauth-authorization-server')));
    assert.ok(requests.gets.some((u) => u.includes('openid-configuration')));
  });
});

describe('MCPAuthClient - Device Flow (RFC 8628)', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fdx-devtest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('startDeviceFlow should return device code info', async () => {
    const { client } = createInitializedClient(tmpDir, mockCredentialStore());

    client.httpClient.post = async (url) => {
      assert.ok(url.includes('/devicecode'));
      return {
        data: {
          device_code: 'device-code-123',
          user_code: 'ABCD-1234',
          verification_uri: 'https://microsoft.com/devicelogin',
          verification_uri_complete: 'https://microsoft.com/devicelogin?otc=ABCD-1234',
          expires_in: 900,
          interval: 5,
        },
      };
    };

    const result = await client.startDeviceFlow();
    assert.strictEqual(result.deviceCode, 'device-code-123');
    assert.strictEqual(result.userCode, 'ABCD-1234');
    assert.strictEqual(result.verificationUri, 'https://microsoft.com/devicelogin');
    assert.strictEqual(result.expiresIn, 900);
    assert.strictEqual(result.interval, 5);
  });

  it('startDeviceFlow should default interval to 5 when not provided by server', async () => {
    const { client } = createInitializedClient(tmpDir, mockCredentialStore());

    client.httpClient.post = async () => ({
      data: { device_code: 'd', user_code: 'U', verification_uri: 'https://v.example.com', expires_in: 900 },
    });

    const result = await client.startDeviceFlow();
    assert.strictEqual(result.interval, 5);
  });

  it('pollDeviceToken should succeed after authorization_pending responses', async () => {
    const credStore = mockCredentialStore();
    const { client } = createInitializedClient(tmpDir, credStore);

    let callCount = 0;
    client.httpClient.post = async () => {
      callCount++;
      if (callCount < 3) {
        const err = new Error('authorization_pending');
        err.response = { data: { error: 'authorization_pending' } };
        throw err;
      }
      return {
        data: { access_token: 'device-access', refresh_token: 'device-refresh', token_type: 'Bearer', expires_in: 3600 },
      };
    };

    const result = await client.pollDeviceToken({ deviceCode: 'device-code', interval: 0 });
    assert.strictEqual(result.access_token, 'device-access');
    assert.strictEqual(callCount, 3);
  });

  it('pollDeviceToken should increase poll interval on slow_down', async () => {
    const { client } = createInitializedClient(tmpDir, mockCredentialStore());

    let callCount = 0;
    client.httpClient.post = async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('slow_down');
        err.response = { data: { error: 'slow_down' } };
        throw err;
      }
      return {
        data: { access_token: 'token-after-slowdown', token_type: 'Bearer', expires_in: 3600 },
      };
    };

    const result = await client.pollDeviceToken({ deviceCode: 'device-code', interval: 0 });
    assert.strictEqual(result.access_token, 'token-after-slowdown');
    assert.strictEqual(callCount, 2);
  });

  it('pollDeviceToken should throw on access_denied', async () => {
    const { client } = createInitializedClient(tmpDir, mockCredentialStore());

    client.httpClient.post = async () => {
      const err = new Error('access_denied');
      err.response = { data: { error: 'access_denied' } };
      throw err;
    };

    await assert.rejects(
      () => client.pollDeviceToken({ deviceCode: 'device-code', interval: 0 }),
      /access denied/i,
    );
  });

  it('pollDeviceToken should throw on expired_token', async () => {
    const { client } = createInitializedClient(tmpDir, mockCredentialStore());

    client.httpClient.post = async () => {
      const err = new Error('expired_token');
      err.response = { data: { error: 'expired_token' } };
      throw err;
    };

    await assert.rejects(
      () => client.pollDeviceToken({ deviceCode: 'device-code', interval: 0 }),
      /expired/i,
    );
  });

  it('pollDeviceToken should throw when deadline is exceeded', async () => {
    const { client } = createInitializedClient(tmpDir, mockCredentialStore());

    client.httpClient.post = async () => {
      const err = new Error('authorization_pending');
      err.response = { data: { error: 'authorization_pending' } };
      throw err;
    };

    await assert.rejects(
      () => client.pollDeviceToken({ deviceCode: 'device-code', interval: 0, expiresIn: 0 }),
      /expired/i,
    );
  });

  it('pollDeviceToken should store tokens in credential store on success', async () => {
    const credStore = mockCredentialStore();
    const { client } = createInitializedClient(tmpDir, credStore);

    client.httpClient.post = async () => ({
      data: { access_token: 'device-at', refresh_token: 'device-rt', token_type: 'Bearer', expires_in: 3600 },
    });

    await client.pollDeviceToken({ deviceCode: 'device-code', interval: 0 });

    const secret = JSON.parse(credStore._secrets['mcp.test.example.com']);
    assert.strictEqual(secret.accessToken, 'device-at');
    assert.strictEqual(secret.refreshToken, 'device-rt');
  });
});

describe('MCPAuthClient - logout()', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fdx-logouttest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should delete the secret from the credential store', async () => {
    const credStore = mockCredentialStore();
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    credStore.setSecret('mcp.test.example.com', JSON.stringify({ accessToken: 'at', refreshToken: 'rt' }));
    await fs.writeFile(storePath, JSON.stringify({ mcpAuth: { clientId: 'cid' }, tokens: { accessToken: 'at' } }));

    await client.logout();

    assert.strictEqual(credStore.getSecret('mcp.test.example.com'), null);
  });

  it('should remove tokens from the store file but keep mcpAuth', async () => {
    const credStore = mockCredentialStore();
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    await fs.writeFile(
      storePath,
      JSON.stringify({ mcpAuth: { clientId: 'cid' }, tokens: { accessToken: 'at' } }),
    );

    await client.logout();

    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.ok(file.mcpAuth, 'mcpAuth should be preserved');
    assert.strictEqual(file.mcpAuth.clientId, 'cid');
    assert.strictEqual(file.tokens, undefined, 'tokens should be removed');
  });

  it('should reset in-memory initialization flags', async () => {
    const credStore = mockCredentialStore();
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    client._discovered = true;

    await fs.writeFile(storePath, JSON.stringify({}));
    await client.logout();

    assert.strictEqual(client._initialized, false);
    assert.strictEqual(client._discovered, false);
  });

  it('should not throw when no secret is stored (unauthenticated)', async () => {
    const credStore = mockCredentialStore();
    const { client, storePath } = createClient(tmpDir, credStore);

    await fs.writeFile(storePath, JSON.stringify({ mcpAuth: { clientId: 'cid' } }));

    await assert.doesNotReject(() => client.logout());
  });

  it('should not throw when store file does not exist', async () => {
    const credStore = mockCredentialStore();
    const { client } = createClient(tmpDir, credStore);

    await assert.doesNotReject(() => client.logout());
  });
});