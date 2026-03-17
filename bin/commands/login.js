const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');
const { getServiceUrl, getServiceNames } = require('../../src/mcp-registry');

const createSpinner = require('../helpers/spinner');
const { printError } = require('../helpers/cli-error-handler');

module.exports = async function login({ email }) {
  if (!email) {
    console.error(pc.red('--email is required'));
    process.exit(1);
  }

  const client = createClientFromEnv();

  console.log(pc.bold('FDX - Login'));
  console.log('');
  console.log(`${pc.dim('Email:')}${' '.repeat(Math.max(1, 12 - 'Email'.length - 1))}${email}`);
  for (const name of getServiceNames()) {
    console.log(`${pc.dim(`${name}:`)}${' '.repeat(Math.max(1, 12 - name.length - 1))}${getServiceUrl(name)}`);
  }
  console.log('');

  const spinner = createSpinner('Requesting verification code...').start();

  let challenge;
  try {
    challenge = await client.login(email);
  } catch (err) {
    spinner.error({ text: 'Login failed' });
    printError(err);
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

  console.log(
    JSON.stringify({
      status: 'otp_sent',
      email,
      codeLength: challenge.codeLength,
      challengeTargetLabel: challenge.challengeTargetLabel,
    }),
  );
};
