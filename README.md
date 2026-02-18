# FDX — Agent Wallet CLI

[![npm version](https://img.shields.io/npm/v/@financedistrict/fdx)](https://www.npmjs.com/package/@financedistrict/fdx)
[![CI](https://github.com/financedistrict-platform/fd-agent-wallet-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/financedistrict-platform/fd-agent-wallet-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A command-line interface to the [Finance District](https://fd.xyz) MCP wallet server. Gives AI agents crypto wallet capabilities — hold, send, swap, and earn yield on assets across multiple chains — without managing private keys.

## Why FDX?

FDX is designed for AI agents and agent frameworks that need wallet tooling but don't natively support the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). Instead of integrating an MCP client, agents invoke `fdx call <method>` from the command line and parse JSON output.

- **No Key Management** — OAuth 2.1 secured. No seed phrases. No private key files.
- **Agent-Native** — Structured JSON input/output designed for tool-calling agents.
- **Multi-Chain** — Ethereum, BSC, Arbitrum, Base, Solana. One wallet, all chains.
- **DeFi Enabled** — Transfer, swap, and earn yield through integrated DeFi protocols.
- **Smart Accounts** — Account abstraction with multi-signature support (ERC-4337).

## Quick Start

```bash
npm install -g @financedistrict/fdx
```

Run the setup:

```bash
fdx setup
```

Check that authentication succeeded:

```bash
fdx status
```

To remove stored credentials:

```bash
fdx logout
```

## Authentication

FDX uses OAuth 2.1 with the Device Authorization Grant (RFC 8628). Authentication is always tied to a user identity — the agent acts as a delegate on the user's behalf.

### Setup

```bash
fdx setup
```

The CLI retrieves a short one-time code and prints it alongside the verification URL:

```
──────────────────────────────────────────────────────────
  Verification URL: https://microsoft.com/devicelogin
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

Removes the stored access and refresh tokens from the OS credential store and clears them from `~/.fdx/auth.json`. Client registrations (DCR) are preserved so the next `fdx setup` skips re-registration and goes straight to authentication.

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
