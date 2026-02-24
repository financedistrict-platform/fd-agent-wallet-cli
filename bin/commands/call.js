const { createSpinner } = require('nanospinner');
const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');
const { parseArgs } = require('../../src/utils/args');

/* -------------------------------------------------------------------------- */
/*  Method metadata — drives METHODS list, --help, and validation hints       */
/* -------------------------------------------------------------------------- */

const METHOD_INFO = {
  getMyInfo: {
    description: 'Get your account information',
  },
  getAppVersion: {
    description: 'Get the application version',
  },
  helpNarrative: {
    description: 'Ask a question and get a narrative answer',
    params: {
      question: { required: true, type: 'string', desc: 'Your question' },
      locale: { type: 'string', desc: 'Response locale (e.g. en, zh)' },
      tone: { type: 'string', desc: 'Response tone (e.g. formal, casual)' },
    },
  },
  onboardingAssistant: {
    description: 'Ask an onboarding question',
    params: {
      question: { required: true, type: 'string', desc: 'Your question' },
      context: { type: 'string', desc: 'Additional context' },
      locale: { type: 'string', desc: 'Response locale' },
      tone: { type: 'string', desc: 'Response tone' },
    },
  },
  reportIssue: {
    description: 'Report an issue',
    params: {
      title: { required: true, type: 'string', desc: 'Issue title' },
      description: { required: true, type: 'string', desc: 'Issue description' },
      severity: { type: 'string', desc: 'Severity level' },
      category: { type: 'string', desc: 'Issue category' },
    },
  },
  getWalletOverview: {
    description: 'Get wallet balances and overview',
    params: {
      chainKey: { type: 'string', desc: 'Blockchain identifier (e.g. bsc, ethereum)' },
      accountAddress: { type: 'string', desc: 'Account address to query' },
    },
  },
  getAccountActivity: {
    description: 'Get account transaction activity',
    params: {
      chainKey: { type: 'string', desc: 'Blockchain identifier' },
      accountAddress: { type: 'string', desc: 'Account address to query' },
      limit: { type: 'number', desc: 'Max results to return' },
      offset: { type: 'number', desc: 'Pagination offset' },
    },
  },
  deploySmartAccount: {
    description: 'Deploy a new smart account',
    params: {
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier' },
      initialOwners: { type: 'string', desc: 'Comma-separated owner addresses' },
      threshold: { type: 'number', desc: 'Multi-sig approval threshold' },
    },
  },
  manageSmartAccountOwnership: {
    description: 'Manage smart account ownership',
    params: {
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier' },
      accountAddress: { required: true, type: 'string', desc: 'Smart account address' },
      action: { required: true, type: 'string', desc: 'Action: addOwner, removeOwner, changeThreshold' },
      ownerAddress: { type: 'string', desc: 'Owner address to add or remove' },
      newThreshold: { type: 'number', desc: 'New approval threshold' },
    },
  },
  transferTokens: {
    description: 'Transfer tokens to a recipient address',
    params: {
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier (e.g. bsc, ethereum)' },
      recipientAddress: { required: true, type: 'string', desc: 'Destination wallet address' },
      amount: { required: true, type: 'string', desc: 'Amount to transfer' },
      fromAccountAddress: { type: 'string', desc: 'Source smart-account address' },
      tokenAddress: { type: 'string', desc: 'Token contract address or symbol (e.g. USDT)' },
      memo: { type: 'string', desc: 'Transfer memo' },
      maxPriorityFeePerGas: { type: 'string', desc: 'Max priority fee per gas (wei)' },
      maxFeePerGas: { type: 'string', desc: 'Max fee per gas (wei)' },
    },
  },
  swapTokens: {
    description: 'Swap tokens on a decentralized exchange',
    params: {
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier' },
      tokenIn: { required: true, type: 'string', desc: 'Input token address or symbol' },
      tokenOut: { required: true, type: 'string', desc: 'Output token address or symbol' },
      amount: { required: true, type: 'string', desc: 'Amount of tokenIn to swap' },
      mode: { type: 'string', desc: 'Swap mode' },
      objective: { type: 'string', desc: 'Swap objective' },
      maxSlippageBps: { type: 'number', desc: 'Max slippage in basis points' },
      deadlineSeconds: { type: 'number', desc: 'Transaction deadline in seconds' },
    },
  },
  discoverYieldStrategies: {
    description: 'Discover available DeFi yield strategies',
    params: {
      chainKey: { type: 'string', desc: 'Blockchain identifier' },
      tokenAddress: { type: 'string', desc: 'Token address or symbol' },
      minApy: { type: 'number', desc: 'Minimum APY filter' },
      maxRisk: { type: 'string', desc: 'Maximum risk level' },
      sortBy: { type: 'string', desc: 'Sort field' },
    },
  },
  depositForYield: {
    description: 'Deposit tokens into a yield strategy',
    params: {
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier' },
      strategyId: { required: true, type: 'string', desc: 'Yield strategy ID' },
      amount: { required: true, type: 'string', desc: 'Amount to deposit' },
      tokenAddress: { type: 'string', desc: 'Token contract address or symbol' },
    },
  },
  withdrawFromYield: {
    description: 'Withdraw tokens from a yield position',
    params: {
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier' },
      positionId: { required: true, type: 'string', desc: 'Yield position ID' },
      amount: { type: 'string', desc: 'Amount to withdraw (omit for full withdrawal)' },
      recipient: { type: 'string', desc: 'Recipient address' },
    },
  },
  authorizePayment: {
    description: 'Authorize a payment via x402 protocol',
    params: {
      url: { required: true, type: 'string', desc: 'Payment URL' },
      preferredNetwork: { type: 'string', desc: 'Preferred blockchain network' },
      preferredNetworkName: { type: 'string', desc: 'Preferred network display name' },
      preferredAsset: { type: 'string', desc: 'Preferred payment asset' },
      maxPaymentAmount: { type: 'string', desc: 'Max payment amount' },
    },
  },
  getX402Content: {
    description: 'Fetch content requiring x402 payment',
    params: {
      url: { required: true, type: 'string', desc: 'Content URL' },
      preferredNetwork: { type: 'string', desc: 'Preferred blockchain network' },
      preferredNetworkName: { type: 'string', desc: 'Preferred network display name' },
      preferredAsset: { type: 'string', desc: 'Preferred payment asset' },
      maxPaymentAmount: { type: 'string', desc: 'Max payment amount' },
    },
  },
};

