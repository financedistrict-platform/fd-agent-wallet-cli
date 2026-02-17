const assert = require('node:assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { afterEach, describe, it } = require('node:test');

const { readStore, writeStore } = require('../src/storage');

describe('Storage', () => {
  const tmpFiles = [];

  function tmpPath() {
    const p = path.join(
      os.tmpdir(),
      `fdx-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    tmpFiles.push(p);
    return p;
  }

  afterEach(async () => {
    for (const f of tmpFiles) {
      try {
        await fs.unlink(f);
      } catch {
        // Ignore cleanup errors
      }
    }
    tmpFiles.length = 0;
  });

  describe('readStore', () => {
    it('should throw if storePath is missing', async () => {
      await assert.rejects(() => readStore(null), /storePath is required/);
    });

    it('should return empty object for non-existent file', async () => {
      const store = await readStore('/tmp/does-not-exist-fdx.json');
      assert.deepStrictEqual(store, {});
    });

    it('should read and parse JSON from file', async () => {
      const p = tmpPath();
      await fs.writeFile(p, JSON.stringify({ foo: 'bar' }));
      const store = await readStore(p);
      assert.deepStrictEqual(store, { foo: 'bar' });
    });

    it('should throw on invalid JSON', async () => {
      const p = tmpPath();
      await fs.writeFile(p, 'not-json');
      await assert.rejects(() => readStore(p), SyntaxError);
    });
  });

  describe('writeStore', () => {
    it('should throw if storePath is missing', async () => {
      await assert.rejects(() => writeStore({}, null), /storePath is required/);
    });

    it('should write JSON to file', async () => {
      const p = tmpPath();
      await writeStore({ hello: 'world' }, p);
      const raw = await fs.readFile(p, 'utf8');
      assert.deepStrictEqual(JSON.parse(raw), { hello: 'world' });
    });

    it('should create parent directories', async () => {
      const dir = path.join(os.tmpdir(), `fdx-test-dir-${Date.now()}`);
      const p = path.join(dir, 'nested', 'store.json');
      tmpFiles.push(p);
      await writeStore({ nested: true }, p);
      const raw = await fs.readFile(p, 'utf8');
      assert.deepStrictEqual(JSON.parse(raw), { nested: true });
      // Cleanup nested dirs
      await fs.rm(dir, { recursive: true, force: true });
    });

    it('should overwrite existing file', async () => {
      const p = tmpPath();
      await writeStore({ v: 1 }, p);
      await writeStore({ v: 2 }, p);
      const raw = await fs.readFile(p, 'utf8');
      assert.deepStrictEqual(JSON.parse(raw), { v: 2 });
    });
  });
});
