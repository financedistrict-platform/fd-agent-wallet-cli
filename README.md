# FDX — Agent Wallet CLI

[![npm version](https://img.shields.io/npm/v/@financedistrict/fdx)](https://www.npmjs.com/package/@financedistrict/fdx)
[![CI](https://github.com/financedistrict-platform/fd-agent-wallet-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/financedistrict-platform/fd-agent-wallet-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A command-line interface to the [Finance District](https://fd.xyz) MCP wallet server. Gives AI agents crypto wallet capabilities — hold, send, swap, and earn yield on assets across multiple chains — without managing private keys.

## Why FDX?

FDX is designed for AI agents and agent frameworks that need wallet and platform tooling but don't natively support the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). Instead of integrating an MCP client, agents invoke `fdx wallet call <method>` or `fdx prism call <method>` from the command line and parse JSON output.

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

Invoke any MCP tool via the CLI using service subcommands:

### Wallet Tools

```bash
fdx wallet call                                    # list all available wallet tools
fdx wallet call getMyInfo                          # account info
fdx wallet call getWalletOverview --chainKey ethereum  # balances
fdx wallet call getTokenPrice --token ETH          # price check
fdx wallet call transferTokens --toAddress 0xABC... --amount 10 --asset USDC --chainKey ethereum
fdx wallet call discoverYieldStrategies --chainKey base
fdx wallet call getTokenPrice --help               # show params for a tool
# ... 15+ tools available — run fdx wallet call to see the full list
```

### Prism Platform Tools

Prism tools are discovered dynamically from the server at runtime — new server-side tools appear automatically without CLI updates.

```bash
fdx prism call                                     # discover all prism tools (fetched live from server)
fdx prism call listPayments                        # invoke a tool
fdx prism call listPayments --help                 # show params from server inputSchema
# ... tools are auto-discovered — run fdx prism call to see what's available
```

### JSON Output

All output is JSON, making it easy for agents to parse:

```bash
fdx wallet call getMyInfo | jq '.email'
fdx prism call listPayments | jq '.[0].status'
```

## SDK Usage

FDX can also be used as a Node.js library:

```js
const { createClientFromEnv } = require('@financedistrict/fdx');

// Wallet — typed convenience methods
const wallet = createClientFromEnv('wallet');
const balance = await wallet.getWalletOverview({ chainKey: 'ethereum' });
console.log(balance.data);
await wallet.close();

// Prism — dynamic tool calls via MCPClient
const prism = createClientFromEnv('prism');
await prism.mcpClient.connect();
const tools = await prism.mcpClient.listTools();          // discover tools
const result = await prism.mcpClient.callTool('listPayments', {});
console.log(result.data);
await prism.close();
```

## Configuration

| Environment Variable | Scope | Default |
| -------------------- | ----- | ------- |
| `FDX_WALLET_MCP_URL` | Wallet MCP server URL | `https://mcp.fd.xyz` |
| `FDX_PRISM_MCP_URL` | Prism MCP server URL | `https://prism-mcp.fd.xyz` |
| `FDX_MCP_SERVER` | Global fallback (all services) | — |
| `FDX_STORE_PATH` | Token store path | `~/.fdx/auth.json` |
| `FDX_LOG_PATH` | Log file path | `~/.fdx/fdx.log` |
| `FDX_LOG_LEVEL` | Log verbosity (`debug`\|`info`\|`warn`\|`error`\|`off`) | `info` |

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for per-environment setup (staging, local dev, `.env` files).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design overview
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) — Environment variables and per-server URL setup
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — Running from source
- [docs/UNINSTALL.md](docs/UNINSTALL.md) — Removal instructions

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

- **Issues**: [GitHub Issues](https://github.com/financedistrict-platform/fd-agent-wallet-cli/issues)
- **Source**: [GitHub Repository](https://github.com/financedistrict-platform/fd-agent-wallet-cli)

## License

MIT — see [LICENSE](LICENSE) for details.
