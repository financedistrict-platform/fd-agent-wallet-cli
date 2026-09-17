const assert = require('node:assert');
const { describe, it, beforeEach, afterEach, mock } = require('node:test');

describe('wallet-call', () => {
  let originalCreateClientFromEnv;
  let originalExitCode;
  let srcModule;
  let consoleOutput;
  let consoleErrors;

  const exitCode = () => process.exitCode ?? null;

  beforeEach(() => {
    consoleOutput = [];
    consoleErrors = [];
    mock.method(console, 'log', (...args) => consoleOutput.push(args.join(' ')));
    mock.method(console, 'error', (...args) => consoleErrors.push(args.join(' ')));

    originalExitCode = process.exitCode;
    process.exitCode = undefined;

    srcModule = require('../src');
    originalCreateClientFromEnv = srcModule.createClientFromEnv;
  });

  afterEach(() => {
    srcModule.createClientFromEnv = originalCreateClientFromEnv;
    process.exitCode = originalExitCode;
    mock.restoreAll();
    delete require.cache[require.resolve('../bin/commands/wallet-call')];
  });

  function mockClient({ tools = [], callToolResult = null } = {}) {
    const calls = [];
    srcModule.createClientFromEnv = (serviceName) => {
      calls.push({ serviceName });
      return {
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

  it('coerces args to the types declared in the tool inputSchema', async () => {
    const calls = mockClient({
      tools: [
        {
          name: 'updateWalletSettings',
          inputSchema: {
            properties: {
              networkWallets: { type: 'object' },
              projectId: { type: ['string', 'null'] },
            },
          },
        },
      ],
    });
    const walletCall = require('../bin/commands/wallet-call');

    await walletCall([
      'updateWalletSettings',
      '--networkWallets',
      '{"eip155:97":"0xabc"}',
      '--projectId',
      '4e6dadec-452b-43c6-8782-2fecef3d609f',
    ]);

    const sent = calls.find((c) => c.callTool).args;
    assert.deepStrictEqual(sent.networkWallets, { 'eip155:97': '0xabc' });
    assert.strictEqual(sent.projectId, '4e6dadec-452b-43c6-8782-2fecef3d609f');
  });

  it('exits 1 with a named error when a structured arg is not valid JSON', async () => {
    const calls = mockClient({
      tools: [
        {
          name: 'updateWalletSettings',
          inputSchema: { properties: { networkWallets: { type: 'object' } } },
        },
      ],
    });
    const walletCall = require('../bin/commands/wallet-call');

    await walletCall(['updateWalletSettings', '--networkWallets', 'not-json']);

    assert.strictEqual(exitCode(), 1);
    assert.ok(!calls.some((c) => c.callTool), 'should not reach the server');
    const errors = consoleErrors.join('\n');
    assert.ok(errors.includes('--networkWallets'), 'should name the offending param');
    assert.ok(errors.includes('JSON object'), 'should state the expected type');
    assert.ok(errors.includes('--help'), 'should point at the help text');
  });

  it('exits 1 for an unknown method', async () => {
    mockClient({ tools: [{ name: 'realMethod' }] });
    const walletCall = require('../bin/commands/wallet-call');

    await walletCall(['nonexistent']);

    assert.strictEqual(exitCode(), 1);
  });

  it('exits 1 when the tool returns an error', async () => {
    mockClient({
      tools: [{ name: 'someMethod' }],
      callToolResult: { error: { code: 'FAIL', message: 'bad' } },
    });
    const walletCall = require('../bin/commands/wallet-call');

    await walletCall(['someMethod']);

    assert.strictEqual(exitCode(), 1);
  });

  it('leaves the exit code untouched on success', async () => {
    mockClient({ tools: [{ name: 'someMethod' }], callToolResult: { data: { ok: true } } });
    const walletCall = require('../bin/commands/wallet-call');

    await walletCall(['someMethod']);

    assert.strictEqual(exitCode(), null);
  });
});
