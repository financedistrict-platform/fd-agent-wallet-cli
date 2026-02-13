const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const { createClientFromEnv } = require('../../src');

const SKILL_NAME = 'autoecon';
const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const SKILL_SRC = path.resolve(__dirname, '..', '..', 'skill', SKILL_NAME);
const SKILL_DEST = path.join(OPENCLAW_DIR, 'skills', SKILL_NAME);

module.exports = async function setup() {
  const client = createClientFromEnv();
  const port = new URL(client.authClient.redirectUri).port || 6274;

  console.log('AutoEcon - Setup');
  console.log('');
  console.log(`MCP Server:   ${client.authClient.mcpServerUrl}`);
  console.log(`Redirect URI: ${client.authClient.redirectUri}`);
  console.log(`Store Path:   ${client.authClient.storePath}`);
  console.log('');

  await client.initialize();
  console.log(`Client ID: ${client.authClient.clientId}`);
  console.log('');

  const { url, state } = await client.getAuthorizationUrl();

  console.log('Open this URL in your browser:');
  console.log('');
  console.log(url);
  console.log('');
  console.log(`Waiting for callback on port ${port}...`);

  const code = await waitForCallback(port, client.authClient.redirectUri);

  const tokens = await client.exchangeCodeForToken({ code, state });
  console.log('');
  console.log('Authentication successful.');
  console.log(`  Token Type:  ${tokens.token_type}`);
  console.log(`  Expires In:  ${tokens.expires_in}s`);
  console.log(`  Has Refresh: ${!!tokens.refresh_token}`);
  console.log('');

  installSkill();
  configureOpenClaw(client.authClient.storePath);
};

function installSkill() {
  console.log('Installing skill...');

  if (!fs.existsSync(SKILL_SRC)) {
    console.log(`  SKIP: Skill source not found at ${SKILL_SRC}`);
    return;
  }

  fs.cpSync(SKILL_SRC, SKILL_DEST, { recursive: true });
  console.log(`  Copied to ${SKILL_DEST}`);
}

function hasOpenClaw() {
  try {
    execSync('openclaw --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function openclawConfigGet(keyPath) {
  try {
    return execSync(`openclaw config get ${keyPath}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function openclawConfigSet(keyPath, value) {
  execSync(`openclaw config set ${keyPath} ${value}`, { stdio: 'ignore' });
}

function configureOpenClaw(storePath) {
  console.log('');
  console.log('Configuring OpenClaw...');

  if (!hasOpenClaw()) {
    console.log('  openclaw CLI not found. Add this to ~/.openclaw/openclaw.json manually:');
    console.log('');
    printManualConfig(storePath);
    return;
  }

  const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
  if (!fs.existsSync(configPath)) {
    console.log(`  SKIP: ${configPath} not found. Is OpenClaw installed?`);
    console.log('');
    printManualConfig(storePath);
    return;
  }

  try {
    JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    console.log(
      `  ERROR: ${configPath} contains invalid JSON. Fix it first, then re-run autoecon setup.`,
    );
    console.log('');
    printManualConfig(storePath);
    return;
  }

  const currentEnabled = openclawConfigGet(`skills.entries.${SKILL_NAME}.enabled`);
  const currentStore = openclawConfigGet(`skills.entries.${SKILL_NAME}.env.AUTOECON_STORE_PATH`);

  if (currentEnabled === 'true' && currentStore === storePath) {
    console.log('  Already configured.');
  } else {
    openclawConfigSet(`skills.entries.${SKILL_NAME}.enabled`, 'true');
    openclawConfigSet(`skills.entries.${SKILL_NAME}.env.AUTOECON_STORE_PATH`, `"${storePath}"`);
    console.log('  Config updated.');
  }

  console.log('');
  console.log('Done. Restart the OpenClaw gateway to load the skill:');
  console.log('  openclaw gateway restart');
}

function printManualConfig(storePath) {
  console.log(
    JSON.stringify(
      {
        skills: {
          entries: {
            [SKILL_NAME]: {
              enabled: true,
              env: { AUTOECON_STORE_PATH: storePath },
            },
          },
        },
      },
      null,
      2,
    ),
  );
  console.log('');
  console.log('Then restart the gateway: openclaw gateway restart');
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
            `<html><body><h1>Error: ${error}</h1><p>${errorDescription || ''}</p></body></html>`,
          );
          server.close();
          reject(new Error(`${error}: ${errorDescription}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Success</h1><p>You can close this window.</p></body></html>');
          server.close();
          resolve(code);
          return;
        }
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    server.listen(port, () => {});
    server.on('error', (err) => reject(new Error(`Callback server error: ${err.message}`)));
  });
}
