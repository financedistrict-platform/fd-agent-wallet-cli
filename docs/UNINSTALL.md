# Uninstall

Remove FDX and all associated data.

## Steps

### For npm install users

```bash
# 1. Remove auth tokens and config
rm -rf ~/.fdx

# 2. Uninstall the package globally
npm uninstall -g @financedistrict/fdx
```

### For development users (git clone)

If you installed from source:

```bash
# 1. Remove auth tokens and config
rm -rf ~/.fdx

# 2. Unlink the CLI
npm unlink -g @financedistrict/fdx

# 3. Remove the repo
rm -rf fd-agent-wallet-cli  # or wherever you cloned it
```

### OS Credential Store Cleanup

If you used FDX with an OS credential store, secrets may persist in the
system keychain after removing `~/.fdx`. Clean them up manually:

**macOS (Keychain):**

```bash
security delete-generic-password -s fdx-wallet
```

**Linux (libsecret):**

```bash
secret-tool clear service fdx-wallet
```

**Windows:** Credentials are stored via DPAPI in `~/.fdx/.cred_*` files and
are removed when you delete the `~/.fdx` directory. No additional cleanup
is needed.

## Verify

```bash
which fdx    # should return nothing
```
