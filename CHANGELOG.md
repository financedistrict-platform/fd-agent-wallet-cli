# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-17

### Added

- CLI commands: `fdx setup`, `fdx status`, `fdx call <method>`
- OAuth 2.1 authentication with PKCE and Dynamic Client Registration (RFC 7591)
- WalletClient SDK with methods for wallet, transfer, swap, and yield operations
- Multi-chain support: Ethereum, BSC, Arbitrum, Base, Solana
- JSON output for agent-friendly parsing
- Token auto-refresh on expiry
