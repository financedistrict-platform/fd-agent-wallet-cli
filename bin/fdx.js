#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') });

const { Command } = require('commander');
const pc = require('picocolors');

const pkg = require('../package.json');

const program = new Command();

program
  .name('fdx')
  .description('Agent wallet CLI — Finance District MCP wallet client')
  .version(pkg.version)
  .enablePositionalOptions()
  .addHelpText(
    'after',
    [
      '',
      `${pc.dim('Environment:')}`,
      `  FDX_MCP_SERVER     MCP server URL (default: https://mcp.fd.xyz)`,
      `  FDX_REDIRECT_URI   OAuth callback URI (default: http://localhost:6260/oauth/callback)`,
      `  FDX_STORE_PATH     Token store path (default: ~/.fdx/auth.json)`,
    ].join('\n'),
  );

program
  .command('setup')
  .description('Run OAuth 2.1 authentication flow')
  .option('--device', 'Use device authorization flow (no browser redirect required)')
  .action(async (opts) => {
    await require('./commands/setup')(opts);
  });

program
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    await require('./commands/status')();
  });

program
  .command('call')
  .description('Invoke an MCP tool')
  .argument('<method>', 'tool name to invoke')
  .allowUnknownOption()
  .allowExcessArguments(true)
  .passThroughOptions()
  .action(async (method, _opts, cmd) => {
    await require('./commands/call')([method, ...cmd.args.slice(1)]);
  });

program.parseAsync().catch((error) => {
  console.error(pc.red(error.message));
  process.exit(1);
});
