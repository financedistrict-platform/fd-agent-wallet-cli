# Bug: macOS Keychain credential store silently stores empty passwords

**Severity:** Medium (security)
**Status:** Pre-existing (not introduced by v0.4.0)
**File:** `src/credential-store.js:107`

## Problem

`security add-generic-password -w` (without a value argument) does NOT read password from stdin. It prompts from tty. The code pipes the secret via `input: secret` in `execFileSync`, but macOS `security` ignores stdin and stores an empty password.

```js
// BROKEN — macOS security ignores stdin, stores empty
execFileSync('security', ['add-generic-password', '-a', account, '-s', SERVICE, '-w'], {
  input: secret,  // ← ignored by security CLI
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

## Impact

- macOS users never get Keychain storage — `setSecret` "succeeds" but stores empty
- Auth falls back silently to plaintext `~/.fdx/auth.json`
- Tokens stored in plain text on disk instead of encrypted Keychain

## Fix

Pass password as `-w` argument:

```js
execFileSync('security', ['add-generic-password', '-a', account, '-s', SERVICE, '-w', secret], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

**Trade-off:** Secret visible in process arguments (`ps aux`). Original code tried to avoid this. Alternatives:
- Accept the trade-off (password is ephemeral in process list)
- Use `expect` or `osaascript` to feed tty input (over-engineered)

## Reproduction

```bash
node -e "
const { execFileSync } = require('child_process');
const ACCT = 'fdx-debug-' + Date.now();

// Via stdin (BROKEN)
execFileSync('security', ['add-generic-password', '-a', ACCT, '-s', 'fdx-wallet', '-w'], {
  input: 'hello', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000
});
const result = execFileSync('security', ['find-generic-password', '-a', ACCT, '-s', 'fdx-wallet', '-w'], {
  encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000
}).trim();
console.log('Got:', JSON.stringify(result)); // '' (empty)
execFileSync('security', ['delete-generic-password', '-a', ACCT, '-s', 'fdx-wallet'], { stdio: 'pipe' });
"
```

## Affected Tests

- `test/credential-store.test.js:28` — "should round-trip a secret"
- `test/credential-store.test.js:57` — "should overwrite an existing secret"
