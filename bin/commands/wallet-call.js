const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');
const { parseArgs } = require('../../src/utils/args');

const createSpinner = require('./spinner');

/* -------------------------------------------------------------------------- */
/*  Method metadata — drives METHODS list, --help, and validation hints       */
/* -------------------------------------------------------------------------- */

const METHOD_INFO = {
  getTokenPrice: {
    category: 'Wallet',
    description: 'Look up current USD price and 24h change for a token',
    params: {
      token: {
        required: true,
        type: 'string',
        desc: 'Token ticker symbol (e.g. BTC, ETH, USDC)',
        example: 'ETH',
      },
    },
  },
  getMyInfo: {
    category: 'Account',
    description: 'Get your account information',
  },
  getAppVersion: {
    category: 'Account',
    description: 'Get the application version',
  },
  helpNarrative: {
    category: 'Support',
    description: 'Ask a conceptual question about wallet safety, keys, fees, etc.',
    params: {
      question: {
        required: true,
        type: 'string',
        desc: 'Your question',
        example: 'What are gas fees?',
      },
      tone: { type: 'string', desc: 'Response style: friendly, concise, formal, developer' },
      locale: { type: 'string', desc: 'Response locale (e.g. en-US, en-GB)' },
    },
  },
  onboardingAssistant: {
    category: 'Support',
    description: 'Interactive onboarding guide for wallet setup',
    params: {
      question: {
        required: true,
        type: 'string',
        desc: 'Your question or setup step',
        example: 'How do I fund my wallet?',
      },
      context: { type: 'string', desc: 'Additional context (JSON string)' },
      tone: { type: 'string', desc: 'Response style: friendly, concise, formal, developer' },
      locale: { type: 'string', desc: 'Response locale (e.g. en-US, en-GB)' },
    },
  },
  reportIssue: {
    category: 'Support',
    description: 'Report a bug or issue (creates a GitHub issue)',
    params: {
      title: {
        required: true,
        type: 'string',
        desc: 'Issue title',
        example: 'Transfer failed on BSC',
      },
      description: {
        required: true,
        type: 'string',
        desc: 'Detailed issue description',
        example: 'Error when sending USDC...',
      },
      labels: { type: 'string', desc: 'Comma-separated labels (e.g. bug, mcp-tool)' },
    },
  },
  getWalletOverview: {
    category: 'Wallet',
    description: 'Get wallet balances and overview across chains',
    params: {
      accountAddress: {
        type: 'string',
        desc: 'Filter by account address (0x..., Base58, or Bitcoin)',
      },
      chainKey: { type: 'string', desc: 'Filter by chain (e.g. bitcoin, bsc, ethereum, solana)' },
    },
  },
  getAccountActivity: {
    category: 'Wallet',
    description: 'Get transaction history for an account on a chain',
    params: {
      accountAddress: {
        required: true,
        type: 'string',
        desc: 'Account address to query',
        example: '0x1234...abcd',
      },
      chainKey: {
        required: true,
        type: 'string',
        desc: 'Blockchain identifier',
        example: 'ethereum',
      },
      maxTransactions: {
        type: 'integer',
        desc: 'Max transactions to return (default: 25, max: 100)',
      },
    },
  },
  transferTokens: {
    category: 'Transfer',
    description: 'Transfer tokens to any address (EVM, Solana, or Bitcoin)',
    params: {
      toAddress: {
        required: true,
        type: 'string',
        desc: 'Recipient address or ENS/SNS name',
        example: '0xRecipient...or vitalik.eth',
      },
      amount: {
        required: true,
        type: 'number',
        desc: 'Amount to transfer (decimal)',
        example: '10',
      },
      asset: {
        required: true,
        type: 'string',
        desc: 'Asset symbol (e.g. BTC, ETH, USDC, SOL) or contract address',
        example: 'USDC',
      },
      chainKey: {
        required: true,
        type: 'string',
        desc: 'Blockchain identifier (e.g. bitcoin, bsc, ethereum, solana)',
        example: 'ethereum',
      },
      fromAccountAddress: {
        type: 'string',
        desc: 'Source wallet address (auto-selected if omitted)',
      },
      autoApprove: {
        type: 'boolean',
        desc: 'Auto-approve up to configured limit (default: false)',
      },
    },
  },
  resolveNameService: {
    category: 'Transfer',
    description: 'Resolve ENS/SNS/Unstoppable Domain names to addresses (or reverse)',
    params: {
      nameOrAddress: {
        required: true,
        type: 'string',
        desc: 'Name (e.g. vitalik.eth, bonfida.sol) or address to resolve',
        example: 'vitalik.eth',
      },
    },
  },
  swapTokens: {
    category: 'Swap',
    description: 'Quote or execute a token swap',
    params: {
      chainKey: {
        required: true,
        type: 'string',
        desc: 'Blockchain identifier',
        example: 'ethereum',
      },
      tokenIn: {
        required: true,
        type: 'string',
        desc: 'Token to sell (e.g. USDC, ETH)',
        example: 'USDC',
      },
      tokenOut: {
        required: true,
        type: 'string',
        desc: 'Token to buy (e.g. USDC, ETH)',
        example: 'ETH',
      },
      amount: {
        required: true,
        type: 'number',
        desc: 'Amount of tokenIn to swap (decimal)',
        example: '100',
      },
      objective: {
        type: 'string',
        desc: 'Objective: Immediate, BestExecution, LowGas, MevProtected',
      },
      maxSlippageBps: { type: 'integer', desc: 'Max slippage in basis points (default: 50)' },
      deadlineSeconds: { type: 'integer', desc: 'Deadline in seconds (default: 120)' },
      mode: { type: 'string', desc: 'Mode: QuoteOnly or Execute (default: QuoteOnly)' },
    },
  },
  discoverYieldStrategies: {
    category: 'Yield',
    description: 'Discover DeFi yield strategies across protocols',
    params: {
      chainKey: { type: 'string', desc: 'Filter by chain (e.g. bsc, base, ethereum)' },
      token: { type: 'string', desc: 'Filter by token (e.g. USDC, WETH, or 0x...)' },
      protocolSlug: {
        type: 'string',
        desc: 'Filter by protocol (e.g. aave-v3, venus, compound-v3)',
      },
      sortBy: { type: 'string', desc: 'Sort field: apy or risk (default: apy)' },
      sortDirection: { type: 'string', desc: 'Sort direction: desc or asc (default: desc)' },
      limit: { type: 'integer', desc: 'Max results 1-100 (default: 30)' },
    },
  },
  depositForYield: {
    category: 'Yield',
    description: 'Deposit tokens into a DeFi yield strategy',
    params: {
      strategyId: {
        required: true,
        type: 'string',
        desc: 'Strategy ID from discoverYieldStrategies',
        example: 'aave-v3-usdc-base',
      },
      fromAccountAddress: {
        required: true,
        type: 'string',
        desc: 'Account address to deposit from',
        example: '0x1234...abcd',
      },
      token: {
        required: true,
        type: 'string',
        desc: 'Token to deposit (e.g. USDC, WETH, or 0x...)',
        example: 'USDC',
      },
      amount: {
        required: true,
        type: 'number',
        desc: 'Amount to deposit (decimal)',
        example: '500',
      },
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier', example: 'base' },
    },
  },
  withdrawFromYield: {
    category: 'Yield',
    description: 'Withdraw tokens from a DeFi yield position',
    params: {
      vaultTokenAddress: {
        required: true,
        type: 'string',
        desc: 'Vault token address (0x...)',
        example: '0xVault...addr',
      },
      underlyingToken: {
        required: true,
        type: 'string',
        desc: 'Token to receive (e.g. USDC, WETH)',
        example: 'USDC',
      },
      withdrawAmount: {
        required: true,
        type: 'number',
        desc: 'Amount of vault tokens to withdraw (decimal)',
        example: '250',
      },
      fromAccountAddress: {
        required: true,
        type: 'string',
        desc: 'Account holding the vault tokens',
        example: '0x1234...abcd',
      },
      chainKey: { required: true, type: 'string', desc: 'Blockchain identifier', example: 'base' },
    },
  },
  authorizePayment: {
    category: 'Payment',
    description: 'Authorize an X-402 payment from a 402 response',
    params: {
      paymentRequirementsResponseJson: {
        required: true,
        type: 'string',
        desc: 'JSON-serialized PaymentRequirementsResponse from server',
        example: '{"accepts":[...]}',
      },
      autoApprove: { type: 'boolean', desc: 'Auto-approve best option (default: false)' },
    },
  },
  getX402Content: {
    category: 'Payment',
    description: 'Fetch content from an X-402 protocol API',
    params: {
      url: {
        required: true,
        type: 'string',
        desc: 'API endpoint URL supporting X-402',
        example: 'https://api.example.com/data',
      },
      maxPaymentAmount: { type: 'string', desc: 'Maximum payment amount (decimal string)' },
      preferredAsset: { type: 'string', desc: 'Preferred payment asset (e.g. FDUSD, USDC)' },
      preferredNetwork: { type: 'string', desc: 'Preferred network identifier' },
      preferredNetworkName: { type: 'string', desc: 'Human-readable network name' },
    },
  },
};

