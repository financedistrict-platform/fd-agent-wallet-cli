const assert = require('node:assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { MCPAuthClient } = require('../src/mcp-auth');

const TEST_TENANT = 'testtenant';
const TEST_CLIENT_ID = 'test-client-id';
const TEST_AUTHORITY = `https://${TEST_TENANT}.ciamlogin.com/${TEST_TENANT}.onmicrosoft.com`;

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
    entraConfig: {
      authority: TEST_AUTHORITY,
      clientId: TEST_CLIENT_ID,
      scopes: 'openid offline_access',
    },
  });

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
    const { client, storePath } = createClient(
      tmpDir,
      credStore,
      mockHttpClient({
        post: async () => ({
          data: {
            access_token: 'access-123',
            refresh_token: 'refresh-456',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid',
          },
        }),
      }),
    );

    await client.completeSignIn('ct-123', 'otp-code', 'user@example.com');

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
    const { client, storePath } = createClient(
      tmpDir,
      credStore,
      mockHttpClient({
        post: async () => ({
          data: {
            access_token: 'access-plain',
            refresh_token: 'refresh-plain',
            token_type: 'Bearer',
            expires_in: 3600,
          },
        }),
      }),
    );

    const warnings = [];
    const handler = (w) => warnings.push(w);
    process.on('warning', handler);

    await client.completeSignIn('ct-123', 'otp-code', 'user@example.com');

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
    const { client, storePath } = createClient(tmpDir, credStore);

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
    const { client, storePath } = createClient(tmpDir, credStore);

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

    await assert.rejects(() => client.getAccessToken(), /credential store is unavailable/);
  });

  it('should throw when credential store throws during read', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createClient(tmpDir, credStore);

    credStore.getSecret = () => {
      throw new Error('dbus connection failed');
    };

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

    await assert.rejects(() => client.getAccessToken(), /credential store is unavailable/);
  });

  it('should preserve refresh token during token refresh', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createClient(
      tmpDir,
      credStore,
      mockHttpClient({
        post: async () => ({
          data: {
            access_token: 'new-access',
            token_type: 'Bearer',
            expires_in: 3600,
          },
        }),
      }),
    );

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

    const newToken = await client.refreshToken();
    assert.strictEqual(newToken, 'new-access');

    const secret = JSON.parse(credStore._secrets['mcp.test.example.com']);
    assert.strictEqual(secret.accessToken, 'new-access');
    assert.strictEqual(secret.refreshToken, 'original-refresh');
  });

  it('should send refresh_token grant to Entra token endpoint', async () => {
    let postCount = 0;
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createClient(
      tmpDir,
      credStore,
      mockHttpClient({
        post: async (url, body) => {
          postCount++;
          assert.ok(url.includes('/oauth2/v2.0/token'), 'should POST to Entra token endpoint');
          const params = new URLSearchParams(body);
          assert.strictEqual(params.get('grant_type'), 'refresh_token');
          assert.strictEqual(params.get('client_id'), TEST_CLIENT_ID);
          return { data: { access_token: 'new-at', token_type: 'Bearer', expires_in: 3600 } };
        },
      }),
    );

    credStore._secrets['mcp.test.example.com'] = JSON.stringify({
      accessToken: 'old-at',
      refreshToken: 'my-refresh-token',
    });
    await fs.writeFile(
      storePath,
      JSON.stringify({ mcpAuth: { email: 'user@example.com' }, tokens: { credentialStore: true } }),
    );

    const newToken = await client.refreshToken();
    assert.strictEqual(newToken, 'new-at');
    assert.strictEqual(postCount, 1, 'only one POST');
  });

  it('should throw when clientId is not configured during refresh', async () => {
    const credStore = mockCredentialStore(true);
    const storePath = path.join(tmpDir, 'auth.json');
    const client = new MCPAuthClient({
      mcpServerUrl: 'https://mcp.test.example.com',
      storePath,
      httpClient: mockHttpClient(),
      credentialStore: credStore,
      entraConfig: { authority: TEST_AUTHORITY, scopes: 'openid' },
    });

    credStore._secrets['mcp.test.example.com'] = JSON.stringify({
      accessToken: 'old-at',
      refreshToken: 'my-refresh-token',
    });
    await fs.writeFile(storePath, JSON.stringify({ tokens: { credentialStore: true } }));

    await assert.rejects(() => client.refreshToken(), /No client ID/);
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
          mcpAuth: { email: 'user@example.com' },
        }),
      );

      const state = await client.getTokenState();
      assert.strictEqual(state.authenticated, true);
      assert.strictEqual(state.expired, false);
      assert.strictEqual(state.hasRefresh, true);
      assert.strictEqual(state.email, 'user@example.com');
      assert.strictEqual(state.usingCredentialStore, true);
    });

    it('should return not-authenticated when no tokens exist', async () => {
      const credStore = mockCredentialStore(true);
      const { client } = createClient(tmpDir, credStore);

      const state = await client.getTokenState();
      assert.strictEqual(state.authenticated, false);
      assert.strictEqual(state.usingCredentialStore, false);
    });

    it('should return not-authenticated when credential store is unavailable', async () => {
      const credStore = mockCredentialStore(true);
      const { client, storePath } = createClient(tmpDir, credStore);

      credStore.getSecret = () => null;

      await fs.writeFile(
        storePath,
        JSON.stringify({
          tokens: {
            credentialStore: true,
            expiresAt: Date.now() + 3600000,
          },
          mcpAuth: { email: 'user@example.com' },
        }),
      );

      const state = await client.getTokenState();
      assert.strictEqual(state.authenticated, false);
      assert.strictEqual(state.usingCredentialStore, true);
      assert.strictEqual(state.email, 'user@example.com');
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

describe('MCPAuthClient - Sign-up Flow', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fdx-signuptest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('startSignUp should POST to signup/start and return continuationToken', async () => {
    const requests = [];
    const { client } = createClient(
      tmpDir,
      mockCredentialStore(),
      mockHttpClient({
        post: async (url, body) => {
          requests.push({ url, body });
          return { data: { continuation_token: 'ct-signup-1' } };
        },
      }),
    );

    const result = await client.startSignUp('agent@example.com');

    assert.strictEqual(result.continuationToken, 'ct-signup-1');
    assert.strictEqual(requests.length, 1);
    assert.ok(requests[0].url.includes('/signup/v1.0/start'));
    const params = new URLSearchParams(requests[0].body);
    assert.strictEqual(params.get('username'), 'agent@example.com');
    assert.strictEqual(params.get('client_id'), TEST_CLIENT_ID);
  });

  it('startSignUp should throw when email is missing', async () => {
    const { client } = createClient(tmpDir, mockCredentialStore());
    await assert.rejects(() => client.startSignUp(), /email is required/);
  });

  it('startSignUp should throw when clientId is not configured', async () => {
    const storePath = path.join(tmpDir, 'auth.json');
    const client = new MCPAuthClient({
      mcpServerUrl: 'https://mcp.test.example.com',
      storePath,
      httpClient: mockHttpClient(),
      credentialStore: mockCredentialStore(),
      entraConfig: { authority: TEST_AUTHORITY, scopes: 'openid' },
    });

    await assert.rejects(() => client.startSignUp('a@b.com'), /client ID not configured/);
  });

  it('startSignUp should throw when Entra returns redirect challenge', async () => {
    const { client } = createClient(
      tmpDir,
      mockCredentialStore(),
      mockHttpClient({
        post: async () => ({ data: { challenge_type: 'redirect' } }),
      }),
    );

    await assert.rejects(() => client.startSignUp('a@b.com'), /browser-based/);
  });

  it('challengeSignUp should return OTP challenge details', async () => {
    const { client } = createClient(
      tmpDir,
      mockCredentialStore(),
      mockHttpClient({
        post: async () => ({
          data: {
            continuation_token: 'ct-challenge-1',
            code_length: 8,
            challenge_target_label: 'ag***@example.com',
            challenge_channel: 'email',
            challenge_type: 'oob',
          },
        }),
      }),
    );

    const result = await client.challengeSignUp('ct-signup-1');
    assert.strictEqual(result.continuationToken, 'ct-challenge-1');
    assert.strictEqual(result.codeLength, 8);
    assert.strictEqual(result.challengeChannel, 'email');
    assert.strictEqual(result.challengeTargetLabel, 'ag***@example.com');
  });

  it('challengeSignUp should throw when continuationToken is missing', async () => {
    const { client } = createClient(tmpDir, mockCredentialStore());
    await assert.rejects(() => client.challengeSignUp(), /continuationToken is required/);
  });

  it('continueSignUp should submit OTP and return new continuationToken', async () => {
    const requests = [];
    const { client } = createClient(
      tmpDir,
      mockCredentialStore(),
      mockHttpClient({
        post: async (url, body) => {
          requests.push({ url, body });
          return { data: { continuation_token: 'ct-continue-1' } };
        },
      }),
    );

    const result = await client.continueSignUp('ct-challenge-1', '12345678');
    assert.strictEqual(result.continuationToken, 'ct-continue-1');
    assert.ok(requests[0].url.includes('/signup/v1.0/continue'));
    const params = new URLSearchParams(requests[0].body);
    assert.strictEqual(params.get('oob'), '12345678');
    assert.strictEqual(params.get('grant_type'), 'oob');
  });

  it('continueSignUp should throw when otpCode is missing', async () => {
    const { client } = createClient(tmpDir, mockCredentialStore());
    await assert.rejects(() => client.continueSignUp('ct', null), /otpCode is required/);
  });

  it('completeSignUp should exchange token and persist credentials', async () => {
    const credStore = mockCredentialStore(true);
    const requests = [];
    const { client, storePath } = createClient(
      tmpDir,
      credStore,
      mockHttpClient({
        post: async (url, body) => {
          requests.push({ url, body });
          return {
            data: {
              access_token: 'signup-at',
              refresh_token: 'signup-rt',
              token_type: 'Bearer',
              expires_in: 3600,
              scope: 'openid offline_access',
            },
          };
        },
      }),
    );

    await client.completeSignUp('ct-continue-1', 'agent@example.com');

    assert.ok(requests[0].url.includes('/oauth2/v2.0/token'));
    const params = new URLSearchParams(requests[0].body);
    assert.strictEqual(params.get('grant_type'), 'continuation_token');
    assert.strictEqual(params.get('username'), 'agent@example.com');

    const secret = JSON.parse(credStore._secrets['mcp.test.example.com']);
    assert.strictEqual(secret.accessToken, 'signup-at');

    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.mcpAuth.email, 'agent@example.com');
    assert.strictEqual(file.tokens.credentialStore, true);
  });

  it('completeSignUp should throw when email is missing', async () => {
    const { client } = createClient(tmpDir, mockCredentialStore());
    await assert.rejects(() => client.completeSignUp('ct'), /email is required/);
  });

  it('should use custom authority URL when configured', async () => {
    const requests = [];
    const storePath = path.join(tmpDir, 'auth.json');
    const client = new MCPAuthClient({
      mcpServerUrl: 'https://mcp.test.example.com',
      storePath,
      httpClient: mockHttpClient({
        post: async (url, body) => {
          requests.push({ url, body });
          return { data: { continuation_token: 'ct-custom' } };
        },
      }),
      credentialStore: mockCredentialStore(),
      entraConfig: {
        authority: 'https://auth.custom.xyz/mytenant.onmicrosoft.com',
        clientId: TEST_CLIENT_ID,
      },
    });

    await client.startSignUp('a@b.com');
    assert.ok(
      requests[0].url.startsWith('https://auth.custom.xyz/mytenant.onmicrosoft.com/'),
      'should use custom authority, got: ' + requests[0].url,
    );
  });
});

