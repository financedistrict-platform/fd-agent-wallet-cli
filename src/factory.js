const os = require('os');
const path = require('path');

const { FdxClient } = require('./fdx-client');
const { getServiceUrl } = require('./mcp-registry');

// Entra presets per environment — switch via FDX_ENV=test|prod (default: prod)
const ENV_PRESETS = {
  prod: {
    authority: 'https://auth.fd.xyz/financedistrict.onmicrosoft.com',
    clientId: '77109def-1265-40e2-93e0-20051cd9a186',
    scopes: 'api://fd-agent-wallet-mcp/mcp:tools openid offline_access',
  },
  test: {
    authority: 'https://auth.test.1stdigital.tech/401c099d-173f-468b-af84-a77a4120fb58',
    clientId: '954aab11-6268-4a2a-b583-6f45804842be',
    scopes: 'api://fd-agent-wallet-mcp/mcp:tools openid offline_access',
  },
};

function getEntraConfig() {
  const env = process.env.FDX_ENV || 'prod';
  const preset = ENV_PRESETS[env];
  if (!preset) {
    const valid = Object.keys(ENV_PRESETS).join(', ');
    throw new Error(`Unknown FDX_ENV: "${env}". Valid values: ${valid}`);
  }
  return preset;
}

function createClientFromEnv(serviceName = 'wallet') {
  const mcpServerUrl = getServiceUrl(serviceName);
  const storePath = process.env.FDX_STORE_PATH;

  const parsed = new URL(mcpServerUrl);
  if (
    parsed.protocol !== 'https:' &&
    parsed.hostname !== 'localhost' &&
    parsed.hostname !== '127.0.0.1'
  ) {
    throw new Error('FDX_MCP_SERVER must use HTTPS (HTTP is only allowed for localhost)');
  }

  return new FdxClient({
    mcpServerUrl,
    storePath: storePath || path.join(os.homedir(), '.fdx', 'auth.json'),
    entraConfig: getEntraConfig(),
  });
}

module.exports = { createClientFromEnv, getEntraConfig, ENV_PRESETS };
