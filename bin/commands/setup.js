const http = require('http');
const { URL } = require('url');

const { createSpinner } = require('nanospinner');
const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');

module.exports = async function setup() {
  const client = createClientFromEnv();
  const port = new URL(client.authClient.redirectUri).port || 6274;

  console.log(pc.bold('FDX - Setup'));
  console.log('');
  console.log(`${pc.dim('MCP Server:')}   ${client.authClient.mcpServerUrl}`);
  console.log(`${pc.dim('Redirect URI:')} ${client.authClient.redirectUri}`);
  console.log(`${pc.dim('Store Path:')}   ${client.authClient.storePath}`);
  console.log('');

  const initSpinner = createSpinner('Registering client...').start();
  await client.initialize();
  initSpinner.success({ text: `Client ID: ${pc.cyan(client.authClient.clientId)}` });
  console.log('');

  const { url, state, codeVerifier } = await client.getAuthorizationUrl();

  console.log('Open this URL in your browser:');
  console.log('');
  console.log(pc.underline(url));
  console.log('');

  const callbackSpinner = createSpinner('Waiting for callback...').start();

  const code = await waitForCallback(port, client.authClient.redirectUri);
  callbackSpinner.success({ text: 'Callback received' });

  const tokenSpinner = createSpinner('Exchanging code for token...').start();
  const tokens = await client.exchangeCodeForToken({ code, state, codeVerifier });
  tokenSpinner.success({ text: 'Authentication successful' });

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

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function waitForCallback(port, redirectUri) {
  const callbackPath = new URL(redirectUri).pathname;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname === callbackPath) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(
            `<html><body><h1>Error: ${escapeHtml(error)}</h1><p>${escapeHtml(errorDescription || '')}</p></body></html>`,
          );
          server.close();
          clearTimeout(timer);
          reject(new Error(`${error}: ${errorDescription}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Success</h1><p>You can close this window.</p></body></html>');
          server.close();
          clearTimeout(timer);
          resolve(code);
          return;
        }
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    const TIMEOUT_MS = 5 * 60 * 1000;
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timed out after 5 minutes'));
    }, TIMEOUT_MS);

    server.listen(port, '127.0.0.1', () => {});
    server.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Callback server error: ${err.message}`));
    });
  });
}
