# Development Guide

Step-by-step instructions to set up FDX for local development on any machine.

---

## Prerequisites

- Node.js >= 18
- Git

---

## 1. Clone the repo

```bash
git clone https://github.com/financedistrict-platform/fd-agent-wallet-cli.git
cd fd-agent-wallet-cli
```

## 2. Install dependencies and link the CLI

```bash
npm install
npm link
```

Verify the `fdx` command is available:

```bash
fdx
```

Should print usage info with `register`, `login`, `verify`, `status`, `wallet`, and `prism` commands.

## 3. Register and authenticate

```bash
fdx register --email you@example.com
# Check your email for an 8-digit OTP
fdx verify --code 12345678
```

This will:

- Send a one-time passcode to your email via Entra External ID
- Exchange the OTP for access and refresh tokens
- Store tokens in the OS credential store (fallback: `~/.fdx/auth.json`)

## 4. Verify the CLI works

```bash
fdx status                       # auth status
fdx wallet call getMyInfo        # account info
fdx wallet call getAppVersion    # server version
fdx wallet call                  # list all available wallet tools
fdx prism call                   # discover prism tools (fetched from service)
```

All commands should return data. Run `fdx wallet call` or `fdx prism call` without arguments to see the full list of available tools. If auth errors occur, run `fdx login --email you@example.com` and `fdx verify --code <OTP>` again.

## 5. Environment Variables

| Variable           | Description        | Default                                |
| ------------------ | ------------------ | -------------------------------------- |
| `FDX_MCP_SERVER`   | MCP service URL (deprecated) | `https://mcp.fd.xyz`          |
| `FDX_STORE_PATH`   | Token store path   | `~/.fdx/auth.json`                     |
| `FDX_LOG_PATH`     | Log file path      | `~/.fdx/fdx.log`                       |
| `FDX_LOG_LEVEL`    | Log verbosity (`debug`\|`info`\|`warn`\|`error`\|`off`) | `info` |

Entra authentication configuration (authority, client ID, scopes) is baked into the package at build time and cannot be overridden at runtime.

You can set these inline before a command, as persistent shell exports, or via a `.env` file in the working directory (see `.env.example`). The `.env` file is gitignored so values never end up in the repository.

## 6. Testing against a non-production environment

The CLI defaults to the production services. To point it at a different environment, override `FDX_WALLET_MCP_URL` / `FDX_PRISM_MCP_URL` (or the deprecated `FDX_MCP_SERVER` fallback) — the test service addresses are shared privately with the test team and must never be committed to the repository.

**Option A — inline (one command):**

```bash
FDX_MCP_SERVER=https://... fdx login --email you@example.com
FDX_MCP_SERVER=https://... fdx wallet call getMyInfo
```

**Option B — shell export (current session):**

```bash
export FDX_MCP_SERVER=https://...
fdx login --email you@example.com
fdx wallet call getMyInfo
```

**Option C — `.env` file (persistent, local only):**

```bash
cp .env.example .env
# edit .env and uncomment FDX_MCP_SERVER=https://...
fdx login --email you@example.com
```

The `.env` file is loaded automatically when the `fdx` binary starts. It is gitignored — do not commit it.

---

## Updating after code changes

When changes are pushed to the repo:

```bash
cd fd-agent-wallet-cli
git pull
npm install
npm link
```

---

## Running Tests

```bash
npm test
```

## Linting

```bash
npm run lint
npm run lint:fix  # auto-fix
```

---

## Troubleshooting

| Problem                   | Fix                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `fdx: command not found`  | Run `npm link` in the repo directory                                               |
| Auth errors on `fdx wallet/prism call` | Run `fdx login --email you@example.com` then `fdx verify --code <OTP>` |
| Token expired             | Auto-refreshes via refresh token. If that also expired, run `fdx login` again      |
