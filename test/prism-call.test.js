const assert = require('node:assert');
const { describe, it, beforeEach, afterEach, mock } = require('node:test');

describe('prism-call', () => {
  let originalCreateClientFromEnv;
  let originalExitCode;
  let srcModule;
  let consoleOutput;
  let consoleErrors;

  const exitCode = () => process.exitCode ?? null;

  beforeEach(() => {
    // Capture console output
    consoleOutput = [];
    consoleErrors = [];
    mock.method(console, 'log', (...args) => consoleOutput.push(args.join(' ')));
    mock.method(console, 'error', (...args) => consoleErrors.push(args.join(' ')));

    originalExitCode = process.exitCode;
    process.exitCode = undefined;

    // Mock createClientFromEnv
    srcModule = require('../src');
    originalCreateClientFromEnv = srcModule.createClientFromEnv;
  });

  afterEach(() => {
    srcModule.createClientFromEnv = originalCreateClientFromEnv;
    process.exitCode = originalExitCode;
    mock.restoreAll();
    // Clear require cache for prism-call so mocks apply fresh
    delete require.cache[require.resolve('../bin/commands/prism-call')];
  });

  function mockClient({ tools = [], callToolResult = null, connectError = null } = {}) {
    const calls = [];
    srcModule.createClientFromEnv = (serviceName) => {
      calls.push({ serviceName });
      return {
        connectMcp: async () => {
          if (connectError) throw connectError;
        },
        listTools: async () => tools,
        callMcpTool: async (name, args) => {
          calls.push({ callTool: name, args });
          return callToolResult || { data: { ok: true } };
        },
        close: async () => {},
      };
    };
    return calls;
  }

  it('creates client with prism MCP name', async () => {
    const calls = mockClient({ tools: [] });
    const prismCall = require('../bin/commands/prism-call');

    await prismCall([]);

    assert.strictEqual(calls[0].serviceName, 'prism');
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

    await prismCall(['nonexistent', '--help']);

    assert.strictEqual(exitCode(), 1);
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

  it('coerces args to the types declared in the tool inputSchema', async () => {
    const calls = mockClient({
      tools: [
        {
          name: 'createProjectFromWizard',
          inputSchema: {
            properties: {
              projectName: { type: 'string' },
              networkIds: { type: 'array' },
              addresses: { type: 'object' },
              fxBufferBasisPoints: { type: 'integer' },
            },
          },
        },
      ],
    });
    const prismCall = require('../bin/commands/prism-call');

    await prismCall([
      'createProjectFromWizard',
      '--projectName',
      'Acme',
      '--networkIds',
      '["eth","base"]',
      '--addresses',
      '{"eth":"0x00abc"}',
      '--fxBufferBasisPoints',
      '50',
    ]);

    const invocation = calls.find((c) => c.callTool === 'createProjectFromWizard');
    assert.deepStrictEqual(invocation.args, {
      projectName: 'Acme',
      networkIds: ['eth', 'base'],
      addresses: { eth: '0x00abc' },
      fxBufferBasisPoints: 50,
    });
  });

  it('exits 1 with a named error when a structured arg is not valid JSON', async () => {
    const calls = mockClient({
      tools: [
        {
          name: 'updateSettlementNetworks',
          inputSchema: { properties: { networks: { type: 'array' } } },
        },
      ],
    });
    const prismCall = require('../bin/commands/prism-call');

    await prismCall(['updateSettlementNetworks', '--networks', 'not-json']);

    assert.strictEqual(exitCode(), 1);
    assert.ok(!calls.some((c) => c.callTool), 'should not reach the server');
    const errors = consoleErrors.join('\n');
    assert.ok(errors.includes('--networks'), 'should name the offending param');
    assert.ok(errors.includes('JSON array'), 'should state the expected type');
  });

  it('exits 1 when tool returns error', async () => {
    mockClient({
      tools: [],
      callToolResult: { error: { code: 'FAIL', message: 'bad' } },
    });
    const prismCall = require('../bin/commands/prism-call');

    await prismCall(['badTool']);

    assert.strictEqual(exitCode(), 1);
  });
});
