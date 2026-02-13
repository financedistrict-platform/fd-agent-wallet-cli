# Architecture

AutoEcon is a three-layer system that gives OpenClaw AI agents secure access to blockchain wallets without managing private keys.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OpenClaw Agent                              │
│  (Asks: "What's my wallet balance?")                                │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ invokes
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AutoEcon npm Package                            │
│                  (@autoecon/openclaw-wallet)                        │
│                                                                     │
│  ┌─────────────────┐        ┌──────────────────────────────┐      │
│  │  CLI Commands   │        │   OpenClaw Skill             │      │
│  │                 │        │   (skill/autoecon/SKILL.md)  │      │
│  │  • autoecon     │        │                              │      │
│  │    setup        │        │  Teaches agents how to use   │      │
│  │  • autoecon     │        │  the `autoecon` CLI          │      │
│  │    call <cmd>   │        │                              │      │
│  └─────────────────┘        └──────────────────────────────┘      │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              AutoEconClient (SDK)                            │ │
│  │  • OAuth 2.1 + DCR + PKCE authentication                     │ │
│  │  • JSON-RPC 2.0 MCP protocol client                          │ │
│  │  • 17 high-level methods for wallet/DeFi operations          │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 │ HTTPS + OAuth 2.1
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     MCP Smart Pay Server                            │
│              (https://mcp.test.1stdigital.tech)                     │
│                                                                     │
│  • User authentication                     │
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

### 1. npm Package (`@autoecon/openclaw-wallet`)

The npm package includes:

- **CLI Tool** (`bin/autoecon.js`): Command-line interface for setup, status checks, and method invocation
- **SDK** (`src/autoecon-client.js`): High-level JavaScript API with 17 methods
- **OpenClaw Skill** (`skill/autoecon/SKILL.md`): Agent instructions that teach OpenClaw how to use the CLI
- **OAuth Client** (`src/mcp-auth.js`): RFC 7591 Dynamic Client Registration with PKCE
- **MCP Client** (`src/mcp-client.js`): JSON-RPC 2.0 protocol handler with SSE response format

### 2. OpenClaw Skill

The skill file (`skill/autoecon/SKILL.md`) is automatically installed to `~/.openclaw/skills/autoecon/` during setup. It provides:

- Complete command reference with parameter tables
- Chain ID mapping (e.g., "ethereum" → 1, "base" → 8453)
- Token address lookups for common tokens
- Error handling guidance
- Usage examples

When an agent needs wallet functionality, OpenClaw loads this skill and the agent learns how to invoke `autoecon call <method>` commands.

### 3. MCP Smart Pay Server

The remote server (hosted at 1stdigital.tech) provides:

- **Authentication**: OAuth 2.1 with Microsoft Entra ID (no local keys)
- **Smart Accounts**: EVM account abstraction via ERC-4337, deterministic Solana addresses
- **Multi-Chain Support**: Single interface for ETH, BSC, ARB, BASE, SOL
- **DeFi Integration**: Swap tokens via DEX aggregators, earn yield via Aave/Compound/Yearn
- **Payment Protocol**: X-402 payment authorization for premium API access

## Data Flow

### Example: Agent Checks Wallet Balance

1. **User asks agent**: _"What's my ETH balance?"_
2. **Agent reads skill**: OpenClaw loads `skill/autoecon/SKILL.md`, learns the `getWalletOverview` command
3. **Agent invokes CLI**: `autoecon call getWalletOverview --chainKey ethereum`
4. **CLI loads SDK**: `bin/commands/call.js` → `src/autoecon-client.js` → `getWalletOverview()`
5. **SDK authenticates**: Reads OAuth tokens from `~/.autoecon/tokens.json`
6. **SDK calls MCP**: HTTPS request to `mcp.test.1stdigital.tech` with JSON-RPC 2.0 payload
7. **Server queries chain**: Fetches balances from Ethereum RPC nodes
8. **Response flows back**: JSON → SDK → CLI → stdout → Agent reads JSON
9. **Agent formats answer**: _"You have 0.42 ETH in your Ethereum wallet (0xABC...)"_

## Authentication Flow

### First-Time Setup (`autoecon setup`)

1. **Generate PKCE challenge**: `S256(random_verifier)` → code_challenge
2. **Register OAuth client**: POST to `/oauth/register` (RFC 7591 DCR)
3. **Open browser**: User grants consent via Microsoft Entra ID
4. **Exchange code**: Authorization code + verifier → access_token + refresh_token
5. **Store tokens**: Save to `~/.autoecon/tokens.json`
6. **Copy skill**: `skill/autoecon/SKILL.md` → `~/.openclaw/skills/autoecon/`
7. **Configure OpenClaw**: Run `openclaw config set mcp.autoecon.type "skill"`

### Subsequent Requests

1. **Load tokens**: Read from `~/.autoecon/tokens.json`
2. **Check expiry**: If `access_token` expired, use `refresh_token` to get new token
3. **Attach header**: `Authorization: Bearer <access_token>`
4. **Make request**: HTTPS + JSON-RPC to MCP server

No private keys, no seed phrases. All wallet operations are server-side with user consent via OAuth.

## Security Model

- **No Local Keys**: Agent never touches private keys. Wallets are managed server-side.
- **OAuth 2.1**: Industry-standard authentication with PKCE protection.
- **Consent-Based**: User authorizes agent via web browser on first setup.
- **Token Refresh**: Long-lived refresh tokens (30 days) minimize re-authentication.
- **Smart Accounts**: ERC-4337 account abstraction allows multi-signature, recovery, upgradability.
- **Audit Trail**: All transactions are recorded on-chain with transparent history.

## Multi-Chain Support

AutoEcon abstracts chain differences behind a single API:

| Chain    | Chain ID | Network Key | Address Format |
| -------- | -------- | ----------- | -------------- |
| Ethereum | 1        | ethereum    | 0x...          |
| BSC      | 56       | bsc         | 0x...          |
| Arbitrum | 42161    | arbitrum    | 0x...          |
| Base     | 8453     | base        | 0x...          |
| Solana   | (CAIP-2) | solana      | base58         |

Agents can use natural language ("Send ETH on Base") and the skill maps to the correct chain ID.

## DeFi Integration

The MCP server integrates with DeFi protocols:

- **DEX Aggregation**: 1inch, 0x, Jupiter (Solana) for best swap routes
- **Yield Strategies**: Aave (lending), Compound (lending), Yearn (vaults)
- **Smart Routing**: Policy-driven swap execution (BestExecution, LowGas, MevProtected)

Agents can discover strategies, deposit tokens, and withdraw yield — all through the same `autoecon call` interface.

## Development & Testing

See [DEVELOPMENT.md](DEVELOPMENT.md) for:

- Running from source (`npm link`)
- Environment variables (`AUTOECON_*`)
- Server deployment steps
- Testing with `node .external/test-sdk.js`

## License

MIT