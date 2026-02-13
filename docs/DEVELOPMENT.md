# AutoEcon + OpenClaw: Server Setup Guide

Step-by-step instructions to install and test AutoEcon on an OpenClaw instance running on a remote server.

---

## Prerequisites

- Remote server with OpenClaw installed (`~/.openclaw/`)
- Node.js >= 18 on the server
- Git on the server
- A browser accessible from the server (or SSH tunnel for the OAuth callback)

---

## 1. Clone the repo

```bash
cd ~/gh
git clone https://github.com/ermirbeqiraj/openclaw-wallet.git
cd openclaw-wallet
```

## 2. Install dependencies and link the CLI

```bash
npm install
npm link
```

Verify the `autoecon` command is available:

```bash
autoecon
```

Should print usage info with `setup`, `status`, `call` commands.

## 3. Run setup

```bash
autoecon setup
```

This will:

- Discover the OAuth server
- Register a client dynamically (first time only)
- Print an authorization URL — open it in your browser
- Wait for the OAuth callback on `localhost:6274`
- Exchange the code for tokens
- Write tokens to `~/.openclaw/auth/wallet.json`
- Copy the skill to `~/.openclaw/skills/autoecon/`
- Configure `openclaw.json` automatically

If the server is headless and you can't open a browser, run `autoecon setup` on your local machine instead, then `scp` the token file:

```bash
# From local machine
scp ~/.openclaw/auth/wallet.json user@server:~/.openclaw/auth/wallet.json
ssh user@server "chmod 600 ~/.openclaw/auth/wallet.json"
```

## 4. Restart the gateway

```bash
openclaw gateway restart
```

## 5. Verify the CLI works

```bash
autoecon status
autoecon call getMyInfo
autoecon call getAppVersion
```

All three should return data. If `autoecon call` fails with auth errors, run `autoecon setup` again.

## 6. Test with the agent

Ask the agent something like:

- "What's my wallet address?"
- "Show me my wallet overview"
- "What version of the API is running?"

The agent should read the skill instructions and run `autoecon call` commands to answer.

---

## Updating after code changes

When changes are pushed to the repo:

```bash
cd ~/gh/openclaw-wallet
git pull
npm install
npm link
autoecon setup   # re-copies skill, re-checks config
```

Start a new session to pick up skill changes.

---

## Troubleshooting

| Problem                        | Fix                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `autoecon: command not found`  | Run `npm link` in the repo dir                                                                |
| Auth errors on `autoecon call` | Run `autoecon setup` to re-authenticate                                                       |
| Agent doesn't see the skill    | Check `~/.openclaw/skills/autoecon/SKILL.md` exists and `openclaw.json` has the entry enabled |
| Token expired                  | Auto-refreshes via refresh token. If refresh also expired, run `autoecon setup` again         |
