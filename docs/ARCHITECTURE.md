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
│                       (@1stdigital/fdx)                             │
│                                                                     │
│  ┌─────────────────┐                                               │
│  │  CLI Commands   │                                               │
│  │                 │                                               │
│  │  • fdx setup    │                                               │
│  │  • fdx status   │                                               │
│  │  • fdx call     │                                               │
│  │    <method>     │                                               │
│  └─────────────────┘                                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              WalletClient (SDK)                              │  │
│  │  • OAuth 2.1 + DCR + PKCE authentication                    │  │
│  │  • JSON-RPC 2.0 MCP protocol client                         │  │
│  │  • High-level methods for wallet/DeFi operations             │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ HTTPS + OAuth 2.1
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Finance District MCP Server                      │
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
│  • Ethereum (1)                                                     │
│  • BNB Smart Chain (56)                                             │
│  • Arbitrum One (42161)                                             │
│  • Base (8453)                                                      │
│  • Solana (solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp)                │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. npm Package (`@1stdigital/fdx`)

The npm package includes:

- **CLI Tool** (`bin/fdx.js`): Command-line interface for setup, status checks, and method invocation
- **SDK** (`src/wallet-client.js`): High-level JavaScript API with typed methods for each MCP tool
- **OAuth Client** (`src/mcp-auth.js`): RFC 7591 Dynamic Client Registration with PKCE
- **MCP Client** (`src/mcp-client.js`): JSON-RPC 2.0 protocol handler with SSE response format

### 2. Finance District MCP Server

The remote server (hosted at fd.xyz) provides:

- **Authentication**: OAuth 2.1 with Microsoft Entra ID (no local keys)
- **Smart Accounts**: EVM account abstraction via ERC-4337, deterministic Solana addresses
- **Multi-Chain Support**: Single interface for ETH, BSC, ARB, BASE, SOL
- **DeFi Integration**: Swap tokens via DEX aggregators, earn yield via Aave/Compound/Yearn
- **Payment Protocol**: X-402 payment authorization for premium API access

## Data Flow

### Example: Agent Checks Wallet Balance

1. **User asks agent**: _"What's my ETH balance?"_
2. **Agent invokes CLI**: `fdx call getWalletOverview --chainKey ethereum`
3. **CLI loads SDK**: `bin/commands/call.js` → `src/wallet-client.js` → `getWalletOverview()`
4. **SDK authenticates**: Reads OAuth tokens from `~/.fdx/auth.json`
5. **SDK calls MCP**: HTTPS request to `mcp.fd.xyz` with JSON-RPC 2.0 payload
6. **Server queries chain**: Fetches balances from Ethereum RPC nodes
7. **Response flows back**: JSON → SDK → CLI → stdout → Agent reads JSON
8. **Agent formats answer**: _"You have 0.42 ETH in your Ethereum wallet (0xABC...)"_

## Authentication Flow

### First-Time Setup (`fdx setup`)

1. **Generate PKCE challenge**: `S256(random_verifier)` → code_challenge
2. **Register OAuth client**: POST to `/oauth/register` (RFC 7591 DCR)
3. **Open browser**: User grants consent via Microsoft Entra ID
4. **Exchange code**: Authorization code + verifier → access_token + refresh_token
5. **Store tokens**: Save to `~/.fdx/auth.json`

### Subsequent Requests

1. **Load tokens**: Read from `~/.fdx/auth.json`
2. **Check expiry**: If `access_token` expired, use `refresh_token` to get new token
3. **Attach header**: `Authorization: Bearer <access_token>`
4. **Make request**: HTTPS + JSON-RPC to MCP server

No private keys, no seed phrases. All wallet operations are server-side with user consent via OAuth.

## Security Model

- **No Local Keys**: Agent never touches private keys. Wallets are managed server-side.
- **OAuth 2.1**: Industry-standard authentication with PKCE protection.
- **Consent-Based**: User authorizes agent via web browser on first setup.
- **Token Refresh**: Long-lived refresh tokens minimize re-authentication.
- **Smart Accounts**: ERC-4337 account abstraction allows multi-signature, recovery, upgradability.
- **Audit Trail**: All transactions are recorded on-chain with transparent history.

## Multi-Chain Support

FDX abstracts chain differences behind a single API:

| Chain    | Chain ID | Network Key | Address Format |
| -------- | -------- | ----------- | -------------- |
| Ethereum | 1        | ethereum    | 0x...          |
| BSC      | 56       | bsc         | 0x...          |
| Arbitrum | 42161    | arbitrum    | 0x...          |
| Base     | 8453     | base        | 0x...          |
| Solana   | (CAIP-2) | solana      | base58         |

## DeFi Integration

The MCP server integrates with DeFi protocols:

- **DEX Aggregation**: 1inch, 0x, Jupiter (Solana) for best swap routes
- **Yield Strategies**: Aave (lending), Compound (lending), Yearn (vaults)
- **Smart Routing**: Policy-driven swap execution (BestExecution, LowGas, MevProtected)

Agents can discover strategies, deposit tokens, and withdraw yield — all through `fdx call`.

## Development & Testing

See [DEVELOPMENT.md](DEVELOPMENT.md) for running from source.

## License

MIT
