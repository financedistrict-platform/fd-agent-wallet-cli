const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');

const createSpinner = require('./spinner');

module.exports = async function login({ email }) {
  if (!email) {
    console.error(pc.red('--email is required'));
    process.exit(1);
  }

  const client = createClientFromEnv();

  console.log(pc.bold('FDX - Login'));
  console.log('');
  console.log(`${pc.dim('Email:')}       ${email}`);
  console.log(`${pc.dim('MCP Server:')} ${client.authClient.mcpServerUrl}`);
  console.log('');

  const spinner = createSpinner('Requesting verification code...').start();

  let challenge;
  try {
    challenge = await client.login(email);
  } catch (err) {
    spinner.error({ text: 'Login failed' });
    if (err.response?.data) {
      const d = err.response.data;
      console.error(`\n  ${pc.red('Error:')}   ${d.error || 'unknown'}`);
      console.error(`  ${pc.red('Detail:')}  ${d.error_description || err.message}`);
      if (d.suberror) console.error(`  ${pc.red('Sub:')}     ${d.suberror}`);
    } else {
      console.error(`\n  ${pc.red('Error:')} ${err.message}`);
    }
    process.exit(1);
  }

  spinner.success({ text: 'Verification code sent' });
  console.log('');
  console.log(pc.bold('─'.repeat(58)));
  console.log(`  ${pc.dim('Code sent to:')} ${challenge.challengeTargetLabel}`);
  console.log(`  ${pc.dim('Code length:')}  ${challenge.codeLength} digits`);
  console.log(pc.bold('─'.repeat(58)));
  console.log('');
  console.log(`Check your email and run: ${pc.cyan('fdx verify --code <OTP_CODE>')}`);
  console.log('');

  // Output machine-readable JSON for agent consumption
  console.log(
    JSON.stringify({
      status: 'otp_sent',
      email,
      codeLength: challenge.codeLength,
      challengeTargetLabel: challenge.challengeTargetLabel,
    }),
  );
};
