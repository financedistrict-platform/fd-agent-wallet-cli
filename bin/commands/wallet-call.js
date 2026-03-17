const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');
const { parseArgs } = require('../../src/utils/args');

const createSpinner = require('../helpers/spinner');
const { levenshtein, coerceArgsBySchema } = require('../helpers/wallet-method-registry');

async function showToolsList(serviceName, hint) {
  const client = createClientFromEnv(serviceName);
  const spinner = createSpinner('Fetching wallet tools...').start();

  try {
    await client.connectMcp();
    const tools = await client.listTools();
    spinner.success({ text: `${tools.length} tools available` });

    console.log('');
    console.log(`Usage: fdx wallet call ${pc.cyan('<method>')} [--param value ...]`);
    console.log('');

    for (const tool of tools) {
      console.log(`  ${pc.cyan(tool.name.padEnd(30))} ${pc.dim(tool.description || '')}`);
    }

    console.log('');

    if (hint) {
      console.log(hint);
      console.log('');
    }

    console.log(pc.dim('Run fdx wallet call <method> --help for parameter details.'));
  } catch (error) {
    spinner.error({ text: 'Failed to fetch tools' });
    console.error(pc.red(error.message));
    if (error.message.includes('access token') || error.message.includes('login')) {
      console.error(pc.dim('Run fdx login --email <email> to authenticate first.'));
    }
    process.exit(1);
  } finally {
    await client.close().catch(() => {});
  }
}

async function showToolHelp(serviceName, method) {
  const client = createClientFromEnv(serviceName);
  const spinner = createSpinner(`Fetching ${method} schema...`).start();

  try {
    await client.connectMcp();
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === method);

    if (!tool) {
      spinner.error({ text: `Unknown tool: ${method}` });
      const match = findClosestTool(method, tools.map((t) => t.name));
      if (match) console.log(pc.yellow(`Did you mean ${pc.cyan(match)}?`));
      process.exit(1);
    }

    spinner.success({ text: method });
    console.log('');
    console.log(`${pc.bold(tool.name)} — ${tool.description || '(no description)'}`);
    console.log('');

    const schema = tool.inputSchema;
    if (!schema?.properties || Object.keys(schema.properties).length === 0) {
      console.log(pc.dim('  No parameters required.'));
      return;
    }

    const required = new Set(schema.required || []);
    const reqParams = Object.entries(schema.properties).filter(([k]) => required.has(k));
    const optParams = Object.entries(schema.properties).filter(([k]) => !required.has(k));

    if (reqParams.length > 0) {
      console.log(pc.underline('Required:'));
      for (const [name, prop] of reqParams) {
        const type = prop.type || 'string';
        console.log(`  --${name.padEnd(24)} ${pc.dim(`<${type}>`)}  ${prop.description || ''}`);
      }
      console.log('');
    }

    if (optParams.length > 0) {
      console.log(pc.underline('Optional:'));
      for (const [name, prop] of optParams) {
        const type = prop.type || 'string';
        console.log(`  --${name.padEnd(24)} ${pc.dim(`<${type}>`)}  ${prop.description || ''}`);
      }
      console.log('');
    }

    const exampleArgs = reqParams.map(([name]) => `--${name} "..."`).join(' ');
    console.log(pc.dim('Example:'));
    console.log(`  fdx wallet call ${method} ${exampleArgs}`);
  } catch (error) {
    spinner.error({ text: 'Failed to fetch schema' });
    console.error(pc.red(error.message));
    process.exit(1);
  } finally {
    await client.close().catch(() => {});
  }
}

function findClosestTool(input, methods) {
  const lower = input.toLowerCase();

  const exact = methods.find((m) => m.toLowerCase() === lower);
  if (exact) return exact;

  const prefixMatches = methods.filter((m) => m.toLowerCase().startsWith(lower));
  if (prefixMatches.length === 1) return prefixMatches[0];

  const substringMatches = methods.filter((m) => m.toLowerCase().includes(lower));
  if (substringMatches.length === 1) return substringMatches[0];

  const scored = methods
    .map((m) => ({ method: m, dist: levenshtein(lower, m.toLowerCase()) }))
    .sort((a, b) => a.dist - b.dist);

  const best = scored[0];
  if (!best) return null;
  const threshold = Math.ceil(Math.max(lower.length, best.method.length) * 0.4);
  if (best.dist <= threshold) return best.method;

  return null;
}

module.exports = async function walletCall(argv, { serviceName = 'wallet' } = {}) {
  const method = argv[0];

  if (!method) {
    await showToolsList(serviceName);
    return;
  }

  if (argv.slice(1).includes('--help')) {
    await showToolHelp(serviceName, method);
    return;
  }

  const args = parseArgs(argv.slice(1));
  const client = createClientFromEnv(serviceName);
  const spinner = createSpinner(`Calling ${pc.cyan(method)}...`).start();

  try {
    await client.connectMcp();

    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === method);

    if (!tool) {
      spinner.error({ text: `Unknown method: ${method}` });
      const suggestion = findClosestTool(method, tools.map((t) => t.name));
      if (suggestion) {
        console.log(pc.yellow(`Did you mean ${pc.cyan(suggestion)}?`));
      }
      console.log(pc.dim('Run fdx wallet call to see all available methods.'));
      process.exit(1);
    }

    const coercedArgs = coerceArgsBySchema(args, tool.inputSchema);
    const result = await client.callMcpTool(method, coercedArgs);

    if (result.error) {
      spinner.error({ text: `${method} failed` });
      console.error(JSON.stringify({ error: result.error }, null, 2));
      console.error(pc.dim(`  Run fdx wallet call ${method} --help for usage details.`));
      process.exit(1);
    }

    spinner.success({ text: method });
    console.log(JSON.stringify(result.data, null, 2));
  } catch (error) {
    spinner.error({ text: `${method} failed` });
    console.error(pc.red(error.message));
    process.exit(1);
  } finally {
    await client.close().catch(() => {});
  }
};
