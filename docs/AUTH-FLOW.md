# Diagram: Auth Flow in FD Agent Wallet CLI
(Microsoft Entra External ID Native Authentication — no browser, fit for AI agents, containers, CI pipelines.)
## ASCII Version

```
                         FD Agent Wallet CLI - Auth Architecture
  =====================================================================================

  USER                    CLI Commands              Core Layer                 External
  ----                    ------------              ----------                 --------

                     +------------------+     +----------------+
  fdx register       | register.js      |---->| FdxClient      |
  --email xxx        +------------------+     |                |
                                              |  .register()   |
                     +------------------+     |  .login()      |     +------------------+
  fdx login          | login.js         |---->|  .verify*()    |     | MCPAuthClient    |
  --email xxx        +------------------+     |  .logout()     |---->|                  |
                                              |  .getToken     |     |  startSignUp()   |
                     +------------------+     |   State()      |     |  challengeSignUp |
  fdx verify         | verify.js        |---->|                |     |  continueSignUp()|
  --code 12345678    +------------------+     +-------+--------+     |  completeSignUp()|
                                                      |             |                  |
                     +------------------+             |             |  startSignIn()   |
  fdx status         | status.js        |-------------+             |  challengeSignIn |
                     +------------------+             |             |  completeSignIn()|
                                                      |             |                  |
                     +------------------+             |             |  refreshToken()  |
  fdx logout         | logout.js        |-------------+             |  getAccessToken()|
                     +------------------+                           +--------+---------+
                                                                             |
                                                                             |  HTTP POST
                                                                             |  (axios)
                                              +------------------+           |
                                              | Credential Store |           v
                                              |                  |  +------------------+
                                              | macOS: Keychain  |  | Microsoft Entra  |
                                              | Linux: libsecret |  | External ID      |
                                              | Win:   DPAPI     |  |                  |
                                              +--------+---------+  | /signup/v1.0/*   |
                                                       |            | /oauth2/v2.0/*   |
                                              +--------+---------+  +------------------+
                                              | ~/.fdx/auth.json |
                                              | (metadata +      |
                                              |  fallback tokens)|
                                              +------------------+
```

## Mermaid: Register Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as register.js
    participant FDX as FdxClient
    participant AUTH as MCPAuthClient
    participant ENTRA as Entra API
    participant CRED as Credential Store
    participant FILE as auth.json

    U->>CLI: fdx register --email user@mail.com
    CLI->>FDX: client.register(email)

    Note over FDX,ENTRA: Step 1: Start Sign-Up
    FDX->>AUTH: startSignUp(email)
    AUTH->>ENTRA: POST /signup/v1.0/start<br/>client_id, challenge_type, username
    ENTRA-->>AUTH: continuation_token

    Note over FDX,ENTRA: Step 2: Challenge (Trigger OTP Email)
    FDX->>AUTH: challengeSignUp(continuation_token)
    AUTH->>ENTRA: POST /signup/v1.0/challenge<br/>client_id, challenge_type, continuation_token
    ENTRA-->>AUTH: new continuation_token,<br/>code_length, challenge_target_label

    Note over FDX,FILE: Step 3: Save Pending State
    FDX->>AUTH: savePendingVerification()
    AUTH->>CRED: setSecret("mcp.fd.xyz/pending", continuation_token)
    AUTH->>FILE: write { email, flow: "register", createdAt }

    AUTH-->>FDX: challenge info
    FDX-->>CLI: challenge info
    CLI-->>U: "Code sent to u***@mail.com (8 digits)"<br/>"Run: fdx verify --code <OTP>"
