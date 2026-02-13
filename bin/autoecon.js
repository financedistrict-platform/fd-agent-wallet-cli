#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') });

const command = process.argv[2];

function showHelp() {
  console.log('Usage: autoecon <command>');
  console.log('');
  console.log('Commands:');
  console.log('  setup    Run OAuth 2.1 authentication flow');
  console.log('  status   Check authentication status');
  console.log('  call     Invoke an SDK method: autoecon call <method> [--param value ...]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h       Show this help message');
  console.log('  --version, -v    Show version number');
  console.log('');
  console.log('Environment:');
  console.log(
    '  AUTOECON_MCP_SERVER     MCP server URL (default: https://mcp.test.1stdigital.tech)',
  );
  console.log(
    '  AUTOECON_REDIRECT_URI   OAuth callback URI (default: http://localhost:6274/oauth/callback)',
  );
  console.log('  AUTOECON_STORE_PATH     Token store path (default: ~/.openclaw/auth/wallet.json)');
}

// Handle help flag
if (command === '--help' || command === '-h' || command === 'help') {
  showHelp();
  process.exit(0);
}

// Handle version flag
if (command === '--version' || command === '-v' || command === 'version') {
  const pkg = require('../package.json');
  console.log(pkg.version);
  process.exit(0);
}

const commands = {
  setup: () => require('./commands/setup')(),
  status: () => require('./commands/status')(),
  call: () => require('./commands/call')(process.argv.slice(3)),
};

if (!command || !commands[command]) {
  showHelp();
  process.exit(1);
}

commands[command]();
