const assert = require('node:assert');
const { describe, it } = require('node:test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const fdx = path.join(__dirname, '../../bin/fdx.js');
const pkg = require('../../package.json');

// Run fdx CLI and return { stdout, stderr, exitCode }
function run(...args) {
  try {
    const stdout = execFileSync('node', [fdx, ...args], {
      encoding: 'utf8',
      env: { ...process.env, FDX_MCP_SERVER: undefined },
      timeout: 5000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status,
    };
  }
}

describe('CLI commands (no auth)', () => {
  describe('fdx --version', () => {
    it('should print the package version', () => {
      const { stdout, exitCode } = run('--version');
      assert.strictEqual(exitCode, 0);
      assert.strictEqual(stdout.trim(), pkg.version);
    });
  });

  describe('fdx servers', () => {
    it('should list wallet and prism servers', () => {
      const { stdout, exitCode } = run('servers');
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('wallet'), 'should list wallet server');
      assert.ok(stdout.includes('prism'), 'should list prism server');
    });

    it('should show usage hint', () => {
      const { stdout } = run('servers');
      assert.ok(stdout.includes('fdx <server> call <method>'), 'should show usage pattern');
    });
  });

  describe('fdx call (deprecated)', () => {
    it('should exit with code 1', () => {
      const { exitCode } = run('call', 'getMyInfo');
      assert.strictEqual(exitCode, 1);
    });

    it('should show deprecation warning', () => {
      const { stdout } = run('call', 'getMyInfo');
      assert.ok(stdout.includes('deprecated'), 'should mention deprecation');
    });

    it('should hint to use fdx <server> call', () => {
      const { stdout } = run('call', 'getMyInfo');
      assert.ok(stdout.includes('fdx <server> call <method>'), 'should show correct usage');
    });

    it('should mention fdx servers command', () => {
      const { stdout } = run('call');
      assert.ok(stdout.includes('fdx servers'), 'should hint about servers command');
    });
  });

  describe('fdx wallet call (no method)', () => {
    it('should show categorized method list', () => {
      const { stdout } = run('wallet', 'call');
      assert.ok(stdout.includes('Wallet'), 'should have Wallet category');
      assert.ok(stdout.includes('Transfer'), 'should have Transfer category');
      assert.ok(stdout.includes('Swap'), 'should have Swap category');
      assert.ok(stdout.includes('Yield'), 'should have Yield category');
      assert.ok(stdout.includes('Payment'), 'should have Payment category');
      assert.ok(stdout.includes('Account'), 'should have Account category');
      assert.ok(stdout.includes('Support'), 'should have Support category');
    });

    it('should list known methods', () => {
      const { stdout } = run('wallet', 'call');
      assert.ok(stdout.includes('getTokenPrice'), 'should list getTokenPrice');
      assert.ok(stdout.includes('transferTokens'), 'should list transferTokens');
      assert.ok(stdout.includes('swapTokens'), 'should list swapTokens');
      assert.ok(stdout.includes('getMyInfo'), 'should list getMyInfo');
    });

    it('should show help hint', () => {
      const { stdout } = run('wallet', 'call');
      assert.ok(stdout.includes('--help'), 'should mention --help for details');
    });
  });

  describe('fdx wallet call <method> --help', () => {
    it('should show parameter details for getTokenPrice', () => {
      const { stdout } = run('wallet', 'call', 'getTokenPrice', '--help');
      assert.ok(stdout.includes('token'), 'should show token param');
      assert.ok(stdout.includes('Required'), 'should indicate required params');
    });

    it('should show parameter details for transferTokens', () => {
      const { stdout } = run('wallet', 'call', 'transferTokens', '--help');
      assert.ok(stdout.includes('toAddress'), 'should show toAddress param');
      assert.ok(stdout.includes('amount'), 'should show amount param');
      assert.ok(stdout.includes('chainKey'), 'should show chainKey param');
    });
  });

  describe('fdx --help', () => {
    it('should list all top-level commands', () => {
      const { stdout, exitCode } = run('--help');
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('register'), 'should list register');
      assert.ok(stdout.includes('login'), 'should list login');
      assert.ok(stdout.includes('wallet'), 'should list wallet');
      assert.ok(stdout.includes('prism'), 'should list prism');
      assert.ok(stdout.includes('servers'), 'should list servers');
    });

    it('should show environment variable docs', () => {
      const { stdout } = run('--help');
      assert.ok(stdout.includes('FDX_WALLET_MCP_URL'), 'should document wallet URL env var');
      assert.ok(stdout.includes('FDX_PRISM_MCP_URL'), 'should document prism URL env var');
    });
  });
});
