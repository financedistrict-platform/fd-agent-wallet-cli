# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- CLI commands: `fdx setup`, `fdx status`, `fdx call <method>`
- OAuth 2.1 authentication with PKCE and Dynamic Client Registration (RFC 7591)
- WalletClient SDK with methods for wallet, transfer, swap, and yield operations
- Multi-chain support: Ethereum, BSC, Arbitrum, Base, Solana
- JSON output for agent-friendly parsing
- Token auto-refresh on expiry
