function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      const rest = arg.substring(2);

      // Support --key=value syntax
      const eqIdx = rest.indexOf('=');
      if (eqIdx !== -1) {
        const key = rest.substring(0, eqIdx);
        if (key) args[key] = parseValue(rest.substring(eqIdx + 1));
        continue;
      }

      const key = rest;
      if (!key) continue;

      const value = argv[i + 1];

      if (value === undefined || value.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = parseValue(value);
        i++;
      }
    }
  }

  return args;
}

function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;

  // All other values stay as strings — no numeric coercion.
  // Financial amounts, addresses, and IDs must not lose precision.
  return value;
}

module.exports = { parseArgs, parseValue };
