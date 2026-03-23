# Manual Testing Guide — FDX CLI

How to test the CLI against local MCP services (wallet + prism).

---

## Prerequisites

- Node.js >= 18
- MCP Wallet service running locally (default: `http://localhost:5000`)
- MCP Prism service running locally (default: `http://localhost:5020`)
- Email registered with Entra External ID

---

## 1. Environment Setup

Create `.env` from template:

```bash
cp .env.example .env
```

Add the following to `.env`:

```env
FDX_WALLET_MCP_URL=http://localhost:5000
FDX_PRISM_MCP_URL=http://localhost:5020
FDX_LOG_LEVEL=debug
```

| Variable | Description | Default |
|----------|-------------|---------|
| `FDX_WALLET_MCP_URL` | Wallet MCP service URL | `https://mcp.fd.xyz` |
| `FDX_PRISM_MCP_URL` | Prism MCP service URL | `https://prism-mcp.fd.xyz` |
| `FDX_LOG_LEVEL` | Log verbosity (`debug`\|`info`\|`warn`\|`error`\|`off`) | `info` |
| `FDX_STORE_PATH` | Token store path | `~/.fdx/auth.json` |

---

## 2. Install and Run from Source

```bash
npm install
```

Run directly from source (no `npm link` needed):

```bash
node bin/fdx.js --help
```

---

## 3. Commands That Don't Require Auth

These commands work without logging in:

```bash
# Check auth status
node bin/fdx.js status

# Show resolved configuration
node bin/fdx.js config

# List configured MCP services
node bin/fdx.js services
```

> **Note:** `fdx wallet` and `fdx prism` (with or without `--help`) require authentication — they connect to the MCP server to discover tools dynamically.

---

## 4. Authentication

### New Account — Register

```bash
node bin/fdx.js register --email you@example.com
# Check your email for an 8-digit OTP
node bin/fdx.js verify --code 12345678
```

If you get `user_already_exists`, use `login` instead of `register`.

### Existing Account — Login

```bash
node bin/fdx.js login --email you@example.com
# Check your email for an 8-digit OTP
node bin/fdx.js verify --code 12345678
```

### Verify Authentication

```bash
node bin/fdx.js status
```

Expected output:

```
Status: authenticated
  MCP service:    http://localhost:5000
  Store path:    C:\Users\<user>\.fdx\auth.json
  Email:         you@example.com
  Token expires: 2026-03-17T...
  Has refresh:   yes
  Credentials:   OS credential store
```

---

## 5. Testing Wallet Tools

After authenticating:

```bash
# List all available wallet tools (fetched from service)
node bin/fdx.js wallet

# Show params for a tool
node bin/fdx.js wallet getMyInfo --help
node bin/fdx.js wallet getTokenPrice --help

# Account info
node bin/fdx.js wallet getMyInfo

# Wallet overview
node bin/fdx.js wallet getWalletOverview --chainKey ethereum

# Token price
node bin/fdx.js wallet getTokenPrice --token ETH
```

---

## 6. Testing Prism Tools

Prism tools are fetched dynamically from the MCP server (same as wallet):

```bash
# List all prism tools (fetched from service)
node bin/fdx.js prism

# Show params for a tool
node bin/fdx.js prism getProviderInfo --help

# Invoke a tool
node bin/fdx.js prism getProviderInfo

# Invoke with params
node bin/fdx.js prism getProviderInfo --includeChains false
```

---

## 7. Logout

```bash
node bin/fdx.js logout
```

Removes tokens from the OS credential store and clears `~/.fdx/auth.json`.

---

## Important Notes

- **HTTP only for localhost**: CLI allows HTTP with `localhost`/`127.0.0.1`. Remote services require HTTPS.
- **Automatic token refresh**: When the access token expires, CLI auto-refreshes using the refresh token. If the refresh token also expires, run `fdx login` again.
- **Shared auth token**: Wallet and Prism share the same Entra auth token. Only one login is needed.
- **Log file**: Check detailed logs at `~/.fdx/fdx.log` (set `FDX_LOG_LEVEL=debug` for full output).

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `user_already_exists` | Used `register` for an existing email | Use `login` instead of `register` |
| `OS credential store is unavailable` | Token stored under a different server key | `logout` then `login` again |
| `No access token available` | Not logged in | Run `login` + `verify` |
| `SESSION_EXPIRED` | Refresh token expired | Run `login` + `verify` again |
| `TOOL_ERROR` | Server-side error (not a CLI issue) | Check server logs |
| `405 Method Not Allowed` | MCP server doesn't support GET | Normal — CLI uses POST, GET is just a probe |
