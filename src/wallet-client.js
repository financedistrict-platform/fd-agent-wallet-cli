const { MCPAuthClient } = require('./mcp-auth');
const { MCPClient } = require('./mcp-client');

class WalletClient {
  constructor({ mcpServerUrl, storePath, httpClient }) {
    if (!mcpServerUrl) throw new Error('mcpServerUrl is required');
    if (!storePath) throw new Error('storePath is required');

    this.authClient = new MCPAuthClient({
      mcpServerUrl,
      storePath,
      httpClient,
    });

    this.mcpClient = new MCPClient({
      mcpServerUrl,
      authClient: this.authClient,
    });
  }

  async initialize() {
    return this.authClient.initialize();
  }

  async startDeviceFlow() {
    return this.authClient.startDeviceFlow();
  }

  async pollDeviceToken({ deviceCode, interval, expiresIn }) {
    return this.authClient.pollDeviceToken({ deviceCode, interval, expiresIn });
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

  async getTokenPrice({ token }) {
    if (!token) throw new Error('token is required');

    return this.mcpClient.callTool('getTokenPrice', { token });
  }

  async getMyInfo() {
    return this.mcpClient.callTool('getMyInfo', {});
  }

  async getAppVersion() {
    return this.mcpClient.callTool('getAppVersion', {});
  }

  async helpNarrative({ question, tone, locale }) {
    if (!question) throw new Error('question is required');

    return this.mcpClient.callTool('helpNarrative', {
      question,
      tone,
      locale,
    });
  }

  async onboardingAssistant({ question, context, tone, locale }) {
    if (!question) throw new Error('question is required');

    return this.mcpClient.callTool('onboardingAssistant', {
      question,
      context,
      tone,
      locale,
    });
  }

  async reportIssue({ title, description, labels }) {
    if (!title) throw new Error('title is required');
    if (!description) throw new Error('description is required');

    return this.mcpClient.callTool('reportIssue', {
      title,
      description,
      labels,
    });
  }

  async getWalletOverview({ accountAddress, chainKey }) {
    return this.mcpClient.callTool('getWalletOverview', {
      accountAddress,
      chainKey,
    });
  }

  async getAccountActivity({ accountAddress, chainKey, maxTransactions }) {
    if (!accountAddress) throw new Error('accountAddress is required');
    if (!chainKey) throw new Error('chainKey is required');

    return this.mcpClient.callTool('getAccountActivity', {
      accountAddress,
      chainKey,
      maxTransactions,
    });
  }

  async transferTokens({ toAddress, amount, asset, chainKey, fromAccountAddress, autoApprove }) {
    if (!toAddress) throw new Error('toAddress is required');
    if (amount == null) throw new Error('amount is required');
    if (!asset) throw new Error('asset is required');
    if (!chainKey) throw new Error('chainKey is required');

    return this.mcpClient.callTool('transferTokens', {
      toAddress,
      amount,
      asset,
      chainKey,
      fromAccountAddress,
      autoApprove,
    });
  }

  async swapTokens({
    chainKey,
    tokenIn,
    tokenOut,
    amount,
    objective,
    maxSlippageBps,
    deadlineSeconds,
    mode,
  }) {
    if (!chainKey) throw new Error('chainKey is required');
    if (!tokenIn) throw new Error('tokenIn is required');
    if (!tokenOut) throw new Error('tokenOut is required');
    if (amount == null) throw new Error('amount is required');

    return this.mcpClient.callTool('swapTokens', {
      chainKey,
      tokenIn,
      tokenOut,
      amount,
      objective,
      maxSlippageBps,
      deadlineSeconds,
      mode,
    });
  }

  async discoverYieldStrategies({ chainKey, token, protocolSlug, sortBy, sortDirection, limit }) {
    return this.mcpClient.callTool('discoverYieldStrategies', {
      chainKey,
      token,
      protocolSlug,
      sortBy,
      sortDirection,
      limit,
    });
  }

  async depositForYield({ strategyId, fromAccountAddress, token, amount, chainKey }) {
    if (!strategyId) throw new Error('strategyId is required');
    if (!fromAccountAddress) throw new Error('fromAccountAddress is required');
    if (!token) throw new Error('token is required');
    if (amount == null) throw new Error('amount is required');
    if (!chainKey) throw new Error('chainKey is required');

    return this.mcpClient.callTool('depositForYield', {
      strategyId,
      fromAccountAddress,
      token,
      amount,
      chainKey,
    });
  }

  async withdrawFromYield({
    vaultTokenAddress,
    underlyingToken,
    withdrawAmount,
    fromAccountAddress,
    chainKey,
  }) {
    if (!vaultTokenAddress) throw new Error('vaultTokenAddress is required');
    if (!underlyingToken) throw new Error('underlyingToken is required');
    if (withdrawAmount == null) throw new Error('withdrawAmount is required');
    if (!fromAccountAddress) throw new Error('fromAccountAddress is required');
    if (!chainKey) throw new Error('chainKey is required');

    return this.mcpClient.callTool('withdrawFromYield', {
      vaultTokenAddress,
      underlyingToken,
      withdrawAmount,
      fromAccountAddress,
      chainKey,
    });
  }

  async authorizePayment({ paymentRequirementsResponseJson, autoApprove }) {
    if (!paymentRequirementsResponseJson) {
      throw new Error('paymentRequirementsResponseJson is required');
    }

    return this.mcpClient.callTool('authorizePayment', {
      paymentRequirementsResponseJson,
      autoApprove,
    });
  }

  async getX402Content({
    url,
    maxPaymentAmount,
    preferredAsset,
    preferredNetwork,
    preferredNetworkName,
  }) {
    if (!url) throw new Error('url is required');

    return this.mcpClient.callTool('getX402Content', {
      url,
      maxPaymentAmount,
      preferredAsset,
      preferredNetwork,
      preferredNetworkName,
    });
  }

  async resolveNameService({ nameOrAddress }) {
    if (!nameOrAddress) throw new Error('nameOrAddress is required');

    return this.mcpClient.callTool('resolveNameService', { nameOrAddress });
  }
}

module.exports = { WalletClient };
