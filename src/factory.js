const os = require('os');
const path = require('path');

const { WalletClient } = require('./wallet-client');

const DEFAULT_MCP_SERVER = 'https://mcp.fd.xyz';

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
  });
}

module.exports = { createClientFromEnv };
