# Architecture

FDX is a three-layer system that gives AI agents secure access to blockchain wallets without managing private keys.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AI Agent                                   │
│  (Asks: "What's my wallet balance?")                                │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ invokes
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       FDX npm Package                               │
│                   (@financedistrict/fdx)                   │
│                                                                     │
│  ┌─────────────────────────────────────┐                           │
│  │  CLI Commands                       │                           │
│  │                                     │                           │
│  │  • fdx register, login, verify      │                           │
│  │  • fdx status                       │                           │
│  │  • fdx wallet <method>            │                           │
│  │  • fdx prism <method>             │                           │
│  └─────────────────────────────────────┘                           │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              FdxClient (SDK)                                 │  │
│  │  • Email OTP authentication via Entra Native Auth               │  │
│  │  • JSON-RPC 2.0 MCP protocol client                         │  │
│  │  • High-level methods for wallet/DeFi operations             │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ HTTPS + Bearer token
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Finance District MCP Service                     │
│                      (https://mcp.fd.xyz)                           │
│                                                                     │
│  • User authentication via OAuth 2.1                                │
│  • Smart Account management (EVM + Solana)                          │
│  • Multi-chain token transfers                                      │
│  • DEX aggregation for swaps                                        │
│  • DeFi yield strategy integration (Aave, Compound, Yearn)          │
│  • X-402 payment protocol support                                   │
│                                                                     │
│  Supported Chains:                                                  │
│  • Bitcoin                                                          │
│  • Ethereum (1)                                                     │
│  • BNB Smart Chain (56)                                             │
│  • Arbitrum One (42161)                                             │
│  • Base (8453)                                                      │
│  • Solana (solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp)                │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. npm Package (`@financedistrict/fdx`)

The npm package includes:

- **CLI Tool** (`bin/fdx.js`): Command-line interface for setup, status checks, and method invocation
- **SDK** (`src/fdx-client.js`): High-level JavaScript API with typed methods for each MCP tool
- **OAuth Client** (`src/mcp-auth.js`): Entra External ID Native Authentication — headless email OTP sign-up and sign-in
- **MCP Client** (`src/mcp-client.js`): JSON-RPC 2.0 protocol handler with SSE response format

### 2. Finance District MCP Service

The remote service (hosted at fd.xyz) provides:

- **Authentication**: OAuth 2.1 with Microsoft Entra ID (no local keys)
- **Smart Accounts**: EVM account abstraction via ERC-4337, deterministic Solana addresses
- **Multi-Chain Support**: Single interface for BTC, ETH, BSC, ARB, BASE, SOL
- **DeFi Integration**: Swap tokens via DEX aggregators, earn yield via Aave/Compound/Yearn
- **Payment Protocol**: X-402 payment authorization for premium API access

## Data Flow

### Example: Agent Checks Wallet Balance

1. **User asks agent**: _"What's my ETH balance?"_
2. **Agent invokes CLI**: `fdx wallet getWalletOverview --chainKey ethereum`
3. **CLI loads SDK**: `bin/commands/wallet-call.js` → `src/fdx-client.js` → `getWalletOverview()`
4. **SDK authenticates**: Reads OAuth tokens from `~/.fdx/auth.json`
5. **SDK calls MCP**: HTTPS request to `mcp.fd.xyz` with JSON-RPC 2.0 payload
6. **Server queries chain**: Fetches balances from Ethereum RPC nodes
7. **Response flows back**: JSON → SDK → CLI → stdout → Agent reads JSON
8. **Agent formats answer**: _"You have 0.42 ETH in your Ethereum wallet (0xABC...)"_

### Example: Agent Lists Prism Payments

1. **User asks agent**: _"Show me recent payments"_
2. **Agent invokes CLI**: `fdx prism listPayments`
3. **CLI loads handler**: `bin/commands/prism-call.js` → `createClientFromEnv('prism')`
4. **SDK authenticates**: Same Entra OAuth tokens (shared auth)
5. **SDK calls MCP**: HTTPS request to `prism-mcp.fd.xyz` via `mcpClient.callTool()`
6. **Server returns data**: JSON result with payment records
7. **Agent parses output**: Formats payments for user

### Example: Dynamic Tool Discovery

```bash
fdx prism                     # → mcpClient.listTools() → displays all tools
fdx prism <tool> --help       # → mcpClient.listTools() → renders inputSchema as help
```

Unlike wallet tools (hardcoded `METHOD_INFO` with 15+ tools), prism tools are fetched from the service at runtime. New tools appear automatically without CLI updates — run `fdx prism` to discover what's available.

## Authentication Flow

### First-Time Registration (`fdx register`)

1. **Start sign-up**: POST email to Entra `/signup/v1.0/start`
2. **Request OTP challenge**: POST to `/signup/v1.0/challenge` with `challenge_type=oob`
3. **User enters OTP**: 8-digit code delivered via email
4. **Submit OTP**: POST to `/signup/v1.0/continue` with the OTP
5. **Exchange for tokens**: POST to `/oauth2/v2.0/token` with grant_continuation_token
6. **Store tokens**: Save to OS credential store (fallback: `~/.fdx/auth.json`)

### Sign-In (`fdx login`)

1. **Start sign-in**: POST email to Entra `/oauth2/v2.0/initiate`
2. **Request OTP challenge**: POST to `/oauth2/v2.0/challenge` with `challenge_type=oob`
3. **User enters OTP via `fdx verify`**: 8-digit code from email
4. **Exchange for tokens**: POST to `/oauth2/v2.0/token` with OTP + continuation_token
5. **Store tokens**: Save to OS credential store

### Subsequent Requests

1. **Load tokens**: Read from `~/.fdx/auth.json`
2. **Check expiry**: If `access_token` expired, use `refresh_token` to get new token
3. **Attach header**: `Authorization: Bearer <access_token>`
4. **Make request**: HTTPS + JSON-RPC to MCP service

No private keys, no seed phrases. All wallet operations are server-side with user consent via OAuth.

## Security Model

- **No Local Keys**: Agent never touches private keys. Wallets are managed by the service.
- **Email OTP**: Passwordless authentication via Entra External ID Native Auth.
- **Headless Flow**: No browser required — works in containers, CI/CD, remote servers.
- **Token Refresh**: Long-lived refresh tokens minimize re-authentication.
- **OS Credential Store**: Tokens stored in macOS Keychain, Linux libsecret, or Windows DPAPI.
- **Smart Accounts**: ERC-4337 account abstraction allows multi-signature, recovery, upgradability.
- **Audit Trail**: All transactions are recorded on-chain with transparent history.

## Multi-Chain Support

FDX abstracts chain differences behind a single API:

| Chain    | Chain ID | Network Key | Address Format       |
|----------|----------|-------------|----------------------|
| Bitcoin  | —        | bitcoin     | bc1... / 1... / 3... |
| Ethereum | 1        | ethereum    | 0x...                |
| BSC      | 56       | bsc         | 0x...                |
| Arbitrum | 42161    | arbitrum    | 0x...                |
| Base     | 8453     | base        | 0x...                |
| Solana   | (CAIP-2) | solana      | base58               |

## DeFi Integration

The MCP service integrates with DeFi protocols:

- **DEX Aggregation**: 1inch, 0x, Jupiter (Solana) for best swap routes
- **Yield Strategies**: Aave (lending), Compound (lending), Yearn (vaults)
- **Smart Routing**: Policy-driven swap execution (BestExecution, LowGas, MevProtected)

Agents can discover strategies, deposit tokens, and withdraw yield — run `fdx wallet` to see all available tools, or `fdx wallet <tool> --help` for parameter details.

## Development & Testing

See [DEVELOPMENT.md](DEVELOPMENT.md) for running from source.

## License

MIT
