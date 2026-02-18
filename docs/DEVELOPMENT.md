# Development Guide

Step-by-step instructions to set up FDX for local development on any machine.

---

## Prerequisites

- Node.js >= 18
- Git
- A browser for the OAuth consent flow

---

## 1. Clone the repo

```bash
git clone https://github.com/1stdigital/fd-agent-wallet-cli.git
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

Should print usage info with `setup`, `status`, `call` commands.

## 3. Run setup

```bash
fdx setup
```

This will:

- Discover the OAuth server
- Register a client dynamically (first time only)
- Print an authorization URL — open it in your browser
- Wait for the OAuth callback on `localhost:6260`
- Exchange the code for tokens
- Write tokens to `~/.fdx/auth.json`

If the machine is headless and you can't open a browser, run `fdx setup` on your local machine instead, then copy the token file:

```bash
# From local machine
scp ~/.fdx/auth.json user@server:~/.fdx/auth.json
ssh user@server "chmod 600 ~/.fdx/auth.json"
```

## 4. Verify the CLI works

```bash
fdx status
fdx call getMyInfo
fdx call getAppVersion
```

All three should return data. If `fdx call` fails with auth errors, run `fdx setup` again.

## 5. Environment Variables

| Variable           | Description        | Default                                |
| ------------------ | ------------------ | -------------------------------------- |
| `FDX_MCP_SERVER`   | MCP server URL     | `https://mcp.fd.xyz`                   |
| `FDX_REDIRECT_URI` | OAuth callback URI | `http://localhost:6260/oauth/callback` |
| `FDX_STORE_PATH`   | Token store path   | `~/.fdx/auth.json`                     |

You can also set these in a `.env` file in the working directory.

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

| Problem                   | Fix                                                                           |
| ------------------------- | ----------------------------------------------------------------------------- |
| `fdx: command not found`  | Run `npm link` in the repo directory                                          |
| Auth errors on `fdx call` | Run `fdx setup` to re-authenticate                                            |
| Token expired             | Auto-refreshes via refresh token. If that also expired, run `fdx setup` again |
