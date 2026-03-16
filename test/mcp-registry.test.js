const assert = require('node:assert');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { getServer, getServerUrl, getServerNames, SERVERS } = require('../src/mcp-registry');

describe('mcp-registry', () => {
  it('returns wallet MCP config', () => {
    const mcp = getServer('wallet');
    assert.strictEqual(mcp.url, 'https://mcp.fd.xyz');
    assert.strictEqual(mcp.name, 'Finance District Wallet');
  });

  it('returns prism MCP config', () => {
    const mcp = getServer('prism');
    assert.strictEqual(mcp.url, 'https://prism-mcp.fd.xyz');
    assert.strictEqual(mcp.name, 'Prism Platform');
  });

  it('throws on unknown MCP service', () => {
    assert.throws(() => getServer('unknown'), /Unknown MCP service "unknown"/);
  });

  it('error message lists available services', () => {
    assert.throws(() => getServer('bad'), /Available: wallet, prism/);
  });

  it('lists all MCP server names', () => {
    const names = getServerNames();
    assert.deepStrictEqual(names, ['wallet', 'prism']);
  });

  it('SERVERS object has expected keys', () => {
    assert.ok(SERVERS.wallet);
    assert.ok(SERVERS.prism);
    assert.strictEqual(Object.keys(SERVERS).length, 2);
  });

  describe('getServerUrl', () => {
    const envKeys = ['FDX_WALLET_MCP_URL', 'FDX_PRISM_MCP_URL', 'FDX_MCP_SERVER'];
    const saved = {};

    beforeEach(() => {
      // Save and clear all MCP env vars before each test
      for (const key of envKeys) {
        saved[key] = process.env[key];
        delete process.env[key];
      }
    });

    afterEach(() => {
      // Restore original env state
      for (const key of envKeys) {
        if (saved[key] !== undefined) process.env[key] = saved[key];
        else delete process.env[key];
      }
    });

    it('returns hardcoded default when no env vars set', () => {
      assert.strictEqual(getServerUrl('wallet'), 'https://mcp.fd.xyz');
      assert.strictEqual(getServerUrl('prism'), 'https://prism-mcp.fd.xyz');
    });

    it('FDX_MCP_SERVER overrides all servers', () => {
      process.env.FDX_MCP_SERVER = 'https://staging.fd.xyz';
      assert.strictEqual(getServerUrl('wallet'), 'https://staging.fd.xyz');
      assert.strictEqual(getServerUrl('prism'), 'https://staging.fd.xyz');
    });

    it('per-server env var takes priority over FDX_MCP_SERVER', () => {
      process.env.FDX_MCP_SERVER = 'https://global.fd.xyz';
      process.env.FDX_WALLET_MCP_URL = 'https://wallet-staging.fd.xyz';
      assert.strictEqual(getServerUrl('wallet'), 'https://wallet-staging.fd.xyz');
      assert.strictEqual(getServerUrl('prism'), 'https://global.fd.xyz');
    });

    it('FDX_PRISM_MCP_URL overrides prism only', () => {
      process.env.FDX_PRISM_MCP_URL = 'https://prism-staging.fd.xyz';
      assert.strictEqual(getServerUrl('wallet'), 'https://mcp.fd.xyz');
      assert.strictEqual(getServerUrl('prism'), 'https://prism-staging.fd.xyz');
    });
  });
});
