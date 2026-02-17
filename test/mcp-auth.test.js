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

function mockHttpClient(postHandler) {
  return {
    get: async () => ({ data: {} }),
    post: postHandler || (async () => ({ data: {} })),
  };
}

function createClient(tmpDir, credStore) {
  const storePath = path.join(tmpDir, 'auth.json');
  const client = new MCPAuthClient({
    mcpServerUrl: 'https://mcp.test.example.com',
    redirectUri: 'http://localhost:6274/oauth/callback',
    storePath,
    httpClient: mockHttpClient(),
    credentialStore: credStore,
  });

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
    const { client, storePath } = createClient(tmpDir, credStore);

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
    const { client, storePath } = createClient(tmpDir, credStore);

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
    const { client, storePath } = createClient(tmpDir, credStore);

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
    const { client, storePath } = createClient(tmpDir, credStore);

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
    const { client, storePath } = createClient(tmpDir, credStore);

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
    const { client, storePath } = createClient(tmpDir, credStore);

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
      const { client, storePath } = createClient(tmpDir, credStore);

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
      const { client } = createClient(tmpDir, credStore);

      const state = await client.getTokenState();
      assert.strictEqual(state.authenticated, false);
      assert.strictEqual(state.usingCredentialStore, false);
    });

    it('should report expired tokens', async () => {
      const credStore = mockCredentialStore(true);
      const { client, storePath } = createClient(tmpDir, credStore);

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
