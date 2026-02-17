function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      const key = arg.substring(2);
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

  // Preserve hex strings (e.g. Ethereum addresses like 0xABC...)
  if (/^0x/i.test(value)) return value;

  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;

  return value;
}

module.exports = { parseArgs, parseValue };
