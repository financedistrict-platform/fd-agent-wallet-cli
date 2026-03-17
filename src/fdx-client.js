const { MCPAuthClient } = require('./mcp-auth');
const { MCPClient } = require('./mcp-client');

class FdxClient {
  constructor({ mcpServerUrl, storePath, httpClient, entraConfig }) {
    if (!mcpServerUrl) throw new Error('mcpServerUrl is required');
    if (!storePath) throw new Error('storePath is required');

    this.authClient = new MCPAuthClient({
      mcpServerUrl,
      storePath,
      httpClient,
      entraConfig,
    });

    this.mcpClient = new MCPClient({
      mcpServerUrl,
      authClient: this.authClient,
    });
  }

  async register(email) {
    const { continuationToken } = await this.authClient.startSignUp(email);
    const challenge = await this.authClient.challengeSignUp(continuationToken);
    await this.authClient.savePendingVerification({
      continuationToken: challenge.continuationToken,
      email,
      flow: 'register',
    });
    return challenge;
  }

  async verifyRegistration(continuationToken, otpCode, email) {
    const { continuationToken: tokenCt } = await this.authClient.continueSignUp(
      continuationToken,
      otpCode,
    );
    const result = await this.authClient.completeSignUp(tokenCt, email);
    await this.authClient.clearPendingVerification();
    return result;
  }

  async login(email) {
    const { continuationToken } = await this.authClient.startSignIn(email);
    const challenge = await this.authClient.challengeSignIn(continuationToken);
    await this.authClient.savePendingVerification({
      continuationToken: challenge.continuationToken,
      email,
      flow: 'login',
    });
    return challenge;
  }

  async verifyLogin(continuationToken, otpCode, email) {
    const result = await this.authClient.completeSignIn(continuationToken, otpCode, email);
    await this.authClient.clearPendingVerification();
    return result;
  }

  get authStorePath() {
    return this.authClient.storePath;
  }

  get mcpServerUrl() {
    return this.authClient.mcpServerUrl;
  }

  async getPendingVerification() {
    return this.authClient.getPendingVerification();
  }

  async connectMcp() {
    return this.mcpClient.connect();
  }

  async callMcpTool(toolName, args) {
    return this.mcpClient.callTool(toolName, args);
  }

  async getTokenState() {
    return this.authClient.getTokenState();
  }

  async logout() {
    return this.authClient.logout();
  }

  async listTools() {
    return this.mcpClient.listTools();
  }

  async close() {
    return this.mcpClient.close();
  }
}

module.exports = { FdxClient };
