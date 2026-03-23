'use strict';

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVICE = 'fdx-wallet';
const TIMEOUT = 10000;

let _supported;

/**
 * Check if the OS credential store is available on this platform.
 *  - macOS: Keychain via `security` CLI
 *  - Linux: libsecret via `secret-tool` CLI
 *  - Windows: DPAPI via PowerShell
 */
function isSupported() {
  if (_supported !== undefined) return _supported;

  try {
    switch (process.platform) {
      case 'darwin':
        execFileSync('security', ['help'], { stdio: 'pipe', timeout: TIMEOUT });
        _supported = true;
        break;
      case 'linux':
        execFileSync('secret-tool', ['--help'], { stdio: 'pipe', timeout: TIMEOUT });
        _supported = true;
        break;
      case 'win32':
        execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '$null'], {
          stdio: 'pipe',
          timeout: TIMEOUT,
        });
        _supported = true;
        break;
      default:
        _supported = false;
    }
  } catch {
    _supported = false;
  }

  return _supported;
}

/**
 * Retrieve a secret from the OS credential store.
 * @param {string} account - Unique account identifier (e.g. MCP server host).
 * @returns {string|null} The secret string, or null if not found / not supported.
 */
function getSecret(account) {
  if (!isSupported()) return null;

  try {
    switch (process.platform) {
      case 'darwin':
        return execFileSync(
          'security',
          ['find-generic-password', '-a', account, '-s', SERVICE, '-w'],
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT },
        ).trim();

      case 'linux':
        return execFileSync('secret-tool', ['lookup', 'service', SERVICE, 'account', account], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: TIMEOUT,
        }).trim();

      case 'win32':
        return winDecrypt(account);

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Store a secret in the OS credential store.
 * @param {string} account - Unique account identifier.
 * @param {string} secret - The secret value to store.
 * @returns {boolean} True if stored successfully, false otherwise.
 */
function setSecret(account, secret) {
  if (!isSupported()) return false;

  try {
    switch (process.platform) {
      case 'darwin':
        // Delete existing entry first (add-generic-password -U can be unreliable)
        try {
          execFileSync('security', ['delete-generic-password', '-a', account, '-s', SERVICE], {
            stdio: 'pipe',
            timeout: TIMEOUT,
          });
        } catch {
          // Entry may not exist — ignore
        }
        // Pass secret as -w argument (macOS security does not read from stdin)
        execFileSync(
          'security',
          ['add-generic-password', '-a', account, '-s', SERVICE, '-w', secret],
          {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: TIMEOUT,
          },
        );
        return true;

      case 'linux':
        execFileSync(
          'secret-tool',
          ['store', '--label', `FDX (${account})`, 'service', SERVICE, 'account', account],
          { input: secret, stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT },
        );
        return true;

      case 'win32':
        winEncrypt(account, secret);
        return true;

      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Delete a secret from the OS credential store.
 * @param {string} account - Unique account identifier.
 */
function deleteSecret(account) {
  if (!isSupported()) return;

  try {
    switch (process.platform) {
      case 'darwin':
        execFileSync('security', ['delete-generic-password', '-a', account, '-s', SERVICE], {
          stdio: 'pipe',
          timeout: TIMEOUT,
        });
        break;

      case 'linux':
        execFileSync('secret-tool', ['clear', 'service', SERVICE, 'account', account], {
          stdio: 'pipe',
          timeout: TIMEOUT,
        });
        break;

      case 'win32':
        winDeleteFile(account);
        break;
    }
  } catch {
    // Credential may not exist — ignore
  }
}

// Tokens are encrypted with the current user's Windows login credentials via DPAPI

function dpapiPath(account) {
  const hash = crypto.createHash('sha256').update(account).digest('hex').slice(0, 16);
  return path.join(os.homedir(), '.fdx', `.cred_${hash}`);
}

function winEncrypt(account, plaintext) {
  const script = [
    'Add-Type -AssemblyName System.Security',
    '$bytes = [Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd())',
    '$enc = [Security.Cryptography.ProtectedData]::Protect(' +
      '$bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Convert]::ToBase64String($enc)',
  ].join('; ');

  const encrypted = execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { input: plaintext, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT },
  ).trim();

  const filePath = dpapiPath(account);
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, encrypted, { mode: 0o600 });
}

function winDecrypt(account) {
  const filePath = dpapiPath(account);
  if (!fs.existsSync(filePath)) return null;

  const encrypted = fs.readFileSync(filePath, 'utf8').trim();
  if (!encrypted) return null;

  const script = [
    'Add-Type -AssemblyName System.Security',
    '$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())',
    '$dec = [Security.Cryptography.ProtectedData]::Unprotect(' +
      '$bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Text.Encoding]::UTF8.GetString($dec)',
  ].join('; ');

  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: encrypted,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: TIMEOUT,
  }).trim();
}

function winDeleteFile(account) {
  try {
    fs.unlinkSync(dpapiPath(account));
  } catch {
    // File may not exist — ignore
  }
}

module.exports = { isSupported, getSecret, setSecret, deleteSecret };
