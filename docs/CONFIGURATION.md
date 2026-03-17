# Configuration

FDX works with zero configuration in production. All defaults point to the production MCP services.

## Environment Variables

| Variable | Scope | Default | Description |
|----------|-------|---------|-------------|
| `FDX_ENV` | Auth | `prod` | Environment preset (`prod` \| `test`) — switches Entra auth config |
| `FDX_WALLET_MCP_URL` | Wallet only | `https://mcp.fd.xyz` | Wallet MCP service URL |
| `FDX_PRISM_MCP_URL` | Prism only | `https://prism-mcp.fd.xyz` | Prism MCP service URL |
| `FDX_STORE_PATH` | Auth | `~/.fdx/auth.json` | Token store file path |
| `FDX_LOG_PATH` | Logging | `~/.fdx/fdx.log` | Log file path |
| `FDX_LOG_LEVEL` | Logging | `info` | `debug` \| `info` \| `warn` \| `error` \| `off` |

### URL Resolution Order

For each service, the URL is resolved in this order:

1. **Per-service env var** — `FDX_WALLET_MCP_URL` or `FDX_PRISM_MCP_URL`
2. **Global fallback** — `FDX_MCP_SERVER` (deprecated — shows warning)
3. **Hardcoded default** — production URL

## Examples by Environment

**Production (no config needed):**

```bash
fdx wallet call getMyInfo        # → https://mcp.fd.xyz
fdx prism call listPayments      # → https://prism-mcp.fd.xyz
```

**Staging:**

```bash
export FDX_WALLET_MCP_URL=https://mcp-staging.fd.xyz
export FDX_PRISM_MCP_URL=https://prism-mcp-staging.fd.xyz

fdx wallet call getMyInfo        # → https://mcp-staging.fd.xyz
fdx prism call listPayments      # → https://prism-mcp-staging.fd.xyz
```

**Override one service only:**

```bash
export FDX_WALLET_MCP_URL=http://localhost:3000

fdx wallet call getMyInfo        # → http://localhost:3000
fdx prism call listPayments      # → https://prism-mcp.fd.xyz (production default)
```

**Inline (single command):**

```bash
FDX_WALLET_MCP_URL=http://localhost:3000 fdx wallet call getMyInfo
```

**Persistent (add to shell profile):**

```bash
# ~/.bashrc or ~/.zshrc
export FDX_WALLET_MCP_URL=https://mcp-staging.fd.xyz
export FDX_PRISM_MCP_URL=https://prism-mcp-staging.fd.xyz
```

## Migrating from `FDX_MCP_SERVER`

If you previously used `FDX_MCP_SERVER`, it still works but is deprecated. The CLI will show a warning:

```
Warning: FDX_MCP_SERVER is deprecated — it overrides ALL services to the same URL.
  Use per-service env vars instead:
    export FDX_WALLET_MCP_URL=...
    export FDX_PRISM_MCP_URL=...
```

Replace with per-service env vars to target each service independently.

## HTTPS Requirement

All MCP service URLs must use HTTPS. HTTP is only allowed for `localhost` / `127.0.0.1`.

```bash
# OK
FDX_WALLET_MCP_URL=https://mcp-staging.fd.xyz
FDX_WALLET_MCP_URL=http://localhost:3000

# Error
FDX_WALLET_MCP_URL=http://mcp-staging.fd.xyz
```

## Auth Configuration

Entra authentication settings are controlled by the `FDX_ENV` environment variable:

| FDX_ENV | Authority | Client ID | Scopes |
|---------|-----------|-----------|--------|
| `prod` (default) | `https://auth.fd.xyz/financedistrict.onmicrosoft.com` | `77109def-...` | `api://fd-agent-wallet-mcp/mcp:tools openid offline_access` |
| `test` | `https://auth.test.1stdigital.tech/401c099d-...` | `954aab11-...` | `api://fd-agent-wallet-mcp/mcp:tools openid offline_access` |

```bash
# Test environment
export FDX_ENV=test
export FDX_WALLET_MCP_URL=https://mcp-test.fd.xyz
export FDX_PRISM_MCP_URL=https://prism-mcp-test.fd.xyz
```

Note: `FDX_ENV` only switches Entra auth config. MCP service URLs must be set separately via `FDX_WALLET_MCP_URL` / `FDX_PRISM_MCP_URL`.
