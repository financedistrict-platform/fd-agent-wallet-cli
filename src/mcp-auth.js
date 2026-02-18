const axios = require('axios');

const defaultCredentialStore = require('./credential-store');
const logger = require('./utils/logger');
const { readStore, writeStore } = require('./storage');
const { generateCodeChallenge, generateCodeVerifier, generateState } = require('./utils/pkce');

class MCPAuthClient {
  constructor({ mcpServerUrl, redirectUri, storePath, httpClient, credentialStore }) {
    if (!mcpServerUrl) throw new Error('mcpServerUrl is required');
    if (!redirectUri) throw new Error('redirectUri is required');
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
    this.redirectUri = redirectUri;
    this.storePath = storePath;
    this.httpClient = httpClient || axios.create();
    this._credentialStore = credentialStore || defaultCredentialStore;
    this._initialized = false;
    this._initPromise = null;
    this._deviceInitialized = false;
    this._deviceInitPromise = null;
    this._discovered = false;
    this._discoveryPromise = null;
  }

  async initialize() {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this.#doInitialize();
    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  async #doInitialize() {
    await this.#ensureDiscovered();

    const store = await this.#readStore();
    const cached = store.mcpAuth;

    if (cached?.clientId) {
      this.clientId = cached.clientId;
      this._initialized = true;
      logger.debug('mcp-auth: using cached interactive client', { clientId: this.clientId });
      return;
    }

    // Device-only setup — reuse device client_id for token refresh
    if (cached?.deviceClientId) {
      this.clientId = cached.deviceClientId;
      this._initialized = true;
      logger.debug('mcp-auth: using cached device client as interactive', { clientId: this.clientId });
      return;
    }

    if (this.registrationEndpoint) {
      const { data: registration } = await this.httpClient.post(
        this.registrationEndpoint,
        {
          redirect_uris: [this.redirectUri],
          client_name: 'FDX Wallet Client',
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          scope: ['openid', 'offline_access', 'api://fd-agent-wallet-mcp/mcp:tools'],
        },
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );

      this.clientId = registration.client_id;
      await this.#persistMCPAuth({ clientId: this.clientId });
      logger.info('mcp-auth: interactive client registered', { clientId: this.clientId });
    }

    this._initialized = true;
  }

  async initializeForDevice() {
    if (this._deviceInitialized) return;
    if (this._deviceInitPromise) return this._deviceInitPromise;
    this._deviceInitPromise = this.#doInitializeDevice();
    try {
      await this._deviceInitPromise;
    } finally {
      this._deviceInitPromise = null;
    }
  }

  async #doInitializeDevice() {
    await this.#ensureDiscovered();

    if (!this.deviceAuthorizationEndpoint) {
      throw new Error('Device authorization flow is not supported by this OAuth server');
    }

    const store = await this.#readStore();
    const cached = store.mcpAuth;

    if (cached?.deviceClientId) {
      this.deviceClientId = cached.deviceClientId;
      this._deviceInitialized = true;
      logger.debug('mcp-auth: using cached device client', { deviceClientId: this.deviceClientId });
      return;
    }

    if (this.registrationEndpoint) {
      const { data: registration } = await this.httpClient.post(
        this.registrationEndpoint,
        {
          client_name: 'FDX Wallet Client',
          token_endpoint_auth_method: 'none',
          grant_types: ['urn:ietf:params:oauth:grant-type:device_code'],
          response_types: [],
        },
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );

      this.deviceClientId = registration.client_id;
      await this.#persistMCPAuth({ deviceClientId: this.deviceClientId });
      logger.info('mcp-auth: device client registered', { deviceClientId: this.deviceClientId });
    }

