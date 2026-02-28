# FDX — Agent Wallet CLI

[![npm version](https://img.shields.io/npm/v/@financedistrict/fdx)](https://www.npmjs.com/package/@financedistrict/fdx)
[![CI](https://github.com/financedistrict-platform/fd-agent-wallet-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/financedistrict-platform/fd-agent-wallet-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The official [Finance District](https://fd.xyz) CLI for [Agent Wallet](https://fd.xyz/agent-wallet) — give your AI agent a crypto wallet in minutes.

## Why FDX?

[Finance District](https://fd.xyz) is an open financial ecosystem where humans and AI transact together — from payments and wallets to on-chain asset management. **Agent Wallet CLI** gives your AI genuine financial autonomy: its own wallet, not a borrowed connection to yours.

- **Security** — Non-custodial architecture with hardware-backed access controls and smart accounts (ERC-4337). Your agent never touches private keys.
- **Trust** — Built by the team behind institutional-grade custody and settlement systems. Production infrastructure, not a weekend project.
- **Autonomy** — Full wallet capabilities with no artificial restrictions. Hold, send, swap, and earn yield across chains — your agent decides how to act.

### What your agent can do

- **Hold money** — Receive, hold, and manage assets across Ethereum, BSC, Arbitrum, Base, and Solana.
- **Pay and get paid** — Transfer tokens, authorize payments, and access paid APIs on behalf of the user.
- **Earn yield** — Discover and deposit into DeFi strategies (Aave, Compound, Yearn) without leaving the conversation.
- **Swap assets** — Trade tokens across DEXs with smart routing, slippage protection, and MEV shielding.
- **Work anywhere** — Structured JSON over the command line. If your agent can run a shell command, it can use FDX.

## Quick Start

### 1. Sign up for Finance District

Create a free account — just an email and a confirmation click:

```bash
fdx signup
```

### 2. Install the CLI

```bash
npm install -g @financedistrict/fdx
```

### 3. Log in

```bash
fdx login
```

A one-time code will appear. Open the verification URL, enter the code, and you're authenticated.

### 4. Verify

```bash
fdx status
```

Done. Your agent can now call any wallet method.

## Agent Wallet Skills

FDX works best with the Agent Wallet skills — pre-built tool definitions that let your agent understand what wallet actions are available and how to call them.

Install all Agent Wallet skills with [Vercel's Skills CLI](https://sdk.vercel.ai/docs/ai-sdk-core/agents#skills):

```bash
npx skills add financedistrict-platform/fd-agent-wallet-skills
```

## Usage

```bash
# Check wallet overview
fdx call getWalletOverview --chainKey ethereum

# Send tokens
fdx call transferTokens --chainKey ethereum --recipientAddress 0xABC... --amount 0.1

# Swap tokens
fdx call swapTokens --chainKey base --tokenIn USDC --tokenOut ETH --amount 100

# Discover yield strategies
fdx call discoverYieldStrategies --chainKey base

# Get account info
fdx call getMyInfo
```

All output is JSON, making it easy for agents to parse:

```bash
fdx call getMyInfo | jq '.email'
```

Run `fdx call` without arguments to see all available methods.

## Authentication

FDX uses OAuth 2.1 with the Device Authorization Grant (RFC 8628). Authentication is always tied to a user identity — the agent acts as a delegate on the user's behalf.

### Login

```bash
fdx login
```

The CLI retrieves a short one-time code and prints it alongside the verification URL:

```
──────────────────────────────────────────────────────────
  Verification URL: https://auth.fd.xyz/device
  Enter code:       ABCD-1234
──────────────────────────────────────────────────────────
```

Open the URL on any device (or have your agent navigate to it), enter the code, and complete sign-in. The CLI polls in the background and stores the token once authorization is confirmed. Works everywhere — Docker containers, CI pipelines, remote servers, and autonomous agents.

### Token storage

Tokens are stored in the OS credential store where available:

| Platform | Backend |
|----------|---------|
| macOS | Keychain (`security` CLI) |
| Linux | libsecret (`secret-tool` CLI) |
| Windows | DPAPI (encrypted file in `~/.fdx/`) |

If no credential store is available (e.g. a minimal container), tokens fall back to plaintext in `~/.fdx/auth.json` with a `SecurityWarning` emitted. Tokens are refreshed automatically using the stored refresh token.

### Logging out

```bash
fdx logout
```

Removes stored tokens from the OS credential store and `~/.fdx/auth.json`. The next `fdx login` goes straight to authentication without re-registration.

## SDK Usage

FDX can also be used as a Node.js library:

```js
const { createClientFromEnv } = require('@financedistrict/fdx');

const client = createClientFromEnv();
const result = await client.getWalletOverview({ chainKey: 'ethereum' });
console.log(result.data);
```

## Configuration

| Environment Variable | Description        | Default                                |
| -------------------- | ------------------ | -------------------------------------- |
| `FDX_MCP_SERVER`     | Server URL         | `https://mcp.fd.xyz`                   |
| `FDX_STORE_PATH`     | Token store path   | `~/.fdx/auth.json`                     |
| `FDX_LOG_PATH`       | Log file path      | `~/.fdx/fdx.log`                       |
| `FDX_LOG_LEVEL`      | Log verbosity (`debug`\|`info`\|`warn`\|`error`\|`off`) | `info` |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design overview
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — Running from source
- [docs/UNINSTALL.md](docs/UNINSTALL.md) — Removal instructions

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

- **Issues**: [GitHub Issues](https://github.com/financedistrict-platform/fd-agent-wallet-cli/issues)
- **Source**: [GitHub Repository](https://github.com/financedistrict-platform/fd-agent-wallet-cli)

## License

MIT — see [LICENSE](LICENSE) for details.
