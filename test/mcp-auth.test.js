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
    redirectUri: 'http://localhost:6260/oauth/callback',
    storePath,
    httpClient: httpClient || mockHttpClient(),
    credentialStore: credStore,
  });

  return { client, storePath };
}

function createInitializedClient(tmpDir, credStore) {
  const { client, storePath } = createClient(tmpDir, credStore);

  // Set fields that would normally be populated by initialize()
  client.oauthServerUrl = 'https://auth.example.com';
  client.authorizationEndpoint = 'https://auth.example.com/authorize';
  client.tokenEndpoint = 'https://auth.example.com/token';
  client.clientId = 'test-client-id';
  client._initialized = true;

  return { client, storePath };
}

function createDeviceClient(tmpDir, credStore) {
  const { client, storePath } = createClient(tmpDir, credStore);

  client.oauthServerUrl = 'https://auth.example.com';
  client.authorizationEndpoint = 'https://auth.example.com/authorize';
  client.tokenEndpoint = 'https://auth.example.com/token';
  client.deviceAuthorizationEndpoint = 'https://auth.example.com/devicecode';
  client.deviceClientId = 'test-device-client-id';
  client._deviceInitialized = true;

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

    await client.exchangeCodeForToken({
      code: 'auth-code',
      state: 'test-state',
      codeVerifier: 'test-verifier',
    });

    // Credential store should have the tokens
    const secret = JSON.parse(credStore._secrets['mcp.test.example.com']);
    assert.strictEqual(secret.accessToken, 'access-123');
    assert.strictEqual(secret.refreshToken, 'refresh-456');

    // File should NOT have plaintext tokens
    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.tokens.accessToken, undefined);
    assert.strictEqual(file.tokens.refreshToken, undefined);
    assert.strictEqual(file.tokens.credentialStore, true);
    assert.strictEqual(file.tokens.tokenType, 'Bearer');
  });

  it('should fall back to file when credential store is not available', async () => {
    const credStore = mockCredentialStore(false);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    // Suppress the SecurityWarning during tests
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

    await client.exchangeCodeForToken({
      code: 'auth-code',
      state: 'test-state',
      codeVerifier: 'test-verifier',
    });

    process.removeListener('warning', handler);

    // File should have plaintext tokens
    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.tokens.accessToken, 'access-plain');
    assert.strictEqual(file.tokens.refreshToken, 'refresh-plain');
    assert.strictEqual(file.tokens.credentialStore, undefined);

    // Warning should have been emitted
    assert.ok(warnings.length > 0);
    assert.ok(warnings[0].message.includes('plaintext'));
  });

  it('should read tokens from credential store when credentialStore flag is set', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    // Pre-populate credential store and file
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

    // File has inline tokens (old format)
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

    // File says credentialStore: true but store is empty
    await fs.writeFile(
      storePath,
      JSON.stringify({
        tokens: {
          credentialStore: true,
          expiresAt: Date.now() + 3600000,
        },
      }),
    );

    await assert.rejects(() => client.getAccessToken(), /No access token available/);
  });

  it('should preserve refresh token during token refresh', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    // Pre-populate with existing tokens
    credStore._secrets['mcp.test.example.com'] = JSON.stringify({
      accessToken: 'old-access',
      refreshToken: 'original-refresh',
    });

    await fs.writeFile(
      storePath,
      JSON.stringify({
        tokens: {
          credentialStore: true,
          expiresAt: Date.now() - 60000, // expired
          tokenType: 'Bearer',
        },
      }),
    );

    // Token endpoint returns new access token but no new refresh token
    client.httpClient.post = async () => ({
      data: {
        access_token: 'new-access',
        token_type: 'Bearer',
        expires_in: 3600,
      },
    });

    const newToken = await client.refreshToken();
    assert.strictEqual(newToken, 'new-access');

    // Refresh token should be preserved
    const secret = JSON.parse(credStore._secrets['mcp.test.example.com']);
    assert.strictEqual(secret.accessToken, 'new-access');
    assert.strictEqual(secret.refreshToken, 'original-refresh');
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
              authorization_endpoint: 'https://auth.example.com/authorize',
              token_endpoint: 'https://auth.example.com/token',
              registration_endpoint: 'https://auth.example.com/register',
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
    assert.strictEqual(client.authorizationEndpoint, 'https://auth.example.com/authorize');
    assert.strictEqual(client.tokenEndpoint, 'https://auth.example.com/token');

    // Should have called protected-resource and authorization-server discovery
    assert.ok(requests.gets.some((u) => u.includes('oauth-protected-resource')));
    assert.ok(requests.gets.some((u) => u.includes('oauth-authorization-server')));

    // Should have registered via DCR
    assert.strictEqual(requests.posts.length, 1);
    assert.ok(requests.posts[0].url.includes('/register'));
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
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            registration_endpoint: 'https://auth.example.com/register',
          },
        };
      },
      post: async () => ({ data: { client_id: 'cached-client' } }),
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);
    await client.initialize();
    const firstGetCount = getCount;

    // Second call should be a no-op
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
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            registration_endpoint: 'https://auth.example.com/register',
          },
        };
      },
      post: async () => {
        postCount++;
        // Simulate network delay
        await new Promise((r) => setTimeout(r, 10));
        return { data: { client_id: 'concurrent-client' } };
      },
    });

    const { client } = createClient(tmpDir, mockCredentialStore(), http);

    // Call initialize concurrently
    await Promise.all([client.initialize(), client.initialize(), client.initialize()]);

    // Should only register once despite 3 concurrent calls
    assert.strictEqual(postCount, 1);
  });

  it('should validate code parameter in exchangeCodeForToken', async () => {
    const { client } = createInitializedClient(tmpDir, mockCredentialStore());
    await assert.rejects(
      () => client.exchangeCodeForToken({ state: 's', codeVerifier: 'v' }),
      /code is required/,
    );
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
          // Simulate 404 / empty body — no token_endpoint means fallback triggers
          return { data: {} };
        }
        if (url.includes('openid-configuration')) {
          return {
            data: {
              authorization_endpoint: 'https://auth.example.com/authorize',
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

    // Both discovery URLs should have been attempted
    assert.ok(requests.gets.some((u) => u.includes('oauth-authorization-server')));
    assert.ok(requests.gets.some((u) => u.includes('openid-configuration')));
  });
});

