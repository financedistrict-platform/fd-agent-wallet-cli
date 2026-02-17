const { createSpinner } = require('nanospinner');
const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');
const { parseArgs } = require('../../src/utils/args');

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
    console.log(`Usage: fdx call ${pc.cyan('<method>')} [--param value ...]`);
    console.log('');
    console.log(pc.dim('Methods:'));
    for (const m of METHODS) {
      console.log(`  ${m}`);
    }
    process.exit(1);
  }

  const args = parseArgs(argv.slice(1));
  const client = createClientFromEnv();

  const spinner = createSpinner(`Calling ${pc.cyan(method)}...`).start();

  try {
    const result = await client[method](args);

    if (result.error) {
      spinner.error({ text: `${method} failed` });
      console.error(JSON.stringify({ error: result.error }, null, 2));
      process.exit(1);
    }

    spinner.success({ text: `${method}` });
    console.log(JSON.stringify(result.data, null, 2));
  } catch (error) {
    spinner.error({ text: `${method} failed` });
    console.error(pc.red(error.message));
    process.exit(1);
  }
};
