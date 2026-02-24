const { createSpinner } = require('nanospinner');
const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');
const { parseArgs } = require('../../src/utils/args');

/* -------------------------------------------------------------------------- */
/*  Method metadata — drives METHODS list, --help, and validation hints       */
/* -------------------------------------------------------------------------- */

const METHOD_INFO = {
  getTokenPrice: {
    description: 'Look up current USD price and 24h change for a token',
    params: {
      token: { required: true, type: 'string', desc: 'Token ticker symbol (e.g. BTC, ETH, USDC)' },
    },
  },
  getMyInfo: {
    description: 'Get your account information',
  },
  getAppVersion: {
    description: 'Get the application version',
  },
  helpNarrative: {
    description: 'Ask a conceptual question about wallet safety, keys, fees, etc.',
    params: {
      question: { required: true, type: 'string', desc: 'Your question' },
      tone: { type: 'string', desc: 'Response style: friendly, concise, formal, developer' },
      locale: { type: 'string', desc: 'Response locale (e.g. en-US, en-GB)' },
    },
  },
  onboardingAssistant: {
    description: 'Interactive onboarding guide for wallet setup',
    params: {
      question: { required: true, type: 'string', desc: 'Your question or setup step' },
      context: { type: 'string', desc: 'Additional context (JSON string)' },
      tone: { type: 'string', desc: 'Response style: friendly, concise, formal, developer' },
      locale: { type: 'string', desc: 'Response locale (e.g. en-US, en-GB)' },
    },
  },
  reportIssue: {
    description: 'Report a bug or issue (creates a GitHub issue)',
    params: {
      title: { required: true, type: 'string', desc: 'Issue title' },
      description: { required: true, type: 'string', desc: 'Detailed issue description' },
      labels: { type: 'string', desc: 'Comma-separated labels (e.g. bug, mcp-tool)' },
    },
  },
  getWalletOverview: {
    description: 'Get wallet balances and overview across chains',
    params: {
      accountAddress: { type: 'string', desc: 'Filter by account address (0x... or Base58)' },
      chainKey: { type: 'string', desc: 'Filter by chain (e.g. bsc, ethereum, solana)' },
    },
  },
  getAccountActivity: {
    description: 'Get transaction history for an account on a chain',
    params: {
      accountAddress: { required: true, type: 'string', desc: 'Account address to query' },
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier' },
      maxTransactions: { type: 'integer', desc: 'Max transactions to return (default: 25, max: 100)' },
    },
  },
  transferTokens: {
    description: 'Transfer tokens to any address (EVM or Solana)',
    params: {
      toAddress: { required: true, type: 'string', desc: 'Recipient address or ENS/SNS name' },
      amount: { required: true, type: 'number', desc: 'Amount to transfer (decimal)' },
      asset: { required: true, type: 'string', desc: 'Asset symbol (e.g. ETH, USDC, SOL) or contract address' },
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier (e.g. bsc, ethereum, solana)' },
      fromAccountAddress: { type: 'string', desc: 'Source wallet address (auto-selected if omitted)' },
      autoApprove: { type: 'boolean', desc: 'Auto-approve up to configured limit (default: false)' },
    },
  },
  swapTokens: {
    description: 'Quote or execute a token swap',
    params: {
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier' },
      tokenIn: { required: true, type: 'string', desc: 'Token to sell (e.g. USDC, ETH)' },
      tokenOut: { required: true, type: 'string', desc: 'Token to buy (e.g. USDC, ETH)' },
      amount: { required: true, type: 'number', desc: 'Amount of tokenIn to swap (decimal)' },
      objective: { type: 'string', desc: 'Objective: Immediate, BestExecution, LowGas, MevProtected' },
      maxSlippageBps: { type: 'integer', desc: 'Max slippage in basis points (default: 50)' },
      deadlineSeconds: { type: 'integer', desc: 'Deadline in seconds (default: 120)' },
      mode: { type: 'string', desc: 'Mode: QuoteOnly or Execute (default: QuoteOnly)' },
    },
  },
  discoverYieldStrategies: {
    description: 'Discover DeFi yield strategies across protocols',
    params: {
      chainKey: { type: 'string', desc: 'Filter by chain (e.g. bsc, base, ethereum)' },
      token: { type: 'string', desc: 'Filter by token (e.g. USDC, WETH, or 0x...)' },
      protocolSlug: { type: 'string', desc: 'Filter by protocol (e.g. aave-v3, venus, compound-v3)' },
      sortBy: { type: 'string', desc: 'Sort field: apy or risk (default: apy)' },
      sortDirection: { type: 'string', desc: 'Sort direction: desc or asc (default: desc)' },
      limit: { type: 'integer', desc: 'Max results 1-100 (default: 30)' },
    },
  },
  depositForYield: {
    description: 'Deposit tokens into a DeFi yield strategy',
    params: {
      strategyId: { required: true, type: 'string', desc: 'Strategy ID from discoverYieldStrategies' },
      fromAccountAddress: { required: true, type: 'string', desc: 'Account address to deposit from' },
      token: { required: true, type: 'string', desc: 'Token to deposit (e.g. USDC, WETH, or 0x...)' },
      amount: { required: true, type: 'number', desc: 'Amount to deposit (decimal)' },
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier' },
    },
  },
  withdrawFromYield: {
    description: 'Withdraw tokens from a DeFi yield position',
    params: {
      vaultTokenAddress: { required: true, type: 'string', desc: 'Vault token address (0x...)' },
      underlyingToken: { required: true, type: 'string', desc: 'Token to receive (e.g. USDC, WETH)' },
      withdrawAmount: { required: true, type: 'number', desc: 'Amount of vault tokens to withdraw (decimal)' },
      fromAccountAddress: { required: true, type: 'string', desc: 'Account holding the vault tokens' },
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier' },
    },
  },
  authorizePayment: {
    description: 'Authorize an X-402 payment from a 402 response',
    params: {
      paymentRequirementsResponseJson: { required: true, type: 'string', desc: 'JSON-serialized PaymentRequirementsResponse from server' },
      autoApprove: { type: 'boolean', desc: 'Auto-approve best option (default: false)' },
    },
  },
  getX402Content: {
    description: 'Fetch content from an X-402 protocol API',
    params: {
      url: { required: true, type: 'string', desc: 'API endpoint URL supporting X-402' },
      maxPaymentAmount: { type: 'string', desc: 'Maximum payment amount (decimal string)' },
      preferredAsset: { type: 'string', desc: 'Preferred payment asset (e.g. FDUSD, USDC)' },
      preferredNetwork: { type: 'string', desc: 'Preferred network identifier' },
      preferredNetworkName: { type: 'string', desc: 'Human-readable network name' },
    },
  },
  resolveNameService: {
    description: 'Resolve ENS/SNS/Unstoppable Domain names to addresses (or reverse)',
    params: {
      nameOrAddress: { required: true, type: 'string', desc: 'Name (e.g. vitalik.eth, bonfida.sol) or address to resolve' },
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