describe('MCPAuthClient - getAuthorizationUrl()', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fdx-urltest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should include all required OAuth parameters', async () => {
    const { client } = createInitializedClient(tmpDir, mockCredentialStore());

    const { url, state, codeVerifier, codeChallenge } = await client.getAuthorizationUrl();
    const parsed = new URL(url);

    assert.strictEqual(parsed.origin, 'https://auth.example.com');
    assert.strictEqual(parsed.pathname, '/authorize');
    assert.strictEqual(parsed.searchParams.get('response_type'), 'code');
    assert.strictEqual(parsed.searchParams.get('client_id'), 'test-client-id');
    assert.strictEqual(
      parsed.searchParams.get('redirect_uri'),
      'http://localhost:6260/oauth/callback',
    );
    assert.strictEqual(parsed.searchParams.get('code_challenge_method'), 'S256');
    assert.strictEqual(parsed.searchParams.get('prompt'), 'consent');
    assert.strictEqual(parsed.searchParams.get('resource'), 'https://mcp.test.example.com');

    // PKCE values should be present
    assert.ok(state);
    assert.ok(codeVerifier);
    assert.ok(codeChallenge);
    assert.strictEqual(parsed.searchParams.get('state'), state);
    assert.strictEqual(parsed.searchParams.get('code_challenge'), codeChallenge);

    // Scope should include required values
    const scope = parsed.searchParams.get('scope');
    assert.ok(scope.includes('openid'));
    assert.ok(scope.includes('offline_access'));
  });

  it('should generate unique state and verifier each time', async () => {
    const { client } = createInitializedClient(tmpDir, mockCredentialStore());

    const first = await client.getAuthorizationUrl();
    const second = await client.getAuthorizationUrl();

    assert.notStrictEqual(first.state, second.state);
    assert.notStrictEqual(first.codeVerifier, second.codeVerifier);
  });
});

