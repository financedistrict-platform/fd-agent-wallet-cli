const os = require('os');
const path = require('path');

const pc = require('picocolors');

const { getEntraConfig, ENV_PRESETS } = require('../../src/factory');
const { getServiceUrl, SERVICES } = require('../../src/mcp-registry');

// Show resolved config for all env vars, Entra preset, and MCP service URLs
module.exports = function config() {
  const env = process.env.FDX_ENV || 'prod';
  const storePath = process.env.FDX_STORE_PATH || path.join(os.homedir(), '.fdx', 'auth.json');
  const logPath = process.env.FDX_LOG_PATH || path.join(os.homedir(), '.fdx', 'fdx.log');
  const logLevel = process.env.FDX_LOG_LEVEL || 'info';

  let entra;
  try {
    entra = getEntraConfig();
  } catch (err) {
    console.log(pc.red(`FDX_ENV error: ${err.message}`));
    process.exit(1);
  }

  const isOverride = (key) => (process.env[key] ? pc.cyan('(env)') : pc.dim('(default)'));

  console.log('');
  console.log(pc.bold('FDX Configuration'));
  console.log('');

  // Environment preset
  console.log(pc.underline('Environment'));
  console.log(`  FDX_ENV            ${pc.green(env)}  ${isOverride('FDX_ENV')}`);
  console.log('');

  // Entra auth
  console.log(pc.underline('Entra Auth'));
  console.log(`  Authority          ${entra.authority}`);
  console.log(`  Client ID          ${entra.clientId}`);
  console.log(`  Scopes             ${entra.scopes}`);
  if (entra.authority.includes('TODO-')) {
    console.log(`  ${pc.yellow('⚠ Placeholder values — test Entra tenant not yet configured')}`);
  }
  console.log('');

  // MCP services
  console.log(pc.underline('MCP Services'));
  for (const [name] of Object.entries(SERVICES)) {
    const url = getServiceUrl(name);
    const envKey = `FDX_${name.toUpperCase()}_MCP_URL`;
    console.log(`  ${name.padEnd(17)}${url}  ${isOverride(envKey)}`);
  }
  if (process.env.FDX_MCP_SERVER) {
    console.log(`  ${pc.yellow('FDX_MCP_SERVER')}     ${process.env.FDX_MCP_SERVER}  ${pc.yellow('(deprecated)')}`);
  }
  console.log('');

  // Paths & logging
  console.log(pc.underline('Storage & Logging'));
  console.log(`  Store path         ${storePath}  ${isOverride('FDX_STORE_PATH')}`);
  console.log(`  Log path           ${logPath}  ${isOverride('FDX_LOG_PATH')}`);
  console.log(`  Log level          ${logLevel}  ${isOverride('FDX_LOG_LEVEL')}`);
  console.log('');

  // Available presets
  console.log(pc.underline('Available Presets'));
  for (const key of Object.keys(ENV_PRESETS)) {
    const marker = key === env ? pc.green('● ') : pc.dim('○ ');
    console.log(`  ${marker}${key}`);
  }
  console.log('');
};
