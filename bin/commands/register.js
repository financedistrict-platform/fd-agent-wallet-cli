const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');
const { getServerUrl, getServerNames } = require('../../src/mcp-registry');

const createSpinner = require('./spinner');

module.exports = async function register({ email }) {
  if (!email) {
    console.error(pc.red('--email is required'));
    process.exit(1);
  }

  const client = createClientFromEnv();

  console.log(pc.bold('FDX - Register'));
  console.log('');
  console.log(`${pc.dim('Email:')}       ${email}`);
  for (const name of getServerNames()) {
    console.log(`${pc.dim(`${name}:`)}${' '.repeat(Math.max(1, 12 - name.length - 1))}${getServerUrl(name)}`);
  }
  console.log('');

  const spinner = createSpinner('Starting registration...').start();

  let challenge;
  try {
    challenge = await client.register(email);
  } catch (err) {
    spinner.error({ text: 'Registration failed' });
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
