const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');

module.exports = async function logout() {
  const client = createClientFromEnv();

  await client.logout();

  console.log(pc.green('Logged out.') + ' Credentials removed.');
  console.log(`  Run ${pc.cyan('"fdx login --email <email>"')} to authenticate again.`);
};
