const pc = require('picocolors');

const SIGNUP_URL = 'https://fd.xyz/signup';

module.exports = async function signup() {
  console.log(pc.bold('FDX - Sign Up'));
  console.log('');
  console.log('  Create a Finance District account to get started.');
  console.log('');
  console.log(`  ${pc.dim('Sign up at:')} ${pc.underline(SIGNUP_URL)}`);
  console.log('');
  console.log(`  After signing up, run ${pc.cyan('"fdx login"')} to authenticate.`);
};
