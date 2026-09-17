#!/usr/bin/env node

const path = require('node:path');

const { Command } = require('commander');
const dotenv = require('dotenv');
const pc = require('picocolors');

const pkg = require('../package.json');
const { loadConfigIntoEnv } = require('../src/config');
const { SERVICES } = require('../src/mcp-registry');

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
loadConfigIntoEnv();

const program = new Command();

program
  .name('fdx')
  .description('Finance District CLI — Wallet & Prism MCP client')
  .version(pkg.version)
  .enablePositionalOptions()
  .addHelpText(
    'after',
    [
      '',
      `${pc.dim('Environment (optional overrides):')}`,
      `  FDX_AUTHORITY               Entra authority URL`,
      `  FDX_CLIENT_ID               Entra client (application) ID`,
      `  FDX_SCOPES                  Entra scopes`,
      `  FDX_WALLET_MCP_URL          Wallet MCP service URL (default: https://mcp.fd.xyz)`,
      `  FDX_PRISM_MCP_URL           Prism MCP service URL (default: https://prism-mcp.fd.xyz)`,
      `  FDX_MCP_SERVER              Global MCP URL fallback (overrides all if per-service not set)`,
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
  .command('config')
  .description('Show or manage persistent configuration (~/.fdx/config.json)')
  .argument('[action]', 'set | get | unset (omit to show all)')
  .argument('[key]', 'config key (e.g. authority, wallet_mcp_url)')
  .argument('[value]', 'value to set')
  .addHelpText(
    'after',
    [
      '',
      `${pc.dim('Available keys:')}`,
      `  authority, client_id, scopes, wallet_mcp_url, prism_mcp_url,`,
      `  store_path, log_path, log_level`,
      '',
      `${pc.dim('Examples:')}`,
      `  fdx config                                     Show resolved config`,
      `  fdx config set authority https://auth.test...  Persist a value`,
      `  fdx config get authority                       Read a persisted value`,
      `  fdx config unset authority                     Remove a persisted value`,
    ].join('\n'),
  )
  .action((action, key, value) => {
    const configCmd = require('./commands/config');

    if (!action) return configCmd.show();

    if (action === 'set') {
      if (!key || !value) {
        console.error(pc.red('Usage: fdx config set <key> <value>'));
        process.exitCode = 1;
        return;
      }
      return configCmd.set(key, value);
    }

    if (action === 'get') {
      if (!key) {
        console.error(pc.red('Usage: fdx config get <key>'));
        process.exitCode = 1;
        return;
      }
      return configCmd.get(key);
    }

    if (action === 'unset') {
      if (!key) {
        console.error(pc.red('Usage: fdx config unset <key>'));
        process.exitCode = 1;
        return;
      }
      return configCmd.unset(key);
    }

    console.error(pc.red(`Unknown config action "${action}". Use set, get, or unset.`));
    process.exitCode = 1;
  });

program
  .command('wallet')
  .description('Wallet MCP tools (DeFi, transfers, X402 payments)')
  .argument('[method]', 'tool name to invoke')
  .allowUnknownOption()
  .allowExcessArguments(true)
  .passThroughOptions()
  .action(async (method, _opts, cmd) => {
    // Skip legacy "call" keyword — treat next arg as the method
    const rawArgs = cmd.args.slice(1);
    if (method === 'call') {
      method = rawArgs.shift();
    }
    await require('./commands/wallet-call')([method, ...rawArgs].filter(Boolean), {
      serviceName: 'wallet',
    });
  });

program
  .command('prism')
  .description('Prism MCP tools (payments, settlements, accounts)')
  .argument('[method]', 'tool name to invoke')
  .allowUnknownOption()
  .allowExcessArguments(true)
  .passThroughOptions()
  .action(async (method, _opts, cmd) => {
    // Skip legacy "call" keyword — treat next arg as the method
    const rawArgs = cmd.args.slice(1);
    if (method === 'call') {
      method = rawArgs.shift();
    }
    await require('./commands/prism-call')([method, ...rawArgs].filter(Boolean));
  });

program
  .command('services')
  .description('List available services')
  .action(() => {
    console.log('');
    console.log('Available MCP services:');
    for (const [key, srv] of Object.entries(SERVICES)) {
      console.log(`  ${pc.cyan(key.padEnd(10))}${pc.dim('—')} ${srv.name}`);
    }
    console.log('');
    console.log(`Usage: ${pc.cyan('fdx <service> <method> [args...]')}`);
    console.log('');
  });

program
  .command('call')
  .description('(deprecated — use fdx <service> <method> ...)')
  .argument('[method]', 'tool name')
  .allowUnknownOption()
  .allowExcessArguments(true)
  .passThroughOptions()
  .action(() => {
    console.log('');
    console.log(pc.yellow('"fdx call" is deprecated.'));
    console.log('');
    console.log(`  Use:  ${pc.cyan('fdx <service> <method>')}`);
    console.log('');
    console.log(pc.dim('Run fdx services to see available services.'));
    process.exitCode = 1;
  });

program.parseAsync().catch((error) => {
  console.error(pc.red(error.message));
  process.exitCode = 1;
});
