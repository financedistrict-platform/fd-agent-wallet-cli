const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');

const createSpinner = require('../helpers/spinner');
const { printError } = require('../helpers/cli-error-handler');

module.exports = async function verify({ code }) {
  if (!code) {
    console.error(pc.red('--code is required'));
    process.exit(1);
  }

  const client = createClientFromEnv();

  const pending = await client.getPendingVerification();
  if (!pending) {
    console.error(
      pc.red('No pending verification found. Run "fdx register" or "fdx login" first.'),
    );
    process.exit(1);
  }

  const { continuationToken, email, flow } = pending;

  console.log(pc.bold('FDX - Verify'));
  console.log('');
  console.log(`${pc.dim('Email:')} ${email}`);
  console.log(`${pc.dim('Flow:')}  ${flow || 'login'}`);
  console.log('');

  const spinner = createSpinner('Verifying code...').start();

  let tokens;
  try {
    if (flow === 'register') {
      tokens = await client.verifyRegistration(continuationToken, code, email);
    } else {
      tokens = await client.verifyLogin(continuationToken, code, email);
    }
  } catch (err) {
    spinner.error({ text: 'Verification failed' });
    printError(err);
    process.exit(1);
  }

  spinner.success({ text: 'Authentication successful' });
  console.log('');
  console.log(`  ${pc.dim('Token Type:')}  ${tokens.token_type}`);
  console.log(`  ${pc.dim('Expires In:')}  ${tokens.expires_in}s`);
  console.log(
    `  ${pc.dim('Has Refresh:')} ${tokens.refresh_token ? pc.green('yes') : pc.yellow('no')}`,
  );
  console.log('');
  console.log(
    pc.green('Done.') +
      ' You can now use ' +
      pc.cyan('"fdx <service> call <method>"') +
      ' to invoke MCP tools.',
  );
};
