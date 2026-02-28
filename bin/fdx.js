#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env'), quiet: true });

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
      `${pc.dim('Environment (optional overrides):')}`,
      `  FDX_MCP_SERVER              MCP server URL (default: https://mcp.fd.xyz)`,
      `  FDX_STORE_PATH              Token store path (default: ~/.fdx/auth.json)`,
      `  FDX_LOG_PATH                Log file path (default: ~/.fdx/fdx.log)`,
      `  FDX_LOG_LEVEL               Log verbosity: debug|info|warn|error|off (default: info)`,
    ].join('\n'),
  );

program
  .command('register')
  .description('Register a new account (sends email OTP)')
  .requiredOption('--email <email>', 'Email address for the new account')
  .action(async (opts) => {
    await require('./commands/register')(opts);
  });

program
  .command('login')
  .description('Sign in to an existing account (sends email OTP)')
  .requiredOption('--email <email>', 'Email address of the account')
  .action(async (opts) => {
    await require('./commands/login')(opts);
  });

program
  .command('verify')
  .description('Complete registration or login by submitting the OTP code')
  .requiredOption('--code <code>', 'OTP code received via email')
  .action(async (opts) => {
    await require('./commands/verify')({
      code: opts.code,
    });
  });

program
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    await require('./commands/status')();
  });

program
  .command('logout')
  .description('Remove stored credentials')
  .action(async () => {
    await require('./commands/logout')();
  });

program
  .command('call')
  .description('Invoke an MCP tool')
  .argument('[method]', 'tool name to invoke')
  .allowUnknownOption()
  .allowExcessArguments(true)
  .passThroughOptions()
  .action(async (method, _opts, cmd) => {
    await require('./commands/call')([method, ...cmd.args.slice(1)].filter(Boolean));
  });

program.parseAsync().catch((error) => {
  console.error(pc.red(error.message));
  process.exit(1);
});
