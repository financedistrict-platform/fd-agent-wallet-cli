const { createSpinner } = require('nanospinner');
const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');

module.exports = async function setup() {
  const client = createClientFromEnv();

  console.log(pc.bold('FDX - Setup'));
  console.log('');
  console.log(`${pc.dim('MCP Server:')}   ${client.authClient.mcpServerUrl}`);
  console.log(`${pc.dim('Store Path:')}   ${client.authClient.storePath}`);
  console.log('');

  const initSpinner = createSpinner('Registering client...').start();
  await client.initialize();
  initSpinner.success({ text: `Client ID: ${pc.cyan(client.authClient.clientId)}` });
  console.log('');

  const deviceSpinner = createSpinner('Requesting device code...').start();
  const deviceInfo = await client.startDeviceFlow();
  deviceSpinner.success({ text: 'Device code received' });

  console.log('');
  console.log(pc.bold('─'.repeat(58)));
  console.log(`  ${pc.dim('Verification URL:')} ${pc.underline(deviceInfo.verificationUri)}`);
  console.log(`  ${pc.bold('Enter code:')}       ${pc.cyan(pc.bold(deviceInfo.userCode))}`);
  console.log(pc.bold('─'.repeat(58)));
  console.log('');

  const pollSpinner = createSpinner('Waiting for authorization...').start();
  const tokens = await client.pollDeviceToken({
    deviceCode: deviceInfo.deviceCode,
    interval: deviceInfo.interval,
    expiresIn: deviceInfo.expiresIn,
  });
  pollSpinner.success({ text: 'Authentication successful' });

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
      pc.cyan('"fdx call <method>"') +
      ' to invoke MCP tools.',
  );
};
