const assert = require('node:assert');
const { describe, it } = require('node:test');

const { FdxClient } = require('../src/fdx-client');

function createClient() {
  const calls = [];
  const client = new FdxClient({
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

describe('FdxClient', () => {
  describe('constructor', () => {
    it('should throw if mcpServerUrl is missing', () => {
      assert.throws(
        () =>
          new FdxClient({
            storePath: '/tmp/test.json',
          }),
        /mcpServerUrl is required/,
      );
    });

    it('should throw if storePath is missing', () => {
      assert.throws(
        () =>
          new FdxClient({
            mcpServerUrl: 'https://example.com',
          }),
        /storePath is required/,
      );
    });
  });

  describe('callMcpTool', () => {
    it('should delegate to mcpClient.callTool', async () => {
      const { client, calls } = createClient();
      await client.callMcpTool('getMyInfo', {});
      assert.strictEqual(calls[0].toolName, 'getMyInfo');
      assert.deepStrictEqual(calls[0].args, {});
    });

    it('should forward all args to mcpClient.callTool', async () => {
      const { client, calls } = createClient();
      await client.callMcpTool('transferTokens', {
        toAddress: '0xABC',
        amount: 1.5,
        asset: 'USDC',
        chainKey: 'ethereum',
      });
      assert.strictEqual(calls[0].toolName, 'transferTokens');
      assert.strictEqual(calls[0].args.toAddress, '0xABC');
      assert.strictEqual(calls[0].args.amount, 1.5);
      assert.strictEqual(calls[0].args.asset, 'USDC');
      assert.strictEqual(calls[0].args.chainKey, 'ethereum');
    });
  });

  describe('proxy getters', () => {
    it('authStorePath should delegate to authClient', () => {
      const client = new FdxClient({
        mcpServerUrl: 'https://mcp.example.com',
        storePath: '/tmp/fdx-test.json',
      });
      assert.strictEqual(client.authStorePath, '/tmp/fdx-test.json');
    });

    it('mcpServerUrl should delegate to authClient', () => {
      const client = new FdxClient({
        mcpServerUrl: 'https://mcp.example.com',
        storePath: '/tmp/fdx-test.json',
      });
      assert.strictEqual(client.mcpServerUrl, 'https://mcp.example.com');
    });
  });
});