    this._deviceInitialized = true;
  }

  async getAuthorizationUrl() {
    await this.initialize();

    const verifier = generateCodeVerifier();
    const state = generateState();
    const codeChallenge = await generateCodeChallenge(verifier);

    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', 'openid offline_access api://fd-agent-wallet-mcp/mcp:tools');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('resource', this.mcpServerUrl);

    return {
      url: url.toString(),
      state,
      codeVerifier: verifier,
      codeChallenge,
    };
  }

  async startDeviceFlow() {
    await this.initializeForDevice();

    if (!this.deviceAuthorizationEndpoint) {
      throw new Error('Device authorization flow is not supported by this OAuth server');
    }

    const payload = new URLSearchParams({
      client_id: this.deviceClientId,
      scope: 'openid offline_access api://fd-agent-wallet-mcp/mcp:tools',
    });

    const { data } = await this.httpClient.post(
      this.deviceAuthorizationEndpoint,
      payload.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      expiresIn: data.expires_in,
      interval: data.interval || 5,
    };
  }

  async pollDeviceToken({ deviceCode, interval = 5 }) {
    let pollIntervalMs = interval * 1000;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const payload = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: this.deviceClientId,
        device_code: deviceCode,
      });

      try {
        const { data } = await this.httpClient.post(this.tokenEndpoint, payload.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        await this.#persistTokens(data);
        logger.info('mcp-auth: token obtained via device flow', { server: this.mcpServerUrl });
        return data;
      } catch (err) {
        const error = err.response?.data?.error;

        if (error === 'authorization_pending') {
          continue;
        } else if (error === 'slow_down') {
          pollIntervalMs += 5000;
          continue;
        } else if (error === 'access_denied') {
          throw new Error('Device flow access denied by user');
        } else if (error === 'expired_token') {
          throw new Error('Device flow code expired — please run setup again');
        } else {
          throw err;
        }
      }
    }
  }

  async exchangeCodeForToken({ code, state, codeVerifier }) {
    await this.initialize();

    if (!code) {
      throw new Error('code is required');
    }
    if (!codeVerifier) {
      throw new Error('codeVerifier is required');
    }
    if (!state) {
      throw new Error('state is required');
    }

    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code,
      code_verifier: codeVerifier,
    });

    const { data } = await this.httpClient.post(this.tokenEndpoint, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    await this.#persistTokens(data);
    return data;
  }

  async getAccessToken() {
    const tokens = await this.#getTokens();
    if (!tokens?.accessToken) {
      throw new Error('No access token available');
    }

    if (!tokens.expiresAt || Date.now() < tokens.expiresAt - 10000) {
      return tokens.accessToken;
    }

    return this.refreshToken();
  }

  async refreshToken() {
    // Ensure endpoint discovery is done — read from cache or discover live.
    // Do NOT call initialize() here: that would trigger interactive DCR for
    // device-only setups that have never run interactive setup.
    await this.#ensureDiscovered();

    // Load client ID from store if not already in memory
    if (!this.clientId && !this.deviceClientId) {
      const store = await this.#readStore();
      this.clientId = store.mcpAuth?.clientId ?? null;
      this.deviceClientId = store.mcpAuth?.deviceClientId ?? null;
    }

    const tokens = await this.#getTokens();
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    logger.debug('mcp-auth: refreshing access token', { server: this.mcpServerUrl });

    const payload = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: this.clientId ?? this.deviceClientId,
    });

    const { data } = await this.httpClient.post(this.tokenEndpoint, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    await this.#persistTokens({ ...tokens, ...data });
    logger.info('mcp-auth: access token refreshed', { server: this.mcpServerUrl });
    return data.access_token;
  }

  async getTokenState() {
    const store = await this.#readStore();
    const tokens = await this.#getTokens();

    return {
      authenticated: !!tokens?.accessToken,
      expired: tokens?.expiresAt ? Date.now() >= tokens.expiresAt : false,
      hasRefresh: !!tokens?.refreshToken,
      expiresAt: tokens?.expiresAt,
      clientId: store.mcpAuth?.clientId || store.mcpAuth?.deviceClientId,
      usingCredentialStore: !!store.tokens?.credentialStore,
    };
  }

  async logout() {
    // Remove tokens from OS credential store
    this._credentialStore.deleteSecret(this.#credentialAccount());

    // Clear tokens from the store file but keep mcpAuth (client registrations)
    // so the next `fdx setup` skips DCR and goes straight to auth
    const store = await this.#readStore();
    delete store.tokens;
    await writeStore(store, this.storePath);

    // Reset in-memory token state
    this._initialized = false;
    this._deviceInitialized = false;
    this._discovered = false;

    logger.info('mcp-auth: logged out', { server: this.mcpServerUrl });
  }

  #credentialAccount() {
    return new URL(this.mcpServerUrl).host;
  }

  async #ensureDiscovered() {
    if (this._discovered) return;
    if (this._discoveryPromise) return this._discoveryPromise;
    this._discoveryPromise = this.#doDiscover();
    try {
      await this._discoveryPromise;
    } finally {
      this._discoveryPromise = null;
    }
  }

  async #doDiscover() {
    const store = await this.#readStore();
    const cached = store.mcpAuth;

    if (cached?.oauthServerUrl && cached?.tokenEndpoint) {
      this.oauthServerUrl = cached.oauthServerUrl;
      this.authorizationEndpoint = cached.authorizationEndpoint;
      this.tokenEndpoint = cached.tokenEndpoint;
      this.registrationEndpoint = cached.registrationEndpoint;
      this.deviceAuthorizationEndpoint = cached.deviceAuthorizationEndpoint;
      this._discovered = true;
      logger.debug('mcp-auth: using cached OAuth discovery', { server: this.oauthServerUrl });
      return;
    }

    const protectedResourceUrl = `${this.mcpServerUrl}/.well-known/oauth-protected-resource`;
    const { data: protectedResource } = await this.httpClient.get(protectedResourceUrl);

    this.oauthServerUrl = protectedResource.authorization_servers[0];
    logger.info('mcp-auth: OAuth server discovered', { server: this.oauthServerUrl });
    // RFC 8414 preferred; fall back to OIDC discovery (e.g. Entra External ID only exposes the latter)
    const metadata = await this.#discoverMetadata(this.oauthServerUrl);

    this.authorizationEndpoint = metadata.authorization_endpoint;
    this.tokenEndpoint = metadata.token_endpoint;
    this.registrationEndpoint = metadata.registration_endpoint;
    this.deviceAuthorizationEndpoint = metadata.device_authorization_endpoint;

    await this.#persistMCPAuth({
      oauthServerUrl: this.oauthServerUrl,
      authorizationEndpoint: this.authorizationEndpoint,
      tokenEndpoint: this.tokenEndpoint,
      registrationEndpoint: this.registrationEndpoint,
      deviceAuthorizationEndpoint: this.deviceAuthorizationEndpoint,
    });

    this._discovered = true;
  }

  async #discoverMetadata(oauthServerUrl) {
    // Try RFC 8414 first; fall back to OIDC discovery (/.well-known/openid-configuration).
    // Entra External ID only exposes the OIDC document.
    const rfc8414Url = `${oauthServerUrl}/.well-known/oauth-authorization-server`;
    try {
      const { data } = await this.httpClient.get(rfc8414Url);
      if (data?.token_endpoint) return data;
    } catch {
      // not found — try OIDC
    }

    const oidcUrl = `${oauthServerUrl}/.well-known/openid-configuration`;
    const { data } = await this.httpClient.get(oidcUrl);
    return data;
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
        // Credential store read failed — return metadata only
      }
      return tokens;
    }

    // Legacy: tokens are stored inline in the file
    return tokens;
  }

  async #persistTokens(tokenResponse) {
    const store = await this.#readStore();
    const expiresInMs = (tokenResponse.expires_in || 0) * 1000;
    const accessToken = tokenResponse.access_token;
    const refreshToken =
      tokenResponse.refresh_token || tokenResponse.refreshToken || store.tokens?.refreshToken;

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

  async #readStore() {
    return readStore(this.storePath);
  }
}

module.exports = { MCPAuthClient };
