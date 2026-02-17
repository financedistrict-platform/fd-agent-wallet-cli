# FDX — Agent Wallet CLI

[![npm version](https://img.shields.io/npm/v/@1stdigital/fdx)](https://www.npmjs.com/package/@1stdigital/fdx)
[![CI](https://github.com/1stdigital/fd-agent-wallet-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/1stdigital/fd-agent-wallet-cli/actions/workflows/ci.yml)
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
npm install -g @1stdigital/fdx
```

Run the setup (opens browser for OAuth):

```bash
fdx setup
```

Check that authentication succeeded:

```bash
fdx status
```

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
const { createClientFromEnv } = require('@1stdigital/fdx');

const client = createClientFromEnv();
const result = await client.getWalletOverview({ chainKey: 'ethereum' });
console.log(result.data);
```

## Configuration

| Environment Variable | Description        | Default                                |
| -------------------- | ------------------ | -------------------------------------- |
| `FDX_MCP_SERVER`     | MCP server URL     | `https://mcp.fd.xyz`                   |
| `FDX_REDIRECT_URI`   | OAuth callback URI | `http://localhost:6274/oauth/callback` |
| `FDX_STORE_PATH`     | Token store path   | `~/.fdx/auth.json`                     |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design overview
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — Running from source
- [docs/UNINSTALL.md](docs/UNINSTALL.md) — Removal instructions

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

- **Issues**: [GitHub Issues](https://github.com/1stdigital/fd-agent-wallet-cli/issues)
- **Source**: [GitHub Repository](https://github.com/1stdigital/fd-agent-wallet-cli)

## License

MIT — see [LICENSE](LICENSE) for details.
