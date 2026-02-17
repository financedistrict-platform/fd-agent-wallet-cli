# Uninstall

Remove FDX and all associated data.

## Steps

### For npm install users

```bash
# 1. Remove auth tokens
rm -rf ~/.fdx

# 2. Uninstall the package globally
npm uninstall -g @1stdigital/fdx
```

### For development users (git clone)

If you installed from source:

```bash
# 1. Remove auth tokens
rm -rf ~/.fdx

# 2. Unlink the CLI
npm unlink -g @1stdigital/fdx

# 3. Remove the repo
rm -rf fd-agent-wallet-cli  # or wherever you cloned it
```

## Verify

```bash
which fdx    # should return nothing
```
