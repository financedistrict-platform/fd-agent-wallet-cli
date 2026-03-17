const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');

module.exports = async function status() {
  const client = createClientFromEnv();
  const storePath = client.authStorePath;
  const mcpService = client.mcpServerUrl;

  let state;
  try {
    state = await client.getTokenState();
  } catch (error) {
    console.log(pc.red('Status: not configured'));
    console.log(`  ${pc.dim('MCP service:')}  ${mcpService}`);
    console.log(`  ${pc.dim('Store path:')} ${storePath} (${error.message})`);
    process.exit(1);
  }

  if (!state.authenticated) {
    console.log(pc.yellow('Status: not authenticated'));
    console.log(`  ${pc.dim('MCP service:')}  ${mcpService}`);
    console.log(`  ${pc.dim('Store path:')} ${storePath}`);
    console.log(`  Run ${pc.cyan('"fdx register"')} or ${pc.cyan('"fdx login"')} to authenticate.`);
    process.exit(1);
  }

  const statusLabel = state.expired ? pc.yellow('token expired') : pc.green('authenticated');
  console.log(`Status: ${statusLabel}`);
  console.log(`  ${pc.dim('MCP service:')}    ${mcpService}`);
  console.log(`  ${pc.dim('Store path:')}    ${storePath}`);
  console.log(`  ${pc.dim('Email:')}          ${state.email || 'unknown'}`);
  console.log(
    `  ${pc.dim('Token expires:')}  ${state.expiresAt ? new Date(state.expiresAt).toISOString() : 'unknown'}`,
  );
  console.log(
    `  ${pc.dim('Has refresh:')}   ${state.hasRefresh ? pc.green('yes') : pc.yellow('no')}`,
  );
  console.log(
    `  ${pc.dim('Credentials:')}   ${state.usingCredentialStore ? pc.green('OS credential store') : pc.yellow('plaintext file')}`,
  );

  if (state.expired && !state.hasRefresh) {
    console.log('');
    console.log(
      pc.red('Token expired and no refresh token.') +
        ` Run ${pc.cyan('"fdx login --email <email>"')} to re-authenticate.`,
    );
    process.exit(1);
  }

  if (state.expired && state.hasRefresh) {
    console.log('');
    console.log(
      pc.dim('Token expired but refresh token available. Will auto-refresh on next call.'),
    );
  }
};