const METHODS = Object.keys(METHOD_INFO);

/* -------------------------------------------------------------------------- */
/*  Category display order                                                    */
/* -------------------------------------------------------------------------- */

const CATEGORY_ORDER = ['Wallet', 'Transfer', 'Swap', 'Yield', 'Payment', 'Account', 'Support'];

/* -------------------------------------------------------------------------- */
/*  Fuzzy method matching                                                     */
/* -------------------------------------------------------------------------- */

function findClosestMethod(input) {
  const lower = input.toLowerCase();

  // Exact case-insensitive match
  const exact = METHODS.find((m) => m.toLowerCase() === lower);
  if (exact) return exact;

  // Prefix match (e.g. "transfer" → "transferTokens")
  const prefixMatches = METHODS.filter((m) => m.toLowerCase().startsWith(lower));
  if (prefixMatches.length === 1) return prefixMatches[0];

  // Substring match (e.g. "yield" → discoverYieldStrategies, depositForYield, ...)
  const substringMatches = METHODS.filter((m) => m.toLowerCase().includes(lower));
  if (substringMatches.length === 1) return substringMatches[0];

  // Levenshtein distance for typo correction
  const scored = METHODS.map((m) => ({
    method: m,
    dist: levenshtein(lower, m.toLowerCase()),
  })).sort((a, b) => a.dist - b.dist);

  // Only suggest if the best match is reasonably close (< 40% of the longer string)
  const best = scored[0];
  const threshold = Math.ceil(Math.max(lower.length, best.method.length) * 0.4);
  if (best.dist <= threshold) return best.method;

  return null;
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/* -------------------------------------------------------------------------- */
/*  Methods list renderer — grouped by category                               */
/* -------------------------------------------------------------------------- */

function showMethodsList(hint) {
  console.log(`Usage: fdx wallet call ${pc.cyan('<method>')} [--param value ...]`);
  console.log('');

  // Group methods by category
  const groups = {};
  for (const m of METHODS) {
    const cat = METHOD_INFO[m].category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  }

  for (const cat of CATEGORY_ORDER) {
    if (!groups[cat]) continue;
    console.log(pc.bold(cat));
    for (const m of groups[cat]) {
      console.log(`  ${pc.cyan(m.padEnd(30))} ${pc.dim(METHOD_INFO[m].description)}`);
    }
    console.log('');
  }

  // Any uncategorized
  for (const cat of Object.keys(groups)) {
    if (CATEGORY_ORDER.includes(cat)) continue;
    console.log(pc.bold(cat));
    for (const m of groups[cat]) {
      console.log(`  ${pc.cyan(m.padEnd(30))} ${pc.dim(METHOD_INFO[m].description)}`);
    }
    console.log('');
  }

  if (hint) {
    console.log(hint);
    console.log('');
  }

  console.log(pc.dim('Run fdx wallet call <method> --help for parameter details.'));
}

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
    console.log(`  fdx wallet call ${method}`);
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

  const example = required.map(([name, p]) => `--${name} ${p.example || '"..."'}`).join(' ');
  console.log(pc.dim('Example:'));
  console.log(`  fdx wallet call ${method} ${example}`);
}