const METHODS = Object.keys(METHOD_INFO);

/* -------------------------------------------------------------------------- */
/*  --help renderer                                                           */
/* -------------------------------------------------------------------------- */

function showMethodHelp(method) {
  const info = METHOD_INFO[method];

  console.log('');
  console.log(`${pc.bold(method)} — ${info.description}`);
  console.log('');

  if (!info.params || Object.keys(info.params).length === 0) {
    console.log(pc.dim('  No parameters required.'));
    console.log('');
    console.log(pc.dim('Example:'));
    console.log(`  fdx call ${method}`);
    return;
  }

  const required = Object.entries(info.params).filter(([, p]) => p.required);
  const optional = Object.entries(info.params).filter(([, p]) => !p.required);

  if (required.length > 0) {
    console.log(pc.underline('Required:'));
    for (const [name, p] of required) {
      console.log(`  --${name.padEnd(24)} ${pc.dim(`<${p.type || 'string'}>`)}  ${p.desc}`);
    }
    console.log('');
  }

  if (optional.length > 0) {
    console.log(pc.underline('Optional:'));
    for (const [name, p] of optional) {
      console.log(`  --${name.padEnd(24)} ${pc.dim(`<${p.type || 'string'}>`)}  ${p.desc}`);
    }
    console.log('');
  }

  const example = required.map(([name]) => `--${name} "..."`).join(' ');
  console.log(pc.dim('Example:'));
  console.log(`  fdx call ${method} ${example}`);
}

/* -------------------------------------------------------------------------- */
/*  Command handler                                                           */
/* -------------------------------------------------------------------------- */

module.exports = async function call(argv) {
  const method = argv[0];

  if (!method || !METHODS.includes(method)) {
    console.log(`Usage: fdx call ${pc.cyan('<method>')} [--param value ...]`);
    console.log('');
    console.log(pc.dim('Methods:'));
    for (const m of METHODS) {
      const desc = METHOD_INFO[m]?.description || '';
      console.log(`  ${m.padEnd(34)} ${pc.dim(desc)}`);
    }
    console.log('');
    console.log(pc.dim('Run fdx call <method> --help for parameter details.'));
    process.exit(1);
  }

  // --help for a specific method
  if (argv.slice(1).includes('--help')) {
    showMethodHelp(method);
    process.exit(0);
  }

  const args = parseArgs(argv.slice(1));
  const info = METHOD_INFO[method];

  // Warn about unrecognized parameters
  if (info?.params) {
    const known = new Set(Object.keys(info.params));
    const unknown = Object.keys(args).filter((k) => !known.has(k));
    if (unknown.length > 0) {
      console.log(
        pc.yellow(`Warning: unrecognized parameter(s): ${unknown.map((k) => `--${k}`).join(', ')}`),
      );
      console.log(pc.dim(`  Run fdx call ${method} --help to see accepted parameters.`));
      console.log('');
    }
  }

  const client = createClientFromEnv();
  const spinner = createSpinner(`Calling ${pc.cyan(method)}...`).start();

  try {
    const result = await client[method](args);

    if (result.error) {
      spinner.error({ text: `${method} failed` });
      console.error(JSON.stringify({ error: result.error }, null, 2));
      console.error(pc.dim(`  Run fdx call ${method} --help for usage details.`));
      process.exit(1);
    }

    spinner.success({ text: `${method}` });
    console.log(JSON.stringify(result.data, null, 2));
  } catch (error) {
    spinner.error({ text: `${method} failed` });
    console.error(pc.red(error.message));
    const argKeys = Object.keys(args);
    if (argKeys.length > 0) {
      console.error(pc.dim(`  Provided: ${argKeys.map((k) => `--${k}`).join(', ')}`));
    }
    if (info?.params) {
      const req = Object.entries(info.params)
        .filter(([, p]) => p.required)
        .map(([name]) => `--${name}`);
      if (req.length > 0) {
        console.error(pc.dim(`  Required: ${req.join(', ')}`));
      }
    }
    console.error(pc.dim(`  Run fdx call ${method} --help for usage details.`));
    process.exit(1);
  } finally {
    await client.close().catch(() => {});
  }
};
