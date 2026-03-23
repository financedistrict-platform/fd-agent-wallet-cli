// Per-service env var keys for URL overrides (e.g. FDX_WALLET_MCP_URL, FDX_PRISM_MCP_URL)
const ENV_KEY_PREFIX = 'FDX_';
const ENV_KEY_SUFFIX = '_MCP_URL';

const SERVICES = {
  wallet: {
    url: 'https://mcp.fd.xyz',
    name: 'Finance District Agent Wallet',
  },
  prism: {
    url: 'https://prism-mcp.fd.xyz',
    name: 'Finance District Prism Payment Gateway',
  },
};

let _deprecationWarned = false;

// Resolution order: FDX_<NAME>_MCP_URL → FDX_MCP_SERVER (deprecated global) → hardcoded default
function getServiceUrl(name) {
  const mcp = getService(name);
  const perServiceKey = `${ENV_KEY_PREFIX}${name.toUpperCase()}${ENV_KEY_SUFFIX}`;
  const perServiceUrl = process.env[perServiceKey];
  if (perServiceUrl) return perServiceUrl;

  const globalUrl = process.env.FDX_MCP_SERVER;
  if (globalUrl) {
    if (!_deprecationWarned) {
      _deprecationWarned = true;
      console.error(
        `Warning: FDX_MCP_SERVER is deprecated — it overrides ALL services to the same URL.\n` +
          `  Use per-service env vars instead:\n` +
          `    export FDX_WALLET_MCP_URL=...\n` +
          `    export FDX_PRISM_MCP_URL=...\n`,
      );
    }
    return globalUrl;
  }

  return mcp.url;
}

function getService(name) {
  const mcp = SERVICES[name];
  if (!mcp) {
    const available = Object.keys(SERVICES).join(', ');
    throw new Error(`Unknown MCP service "${name}". Available: ${available}`);
  }
  return mcp;
}

function getServiceNames() {
  return Object.keys(SERVICES);
}

module.exports = { getService, getServiceUrl, getServiceNames, SERVICES };