/* -------------------------------------------------------------------------- */
/*  Type coercion — convert string args to number/integer where schema says   */
/* -------------------------------------------------------------------------- */

function coerceArgs(args, info) {
  if (!info?.params) return args;

  const coerced = { ...args };

  for (const [key, value] of Object.entries(coerced)) {
    const paramInfo = info.params[key];
    if (!paramInfo) continue;

    if (
      (paramInfo.type === 'number' || paramInfo.type === 'integer') &&
      typeof value === 'string'
    ) {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        coerced[key] = paramInfo.type === 'integer' ? Math.trunc(num) : num;
      }
    }
  }

  return coerced;
}

/* -------------------------------------------------------------------------- */
/*  Command handler                                                           */
/* -------------------------------------------------------------------------- */

module.exports = async function walletCall(argv, { serverName = 'wallet' } = {}) {
  const method = argv[0];

  // No method given — show categorized list
  if (!method) {
    showMethodsList();
    process.exit(1);
  }

  // Unknown method — try fuzzy match
  if (!METHODS.includes(method)) {
    const suggestion = findClosestMethod(method);
    if (suggestion) {
      showMethodsList(
        pc.yellow(`Unknown method "${method}".`) + ` Did you mean ${pc.cyan(suggestion)}?`,
      );
    } else {
      showMethodsList(pc.yellow(`Unknown method "${method}".`));
    }
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
      console.log(pc.dim(`  Run fdx wallet call ${method} --help to see accepted parameters.`));
      console.log('');
    }
  }

  // Coerce types (string → number/integer) based on schema
  const coercedArgs = coerceArgs(args, info);

  const client = createClientFromEnv(serverName);
  const spinner = createSpinner(`Calling ${pc.cyan(method)}...`).start();

  try {
    const result = await client[method](coercedArgs);

    if (result.error) {
      spinner.error({ text: `${method} failed` });
      console.error(JSON.stringify({ error: result.error }, null, 2));
      console.error(pc.dim(`  Run fdx wallet call ${method} --help for usage details.`));
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
    console.error(pc.dim(`  Run fdx wallet call ${method} --help for usage details.`));
    process.exit(1);
  } finally {
    await client.close().catch(() => {});
  }
};