```

## Mermaid: Login Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as login.js
    participant FDX as FdxClient
    participant AUTH as MCPAuthClient
    participant ENTRA as Entra API
    participant CRED as Credential Store
    participant FILE as auth.json

    U->>CLI: fdx login --email user@mail.com
    CLI->>FDX: client.login(email)

    Note over FDX,ENTRA: Step 1: Initiate Sign-In
    FDX->>AUTH: startSignIn(email)
    AUTH->>ENTRA: POST /oauth2/v2.0/initiate<br/>client_id, challenge_type, username
    ENTRA-->>AUTH: continuation_token

    Note over FDX,ENTRA: Step 2: Challenge (Trigger OTP Email)
    FDX->>AUTH: challengeSignIn(continuation_token)
    AUTH->>ENTRA: POST /oauth2/v2.0/challenge<br/>client_id, challenge_type, continuation_token
    ENTRA-->>AUTH: new continuation_token,<br/>code_length, challenge_target_label

    Note over FDX,FILE: Step 3: Save Pending State
    FDX->>AUTH: savePendingVerification()
    AUTH->>CRED: setSecret("mcp.fd.xyz/pending", continuation_token)
    AUTH->>FILE: write { email, flow: "login", createdAt }

    AUTH-->>FDX: challenge info
    FDX-->>CLI: challenge info
    CLI-->>U: "Code sent to u***@mail.com (8 digits)"<br/>"Run: fdx verify --code <OTP>"
```

## Mermaid: Verify Flow (Register Branch)

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as verify.js
    participant FDX as FdxClient
    participant AUTH as MCPAuthClient
    participant ENTRA as Entra API
    participant CRED as Credential Store
    participant FILE as auth.json

    U->>CLI: fdx verify --code 12345678
    CLI->>AUTH: getPendingVerification()
    AUTH->>CRED: getSecret("mcp.fd.xyz/pending")
    CRED-->>AUTH: continuation_token
    AUTH->>FILE: read { email, flow: "register" }
    AUTH-->>CLI: { continuationToken, email, flow: "register" }

    Note over FDX,ENTRA: Step 1: Submit OTP
    CLI->>FDX: verifyRegistration(token, code, email)
    FDX->>AUTH: continueSignUp(token, "12345678")
    AUTH->>ENTRA: POST /signup/v1.0/continue<br/>client_id, continuation_token,<br/>grant_type=oob, oob=12345678
    ENTRA-->>AUTH: new continuation_token

    Note over FDX,ENTRA: Step 2: Exchange for Tokens
    FDX->>AUTH: completeSignUp(new_token, email)
    AUTH->>ENTRA: POST /oauth2/v2.0/token<br/>client_id, continuation_token,<br/>grant_type=continuation_token,<br/>scope, username
    ENTRA-->>AUTH: access_token, refresh_token,<br/>expires_in, token_type

    Note over AUTH,FILE: Step 3: Persist Tokens
    AUTH->>CRED: setSecret("auth.fd.xyz",<br/>JSON { accessToken, refreshToken })
    AUTH->>FILE: write { scope, tokenType, expiresAt,<br/>credentialStore: true }
    AUTH->>FILE: write mcpAuth { email }

    Note over AUTH,CRED: Step 4: Cleanup
    AUTH->>CRED: deleteSecret("mcp.fd.xyz/pending")
    AUTH->>FILE: delete pendingVerification

    FDX-->>CLI: token response
    CLI-->>U: "Authentication successful"<br/>Token Type: Bearer, Expires In: 3600s
```

## Mermaid: Verify Flow (Login Branch)

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as verify.js
    participant FDX as FdxClient
    participant AUTH as MCPAuthClient
    participant ENTRA as Entra API
    participant CRED as Credential Store
    participant FILE as auth.json

    U->>CLI: fdx verify --code 12345678
    CLI->>AUTH: getPendingVerification()
    AUTH->>CRED: getSecret("mcp.fd.xyz/pending")
    AUTH->>FILE: read { email, flow: "login" }
    AUTH-->>CLI: { continuationToken, email, flow: "login" }

    Note over FDX,ENTRA: Step 1: Submit OTP + Get Tokens (single step)
    CLI->>FDX: verifyLogin(token, code, email)
    FDX->>AUTH: completeSignIn(token, "12345678", email)
    AUTH->>ENTRA: POST /oauth2/v2.0/token<br/>client_id, continuation_token,<br/>grant_type=oob, oob=12345678, scope
    ENTRA-->>AUTH: access_token, refresh_token,<br/>expires_in, token_type

    Note over AUTH,FILE: Step 2: Persist Tokens
    AUTH->>CRED: setSecret("auth.fd.xyz",<br/>JSON { accessToken, refreshToken })
    AUTH->>FILE: write { scope, tokenType, expiresAt,<br/>credentialStore: true }
    AUTH->>FILE: write mcpAuth { email }

    Note over AUTH,CRED: Step 3: Cleanup
    AUTH->>CRED: deleteSecret("mcp.fd.xyz/pending")
    AUTH->>FILE: delete pendingVerification

    FDX-->>CLI: token response
    CLI-->>U: "Authentication successful"
```

