const assert = require('node:assert');
const { describe, it, beforeEach, afterEach, mock } = require('node:test');

describe('prism-call', () => {
  let originalCreateClientFromEnv;
  let srcModule;
  let exitCode;
  let consoleOutput;
  let consoleErrors;

  beforeEach(() => {
    // Capture console output
    consoleOutput = [];
    consoleErrors = [];
    mock.method(console, 'log', (...args) => consoleOutput.push(args.join(' ')));
    mock.method(console, 'error', (...args) => consoleErrors.push(args.join(' ')));

    // Capture process.exit
    exitCode = null;
    mock.method(process, 'exit', (code) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    });

    // Mock createClientFromEnv
    srcModule = require('../src');
    originalCreateClientFromEnv = srcModule.createClientFromEnv;
  });

  afterEach(() => {
    srcModule.createClientFromEnv = originalCreateClientFromEnv;
    mock.restoreAll();
    // Clear require cache for prism-call so mocks apply fresh
    delete require.cache[require.resolve('../bin/commands/prism-call')];
  });

  function mockClient({ tools = [], callToolResult = null, connectError = null } = {}) {
    const calls = [];
    srcModule.createClientFromEnv = (serverName) => {
      calls.push({ serverName });
      return {
        mcpClient: {
          connect: async () => {
            if (connectError) throw connectError;
          },
          listTools: async () => tools,
          callTool: async (name, args) => {
            calls.push({ callTool: name, args });
            return callToolResult || { data: { ok: true } };
          },
        },
        close: async () => {},
      };
    };
    return calls;
  }

  it('creates client with prism MCP name', async () => {
    const calls = mockClient({ tools: [] });
    const prismCall = require('../bin/commands/prism-call');

    try {
      await prismCall([]);
    } catch {
      // process.exit throws
    }
    assert.strictEqual(calls[0].serverName, 'prism');
  });

  it('lists tools when no method is given', async () => {
    const tools = [
      { name: 'listPayments', description: 'List all payments' },
      { name: 'getProvider', description: 'Get provider info' },
    ];
    mockClient({ tools });
    const prismCall = require('../bin/commands/prism-call');

    await prismCall([]);

    const output = consoleOutput.join('\n');
    assert.ok(output.includes('listPayments'), 'should show listPayments tool');
    assert.ok(output.includes('getProvider'), 'should show getProvider tool');
  });

  it('shows tool help with --help flag', async () => {
    const tools = [
      {
        name: 'createPayment',
        description: 'Create a payment',
        inputSchema: {
          properties: {
            amount: { type: 'number', description: 'Payment amount' },
            currency: { type: 'string', description: 'Currency code' },
          },
          required: ['amount'],
        },
      },
    ];
    mockClient({ tools });
    const prismCall = require('../bin/commands/prism-call');

    await prismCall(['createPayment', '--help']);

    const output = consoleOutput.join('\n');
    assert.ok(output.includes('createPayment'), 'should show tool name');
    assert.ok(output.includes('amount'), 'should show required param');
    assert.ok(output.includes('currency'), 'should show optional param');
  });

  it('exits 1 for unknown tool with --help', async () => {
    mockClient({ tools: [{ name: 'realTool', description: 'exists' }] });
    const prismCall = require('../bin/commands/prism-call');

    try {
      await prismCall(['nonexistent', '--help']);
    } catch {
      // process.exit throws
    }
    assert.strictEqual(exitCode, 1);
  });

  it('invokes tool and prints result', async () => {
    mockClient({
      tools: [],
      callToolResult: { data: { payments: [{ id: 1 }] } },
    });
    const prismCall = require('../bin/commands/prism-call');

    await prismCall(['listPayments', '--status', 'active']);

    const output = consoleOutput.join('\n');
    assert.ok(output.includes('"payments"'), 'should print JSON result');
  });

  it('exits 1 when tool returns error', async () => {
    mockClient({
      tools: [],
      callToolResult: { error: { code: 'FAIL', message: 'bad' } },
    });
    const prismCall = require('../bin/commands/prism-call');

    try {
      await prismCall(['badTool']);
    } catch {
      // process.exit throws
    }
    assert.strictEqual(exitCode, 1);
  });
});