describe('MCPAuthClient - Device Authorization Flow (RFC 8628)', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fdx-devtest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('initializeForDevice', () => {
    it('should register device client via DCR and cache deviceClientId', async () => {
      const http = mockHttpClient({
        get: async (url) => {
          if (url.includes('oauth-protected-resource')) {
            return { data: { authorization_servers: ['https://auth.example.com'] } };
          }
          if (url.includes('oauth-authorization-server')) {
            return {
              data: {
                authorization_endpoint: 'https://auth.example.com/authorize',
                token_endpoint: 'https://auth.example.com/token',
                registration_endpoint: 'https://auth.example.com/register',
                device_authorization_endpoint: 'https://auth.example.com/devicecode',
              },
            };
          }
          return { data: {} };
        },
        post: async () => ({ data: { client_id: 'device-registered-id' } }),
      });

      const { client } = createClient(tmpDir, mockCredentialStore(), http);
      await client.initializeForDevice();

      assert.strictEqual(client.deviceClientId, 'device-registered-id');
      assert.strictEqual(client._deviceInitialized, true);
    });

    it('should use no redirect_uris and only device_code grant in DCR', async () => {
      let registrationBody;
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
        post: async (_url, body) => {
          registrationBody = typeof body === 'string' ? body : JSON.stringify(body);
          return { data: { client_id: 'device-id' } };
        },
      });

      const { client } = createClient(tmpDir, mockCredentialStore(), http);
      await client.initializeForDevice();

      const parsed = JSON.parse(registrationBody);
      assert.deepStrictEqual(parsed.grant_types, ['urn:ietf:params:oauth:grant-type:device_code']);
      assert.strictEqual(parsed.redirect_uris, undefined);
    });

    it('should reuse cached deviceClientId without re-registering', async () => {
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
          return { data: { client_id: 'device-id' } };
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
            deviceClientId: 'cached-device-id',
          },
        }),
      );

      await client.initializeForDevice();

      assert.strictEqual(client.deviceClientId, 'cached-device-id');
      assert.strictEqual(postCount, 0);
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
              // no device_authorization_endpoint
            },
          };
        },
      });

      const { client } = createClient(tmpDir, mockCredentialStore(), http);
      await assert.rejects(() => client.initializeForDevice(), /not supported/);
    });

    it('should store interactive and device clientIds independently', async () => {
      let postCount = 0;
      const http = mockHttpClient({
        get: async (url) => {
          if (url.includes('oauth-protected-resource')) {
            return { data: { authorization_servers: ['https://auth.example.com'] } };
          }
          return {
            data: {
              authorization_endpoint: 'https://auth.example.com/authorize',
              token_endpoint: 'https://auth.example.com/token',
              registration_endpoint: 'https://auth.example.com/register',
              device_authorization_endpoint: 'https://auth.example.com/devicecode',
            },
          };
        },
        post: async () => {
          postCount++;
          return { data: { client_id: `client-${postCount}` } };
        },
      });

      const { client, storePath } = createClient(tmpDir, mockCredentialStore(), http);
      await client.initialize();
      await client.initializeForDevice();

      const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
      assert.ok(file.mcpAuth.clientId, 'interactive clientId should be stored');
      assert.ok(file.mcpAuth.deviceClientId, 'device clientId should be stored');
      assert.notStrictEqual(file.mcpAuth.clientId, file.mcpAuth.deviceClientId);
      assert.strictEqual(postCount, 2);
    });
  });

  it('startDeviceFlow should return device code info', async () => {
    const { client } = createDeviceClient(tmpDir, mockCredentialStore());

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
    const { client } = createDeviceClient(tmpDir, mockCredentialStore());

    client.httpClient.post = async () => ({
      data: { device_code: 'd', user_code: 'U', verification_uri: 'https://v.example.com', expires_in: 900 },
    });

    const result = await client.startDeviceFlow();
    assert.strictEqual(result.interval, 5);
  });

  it('startDeviceFlow should throw when device flow is not supported by server', async () => {
    const { client } = createDeviceClient(tmpDir, mockCredentialStore());
    client.deviceAuthorizationEndpoint = undefined;

    await assert.rejects(() => client.startDeviceFlow(), /not supported/);
  });

  it('pollDeviceToken should succeed after authorization_pending responses', async () => {
    const credStore = mockCredentialStore();
    const { client } = createDeviceClient(tmpDir, credStore);

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
    const { client } = createDeviceClient(tmpDir, mockCredentialStore());

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
    const { client } = createDeviceClient(tmpDir, mockCredentialStore());

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
    const { client } = createDeviceClient(tmpDir, mockCredentialStore());

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

  it('pollDeviceToken should store tokens in credential store on success', async () => {
    const credStore = mockCredentialStore();
    const { client } = createDeviceClient(tmpDir, credStore);

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

    // Seed a secret as if the user is authenticated
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
      JSON.stringify({ mcpAuth: { clientId: 'cid', deviceClientId: 'dcid' }, tokens: { accessToken: 'at' } }),
    );

    await client.logout();

    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.ok(file.mcpAuth, 'mcpAuth should be preserved');
    assert.strictEqual(file.mcpAuth.clientId, 'cid');
    assert.strictEqual(file.mcpAuth.deviceClientId, 'dcid');
    assert.strictEqual(file.tokens, undefined, 'tokens should be removed');
  });

  it('should reset in-memory initialization flags', async () => {
    const credStore = mockCredentialStore();
    const { client, storePath } = createInitializedClient(tmpDir, credStore);

    // Also mark device as initialized
    client._deviceInitialized = true;
    client._discovered = true;

    await fs.writeFile(storePath, JSON.stringify({}));
    await client.logout();

    assert.strictEqual(client._initialized, false);
    assert.strictEqual(client._deviceInitialized, false);
    assert.strictEqual(client._discovered, false);
  });

  it('should not throw when no secret is stored (unauthenticated)', async () => {
    const credStore = mockCredentialStore();
    const { client, storePath } = createClient(tmpDir, credStore);

    await fs.writeFile(storePath, JSON.stringify({ mcpAuth: { clientId: 'cid' } }));

    // Should complete without error even if there was never a secret
    await assert.doesNotReject(() => client.logout());
  });

  it('should not throw when store file does not exist', async () => {
    const credStore = mockCredentialStore();
    const { client } = createClient(tmpDir, credStore);

    // storePath points to a non-existent file
    await assert.doesNotReject(() => client.logout());
  });
});
