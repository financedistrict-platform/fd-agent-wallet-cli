const { MCPAuthClient } = require('./mcp-auth');
const { MCPClient } = require('./mcp-client');

class WalletClient {
  constructor({ mcpServerUrl, redirectUri, storePath, httpClient }) {
    if (!mcpServerUrl) throw new Error('mcpServerUrl is required');
    if (!redirectUri) throw new Error('redirectUri is required');
    if (!storePath) throw new Error('storePath is required');

    this.authClient = new MCPAuthClient({
      mcpServerUrl,
      redirectUri,
      storePath,
      httpClient,
    });

    this.mcpClient = new MCPClient({
      mcpServerUrl,
      authClient: this.authClient,
      httpClient,
    });
  }

  async initialize() {
    return this.authClient.initialize();
  }

  async getAuthorizationUrl() {
    return this.authClient.getAuthorizationUrl();
  }

  async exchangeCodeForToken({ code, state, codeVerifier }) {
    return this.authClient.exchangeCodeForToken({ code, state, codeVerifier });
  }

  async getMyInfo() {
    return this.mcpClient.callTool('getMyInfo', {});
  }

  async getAppVersion() {
    return this.mcpClient.callTool('getAppVersion', {});
  }

  async helpNarrative({ question, locale, tone }) {
    if (!question) throw new Error('question is required');

    return this.mcpClient.callTool('helpNarrative', {
      question,
      locale,
      tone,
    });
  }

  async onboardingAssistant({ question, context, locale, tone }) {
    if (!question) throw new Error('question is required');

    return this.mcpClient.callTool('onboardingAssistant', {
      question,
      context,
      locale,
      tone,
    });
  }

  async reportIssue({ title, description, severity, category }) {
    if (!title) throw new Error('title is required');
    if (!description) throw new Error('description is required');

    return this.mcpClient.callTool('reportIssue', {
      title,
      description,
      severity,
      category,
    });
  }

  async getWalletOverview({ chainKey, accountAddress }) {
    return this.mcpClient.callTool('getWalletOverview', {
      chainKey,
      accountAddress,
    });
  }

  async getAccountActivity({ chainKey, accountAddress, limit, offset }) {
    return this.mcpClient.callTool('getAccountActivity', {
      chainKey,
      accountAddress,
      limit,
      offset,
    });
  }

  async deploySmartAccount({ chainKey, initialOwners, threshold }) {
    if (!chainKey) throw new Error('chainKey is required');

    return this.mcpClient.callTool('deploySmartAccount', {
      chainKey,
      initialOwners,
      threshold,
    });
  }

  async manageSmartAccountOwnership({
    chainKey,
    accountAddress,
    action,
    ownerAddress,
    newThreshold,
  }) {
    if (!chainKey) throw new Error('chainKey is required');
    if (!accountAddress) throw new Error('accountAddress is required');
    if (!action) throw new Error('action is required');

    return this.mcpClient.callTool('manageSmartAccountOwnership', {
      chainKey,
      accountAddress,
      action,
      ownerAddress,
      newThreshold,
    });
  }

  async transferTokens({
    chainKey,
    fromAccountAddress,
    recipientAddress,
    amount,
    tokenAddress,
    memo,
    maxPriorityFeePerGas,
    maxFeePerGas,
  }) {
    if (!chainKey) throw new Error('chainKey is required');
    if (!recipientAddress) throw new Error('recipientAddress is required');
    if (!amount) throw new Error('amount is required');

    return this.mcpClient.callTool('transferTokens', {
      chainKey,
      fromAccountAddress,
      recipientAddress,
      amount,
      tokenAddress,
      memo,
      maxPriorityFeePerGas,
      maxFeePerGas,
    });
  }

  async swapTokens({
    chainKey,
    tokenIn,
    tokenOut,
    amount,
    mode,
    objective,
    maxSlippageBps,
    deadlineSeconds,
  }) {
    if (!chainKey) throw new Error('chainKey is required');
    if (!tokenIn) throw new Error('tokenIn is required');
    if (!tokenOut) throw new Error('tokenOut is required');
    if (!amount) throw new Error('amount is required');

    return this.mcpClient.callTool('swapTokens', {
      chainKey,
      tokenIn,
      tokenOut,
      amount,
      mode,
      objective,
      maxSlippageBps,
      deadlineSeconds,
    });
  }

  async discoverYieldStrategies({ chainKey, tokenAddress, minApy, maxRisk, sortBy }) {
    return this.mcpClient.callTool('discoverYieldStrategies', {
      chainKey,
      tokenAddress,
      minApy,
      maxRisk,
      sortBy,
    });
  }

  async depositForYield({ chainKey, strategyId, amount, tokenAddress }) {
    if (!chainKey) throw new Error('chainKey is required');
    if (!strategyId) throw new Error('strategyId is required');
    if (!amount) throw new Error('amount is required');

    return this.mcpClient.callTool('depositForYield', {
      chainKey,
      strategyId,
      amount,
      tokenAddress,
    });
  }

  async withdrawFromYield({ chainKey, positionId, amount, recipient }) {
    if (!chainKey) throw new Error('chainKey is required');
    if (!positionId) throw new Error('positionId is required');

    return this.mcpClient.callTool('withdrawFromYield', {
      chainKey,
      positionId,
      amount,
      recipient,
    });
  }

  async authorizePayment({
    url,
    preferredNetwork,
    preferredNetworkName,
    preferredAsset,
    maxPaymentAmount,
  }) {
    if (!url) throw new Error('url is required');

    return this.mcpClient.callTool('authorizePayment', {
      url,
      preferredNetwork,
      preferredNetworkName,
      preferredAsset,
      maxPaymentAmount,
    });
  }

  async getX402Content({
    url,
    preferredNetwork,
    preferredNetworkName,
    preferredAsset,
    maxPaymentAmount,
  }) {
    if (!url) throw new Error('url is required');

    return this.mcpClient.callTool('getX402Content', {
      url,
      preferredNetwork,
      preferredNetworkName,
      preferredAsset,
      maxPaymentAmount,
    });
  }
}

module.exports = { WalletClient };
