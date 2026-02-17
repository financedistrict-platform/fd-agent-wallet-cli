const os = require('os');
const path = require('path');

const pc = require('picocolors');

const { readStore } = require('../../src/storage');

module.exports = async function status() {
  const storePath = process.env.FDX_STORE_PATH || path.join(os.homedir(), '.fdx', 'auth.json');

  let store;
  try {
    store = await readStore(storePath);
  } catch (error) {
    console.log(pc.red('Status: not configured'));
    console.log(`  ${pc.dim('Store path:')} ${storePath} (${error.message})`);
    process.exit(1);
  }

  if (!store.tokens?.accessToken) {
    console.log(pc.yellow('Status: not authenticated'));
    console.log(`  ${pc.dim('Store path:')} ${storePath}`);
    console.log(`  Run ${pc.cyan('"fdx setup"')} to authenticate.`);
    process.exit(1);
  }

  const expired = store.tokens.expiresAt && Date.now() >= store.tokens.expiresAt;
  const hasRefresh = !!store.tokens.refreshToken;

  const statusLabel = expired ? pc.yellow('token expired') : pc.green('authenticated');
  console.log(`Status: ${statusLabel}`);
  console.log(`  ${pc.dim('Store path:')}    ${storePath}`);
  console.log(`  ${pc.dim('Client ID:')}     ${store.mcpAuth?.clientId || 'unknown'}`);
  console.log(
    `  ${pc.dim('Token expires:')}  ${store.tokens.expiresAt ? new Date(store.tokens.expiresAt).toISOString() : 'unknown'}`,
  );
  console.log(`  ${pc.dim('Has refresh:')}   ${hasRefresh ? pc.green('yes') : pc.yellow('no')}`);

  if (expired && !hasRefresh) {
    console.log('');
    console.log(
      pc.red('Token expired and no refresh token.') +
        ` Run ${pc.cyan('"fdx setup"')} to re-authenticate.`,
    );
    process.exit(1);
  }

  if (expired && hasRefresh) {
    console.log('');
    console.log(
      pc.dim('Token expired but refresh token available. Will auto-refresh on next call.'),
    );
  }
};
