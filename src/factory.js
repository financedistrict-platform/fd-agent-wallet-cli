const os = require('os');
const path = require('path');

const { FdxClient } = require('./fdx-client');
const { getServiceUrl } = require('./mcp-registry');

// Production defaults — override any value via FDX_AUTHORITY, FDX_CLIENT_ID, FDX_SCOPES
const ENTRA_DEFAULTS = {
  authority: 'https://auth.fd.xyz/financedistrict.onmicrosoft.com',
  clientId: '77109def-1265-40e2-93e0-20051cd9a186',
  scopes: 'api://fd-agent-wallet-mcp/mcp:tools openid offline_access',
};

function getEntraConfig() {
  return {
    authority: process.env.FDX_AUTHORITY || ENTRA_DEFAULTS.authority,
    clientId: process.env.FDX_CLIENT_ID || ENTRA_DEFAULTS.clientId,
    scopes: process.env.FDX_SCOPES || ENTRA_DEFAULTS.scopes,
  };
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

module.exports = { createClientFromEnv, getEntraConfig, ENTRA_DEFAULTS };
