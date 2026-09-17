const os = require('os');
const path = require('path');

const pc = require('picocolors');

const { readConfig, writeConfig, KNOWN_KEYS, CONFIG_PATH } = require('../../src/config');
const { getEntraConfig } = require('../../src/factory');
const { getServiceUrl, SERVICES } = require('../../src/mcp-registry');

function sourceLabel(envKey, configKey, cfg) {
  const envValue = process.env[envKey];
  if (envValue === undefined) return pc.dim('(default)');
  if (cfg[configKey] === envValue) return pc.green('(config)');
  return pc.cyan('(env)');
}

function isKnownKey(key) {
  if (KNOWN_KEYS[key] !== undefined) return true;
  const available = Object.keys(KNOWN_KEYS).join(', ');
  console.error(pc.red(`Unknown key "${key}". Available: ${available}`));
  process.exitCode = 1;
  return false;
}

function loadOrReport() {
  try {
    return { cfg: readConfig() };
  } catch (err) {
    console.error(pc.red(`Cannot read ${CONFIG_PATH}: ${err.message}`));
    console.error(pc.dim('  Delete or repair that file, then run the command again.'));
    process.exitCode = 1;
    return { failed: true };
  }
}

// Show resolved config for all env vars, Entra settings, and MCP service URLs
function show() {
  const { cfg, failed } = loadOrReport();
  if (failed) return;

  const storePath = process.env.FDX_STORE_PATH || path.join(os.homedir(), '.fdx', 'auth.json');
  const logPath = process.env.FDX_LOG_PATH || path.join(os.homedir(), '.fdx', 'fdx.log');
  const logLevel = process.env.FDX_LOG_LEVEL || 'info';

  const entra = getEntraConfig();

  console.log('');
  console.log(pc.bold('FDX Configuration'));
  console.log(pc.dim(`Config file: ${CONFIG_PATH}`));
  console.log('');

  // Entra auth
  console.log(pc.underline('Entra Auth'));
  console.log(
    `  Authority          ${entra.authority}  ${sourceLabel('FDX_AUTHORITY', 'authority', cfg)}`,
  );
  console.log(
    `  Client ID          ${entra.clientId}  ${sourceLabel('FDX_CLIENT_ID', 'client_id', cfg)}`,
  );
  console.log(`  Scopes             ${entra.scopes}  ${sourceLabel('FDX_SCOPES', 'scopes', cfg)}`);
  console.log('');

  // MCP services
  console.log(pc.underline('MCP Services'));
  for (const [name] of Object.entries(SERVICES)) {
    const url = getServiceUrl(name);
    const envKey = `FDX_${name.toUpperCase()}_MCP_URL`;
    const cfgKey = `${name}_mcp_url`;
    console.log(`  ${name.padEnd(17)}${url}  ${sourceLabel(envKey, cfgKey, cfg)}`);
  }
  if (process.env.FDX_MCP_SERVER) {
    console.log(
      `  ${pc.yellow('FDX_MCP_SERVER')}     ${process.env.FDX_MCP_SERVER}  ${pc.yellow('(deprecated)')}`,
    );
  }
  console.log('');

  // Paths & logging
  console.log(pc.underline('Storage & Logging'));
  console.log(
    `  Store path         ${storePath}  ${sourceLabel('FDX_STORE_PATH', 'store_path', cfg)}`,
  );
  console.log(`  Log path           ${logPath}  ${sourceLabel('FDX_LOG_PATH', 'log_path', cfg)}`);
  console.log(
    `  Log level          ${logLevel}  ${sourceLabel('FDX_LOG_LEVEL', 'log_level', cfg)}`,
  );
  console.log('');

  console.log(pc.dim('Priority: env var > config file > default'));
  console.log('');
}

function set(key, value) {
  if (!isKnownKey(key)) return;
  const { cfg, failed } = loadOrReport();
  if (failed) return;

  cfg[key] = value;
  writeConfig(cfg);
  console.log(pc.green(`Set ${key} = ${value}`));
}

function get(key) {
  if (!isKnownKey(key)) return;
  const { cfg, failed } = loadOrReport();
  if (failed) return;

  console.log(cfg[key] === undefined ? pc.dim('(not set)') : cfg[key]);
}

function unset(key) {
  if (!isKnownKey(key)) return;

  let cfg;
  try {
    cfg = readConfig();
  } catch {
    console.error(pc.yellow(`Discarding unreadable ${CONFIG_PATH}`));
    cfg = {};
  }

  delete cfg[key];
  writeConfig(cfg);
  console.log(pc.green(`Unset ${key}`));
}

module.exports = { show, set, get, unset };
