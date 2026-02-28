# FDX — Agent Wallet CLI

[![npm version](https://img.shields.io/npm/v/@financedistrict/fdx)](https://www.npmjs.com/package/@financedistrict/fdx)
[![CI](https://github.com/financedistrict-platform/fd-agent-wallet-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/financedistrict-platform/fd-agent-wallet-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A command-line interface to the [Finance District](https://fd.xyz) MCP wallet server. Gives AI agents crypto wallet capabilities — hold, send, swap, and earn yield on assets across multiple chains — without managing private keys.

## Why FDX?

FDX is designed for AI agents and agent frameworks that need wallet tooling but don't natively support the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). Instead of integrating an MCP client, agents invoke `fdx call <method>` from the command line and parse JSON output.

- **No Key Management** — Email OTP authentication. No seed phrases. No private key files.
- **Agent-Native** — Structured JSON input/output designed for tool-calling agents.
- **Multi-Chain** — Ethereum, BSC, Arbitrum, Base, Solana. One wallet, all chains.
- **DeFi Enabled** — Transfer, swap, and earn yield through integrated DeFi protocols.
- **Smart Accounts** — Account abstraction with multi-signature support (ERC-4337).

## Quick Start

```bash
npm install -g @financedistrict/fdx
```

Register a new account:

```bash
fdx register --email you@example.com
```

Enter the 8-digit OTP sent to your email:

```bash
fdx verify --code 12345678
```

Check that authentication succeeded:

```bash
fdx status
```

For subsequent sessions, sign in with:

```bash
fdx login --email you@example.com
fdx verify --code 12345678
```

To remove stored credentials:

```bash
fdx logout
```

## Authentication

FDX uses email one-time passcode (OTP) authentication via Microsoft Entra External ID. No browser is required — the entire flow runs headlessly, making it ideal for autonomous agents, Docker containers, CI pipelines, and remote servers.

### Register (first time)

```bash
fdx register --email you@example.com
# Check your inbox for an 8-digit OTP
fdx verify --code 12345678
```

### Login (returning users)

```bash
fdx login --email you@example.com
# Check your inbox for an 8-digit OTP
fdx verify --code 12345678
```

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

Removes stored tokens from the OS credential store and clears `~/.fdx/auth.json`.

## Usage

Invoke any MCP tool via the CLI:

```bash
# Check wallet overview
fdx call getWalletOverview --chainKey ethereum

# Send tokens
fdx call transferTokens --chainKey ethereum --recipientAddress 0xABC... --amount 0.1

# Discover yield strategies
fdx call discoverYieldStrategies --chainKey base
```

All output is JSON, making it easy for agents to parse:

```bash
fdx call getMyInfo | jq '.email'
```

Run `fdx call` without arguments to see all available methods.

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
| `FDX_MCP_SERVER`     | MCP server URL     | `https://mcp.fd.xyz`                   |
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
