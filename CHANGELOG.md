# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-16

### Added

- `fdx wallet call <method>` — Wallet MCP tools (transfers, swaps, yield, X402 payments)
- `fdx prism call <method>` — Prism Platform tools with dynamic server discovery
- `fdx services` — list available services and their URLs
- Multi-service routing — CLI routes tool calls to Wallet or Prism based on subcommand
- `FDX_WALLET_MCP_URL` / `FDX_PRISM_MCP_URL` env vars for per-service URL overrides

### Changed

- **BREAKING**: `WalletClient` renamed to `FdxClient` in SDK exports — no backward-compat alias
- Updated all documentation examples to use new `fdx wallet call` and `fdx prism call` syntax

### Deprecated

- `fdx call <method>` — use `fdx wallet call <method>` or `fdx prism call <method>` instead (exits with error)
- `FDX_MCP_SERVER` env var — use per-service env vars (`FDX_WALLET_MCP_URL`, `FDX_PRISM_MCP_URL`)

### Fixed

- Tool routing ambiguity resolved by requiring explicit service selection

### Migration

**CLI commands:**

```bash
# Before (v0.3.x)
fdx call getMyInfo
fdx call getTokenPrice --token ETH

# After (v0.4.0)
fdx wallet call getMyInfo
fdx wallet call getTokenPrice --token ETH
fdx prism call listPayments          # new: Prism tools
fdx services                         # list available services
```

**SDK imports:**

```js
// Before (v0.3.x)
const { WalletClient } = require('@financedistrict/fdx');

// After (v0.4.0)
const { FdxClient } = require('@financedistrict/fdx');
```

**Environment variables:**

```bash
# Before (v0.3.x)
export FDX_MCP_SERVER=https://custom-server.example.com

# After (v0.4.0)
export FDX_WALLET_MCP_URL=https://custom-wallet.example.com
export FDX_PRISM_MCP_URL=https://custom-prism.example.com
```

**AI agent operators:** Update tool invocation configs from `fdx call <method>` to `fdx wallet call <method>`. Prism tools now available via `fdx prism call`.

## [0.3.1] - 2026-02-28

### Fixed

