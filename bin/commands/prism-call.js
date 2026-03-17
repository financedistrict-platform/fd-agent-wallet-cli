const pc = require('picocolors');

const { createClientFromEnv } = require('../../src');
const { parseArgs } = require('../../src/utils/args');

const createSpinner = require('../helpers/spinner');

async function showToolsList() {
  const client = createClientFromEnv('prism');
  const spinner = createSpinner('Fetching Prism tools...').start();

  try {
    await client.connectMcp();
    const tools = await client.listTools();
    spinner.success({ text: `${tools.length} tools available` });

    console.log('');
    console.log(`Usage: fdx prism call ${pc.cyan('<method>')} [--param value ...]`);
    console.log('');

    for (const tool of tools) {
      console.log(`  ${pc.cyan(tool.name.padEnd(35))} ${pc.dim(tool.description || '')}`);
    }

    console.log('');
    console.log(pc.dim('Run fdx prism call <method> --help for parameter details.'));
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

async function showToolHelp(method) {
  const client = createClientFromEnv('prism');
  const spinner = createSpinner(`Fetching ${method} schema...`).start();

  try {
    await client.connectMcp();
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === method);

    if (!tool) {
      spinner.error({ text: `Unknown tool: ${method}` });
      const match = tools.find((t) => t.name.toLowerCase().includes(method.toLowerCase()));
      if (match) console.log(pc.yellow(`Did you mean ${pc.cyan(match.name)}?`));
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
    console.log(`  fdx prism call ${method} ${exampleArgs}`);
  } catch (error) {
    spinner.error({ text: 'Failed to fetch schema' });
    console.error(pc.red(error.message));
    process.exit(1);
  } finally {
    await client.close().catch(() => {});
  }
}

module.exports = async function prismCall(argv) {
  const method = argv[0];

  if (!method) {
    await showToolsList();
    return;
  }

  if (argv.slice(1).includes('--help')) {
    await showToolHelp(method);
    return;
  }

  const args = parseArgs(argv.slice(1));
  const client = createClientFromEnv('prism');
  const spinner = createSpinner(`Calling ${pc.cyan(method)}...`).start();
  let exitCode = 0;

  try {
    await client.connectMcp();
    const result = await client.callMcpTool(method, args);

    if (result.error) {
      spinner.error({ text: `${method} failed` });
      console.error(JSON.stringify({ error: result.error }, null, 2));
      exitCode = 1;
      return;
    }

    spinner.success({ text: method });
    console.log(JSON.stringify(result.data, null, 2));
  } catch (error) {
    spinner.error({ text: `${method} failed` });
    console.error(pc.red(error.message));
    exitCode = 1;
  } finally {
    await client.close().catch(() => {});
    if (exitCode) process.exit(exitCode);
  }
};
