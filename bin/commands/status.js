const os = require('os');
const path = require('path');

const { readStore } = require('../../src/storage');

module.exports = async function status() {
  const storePath =
    process.env.AUTOECON_STORE_PATH || path.join(os.homedir(), '.openclaw', 'auth', 'wallet.json');

  let store;
  try {
    store = await readStore(storePath);
  } catch (error) {
    console.log('Status: not configured');
    console.log(`  Store path: ${storePath} (${error.message})`);
    process.exit(1);
  }

  if (!store.tokens?.accessToken) {
    console.log('Status: not authenticated');
    console.log(`  Store path: ${storePath}`);
    console.log('  Run "autoecon setup" to authenticate.');
    process.exit(1);
  }

  const expired = store.tokens.expiresAt && Date.now() >= store.tokens.expiresAt;
  const hasRefresh = !!store.tokens.refreshToken;

  console.log(`Status: ${expired ? 'token expired' : 'authenticated'}`);
  console.log(`  Store path:    ${storePath}`);
  console.log(`  Client ID:     ${store.mcpAuth?.clientId || 'unknown'}`);
  console.log(
    `  Token expires:  ${store.tokens.expiresAt ? new Date(store.tokens.expiresAt).toISOString() : 'unknown'}`,
  );
  console.log(`  Has refresh:   ${hasRefresh}`);

  if (expired && !hasRefresh) {
    console.log('');
    console.log('Token expired and no refresh token. Run "autoecon setup" to re-authenticate.');
    process.exit(1);
  }

  if (expired && hasRefresh) {
    console.log('');
    console.log('Token expired but refresh token available. Will auto-refresh on next call.');
  }
};
