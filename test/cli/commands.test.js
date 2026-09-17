const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

const fdx = path.join(__dirname, '../../bin/fdx.js');
const pkg = require('../../package.json');

const EMPTY_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'fdx-cli-home-'));

function run(...args) {
  const extraEnv = args.length && args[args.length - 1] instanceof Object ? args.pop() : {};
  const argv = args.filter((a) => a != null);

  const result = spawnSync('node', [fdx, ...argv], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FDX_MCP_SERVER: undefined,
      HOME: EMPTY_HOME,
      USERPROFILE: EMPTY_HOME,
      ...extraEnv,
    },
    timeout: 30000,
  });

  if (result.error) {
    throw new Error(
      `fdx ${argv.join(' ')} did not run: ${result.error.code || result.error.message}`,
    );
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status,
  };
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

  describe('fdx config', () => {
    it('should label a persisted value as (config) and an override as (env)', () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fdx-cli-config-'));
      const homeEnv = { HOME: home, USERPROFILE: home };
      try {
        run('config', 'set', 'prism_mcp_url', 'https://prism-persisted.example', homeEnv);

        const persisted = run('config', null, null, null, homeEnv)
          .stdout.split('\n')
          .find((l) => l.includes('https://prism-persisted.example'));
        assert.ok(persisted, 'persisted value should be shown');
        assert.ok(persisted.includes('(config)'), `expected (config), got: ${persisted}`);

        const overridden = run('config', null, null, null, {
          ...homeEnv,
          FDX_PRISM_MCP_URL: 'https://prism-from-env.example',
        })
          .stdout.split('\n')
          .find((l) => l.includes('https://prism-from-env.example'));
        assert.ok(overridden, 'env value should be shown');
        assert.ok(overridden.includes('(env)'), `expected (env), got: ${overridden}`);
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });

    it('should list the persistable keys in help', () => {
      const { stdout, exitCode } = run('config', '--help');
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('wallet_mcp_url'), 'should document a config key');
      assert.ok(stdout.includes('fdx config set'), 'should document the set action');
    });

    it('should reject an unknown action with code 1', () => {
      const { exitCode, stderr } = run('config', 'bogus');
      assert.strictEqual(exitCode, 1);
      assert.ok(stderr.includes('Unknown config action'), 'should name the bad action');
    });

    it('should reject an unknown key with code 1', () => {
      const { exitCode, stderr } = run('config', 'get', 'not_a_key');
      assert.strictEqual(exitCode, 1);
      assert.ok(stderr.includes('Unknown key'), 'should name the bad key');
    });

    it('should require a value for set', () => {
      const { exitCode, stderr } = run('config', 'set', 'authority');
      assert.strictEqual(exitCode, 1);
      assert.ok(stderr.includes('fdx config set <key> <value>'), 'should show set usage');
    });
  });

  describe('failure exits cleanly', () => {
    const ABORT = 3221226505;

    for (const service of ['wallet', 'prism']) {
      it(`fdx ${service} exits 1 after an async failure, not an abort`, () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), `fdx-cli-${service}-`));
        try {
          const { exitCode } = run(service, 'someMethod', {
            HOME: home,
            USERPROFILE: home,
            FDX_WALLET_MCP_URL: 'http://localhost:1',
            FDX_PRISM_MCP_URL: 'http://localhost:1',
            FDX_STORE_PATH: path.join(home, 'auth.json'),
          });
          assert.notStrictEqual(exitCode, ABORT, 'process aborted instead of exiting');
          assert.strictEqual(exitCode, 1, `expected exit 1, got ${exitCode}`);
        } finally {
          fs.rmSync(home, { recursive: true, force: true });
        }
      });
    }

    it('fdx call getMyInfo exits 1 without aborting', () => {
      const { exitCode } = run('call', 'getMyInfo');
      assert.notStrictEqual(exitCode, ABORT, 'process aborted instead of exiting');
      assert.strictEqual(exitCode, 1, `expected exit 1, got ${exitCode}`);
    });
  });

  describe('unreadable config file', () => {
    function corruptHome() {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fdx-cli-corrupt-'));
      fs.mkdirSync(path.join(home, '.fdx'), { recursive: true });
      fs.writeFileSync(path.join(home, '.fdx', 'config.json'), '{ not json');
      return home;
    }

    it('should not stop unrelated commands from running', () => {
      const home = corruptHome();
      try {
        const { stdout, stderr, exitCode } = run('--version', { HOME: home, USERPROFILE: home });
        assert.strictEqual(exitCode, 0);
        assert.strictEqual(stdout.trim(), pkg.version);
        assert.ok(stderr.includes('Warning'), 'should warn about the unreadable file');
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });

    it('should report the path and the repair for fdx config', () => {
      const home = corruptHome();
      try {
        const { stderr, exitCode } = run('config', { HOME: home, USERPROFILE: home });
        assert.strictEqual(exitCode, 1);
        assert.ok(stderr.includes('config.json'), 'should name the file');
        assert.ok(stderr.includes('Delete or repair'), 'should state the repair');
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });

    it('should let fdx config unset clear the broken file', () => {
      const home = corruptHome();
      try {
        const { exitCode } = run('config', 'unset', 'prism_mcp_url', {
          HOME: home,
          USERPROFILE: home,
        });
        assert.strictEqual(exitCode, 0, 'the repair path must succeed');

        const repaired = run('config', 'get', 'prism_mcp_url', { HOME: home, USERPROFILE: home });
        assert.strictEqual(repaired.exitCode, 0);
        assert.ok(repaired.stdout.includes('not set'), 'config should be readable again');
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });
  });
});
