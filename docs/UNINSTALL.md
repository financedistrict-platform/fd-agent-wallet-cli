# Uninstall

Remove AutoEcon and all associated data from an OpenClaw instance.

## Steps

### For npm install users

```bash
# 1. Remove OpenClaw skill config
openclaw config unset skills.entries.autoecon

# 2. Remove skill folder
rm -rf ~/.openclaw/skills/autoecon

# 3. Remove auth tokens
rm -f ~/.autoecon/tokens.json

# 4. Uninstall the package globally
npm uninstall -g @autoecon/openclaw-wallet

# 5. Restart gateway to unload the skill
openclaw gateway restart
```

### For development users (git clone)

If you installed from source:

```bash
# Follow steps 1-3 above, then:

# 4. Unlink the CLI
npm unlink -g @autoecon/openclaw-wallet

# 5. Remove the repo
rm -rf ~/gh/openclaw-wallet  # or wherever you cloned it

# 6. Restart gateway
openclaw gateway restart
```

## Verify

```bash
openclaw skills list          # autoecon should not appear
which autoecon                # should return nothing
openclaw config get skills    # should have no autoecon entry
```