- Spinner and checkmark characters render as garbled text on Windows PowerShell — now uses ASCII frames (`| / - \`) and marks (`+`, `x`) on Windows

## [0.3.0] - 2026-02-28

### Added

- **Email OTP authentication** — fully headless sign-in and registration via email one-time passcode; no browser required
- `fdx register --email <email>` — start a new account registration with email OTP
- `fdx login --email <email>` — sign in to an existing account with email OTP
- `fdx verify --code <OTP>` — complete registration or login by submitting the 8-digit code from email
- Pending verification state stored in OS credential store — continuation tokens survive between CLI invocations
- Automatic token refresh — expired access tokens are refreshed transparently using the stored refresh token
- ASCII spinner for Windows — spinner frames and checkmarks render cleanly in PowerShell (no garbled Unicode)

### Changed

- **BREAKING**: Replaced Device Authorization Grant (RFC 8628) with Entra Native Authentication email OTP as the sole authentication method
- **BREAKING**: Removed `fdx setup` and `fdx signup` commands — replaced by `fdx register`, `fdx login`, `fdx verify`
- **BREAKING**: Auth configuration (authority, client ID, scopes) is now baked in at build time — `FDX_ENTRA_AUTHORITY`, `FDX_ENTRA_CLIENT_ID`, `FDX_ENTRA_SCOPES`, `FDX_TENANT_SUBDOMAIN` environment variables no longer have any effect
- **BREAKING**: Removed `MCPAuthClient` methods: `discoverEndpoints()`, `startDeviceAuthorization()`, `pollDeviceToken()`, `getAuthorizationUrl()`, `exchangeCodeForToken()`
- **BREAKING**: `WalletClient` constructor now requires `authConfig` object (`{ authority, clientId, scopes }`) instead of OAuth discovery parameters

### Removed

- Device Authorization Grant flow and all OAuth 2.0 discovery logic (RFC 8414, protected resource metadata)
- `fdx setup` command (previously aliased to `fdx login`)
- `fdx signup` command (browser-based registration redirect)
- `skills/` git submodule — skills now live in a separate repository

## [0.2.2] - 2026-02-24

### Added

- "Did you mean?" fuzzy matching for mistyped method names (handles typos, wrong case, partial names)
- Categorized method list — `fdx call` groups tools under Wallet, Transfer, Swap, Yield, Payment, Account, Support
- Automatic type coercion — `--amount 10` is sent as a number, `--limit 5` as an integer (per schema type)
- Realistic example values in `--help` output (e.g. `--asset USDC --chainKey ethereum`)

### Fixed

- `fdx call` (no method) now shows the methods list instead of Commander's generic "missing required argument" error
- Silenced noisy dotenv banner (`[dotenv@17.x] injecting env...`) on every command

## [0.2.1] - 2026-02-24

### Changed

- Patch release — no functional changes; includes skills submodule update and minor formatting fixes

## [0.2.0] - 2026-02-24

### Added

- `getTokenPrice` tool — look up current USD price and 24h change for any token
- `resolveNameService` tool — resolve ENS (.eth), SNS (.sol), Unstoppable Domain names to addresses and vice versa
- `skills/` git submodule pointing to `1stdigital/fd-agent-wallet-skills`
- `docs/mcp-tools-schema.json` — reference copy of the MCP server tool schema

### Changed

- **BREAKING**: `transferTokens` params renamed: `recipientAddress` → `toAddress`, `tokenAddress` → `asset`, `amount` is now `number` type; removed `memo`, `maxPriorityFeePerGas`, `maxFeePerGas`; added `autoApprove`
- **BREAKING**: `depositForYield` params renamed: `tokenAddress` → `token`; `fromAccountAddress` is now required
- **BREAKING**: `withdrawFromYield` completely reworked: `positionId` → `vaultTokenAddress`, `amount` → `withdrawAmount`; added required `underlyingToken`, `fromAccountAddress`; removed `recipient`
- **BREAKING**: `authorizePayment` completely reworked: replaced `url` and preference params with `paymentRequirementsResponseJson` and `autoApprove`
- **BREAKING**: `getAccountActivity` params: `accountAddress` and `chainKey` now required; `limit`/`offset` replaced by `maxTransactions`
- **BREAKING**: `discoverYieldStrategies` params renamed: `tokenAddress` → `token`; removed `minApy`, `maxRisk`; added `protocolSlug`, `sortDirection`, `limit`
- `reportIssue` params: removed `severity`, `category`; added `labels`
- `swapTokens` `amount` is now `number` type; added enum constraints for `objective` and `mode`

### Removed

- `deploySmartAccount` tool — no longer available on MCP server
- `manageSmartAccountOwnership` tool — no longer available on MCP server

## [0.1.4] - 2026-02-24

### Added

- `fdx call <method> --help` — shows required/optional parameters, types, descriptions, and usage example for each tool
- `fdx call` (no method) now displays method descriptions and a hint to use `--help`
- Unrecognized parameter warnings — CLI warns when you pass unknown flags (e.g. `--toAddress` instead of `--recipientAddress`)
- Error context on failure — shows provided vs required parameters and a `--help` hint

### Fixed

- `MCPClient.callTool` now strips `undefined`/`null` values from arguments before sending to the MCP server, preventing silent failures from unset optional params
- Improved error text extraction from MCP tool responses — concatenates all text content items instead of only the first

## [0.1.3] - 2026-02-23

### Added

- Proactive token refresh — `MCPClient` now detects when the access token has changed (e.g. after a background refresh) and reconnects automatically before making a call
- `SESSION_EXPIRED` error code — when the refresh token is also expired (`invalid_grant` / `interaction_required`), the CLI returns a clear `SESSION_EXPIRED` error instead of a cryptic 400
- `fdx login` command (replaces `fdx setup` as the primary auth command)
- `fdx signup` command — directs users to `https://fd.xyz/signup`

### Changed

- `fdx setup` is now a hidden backward-compatible alias for `fdx login`
- All user-facing messages updated from "fdx setup" to "fdx login"
- README rewritten — positioned as official Finance District Agent Wallet CLI, added Why FDX section, Quick Start with signup flow, Agent Wallet Skills integration

### Fixed

- Auth token not renewed after days of inactivity — tokens baked into the transport at connect time were never replaced, even after a successful background refresh
- Verification URL in README corrected to `https://auth.fd.xyz/device`

## [0.1.2] - 2026-02-19

### Changed

- **BREAKING**: Replaced authorization code + PKCE flow with Device Authorization Grant (RFC 8628) as the sole authentication method
- **BREAKING**: `fdx setup` no longer opens a browser — always uses device code flow
- **BREAKING**: Removed `--device` flag from `fdx setup`
- **BREAKING**: Removed `FDX_REDIRECT_URI` environment variable
- **BREAKING**: Removed `redirectUri` parameter from `WalletClient` and `MCPAuthClient` constructors
- **BREAKING**: Removed `getAuthorizationUrl()`, `exchangeCodeForToken()`, `initializeForDevice()` methods
- Unified `clientId` and `deviceClientId` into a single `clientId` (legacy `deviceClientId` still read for backward compatibility)
- Upgraded `dotenv` 16.x → 17.x

### Added

- HTTPS validation for all discovered OAuth endpoints
- Device code expiry deadline enforcement in `pollDeviceToken()` to prevent infinite polling
- Guard against missing `authorization_servers` in protected resource metadata
- Stale OAuth metadata cache re-discovery when `device_authorization_endpoint` is missing
- RFC 8414 + OIDC metadata merge for `device_authorization_endpoint` fallback

### Fixed

- Credential store read failure on Linux: when the OS keyring session expires between CLI invocations, `#getTokens()` now throws a clear error instead of silently returning empty tokens, which previously caused a misleading `AUTH_REFRESH_FAILED: No refresh token available` cascade
- `isAuthError()` no longer matches local token absence as a retryable server 401
- `getTokenState()` handles credential store unavailability gracefully
- Null `clientId` during token refresh no longer sends literal string `'null'`

### Removed

- `src/utils/pkce.js` and `test/utils/pkce.test.js`
- Authorization code flow, local HTTP callback server, PKCE challenge generation
- `escapeHtml()` and `waitForCallback()` helpers

## [0.1.0] - 2026-02-17

### Added

- CLI commands: `fdx register`, `fdx login`, `fdx verify`, `fdx status`, `fdx call <method>`, `fdx logout`
- Email OTP authentication via Entra External ID Native Authentication
- WalletClient SDK with methods for wallet, transfer, swap, and yield operations
- Multi-chain support: Ethereum, BSC, Arbitrum, Base, Solana
- JSON output for agent-friendly parsing
- Token auto-refresh on expiry
- OS credential store integration (macOS Keychain, Linux libsecret, Windows DPAPI)
