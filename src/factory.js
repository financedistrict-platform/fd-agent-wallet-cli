const os = require('os');
const path = require('path');

const { WalletClient } = require('./wallet-client');

const DEFAULT_MCP_SERVER = 'https://mcp.fd.xyz';
const DEFAULT_ENTRA_AUTHORITY = 'https://auth.fd.xyz/financedistrict.onmicrosoft.com';
const DEFAULT_ENTRA_CLIENT_ID = '77109def-1265-40e2-93e0-20051cd9a186';
const DEFAULT_ENTRA_SCOPES = 'api://fd-agent-wallet-mcp/mcp:tools openid offline_access';

function createClientFromEnv() {
  const mcpServerUrl = process.env.FDX_MCP_SERVER || DEFAULT_MCP_SERVER;
  const storePath = process.env.FDX_STORE_PATH;

  const parsed = new URL(mcpServerUrl);
  if (
    parsed.protocol !== 'https:' &&
    parsed.hostname !== 'localhost' &&
    parsed.hostname !== '127.0.0.1'
  ) {
    throw new Error('FDX_MCP_SERVER must use HTTPS (HTTP is only allowed for localhost)');
  }

  return new WalletClient({
    mcpServerUrl,
    storePath: storePath || path.join(os.homedir(), '.fdx', 'auth.json'),
    entraConfig: {
      authority: DEFAULT_ENTRA_AUTHORITY,
      clientId: DEFAULT_ENTRA_CLIENT_ID,
      scopes: DEFAULT_ENTRA_SCOPES,
    },
  });
}

module.exports = { createClientFromEnv };
