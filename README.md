# AutoEcon

[![npm version](https://img.shields.io/npm/v/@autoecon/openclaw-wallet)](https://www.npmjs.com/package/@autoecon/openclaw-wallet)
[![CI](https://github.com/ermirbeqiraj/openclaw-wallet/actions/workflows/ci.yml/badge.svg)](https://github.com/ermirbeqiraj/openclaw-wallet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Economic autonomy for your agent — no keys required.**

AutoEcon gives your OpenClaw AI agent a crypto wallet without the complexity of managing private keys, seed phrases, or network configurations. Your agent can hold, send, swap, and earn yield on crypto assets across multiple chains — all secured by OAuth 2.1, not by you managing secrets.

## Why AutoEcon?

- **No Key Management** — OAuth-secured wallet. No seed phrases. No private key files.
- **Agent-Native** — Built for AI agents. Natural language commands via OpenClaw skills.
- **Multi-Chain** — Ethereum, BSC, Arbitrum, Base, Solana. One wallet, all chains.
- **DeFi Enabled** — Transfer, swap, and earn yield through integrated DeFi protocols.
- **Smart Account Architecture** — Account abstraction with multi-signature support.

## Quick Start

Install globally via npm:

```bash
npm install -g @autoecon/openclaw-wallet
```

Run the setup (opens browser for OAuth):

```bash
autoecon setup
```

Restart your OpenClaw gateway:

```bash
openclaw gateway restart
```

Done. Your agent now has a wallet.

## Usage

Ask your OpenClaw agent:

- _"What's my wallet address?"_
- _"Show me my Ethereum balance"_
- _"Send 0.1 ETH to 0xABC..."_
- _"What DeFi yield strategies are available on Base?"_

The agent will use the `autoecon` CLI under the hood. All available commands and parameters are documented in the [skill reference](skill/autoecon/SKILL.md).

## Documentation

- **[skill/autoecon/SKILL.md](skill/autoecon/SKILL.md)** — Complete command reference for agents
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System design overview
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** — Running from source
- **[docs/UNINSTALL.md](docs/UNINSTALL.md)** — Removal instructions

## Support

Found a bug or have a question?

- **Issues**: [GitHub Issues](https://github.com/ermirbeqiraj/openclaw-wallet/issues)
- **Source**: [GitHub Repository](https://github.com/ermirbeqiraj/openclaw-wallet)

## License

MIT
