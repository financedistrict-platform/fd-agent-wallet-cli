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
      await client.discoverYieldStrategies({ chainKey: 'base', minApy: 5 });
      assert.strictEqual(calls[0].toolName, 'discoverYieldStrategies');
      assert.strictEqual(calls[0].args.chainKey, 'base');
      assert.strictEqual(calls[0].args.minApy, 5);
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

    it('deploySmartAccount should throw if chainKey is missing', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.deploySmartAccount({}), /chainKey is required/);
    });

    it('transferTokens should validate required fields', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.transferTokens({}), /chainKey is required/);
      await assert.rejects(
        () => client.transferTokens({ chainKey: 'ethereum' }),
        /recipientAddress is required/,
      );
      await assert.rejects(
        () => client.transferTokens({ chainKey: 'ethereum', recipientAddress: '0x1' }),
        /amount is required/,
      );
    });

    it('transferTokens should call tool with all params', async () => {
      const { client, calls } = createClient();
      await client.transferTokens({
        chainKey: 'ethereum',
        recipientAddress: '0xABC',
        amount: '1.5',
        tokenAddress: '0xTOKEN',
      });
      assert.strictEqual(calls[0].toolName, 'transferTokens');
      assert.strictEqual(calls[0].args.chainKey, 'ethereum');
      assert.strictEqual(calls[0].args.recipientAddress, '0xABC');
      assert.strictEqual(calls[0].args.amount, '1.5');
      assert.strictEqual(calls[0].args.tokenAddress, '0xTOKEN');
    });

    it('swapTokens should validate required fields', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.swapTokens({}), /chainKey is required/);
      await assert.rejects(() => client.swapTokens({ chainKey: 'base' }), /tokenIn is required/);
    });

    it('authorizePayment should throw if url is missing', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.authorizePayment({}), /url is required/);
    });

    it('getX402Content should throw if url is missing', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.getX402Content({}), /url is required/);
    });

    it('depositForYield should validate required fields', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.depositForYield({}), /chainKey is required/);
      await assert.rejects(
        () => client.depositForYield({ chainKey: 'base' }),
        /strategyId is required/,
      );
    });

    it('withdrawFromYield should validate required fields', async () => {
      const { client } = createClient();
      await assert.rejects(() => client.withdrawFromYield({}), /chainKey is required/);
      await assert.rejects(
        () => client.withdrawFromYield({ chainKey: 'base' }),
        /positionId is required/,
      );
    });
  });
});
