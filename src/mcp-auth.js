const axios = require('axios');

const defaultCredentialStore = require('./credential-store');
const logger = require('./utils/logger');
const { readStore, writeStore } = require('./storage');

/**
 * Entra External ID Native Authentication client.
 *
 * Sign-up: /signup/v1.0/start → /signup/v1.0/challenge → /signup/v1.0/continue → /oauth2/v2.0/token
 * Sign-in: /oauth2/v2.0/initiate → /oauth2/v2.0/challenge → /oauth2/v2.0/token
 */

class MCPAuthClient {
  constructor({ mcpServerUrl, storePath, httpClient, credentialStore, entraConfig }) {
    if (!mcpServerUrl) throw new Error('mcpServerUrl is required');
    if (!storePath) throw new Error('storePath is required');

    const parsed = new URL(mcpServerUrl);
    if (
      parsed.protocol !== 'https:' &&
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1'
    ) {
      throw new Error('mcpServerUrl must use HTTPS (HTTP is only allowed for localhost)');
    }

    this.mcpServerUrl = mcpServerUrl.replace(/\/$/, '');
    this.storePath = storePath;
    this.httpClient = httpClient || axios.create();
    this._credentialStore = credentialStore || defaultCredentialStore;

    // Entra Native Auth configuration
    const cfg = entraConfig || {};
    this.entraAuthority = cfg.authority;
    this.clientId = cfg.clientId;
    this.scopes = cfg.scopes || 'openid offline_access';
    this.challengeType = 'oob redirect';
  }

