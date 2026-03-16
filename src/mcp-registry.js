// Per-server env var keys for URL overrides (e.g. FDX_WALLET_MCP_URL, FDX_PRISM_MCP_URL)
const ENV_KEY_PREFIX = 'FDX_';
const ENV_KEY_SUFFIX = '_MCP_URL';

const SERVERS = {
  wallet: {
    url: 'https://mcp.fd.xyz',
    name: 'Finance District Wallet',
  },
  prism: {
    url: 'https://prism-mcp.fd.xyz',
    name: 'Prism Platform',
  },
};

let _deprecationWarned = false;

// Resolution order: FDX_<NAME>_MCP_URL → FDX_MCP_SERVER (deprecated global) → hardcoded default
function getServerUrl(name) {
  const mcp = getServer(name);
  const perServerKey = `${ENV_KEY_PREFIX}${name.toUpperCase()}${ENV_KEY_SUFFIX}`;
  const perServerUrl = process.env[perServerKey];
  if (perServerUrl) return perServerUrl;

  const globalUrl = process.env.FDX_MCP_SERVER;
  if (globalUrl) {
    if (!_deprecationWarned) {
      _deprecationWarned = true;
      console.error(
        `Warning: FDX_MCP_SERVER is deprecated — it overrides ALL services to the same URL.\n` +
          `  Use per-server env vars instead:\n` +
          `    export FDX_WALLET_MCP_URL=...\n` +
          `    export FDX_PRISM_MCP_URL=...\n`,
      );
    }
    return globalUrl;
  }

  return mcp.url;
}

function getServer(name) {
  const mcp = SERVERS[name];
  if (!mcp) {
    const available = Object.keys(SERVERS).join(', ');
    throw new Error(`Unknown MCP service "${name}". Available: ${available}`);
  }
  return mcp;
}

function getServerNames() {
  return Object.keys(SERVERS);
}

module.exports = { getServer, getServerUrl, getServerNames, SERVERS };
