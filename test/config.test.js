'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const fsAsync = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, it } = require('node:test');

const CONFIG_MODULE = require.resolve('../src/config');
const ENV_KEYS = [
  'FDX_AUTHORITY',
  'FDX_CLIENT_ID',
  'FDX_SCOPES',
  'FDX_WALLET_MCP_URL',
  'FDX_PRISM_MCP_URL',
  'FDX_STORE_PATH',
  'FDX_LOG_PATH',
  'FDX_LOG_LEVEL',
];

describe('config', () => {
  let tmpHome;
  let savedHome;
  let savedUserProfile;
  let savedEnv;

  function loadConfig() {
    delete require.cache[CONFIG_MODULE];
    return require('../src/config');
  }

  beforeEach(async () => {
    tmpHome = await fsAsync.mkdtemp(path.join(os.tmpdir(), 'fdx-config-'));
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;

    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;

    delete require.cache[CONFIG_MODULE];
    await fsAsync.rm(tmpHome, { recursive: true, force: true });
  });

  describe('readConfig', () => {
    it('returns an empty object when no config file exists', () => {
      const { readConfig } = loadConfig();
      assert.deepStrictEqual(readConfig(), {});
    });

    it('returns the persisted values', () => {
      const { readConfig, writeConfig } = loadConfig();
      writeConfig({ authority: 'https://auth.example' });
      assert.deepStrictEqual(readConfig(), { authority: 'https://auth.example' });
    });

    it('throws on malformed JSON instead of silently discarding config', () => {
      const { readConfig, CONFIG_PATH } = loadConfig();
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, '{ not json');
      assert.throws(() => readConfig());
    });

    it('reads back a persisted falsy value', () => {
      const { readConfig, writeConfig } = loadConfig();
      writeConfig({ log_level: '' });
      assert.strictEqual(readConfig().log_level, '');
    });
  });

  describe('writeConfig', () => {
    it('creates the parent directory and writes pretty JSON', () => {
      const { writeConfig, CONFIG_PATH } = loadConfig();
      writeConfig({ log_level: 'debug' });
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      assert.strictEqual(raw, '{\n  "log_level": "debug"\n}\n');
    });

    it('replaces the whole file so removed keys do not linger', () => {
      const { readConfig, writeConfig } = loadConfig();
      writeConfig({ authority: 'a', scopes: 'b' });
      writeConfig({ authority: 'a' });
      assert.deepStrictEqual(readConfig(), { authority: 'a' });
    });
  });

  describe('loadConfigIntoEnv', () => {
    it('maps persisted keys onto their env vars', () => {
      const { writeConfig, loadConfigIntoEnv } = loadConfig();
      writeConfig({ authority: 'https://auth.example', prism_mcp_url: 'https://prism.example' });

      loadConfigIntoEnv();

      assert.strictEqual(process.env.FDX_AUTHORITY, 'https://auth.example');
      assert.strictEqual(process.env.FDX_PRISM_MCP_URL, 'https://prism.example');
    });

    it('never overrides a value already present in the environment', () => {
      const { writeConfig, loadConfigIntoEnv } = loadConfig();
      writeConfig({ authority: 'https://from-config' });
      process.env.FDX_AUTHORITY = 'https://from-env';

      loadConfigIntoEnv();

      assert.strictEqual(process.env.FDX_AUTHORITY, 'https://from-env');
    });

    it('ignores keys that are not recognised', () => {
      const { writeConfig, loadConfigIntoEnv } = loadConfig();
      writeConfig({ not_a_real_key: 'value' });

      loadConfigIntoEnv();

      assert.strictEqual(process.env.FDX_NOT_A_REAL_KEY, undefined);
    });

    it('is a no-op when no config file exists', () => {
      const { loadConfigIntoEnv } = loadConfig();
      loadConfigIntoEnv();
      assert.strictEqual(process.env.FDX_AUTHORITY, undefined);
    });

    it('warns and continues when the config file is unreadable', () => {
      const { loadConfigIntoEnv, CONFIG_PATH } = loadConfig();
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, '{ not json');

      const warnings = [];
      const originalError = console.error;
      console.error = (...args) => warnings.push(args.join(' '));
      try {
        assert.doesNotThrow(() => loadConfigIntoEnv());
      } finally {
        console.error = originalError;
      }

      assert.strictEqual(warnings.length, 1, 'should warn exactly once');
      assert.ok(warnings[0].includes(CONFIG_PATH), 'warning should name the file');
    });

    it('copies a persisted falsy value into the environment', () => {
      const { writeConfig, loadConfigIntoEnv } = loadConfig();
      writeConfig({ log_level: '' });

      loadConfigIntoEnv();

      assert.strictEqual(process.env.FDX_LOG_LEVEL, '');
    });
  });

  describe('KNOWN_KEYS', () => {
    it('maps every key to an FDX_ env var', () => {
      const { KNOWN_KEYS } = loadConfig();
      for (const [key, envVar] of Object.entries(KNOWN_KEYS)) {
        assert.ok(envVar.startsWith('FDX_'), `${key} should map to an FDX_ env var`);
      }
    });
  });
});