  // ---------------------------------------------------------------------------
  // Entra base URL
  // ---------------------------------------------------------------------------
  get #entraBaseUrl() {
    if (!this.entraAuthority) {
      throw new Error('Entra authority not configured.');
    }
    return this.entraAuthority.replace(/\/$/, '');
  }

  // ---------------------------------------------------------------------------
  // Sign-up flow (register new principal)
  // ---------------------------------------------------------------------------

  /**
   * Step 1: Start sign-up — sends OTP to the given email.
   * Returns { continuationToken }.
   */
  async startSignUp(email) {
    if (!email) throw new Error('email is required');
    if (!this.clientId) throw new Error('Entra client ID not configured');

    const url = `${this.#entraBaseUrl}/signup/v1.0/start`;
    const payload = new URLSearchParams({
      client_id: this.clientId,
      challenge_type: this.challengeType,
      username: email,
    });

    logger.debug('mcp-auth: starting sign-up', { email });
    const { data } = await this.httpClient.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (data.challenge_type === 'redirect') {
      throw new Error('Entra requires browser-based authentication — native auth may not be enabled for this app');
    }

    logger.info('mcp-auth: sign-up started', { email });
    return { continuationToken: data.continuation_token };
  }

  /**
   * Step 2: Request OTP challenge for sign-up.
   * Entra generates and emails the OTP code.
   * Returns { continuationToken, codeLength, challengeTargetLabel }.
   */
  async challengeSignUp(continuationToken) {
    if (!continuationToken) throw new Error('continuationToken is required');

    const url = `${this.#entraBaseUrl}/signup/v1.0/challenge`;
    const payload = new URLSearchParams({
      client_id: this.clientId,
      challenge_type: this.challengeType,
      continuation_token: continuationToken,
    });

    const { data } = await this.httpClient.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (data.challenge_type === 'redirect') {
      throw new Error('Entra requires browser-based authentication for this step');
    }

    logger.info('mcp-auth: sign-up OTP sent', {
      channel: data.challenge_channel,
      codeLength: data.code_length,
    });

    return {
      continuationToken: data.continuation_token,
      codeLength: data.code_length,
      challengeTargetLabel: data.challenge_target_label,
      challengeChannel: data.challenge_channel,
      interval: data.interval,
    };
  }

  /**
   * Step 3: Submit OTP to continue sign-up.
   * Returns { continuationToken } for the token exchange step.
   */
  async continueSignUp(continuationToken, otpCode) {
    if (!continuationToken) throw new Error('continuationToken is required');
    if (!otpCode) throw new Error('otpCode is required');

    const url = `${this.#entraBaseUrl}/signup/v1.0/continue`;
    const payload = new URLSearchParams({
      client_id: this.clientId,
      continuation_token: continuationToken,
      grant_type: 'oob',
      oob: otpCode,
    });

    const { data } = await this.httpClient.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (data.challenge_type === 'redirect') {
      throw new Error('Entra requires browser-based authentication for this step');
    }

    logger.info('mcp-auth: sign-up OTP verified');
    return { continuationToken: data.continuation_token };
  }

  /**
   * Step 4: Exchange sign-up continuation token for OAuth tokens.
   * Persists tokens locally.
   */
  async completeSignUp(continuationToken, email) {
    if (!continuationToken) throw new Error('continuationToken is required');
    if (!email) throw new Error('email is required');

    const url = `${this.#entraBaseUrl}/oauth2/v2.0/token`;
    const payload = new URLSearchParams({
      client_id: this.clientId,
      continuation_token: continuationToken,
      grant_type: 'continuation_token',
      scope: this.scopes,
      username: email,
    });

    const { data } = await this.httpClient.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    await this.#persistTokens(data);
    await this.#persistMCPAuth({ email });
    logger.info('mcp-auth: sign-up complete — tokens obtained', { email });
    return data;
  }

  // ---------------------------------------------------------------------------
  // Sign-in flow (existing principal)
  // ---------------------------------------------------------------------------

  /**
   * Step 1: Initiate sign-in — returns continuation token.
   */
  async startSignIn(email) {
    if (!email) throw new Error('email is required');
    if (!this.clientId) throw new Error('Entra client ID not configured');

    const url = `${this.#entraBaseUrl}/oauth2/v2.0/initiate`;
    const payload = new URLSearchParams({
      client_id: this.clientId,
      challenge_type: this.challengeType,
      username: email,
    });

    logger.debug('mcp-auth: starting sign-in', { email });
    const { data } = await this.httpClient.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (data.challenge_type === 'redirect') {
      throw new Error('Entra requires browser-based authentication — native auth may not be enabled for this app');
    }

    logger.info('mcp-auth: sign-in initiated', { email });
    return { continuationToken: data.continuation_token };
  }

  /**
   * Step 2: Request OTP challenge for sign-in.
   * Entra sends OTP to the user's email.
   */
  async challengeSignIn(continuationToken) {
    if (!continuationToken) throw new Error('continuationToken is required');

    const url = `${this.#entraBaseUrl}/oauth2/v2.0/challenge`;
    const payload = new URLSearchParams({
      client_id: this.clientId,
      challenge_type: this.challengeType,
      continuation_token: continuationToken,
    });

    const { data } = await this.httpClient.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (data.challenge_type === 'redirect') {
      throw new Error('Entra requires browser-based authentication for this step');
    }

    logger.info('mcp-auth: sign-in OTP sent', {
      channel: data.challenge_channel,
      codeLength: data.code_length,
    });

    return {
      continuationToken: data.continuation_token,
      codeLength: data.code_length,
      challengeTargetLabel: data.challenge_target_label,
      challengeChannel: data.challenge_channel,
    };
  }

  /**
   * Step 3: Submit OTP and obtain tokens for sign-in.
   * Persists tokens locally.
   */
  async completeSignIn(continuationToken, otpCode, email) {
    if (!continuationToken) throw new Error('continuationToken is required');
    if (!otpCode) throw new Error('otpCode is required');

    const url = `${this.#entraBaseUrl}/oauth2/v2.0/token`;
    const payload = new URLSearchParams({
      client_id: this.clientId,
      continuation_token: continuationToken,
      grant_type: 'oob',
      oob: otpCode,
      scope: this.scopes,
    });

    const { data } = await this.httpClient.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    await this.#persistTokens(data);
    await this.#persistMCPAuth({ email });
    logger.info('mcp-auth: sign-in complete — tokens obtained', { email });
    return data;
  }

  // ---------------------------------------------------------------------------
  // Token management (unchanged interface for MCPClient compatibility)
  // ---------------------------------------------------------------------------

  async getAccessToken() {
    const tokens = await this.#getTokens();
    if (!tokens?.accessToken) {
      throw new Error('No access token available — run "fdx login" or "fdx register" first');
    }

    // Refresh proactively if expiring within 30 seconds
    if (tokens.expiresAt && Date.now() >= tokens.expiresAt - 30_000) {
      return this.refreshToken();
    }

    return tokens.accessToken;
  }

  async refreshToken() {
    if (!this.clientId) {
      throw new Error('No client ID available — Entra client ID not configured');
    }

    const tokens = await this.#getTokens();
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available — run "fdx login" to re-authenticate');
    }

    logger.debug('mcp-auth: refreshing access token');

    const url = `${this.#entraBaseUrl}/oauth2/v2.0/token`;
    const payload = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: this.clientId,
      scope: this.scopes,
    });

    const { data } = await this.httpClient.post(url, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    await this.#persistTokens(data);
    logger.info('mcp-auth: access token refreshed');
    return data.access_token;
  }

  async getTokenState() {
    const store = await this.#readStore();
    let tokens = null;
    try {
      tokens = await this.#getTokens();
    } catch {
      // Credential store unavailable — report as not authenticated
    }

    return {
      authenticated: !!tokens?.accessToken,
      expired: tokens?.expiresAt ? Date.now() >= tokens.expiresAt : false,
      hasRefresh: !!tokens?.refreshToken,
      expiresAt: tokens?.expiresAt,
      email: store.mcpAuth?.email,
      usingCredentialStore: !!store.tokens?.credentialStore,
    };
  }

  async logout() {
    this._credentialStore.deleteSecret(this.#credentialAccount());
    this._credentialStore.deleteSecret(this.#pendingCredentialAccount());

    const store = await this.#readStore();
    delete store.tokens;
    delete store.mcpAuth;
    delete store.pendingVerification;
    await writeStore(store, this.storePath);

    logger.info('mcp-auth: logged out', { server: this.mcpServerUrl });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  #credentialAccount() {
    return new URL(this.mcpServerUrl).host;
  }

  async #getTokens() {
    const store = await this.#readStore();
    const tokens = store.tokens;
    if (!tokens) return null;

    if (tokens.credentialStore) {
      try {
        const raw = this._credentialStore.getSecret(this.#credentialAccount());
        if (raw) {
          const secrets = JSON.parse(raw);
          return { ...tokens, ...secrets };
        }
      } catch {
        // Credential store read threw — fall through to error below
      }
      throw new Error(
        'OS credential store is unavailable \u2014 re-run "fdx login" to re-authenticate',
      );
    }

    return tokens;
  }

  async #persistTokens(tokenResponse) {
    const store = await this.#readStore();
    const expiresInMs = (tokenResponse.expires_in || 0) * 1000;
    const accessToken = tokenResponse.access_token;

    // Preserve existing refresh token: check response first, then current tokens
    let refreshToken = tokenResponse.refresh_token || tokenResponse.refreshToken;
    if (!refreshToken) {
      try {
        const current = await this.#getTokens();
        refreshToken = current?.refreshToken;
      } catch {
        // Credential store unavailable — nothing to preserve
      }
    }

    const stored = this._credentialStore.setSecret(
      this.#credentialAccount(),
      JSON.stringify({ accessToken, refreshToken }),
    );

    store.tokens = {
      scope: tokenResponse.scope,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresAt: expiresInMs ? Date.now() + expiresInMs : undefined,
    };

    if (stored) {
      store.tokens.credentialStore = true;
    } else {
      store.tokens.accessToken = accessToken;
      store.tokens.refreshToken = refreshToken;
      process.emitWarning(
        'OS credential store not available. Tokens stored in plaintext at ' + this.storePath,
        'SecurityWarning',
      );
    }

    await writeStore(store, this.storePath);
  }

  async #persistMCPAuth(mcpAuth) {
    const store = await this.#readStore();
    store.mcpAuth = { ...store.mcpAuth, ...mcpAuth };
    await writeStore(store, this.storePath);
  }

  async savePendingVerification({ continuationToken, email, flow }) {
    // Store continuation token in OS credential store (sensitive)
    const account = this.#pendingCredentialAccount();
    const stored = this._credentialStore.setSecret(account, continuationToken);

    const store = await this.#readStore();
    store.pendingVerification = { email, flow, createdAt: Date.now() };
    if (!stored) {
      // Fallback: store in state file if credential store unavailable
      store.pendingVerification.continuationToken = continuationToken;
    } else {
      store.pendingVerification.credentialStore = true;
    }
    await writeStore(store, this.storePath);
  }

  async getPendingVerification() {
    const store = await this.#readStore();
    const pending = store.pendingVerification;
    if (!pending) return null;

    let continuationToken;
    if (pending.credentialStore) {
      continuationToken = this._credentialStore.getSecret(this.#pendingCredentialAccount());
    } else {
      continuationToken = pending.continuationToken;
    }

    if (!continuationToken) return null;
    return { continuationToken, email: pending.email, flow: pending.flow };
  }

  async clearPendingVerification() {
    this._credentialStore.deleteSecret(this.#pendingCredentialAccount());
    const store = await this.#readStore();
    delete store.pendingVerification;
    await writeStore(store, this.storePath);
  }

  #pendingCredentialAccount() {
    return `${new URL(this.mcpServerUrl).host}/pending`;
  }

  async #readStore() {
    return readStore(this.storePath);
  }
}

module.exports = { MCPAuthClient };