describe('MCPAuthClient - Sign-in Flow', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fdx-signintest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('startSignIn should POST to initiate and return continuationToken', async () => {
    const requests = [];
    const { client } = createClient(
      tmpDir,
      mockCredentialStore(),
      mockHttpClient({
        post: async (url, body) => {
          requests.push({ url, body });
          return { data: { continuation_token: 'ct-signin-1' } };
        },
      }),
    );

    const result = await client.startSignIn('agent@example.com');

    assert.strictEqual(result.continuationToken, 'ct-signin-1');
    assert.strictEqual(requests.length, 1);
    assert.ok(requests[0].url.includes('/oauth2/v2.0/initiate'));
    const params = new URLSearchParams(requests[0].body);
    assert.strictEqual(params.get('username'), 'agent@example.com');
    assert.strictEqual(params.get('client_id'), TEST_CLIENT_ID);
    assert.strictEqual(params.get('challenge_type'), 'oob redirect');
  });

  it('startSignIn should throw when email is missing', async () => {
    const { client } = createClient(tmpDir, mockCredentialStore());
    await assert.rejects(() => client.startSignIn(), /email is required/);
  });

  it('startSignIn should throw when Entra returns redirect challenge', async () => {
    const { client } = createClient(
      tmpDir,
      mockCredentialStore(),
      mockHttpClient({
        post: async () => ({ data: { challenge_type: 'redirect' } }),
      }),
    );

    await assert.rejects(() => client.startSignIn('a@b.com'), /browser-based/);
  });

  it('challengeSignIn should return OTP challenge details', async () => {
    const { client } = createClient(
      tmpDir,
      mockCredentialStore(),
      mockHttpClient({
        post: async (url) => {
          assert.ok(url.includes('/oauth2/v2.0/challenge'));
          return {
            data: {
              continuation_token: 'ct-signin-challenge',
              code_length: 8,
              challenge_target_label: 'ag***@example.com',
              challenge_channel: 'email',
              challenge_type: 'oob',
            },
          };
        },
      }),
    );

    const result = await client.challengeSignIn('ct-signin-1');
    assert.strictEqual(result.continuationToken, 'ct-signin-challenge');
    assert.strictEqual(result.codeLength, 8);
    assert.strictEqual(result.challengeChannel, 'email');
  });

  it('challengeSignIn should throw when continuationToken is missing', async () => {
    const { client } = createClient(tmpDir, mockCredentialStore());
    await assert.rejects(() => client.challengeSignIn(), /continuationToken is required/);
  });

  it('challengeSignIn should throw when Entra returns redirect', async () => {
    const { client } = createClient(
      tmpDir,
      mockCredentialStore(),
      mockHttpClient({
        post: async () => ({ data: { challenge_type: 'redirect' } }),
      }),
    );

    await assert.rejects(() => client.challengeSignIn('ct'), /browser-based/);
  });

  it('completeSignIn should submit OTP and persist tokens', async () => {
    const credStore = mockCredentialStore(true);
    const requests = [];
    const { client, storePath } = createClient(
      tmpDir,
      credStore,
      mockHttpClient({
        post: async (url, body) => {
          requests.push({ url, body });
          return {
            data: {
              access_token: 'signin-at',
              refresh_token: 'signin-rt',
              token_type: 'Bearer',
              expires_in: 3600,
              scope: 'openid offline_access',
            },
          };
        },
      }),
    );

    await client.completeSignIn('ct-signin-challenge', '87654321', 'agent@example.com');

    assert.ok(requests[0].url.includes('/oauth2/v2.0/token'));
    const params = new URLSearchParams(requests[0].body);
    assert.strictEqual(params.get('grant_type'), 'oob');
    assert.strictEqual(params.get('oob'), '87654321');

    const secret = JSON.parse(credStore._secrets['mcp.test.example.com']);
    assert.strictEqual(secret.accessToken, 'signin-at');
    assert.strictEqual(secret.refreshToken, 'signin-rt');

    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.mcpAuth.email, 'agent@example.com');
    assert.strictEqual(file.tokens.credentialStore, true);
  });

  it('completeSignIn should throw when otpCode is missing', async () => {
    const { client } = createClient(tmpDir, mockCredentialStore());
    await assert.rejects(() => client.completeSignIn('ct', null), /otpCode is required/);
  });

  it('completeSignIn should throw when continuationToken is missing', async () => {
    const { client } = createClient(tmpDir, mockCredentialStore());
    await assert.rejects(() => client.completeSignIn(null, '123'), /continuationToken is required/);
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
    const { client, storePath } = createClient(tmpDir, credStore);

    credStore.setSecret(
      'mcp.test.example.com',
      JSON.stringify({ accessToken: 'at', refreshToken: 'rt' }),
    );
    await fs.writeFile(
      storePath,
      JSON.stringify({ mcpAuth: { email: 'a@b.com' }, tokens: { accessToken: 'at' } }),
    );

    await client.logout();

    assert.strictEqual(credStore.getSecret('mcp.test.example.com'), null);
  });

  it('should remove tokens from the store file and clear mcpAuth', async () => {
    const credStore = mockCredentialStore();
    const { client, storePath } = createClient(tmpDir, credStore);

    await fs.writeFile(
      storePath,
      JSON.stringify({ mcpAuth: { email: 'a@b.com' }, tokens: { accessToken: 'at' } }),
    );

    await client.logout();

    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.mcpAuth, undefined, 'mcpAuth should be removed');
    assert.strictEqual(file.tokens, undefined, 'tokens should be removed');
  });

  it('should not throw when no secret is stored (unauthenticated)', async () => {
    const credStore = mockCredentialStore();
    const { client, storePath } = createClient(tmpDir, credStore);

    await fs.writeFile(storePath, JSON.stringify({ mcpAuth: { email: 'a@b.com' } }));

    await assert.doesNotReject(() => client.logout());
  });

  it('should not throw when store file does not exist', async () => {
    const credStore = mockCredentialStore();
    const { client } = createClient(tmpDir, credStore);

    await assert.doesNotReject(() => client.logout());
  });

  it('should clear pending verification secret and state', async () => {
    const credStore = mockCredentialStore();
    const { client, storePath } = createClient(tmpDir, credStore);

    credStore.setSecret('mcp.test.example.com/pending', 'ct-pending');
    await fs.writeFile(
      storePath,
      JSON.stringify({
        tokens: { accessToken: 'at' },
        pendingVerification: { email: 'a@b.com', flow: 'register', credentialStore: true },
      }),
    );

    await client.logout();

    assert.strictEqual(credStore.getSecret('mcp.test.example.com/pending'), null);
    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.pendingVerification, undefined);
  });
});

