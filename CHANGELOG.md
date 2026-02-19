# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
