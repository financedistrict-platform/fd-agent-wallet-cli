const axios = require('axios');

const { readStore, writeStore } = require('./storage');
const { generateCodeChallenge, generateCodeVerifier, generateState } = require('./utils/pkce');

class MCPAuthClient {
  constructor({ mcpServerUrl, redirectUri, storePath, httpClient }) {
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
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;

    const store = await this.#readStore();
    const cached = store.mcpAuth;

    if (
      cached?.oauthServerUrl &&
      cached?.authorizationEndpoint &&
      cached?.tokenEndpoint &&
      cached?.clientId
    ) {
      this.oauthServerUrl = cached.oauthServerUrl;
      this.authorizationEndpoint = cached.authorizationEndpoint;
      this.tokenEndpoint = cached.tokenEndpoint;
      this.registrationEndpoint = cached.registrationEndpoint;
      this.clientId = cached.clientId;
      this._initialized = true;
      return;
    }

    const protectedResourceUrl = `${this.mcpServerUrl}/.well-known/oauth-protected-resource`;
    const { data: protectedResource } = await this.httpClient.get(protectedResourceUrl);

    this.oauthServerUrl = protectedResource.authorization_servers[0];
    const oauthHost = new URL(this.oauthServerUrl).host;
    // eslint-disable-next-line no-console
    console.log(`OAuth server: ${oauthHost}`);
    const discoveryUrl = `${this.oauthServerUrl}/.well-known/oauth-authorization-server`;
    const { data: metadata } = await this.httpClient.get(discoveryUrl);

    this.authorizationEndpoint = metadata.authorization_endpoint;
    this.tokenEndpoint = metadata.token_endpoint;
    this.registrationEndpoint = metadata.registration_endpoint;

    if (this.registrationEndpoint && !cached?.clientId) {
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

      await this.#persistMCPAuth({
        oauthServerUrl: this.oauthServerUrl,
        authorizationEndpoint: this.authorizationEndpoint,
        tokenEndpoint: this.tokenEndpoint,
        registrationEndpoint: this.registrationEndpoint,
        clientId: this.clientId,
      });
    }

    this._initialized = true;
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

  async exchangeCodeForToken({ code, state, codeVerifier }) {
    await this.initialize();

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
    const tokens = await this.#getStoreProperty('tokens');
    if (!tokens?.accessToken) {
      throw new Error('No access token available');
    }

    if (!tokens.expiresAt || Date.now() < tokens.expiresAt - 10000) {
      return tokens.accessToken;
    }

    return this.refreshToken();
  }

  async refreshToken() {
    await this.initialize();

    const tokens = await this.#getStoreProperty('tokens');
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const payload = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: this.clientId,
    });

    const { data } = await this.httpClient.post(this.tokenEndpoint, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    await this.#persistTokens({ ...tokens, ...data });
    return data.access_token;
  }

  async #persistTokens(tokenResponse) {
    const store = await this.#readStore();
    const expiresInMs = (tokenResponse.expires_in || 0) * 1000;
    store.tokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || store.tokens?.refreshToken,
      scope: tokenResponse.scope,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresAt: expiresInMs ? Date.now() + expiresInMs : undefined,
    };
    await writeStore(store, this.storePath);
  }

  async #persistMCPAuth(mcpAuth) {
    const store = await this.#readStore();
    store.mcpAuth = mcpAuth;
    await writeStore(store, this.storePath);
  }

  async #getStoreProperty(property) {
    const store = await this.#readStore();
    return store[property];
  }

  async #readStore() {
    return readStore(this.storePath);
  }
}

module.exports = { MCPAuthClient };