## Mermaid: Token Refresh + MCP Call Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as wallet-call.js
    participant FDX as FdxClient
    participant MCP as MCPClient
    participant AUTH as MCPAuthClient
    participant CRED as Credential Store
    participant ENTRA as Entra API
    participant SRV as MCP Server<br/>(mcp.fd.xyz)

    U->>CLI: fdx wallet getTokenPrice --token ETH
    CLI->>FDX: createClientFromEnv("wallet")
    CLI->>FDX: client.getTokenPrice({ token: "ETH" })
    FDX->>MCP: callTool("getTokenPrice", { token: "ETH" })

    Note over MCP,AUTH: Check token freshness
    MCP->>AUTH: getAccessToken()
    AUTH->>CRED: getSecret("auth.fd.xyz")
    CRED-->>AUTH: { accessToken, refreshToken }

    alt Token still valid (expiresAt > now + 30s)
        AUTH-->>MCP: accessToken
    else Token expiring soon (< 30s left)
        AUTH->>ENTRA: POST /oauth2/v2.0/token<br/>grant_type=refresh_token,<br/>refresh_token, client_id, scope
        ENTRA-->>AUTH: new access_token, refresh_token
        AUTH->>CRED: setSecret("auth.fd.xyz", new tokens)
        AUTH-->>MCP: new accessToken
    end

    MCP->>SRV: HTTP POST (StreamableHTTP)<br/>Authorization: Bearer {accessToken}
    SRV-->>MCP: tool result

    alt 401 Unauthorized
        MCP->>AUTH: refreshToken()
        AUTH->>ENTRA: POST /oauth2/v2.0/token (refresh)
        ENTRA-->>AUTH: new tokens
        MCP->>SRV: retry with new token
        SRV-->>MCP: tool result
    end

    MCP-->>FDX: { data: { price, change24h } }
    FDX-->>CLI: result
    CLI-->>U: JSON output
```

## Mermaid: Token Storage Strategy

```mermaid
flowchart TD
    A["persistTokens(tokenResponse)"] --> B{"OS Credential<br/>Store available?"}

    B -->|Yes| C["credentialStore.setSecret(<br/>'auth.fd.xyz',<br/>JSON { accessToken, refreshToken })"]
    C --> D["Write to auth.json:<br/>{ scope, tokenType,<br/>expiresAt, credentialStore: true }<br/>(NO tokens in file)"]

    B -->|No| E["Write to auth.json:<br/>{ scope, tokenType, expiresAt,<br/>accessToken, refreshToken }<br/>(plaintext!)"]
    E --> F["emit SecurityWarning"]

    style C fill:#2d5a2d,color:#fff
    style D fill:#2d5a2d,color:#fff
    style E fill:#8b2500,color:#fff
    style F fill:#8b2500,color:#fff
```

## Mermaid: Credential Store per OS

```mermaid
flowchart LR
    CS["Credential Store<br/>service: fdx-wallet"]

    CS --> MAC["macOS<br/>Keychain"]
    CS --> LIN["Linux<br/>libsecret"]
    CS --> WIN["Windows<br/>DPAPI"]

    MAC --> MAC_CMD["security CLI<br/>add/find/delete<br/>-generic-password"]
    LIN --> LIN_CMD["secret-tool CLI<br/>store/lookup/clear"]
    WIN --> WIN_CMD["PowerShell<br/>ProtectedData::<br/>Protect/Unprotect"]
    WIN_CMD --> WIN_FILE["~/.fdx/.cred_{hash}<br/>hash = SHA256(account)<br/>.slice(0,16)"]

    style MAC fill:#1a5276,color:#fff
    style LIN fill:#6c3483,color:#fff
    style WIN fill:#1e8449,color:#fff
```
