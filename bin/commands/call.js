const { createClientFromEnv } = require('../../src');

const METHODS = [
  'getMyInfo',
  'getAppVersion',
  'helpNarrative',
  'onboardingAssistant',
  'reportIssue',
  'getWalletOverview',
  'getAccountActivity',
  'deploySmartAccount',
  'manageSmartAccountOwnership',
  'transferTokens',
  'swapTokens',
  'discoverYieldStrategies',
  'depositForYield',
  'withdrawFromYield',
  'authorizePayment',
  'getX402Content',
];

module.exports = async function call(argv) {
  const method = argv[0];

  if (!method || !METHODS.includes(method)) {
    console.log('Usage: autoecon call <method> [--param value ...]');
    console.log('');
    console.log('Methods:');
    for (const m of METHODS) {
      console.log(`  ${m}`);
    }
    process.exit(1);
  }

  const args = parseArgs(argv.slice(1));
  const client = createClientFromEnv();

  try {
    const result = await client[method](args);

    if (result.error) {
      console.error(JSON.stringify({ error: result.error }, null, 2));
      process.exit(1);
    }

    console.log(JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: { message: error.message } }, null, 2));
    process.exit(1);
  }
};

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

  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;

  return value;
}
