const assert = require('node:assert');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { getService, getServiceUrl, getServiceNames, SERVICES } = require('../src/mcp-registry');

describe('mcp-registry', () => {
  it('returns wallet MCP config', () => {
    const mcp = getService('wallet');
    assert.strictEqual(mcp.url, 'https://mcp.fd.xyz');
    assert.strictEqual(mcp.name, 'Finance District Agent Wallet');
  });

  it('returns prism MCP config', () => {
    const mcp = getService('prism');
    assert.strictEqual(mcp.url, 'https://prism-mcp.fd.xyz');
    assert.strictEqual(mcp.name, 'Finance District Prism Payment Gateway');
  });

  it('throws on unknown MCP service', () => {
    assert.throws(() => getService('unknown'), /Unknown MCP service "unknown"/);
  });

  it('error message lists available services', () => {
    assert.throws(() => getService('bad'), /Available: wallet, prism/);
  });

  it('lists all MCP service names', () => {
    const names = getServiceNames();
    assert.deepStrictEqual(names, ['wallet', 'prism']);
  });

  it('SERVICES object has expected keys', () => {
    assert.ok(SERVICES.wallet);
    assert.ok(SERVICES.prism);
    assert.strictEqual(Object.keys(SERVICES).length, 2);
  });

  describe('getServiceUrl', () => {
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
      assert.strictEqual(getServiceUrl('wallet'), 'https://mcp.fd.xyz');
      assert.strictEqual(getServiceUrl('prism'), 'https://prism-mcp.fd.xyz');
    });

    it('FDX_MCP_SERVER overrides all services', () => {
      process.env.FDX_MCP_SERVER = 'https://staging.fd.xyz';
      assert.strictEqual(getServiceUrl('wallet'), 'https://staging.fd.xyz');
      assert.strictEqual(getServiceUrl('prism'), 'https://staging.fd.xyz');
    });

    it('per-service env var takes priority over FDX_MCP_SERVER', () => {
      process.env.FDX_MCP_SERVER = 'https://global.fd.xyz';
      process.env.FDX_WALLET_MCP_URL = 'https://wallet-staging.fd.xyz';
      assert.strictEqual(getServiceUrl('wallet'), 'https://wallet-staging.fd.xyz');
      assert.strictEqual(getServiceUrl('prism'), 'https://global.fd.xyz');
    });

    it('FDX_PRISM_MCP_URL overrides prism only', () => {
      process.env.FDX_PRISM_MCP_URL = 'https://prism-staging.fd.xyz';
      assert.strictEqual(getServiceUrl('wallet'), 'https://mcp.fd.xyz');
      assert.strictEqual(getServiceUrl('prism'), 'https://prism-staging.fd.xyz');
    });
  });
});
