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
    redirectUri: 'http://localhost:6274/oauth/callback',
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
      'http://localhost:6274/oauth/callback',
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
