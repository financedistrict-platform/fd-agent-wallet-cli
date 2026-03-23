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

  describe('fdx services', () => {
    it('should list wallet and prism services', () => {
      const { stdout, exitCode } = run('services');
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('wallet'), 'should list wallet service');
      assert.ok(stdout.includes('prism'), 'should list prism service');
    });

    it('should show usage hint', () => {
      const { stdout } = run('services');
      assert.ok(stdout.includes('fdx <service> <method>'), 'should show usage pattern');
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

    it('should hint to use fdx <service> <method>', () => {
      const { stdout } = run('call', 'getMyInfo');
      assert.ok(stdout.includes('fdx <service> <method>'), 'should show correct usage');
    });

    it('should mention fdx services command', () => {
      const { stdout } = run('call');
      assert.ok(stdout.includes('fdx services'), 'should hint about services command');
    });
  });

  // fdx wallet call tests removed — now dynamic via MCP, requires auth

  describe('fdx --help', () => {
    it('should list all top-level commands', () => {
      const { stdout, exitCode } = run('--help');
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('register'), 'should list register');
      assert.ok(stdout.includes('login'), 'should list login');
      assert.ok(stdout.includes('wallet'), 'should list wallet');
      assert.ok(stdout.includes('prism'), 'should list prism');
      assert.ok(stdout.includes('services'), 'should list services');
    });

    it('should show environment variable docs', () => {
      const { stdout } = run('--help');
      assert.ok(stdout.includes('FDX_WALLET_MCP_URL'), 'should document wallet URL env var');
      assert.ok(stdout.includes('FDX_PRISM_MCP_URL'), 'should document prism URL env var');
    });
  });
});