describe('MCPAuthClient - Pending Verification', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fdx-pendingtest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should store continuation token in credential store', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createClient(tmpDir, credStore);

    await client.savePendingVerification({
      continuationToken: 'ct-pending-123',
      email: 'user@example.com',
      flow: 'register',
    });

    assert.strictEqual(credStore.getSecret('mcp.test.example.com/pending'), 'ct-pending-123');
    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.pendingVerification.email, 'user@example.com');
    assert.strictEqual(file.pendingVerification.flow, 'register');
    assert.strictEqual(file.pendingVerification.credentialStore, true);
    assert.strictEqual(file.pendingVerification.continuationToken, undefined);
  });

  it('should fall back to state file when credential store unavailable', async () => {
    const credStore = mockCredentialStore(false);
    const { client, storePath } = createClient(tmpDir, credStore);

    await client.savePendingVerification({
      continuationToken: 'ct-fallback',
      email: 'user@example.com',
      flow: 'login',
    });

    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.pendingVerification.continuationToken, 'ct-fallback');
    assert.strictEqual(file.pendingVerification.credentialStore, undefined);
  });

  it('should retrieve pending verification from credential store', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createClient(tmpDir, credStore);

    credStore.setSecret('mcp.test.example.com/pending', 'ct-stored');
    await fs.writeFile(
      storePath,
      JSON.stringify({
        pendingVerification: { email: 'user@example.com', flow: 'register', credentialStore: true },
      }),
    );

    const pending = await client.getPendingVerification();
    assert.strictEqual(pending.continuationToken, 'ct-stored');
    assert.strictEqual(pending.email, 'user@example.com');
    assert.strictEqual(pending.flow, 'register');
  });

  it('should retrieve pending verification from state file fallback', async () => {
    const credStore = mockCredentialStore(false);
    const { client, storePath } = createClient(tmpDir, credStore);

    await fs.writeFile(
      storePath,
      JSON.stringify({
        pendingVerification: {
          email: 'user@example.com',
          flow: 'login',
          continuationToken: 'ct-file',
        },
      }),
    );

    const pending = await client.getPendingVerification();
    assert.strictEqual(pending.continuationToken, 'ct-file');
    assert.strictEqual(pending.email, 'user@example.com');
    assert.strictEqual(pending.flow, 'login');
  });

  it('should return null when no pending verification exists', async () => {
    const credStore = mockCredentialStore(true);
    const { client } = createClient(tmpDir, credStore);

    const pending = await client.getPendingVerification();
    assert.strictEqual(pending, null);
  });

  it('should return null when credential store has no token', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createClient(tmpDir, credStore);

    await fs.writeFile(
      storePath,
      JSON.stringify({
        pendingVerification: { email: 'user@example.com', flow: 'register', credentialStore: true },
      }),
    );

    const pending = await client.getPendingVerification();
    assert.strictEqual(pending, null);
  });

  it('should clear pending verification from both stores', async () => {
    const credStore = mockCredentialStore(true);
    const { client, storePath } = createClient(tmpDir, credStore);

    credStore.setSecret('mcp.test.example.com/pending', 'ct-to-clear');
    await fs.writeFile(
      storePath,
      JSON.stringify({
        pendingVerification: { email: 'user@example.com', flow: 'register', credentialStore: true },
      }),
    );

    await client.clearPendingVerification();

    assert.strictEqual(credStore.getSecret('mcp.test.example.com/pending'), null);
    const file = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.strictEqual(file.pendingVerification, undefined);
  });
});
