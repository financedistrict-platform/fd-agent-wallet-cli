const os = require('os');
const path = require('path');

const { AutoEconClient } = require('./autoecon-client');

const DEFAULT_MCP_SERVER = 'https://mcp.test.1stdigital.tech';

function createClientFromEnv() {
  const mcpServerUrl = process.env.AUTOECON_MCP_SERVER || DEFAULT_MCP_SERVER;
  const redirectUri = process.env.AUTOECON_REDIRECT_URI;
  const storePath = process.env.AUTOECON_STORE_PATH;

  return new AutoEconClient({
    mcpServerUrl,
    redirectUri: redirectUri || `http://localhost:6274/oauth/callback`,
    storePath: storePath || path.join(os.homedir(), '.openclaw', 'auth', 'wallet.json'),
  });
}

module.exports = { createClientFromEnv };
