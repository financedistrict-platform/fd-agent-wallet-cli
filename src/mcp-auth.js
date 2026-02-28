const axios = require('axios');

const defaultCredentialStore = require('./credential-store');
const logger = require('./utils/logger');
const { readStore, writeStore } = require('./storage');

class MCPAuthClient {
  constructor({ mcpServerUrl, storePath, httpClient, credentialStore }) {
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
    this._initialized = false;
    this._initPromise = null;
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

    // Cached discovery metadata may predate device-flow support on the server.
    // Force a live re-discovery before giving up.
    if (!this.deviceAuthorizationEndpoint) {
      this._discovered = false;
      const store = await this.#readStore();
      if (store.mcpAuth) {
        delete store.mcpAuth.oauthServerUrl;
        await writeStore(store, this.storePath);
      }
      await this.#ensureDiscovered();
    }

    if (!this.deviceAuthorizationEndpoint) {
      throw new Error('Device authorization flow is not supported by this OAuth server');
    }

    const store = await this.#readStore();
    const cached = store.mcpAuth;

    // Support legacy stores that used deviceClientId
    if (cached?.clientId || cached?.deviceClientId) {
      this.clientId = cached.clientId || cached.deviceClientId;
      this._initialized = true;
      logger.debug('mcp-auth: using cached client', { clientId: this.clientId });
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

      this.clientId = registration.client_id;
      await this.#persistMCPAuth({ clientId: this.clientId });
      logger.info('mcp-auth: client registered', { clientId: this.clientId });
    }

    this._initialized = true;
  }

  async startDeviceFlow() {
    await this.initialize();

    const payload = new URLSearchParams({
      client_id: this.clientId,
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

  async pollDeviceToken({ deviceCode, interval = 5, expiresIn = 900 }) {
    let pollIntervalMs = interval * 1000;
    const deadline = Date.now() + expiresIn * 1000;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      if (Date.now() >= deadline) {
        throw new Error('Device flow code expired \u2014 please run "fdx login" again');
      }

      const payload = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: this.clientId,
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
          throw new Error('Device flow code expired \u2014 please run "fdx login" again');
        } else {
          throw err;
        }
      }
    }
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
    await this.#ensureDiscovered();

    // Load client ID from store if not already in memory
    if (!this.clientId) {
      const store = await this.#readStore();
      this.clientId = store.mcpAuth?.clientId || store.mcpAuth?.deviceClientId || null;
    }

    if (!this.clientId) {
      throw new Error('No client ID available \u2014 run "fdx login" first');
    }

    const tokens = await this.#getTokens();
    if (!tokens?.refreshToken) {
      const error = new Error('No refresh token available \u2014 run "fdx login" to re-authenticate');
      error.code = 'SESSION_EXPIRED';
      throw error;
    }

    logger.debug('mcp-auth: refreshing access token', { server: this.mcpServerUrl });

    const payload = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: this.clientId,
    });

    let data;
    try {
      ({ data } = await this.httpClient.post(this.tokenEndpoint, payload.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }));
    } catch (err) {
      const oauthError = err.response?.data?.error;
      if (oauthError === 'invalid_grant' || oauthError === 'interaction_required') {
        logger.warn('mcp-auth: refresh token rejected by server', { error: oauthError });
        const error = new Error('Session expired \u2014 run "fdx login" to re-authenticate');
        error.code = 'SESSION_EXPIRED';
        throw error;
      }
      throw err;
    }

    await this.#persistTokens({ ...tokens, ...data });
    logger.info('mcp-auth: access token refreshed', { server: this.mcpServerUrl });
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
      clientId: store.mcpAuth?.clientId || store.mcpAuth?.deviceClientId,
      usingCredentialStore: !!store.tokens?.credentialStore,
    };
  }

  async logout() {
    this._credentialStore.deleteSecret(this.#credentialAccount());

    const store = await this.#readStore();
    delete store.tokens;
    await writeStore(store, this.storePath);

    this._initialized = false;
    this._discovered = false;

    logger.info('mcp-auth: logged out', { server: this.mcpServerUrl });
  }

  #requireHttps(url, label) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid ${label} URL: ${url}`);
    }
    if (
      parsed.protocol !== 'https:' &&
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1'
    ) {
      throw new Error(`${label} must use HTTPS: ${url}`);
    }
  }

  #validateDiscoveredEndpoints() {
    this.#requireHttps(this.oauthServerUrl, 'authorization_server');
    this.#requireHttps(this.tokenEndpoint, 'token_endpoint');
    if (this.registrationEndpoint) {
      this.#requireHttps(this.registrationEndpoint, 'registration_endpoint');
    }
    if (this.deviceAuthorizationEndpoint) {
      this.#requireHttps(this.deviceAuthorizationEndpoint, 'device_authorization_endpoint');
    }
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
      this.tokenEndpoint = cached.tokenEndpoint;
      this.registrationEndpoint = cached.registrationEndpoint;
      this.deviceAuthorizationEndpoint = cached.deviceAuthorizationEndpoint;
      this.#validateDiscoveredEndpoints();
      this._discovered = true;
      logger.debug('mcp-auth: using cached OAuth discovery', { server: this.oauthServerUrl });
      return;
    }

    const protectedResourceUrl = `${this.mcpServerUrl}/.well-known/oauth-protected-resource`;
    const { data: protectedResource } = await this.httpClient.get(protectedResourceUrl);

    const server = protectedResource.authorization_servers?.[0];
    if (!server) {
      throw new Error('No authorization server found in protected resource metadata');
    }
    this.oauthServerUrl = server;
    logger.info('mcp-auth: OAuth server discovered', { server: this.oauthServerUrl });
    const metadata = await this.#discoverMetadata(this.oauthServerUrl);

    this.tokenEndpoint = metadata.token_endpoint;
    this.registrationEndpoint = metadata.registration_endpoint;
    this.deviceAuthorizationEndpoint = metadata.device_authorization_endpoint;
    this.#validateDiscoveredEndpoints();

    await this.#persistMCPAuth({
      oauthServerUrl: this.oauthServerUrl,
      tokenEndpoint: this.tokenEndpoint,
      registrationEndpoint: this.registrationEndpoint,
      deviceAuthorizationEndpoint: this.deviceAuthorizationEndpoint,
    });

    this._discovered = true;
  }

  async #discoverMetadata(oauthServerUrl) {
    const rfc8414Url = `${oauthServerUrl}/.well-known/oauth-authorization-server`;
    let rfc8414Data;
    try {
      const { data } = await this.httpClient.get(rfc8414Url);
      if (data?.token_endpoint) rfc8414Data = data;
    } catch {
      // not found - try OIDC
    }

    if (rfc8414Data?.device_authorization_endpoint) {
      return rfc8414Data;
    }

    const oidcUrl = `${oauthServerUrl}/.well-known/openid-configuration`;
    try {
      const { data } = await this.httpClient.get(oidcUrl);
      if (rfc8414Data) {
        return { ...data, ...rfc8414Data, device_authorization_endpoint: data.device_authorization_endpoint || rfc8414Data.device_authorization_endpoint };
      }
      return data;
    } catch {
      if (rfc8414Data) return rfc8414Data;
      throw new Error(`OAuth metadata discovery failed for ${oauthServerUrl}`);
    }
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
