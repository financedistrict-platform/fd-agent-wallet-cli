'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_PATH = path.join(os.homedir(), '.fdx', 'config.json');

const KNOWN_KEYS = {
  authority: 'FDX_AUTHORITY',
  client_id: 'FDX_CLIENT_ID',
  scopes: 'FDX_SCOPES',
  wallet_mcp_url: 'FDX_WALLET_MCP_URL',
  prism_mcp_url: 'FDX_PRISM_MCP_URL',
  store_path: 'FDX_STORE_PATH',
  log_path: 'FDX_LOG_PATH',
  log_level: 'FDX_LOG_LEVEL',
};

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function writeConfig(data) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  const json = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(CONFIG_PATH, json, { mode: 0o600 });
}

function loadConfigIntoEnv() {
  let cfg;
  try {
    cfg = readConfig();
  } catch (err) {
    console.error(`Warning: ignoring unreadable ${CONFIG_PATH} (${err.message})`);
    return;
  }

  for (const [key, envVar] of Object.entries(KNOWN_KEYS)) {
    if (cfg[key] !== undefined && process.env[envVar] === undefined) {
      process.env[envVar] = cfg[key];
    }
  }
}

module.exports = { readConfig, writeConfig, loadConfigIntoEnv, KNOWN_KEYS, CONFIG_PATH };
