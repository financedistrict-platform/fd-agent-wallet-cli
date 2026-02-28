const assert = require('node:assert');
const { describe, it } = require('node:test');

const { WalletClient } = require('../src/wallet-client');

function createClient() {
  const calls = [];
  const client = new WalletClient({
    mcpServerUrl: 'https://mcp.example.com',
    storePath: '/tmp/fdx-test.json',
  });

  // Replace mcpClient.callTool with a spy
  client.mcpClient.callTool = async (toolName, args) => {
    calls.push({ toolName, args });
    return { data: { tool: toolName } };
  };

  return { client, calls };
}

describe('WalletClient', () => {
  describe('constructor', () => {
    it('should throw if mcpServerUrl is missing', () => {
      assert.throws(
        () =>
          new WalletClient({
            storePath: '/tmp/test.json',
          }),
        /mcpServerUrl is required/,
      );
    });

    it('should throw if storePath is missing', () => {
      assert.throws(
        () =>
          new WalletClient({
            mcpServerUrl: 'https://example.com',
          }),
        /storePath is required/,
      );
    });
  });

  describe('methods without required params', () => {
    it('getMyInfo should call tool with empty args', async () => {
      const { client, calls } = createClient();
      await client.getMyInfo();
      assert.strictEqual(calls[0].toolName, 'getMyInfo');
      assert.deepStrictEqual(calls[0].args, {});
    });

    it('getAppVersion should call tool with empty args', async () => {
      const { client, calls } = createClient();
      await client.getAppVersion();
      assert.strictEqual(calls[0].toolName, 'getAppVersion');
    });

    it('getWalletOverview should forward optional params', async () => {
      const { client, calls } = createClient();
      await client.getWalletOverview({ chainKey: 'ethereum', accountAddress: '0x123' });
      assert.strictEqual(calls[0].toolName, 'getWalletOverview');
      assert.strictEqual(calls[0].args.chainKey, 'ethereum');
      assert.strictEqual(calls[0].args.accountAddress, '0x123');
    });

    it('discoverYieldStrategies should forward params', async () => {
      const { client, calls } = createClient();
      await client.discoverYieldStrategies({ chainKey: 'base', token: 'USDC', protocolSlug: 'aave-v3' });
      assert.strictEqual(calls[0].toolName, 'discoverYieldStrategies');
      assert.strictEqual(calls[0].args.chainKey, 'base');
      assert.strictEqual(calls[0].args.token, 'USDC');
      assert.strictEqual(calls[0].args.protocolSlug, 'aave-v3');
    });
  });

  describe('methods with required params', () => {
    it('helpNarrative should throw if question is missing', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.helpNarrative({}), /question is required/);
    });

    it('helpNarrative should call tool with params', async () => {
      const { client, calls } = createClient();
      await client.helpNarrative({ question: 'How do I swap?' });
      assert.strictEqual(calls[0].toolName, 'helpNarrative');
      assert.strictEqual(calls[0].args.question, 'How do I swap?');
    });

    it('reportIssue should throw if title is missing', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.reportIssue({ description: 'desc' }), /title is required/);
    });

    it('reportIssue should throw if description is missing', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.reportIssue({ title: 'Bug' }), /description is required/);
    });

    it('getTokenPrice should throw if token is missing', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.getTokenPrice({}), /token is required/);
    });

    it('getTokenPrice should call tool with params', async () => {
      const { client, calls } = createClient();
      await client.getTokenPrice({ token: 'ETH' });
      assert.strictEqual(calls[0].toolName, 'getTokenPrice');
      assert.strictEqual(calls[0].args.token, 'ETH');
    });

    it('resolveNameService should throw if nameOrAddress is missing', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.resolveNameService({}), /nameOrAddress is required/);
    });

    it('resolveNameService should call tool with params', async () => {
      const { client, calls } = createClient();
      await client.resolveNameService({ nameOrAddress: 'vitalik.eth' });
      assert.strictEqual(calls[0].toolName, 'resolveNameService');
      assert.strictEqual(calls[0].args.nameOrAddress, 'vitalik.eth');
    });

    it('transferTokens should validate required fields', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.transferTokens({}), /toAddress is required/);
      await assert.rejects(
        () => client.transferTokens({ toAddress: '0x1' }),
        /amount is required/,
      );
      await assert.rejects(
        () => client.transferTokens({ toAddress: '0x1', amount: 1 }),
        /asset is required/,
      );
      await assert.rejects(
        () => client.transferTokens({ toAddress: '0x1', amount: 1, asset: 'ETH' }),
        /chainKey is required/,
      );
    });

    it('transferTokens should call tool with all params', async () => {
      const { client, calls } = createClient();
      await client.transferTokens({
        toAddress: '0xABC',
        amount: 1.5,
        asset: 'USDC',
        chainKey: 'ethereum',
        fromAccountAddress: '0xSRC',
        autoApprove: true,
      });
      assert.strictEqual(calls[0].toolName, 'transferTokens');
      assert.strictEqual(calls[0].args.toAddress, '0xABC');
      assert.strictEqual(calls[0].args.amount, 1.5);
      assert.strictEqual(calls[0].args.asset, 'USDC');
      assert.strictEqual(calls[0].args.chainKey, 'ethereum');
      assert.strictEqual(calls[0].args.fromAccountAddress, '0xSRC');
      assert.strictEqual(calls[0].args.autoApprove, true);
    });

    it('swapTokens should validate required fields', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.swapTokens({}), /chainKey is required/);
      await assert.rejects(() => client.swapTokens({ chainKey: 'base' }), /tokenIn is required/);
    });

    it('authorizePayment should throw if paymentRequirementsResponseJson is missing', async () => {
      const { client } = createClient();
      await assert.rejects(
        () => client.authorizePayment({}),
        /paymentRequirementsResponseJson is required/,
      );
    });

    it('authorizePayment should call tool with params', async () => {
      const { client, calls } = createClient();
      await client.authorizePayment({ paymentRequirementsResponseJson: '{"test":true}' });
      assert.strictEqual(calls[0].toolName, 'authorizePayment');
      assert.strictEqual(calls[0].args.paymentRequirementsResponseJson, '{"test":true}');
    });

    it('getAccountActivity should validate required fields', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.getAccountActivity({}), /accountAddress is required/);
      await assert.rejects(
        () => client.getAccountActivity({ accountAddress: '0x1' }),
        /chainKey is required/,
      );
    });

    it('getX402Content should throw if url is missing', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.getX402Content({}), /url is required/);
    });

    it('depositForYield should validate required fields', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.depositForYield({}), /strategyId is required/);
      await assert.rejects(
        () => client.depositForYield({ strategyId: 'aave-usdc' }),
        /fromAccountAddress is required/,
      );
      await assert.rejects(
        () => client.depositForYield({ strategyId: 'aave-usdc', fromAccountAddress: '0x1' }),
        /token is required/,
      );
      await assert.rejects(
        () => client.depositForYield({ strategyId: 'aave-usdc', fromAccountAddress: '0x1', token: 'USDC' }),
        /amount is required/,
      );
      await assert.rejects(
        () => client.depositForYield({ strategyId: 'aave-usdc', fromAccountAddress: '0x1', token: 'USDC', amount: 10 }),
        /chainKey is required/,
      );
    });

    it('depositForYield should call tool with all params', async () => {
      const { client, calls } = createClient();
      await client.depositForYield({
        strategyId: 'aave-usdc',
        fromAccountAddress: '0x1',
        token: 'USDC',
        amount: 100,
        chainKey: 'base',
      });
      assert.strictEqual(calls[0].toolName, 'depositForYield');
      assert.strictEqual(calls[0].args.strategyId, 'aave-usdc');
      assert.strictEqual(calls[0].args.fromAccountAddress, '0x1');
      assert.strictEqual(calls[0].args.token, 'USDC');
      assert.strictEqual(calls[0].args.amount, 100);
      assert.strictEqual(calls[0].args.chainKey, 'base');
    });

    it('withdrawFromYield should validate required fields', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.withdrawFromYield({}), /vaultTokenAddress is required/);
      await assert.rejects(
        () => client.withdrawFromYield({ vaultTokenAddress: '0xVAULT' }),
        /underlyingToken is required/,
      );
      await assert.rejects(
        () => client.withdrawFromYield({ vaultTokenAddress: '0xVAULT', underlyingToken: 'USDC' }),
        /withdrawAmount is required/,
      );
      await assert.rejects(
        () => client.withdrawFromYield({ vaultTokenAddress: '0xVAULT', underlyingToken: 'USDC', withdrawAmount: 50 }),
        /fromAccountAddress is required/,
      );
      await assert.rejects(
        () => client.withdrawFromYield({ vaultTokenAddress: '0xVAULT', underlyingToken: 'USDC', withdrawAmount: 50, fromAccountAddress: '0x1' }),
        /chainKey is required/,
      );
    });

    it('withdrawFromYield should call tool with all params', async () => {
      const { client, calls } = createClient();
      await client.withdrawFromYield({
        vaultTokenAddress: '0xVAULT',
        underlyingToken: 'USDC',
        withdrawAmount: 50,
        fromAccountAddress: '0x1',
        chainKey: 'base',
      });
      assert.strictEqual(calls[0].toolName, 'withdrawFromYield');
      assert.strictEqual(calls[0].args.vaultTokenAddress, '0xVAULT');
      assert.strictEqual(calls[0].args.underlyingToken, 'USDC');
      assert.strictEqual(calls[0].args.withdrawAmount, 50);
      assert.strictEqual(calls[0].args.fromAccountAddress, '0x1');
      assert.strictEqual(calls[0].args.chainKey, 'base');
    });
  });
});
