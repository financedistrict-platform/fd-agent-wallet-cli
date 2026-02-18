'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const fsAsync = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { Logger } = require('../../src/utils/logger');

describe('Logger', () => {
  let tmpDir;
  let logPath;

  beforeEach(async () => {
    tmpDir = await fsAsync.mkdtemp(path.join(os.tmpdir(), 'fdx-logger-'));
    logPath = path.join(tmpDir, 'test.log');
  });

  afterEach(async () => {
    await fsAsync.rm(tmpDir, { recursive: true, force: true });
  });

  function readLines() {
    const raw = fs.readFileSync(logPath, 'utf8').trim();
    return raw.split('\n').map((l) => JSON.parse(l));
  }

  it('should write a JSON line for each log call', () => {
    const logger = new Logger({ logPath, level: 'debug' });
    logger.info('hello world');
    const [line] = readLines();
    assert.strictEqual(line.level, 'info');
    assert.strictEqual(line.msg, 'hello world');
    assert.ok(line.ts, 'should have a timestamp');
  });

  it('should include data when provided', () => {
    const logger = new Logger({ logPath, level: 'debug' });
    logger.info('event', { tool: 'getMyInfo', code: 42 });
    const [line] = readLines();
    assert.deepStrictEqual(line.data, { tool: 'getMyInfo', code: 42 });
  });

  it('should omit data key when no data is provided', () => {
    const logger = new Logger({ logPath, level: 'debug' });
    logger.info('no data');
    const [line] = readLines();
    assert.strictEqual(Object.hasOwn(line, 'data'), false, 'data key should be absent');
  });

  it('should write all levels in order', () => {
    const logger = new Logger({ logPath, level: 'debug' });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    const lines = readLines();
    assert.deepStrictEqual(
      lines.map((l) => l.level),
      ['debug', 'info', 'warn', 'error'],
    );
  });

  it('should suppress messages below the configured level', () => {
    const logger = new Logger({ logPath, level: 'warn' });
    logger.debug('ignored');
    logger.info('also ignored');
    logger.warn('visible');
    logger.error('also visible');
    const lines = readLines();
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0].level, 'warn');
    assert.strictEqual(lines[1].level, 'error');
  });

  it('should suppress all messages when level is off', () => {
    const logger = new Logger({ logPath, level: 'off' });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    assert.strictEqual(fs.existsSync(logPath), false, 'log file should not be created');
  });

  it('should create parent directories automatically', async () => {
    const nestedLog = path.join(tmpDir, 'a', 'b', 'c', 'nested.log');
    const logger = new Logger({ logPath: nestedLog, level: 'info' });
    logger.info('nested');
    assert.ok(fs.existsSync(nestedLog), 'log file should be created inside nested dirs');
  });

  it('should rotate the log file when it exceeds MAX_BYTES', () => {
    const logger = new Logger({ logPath, level: 'info' });

    // Write enough data to trigger rotation by temporarily lowering MAX_BYTES
    // We do this by filling the file manually then triggering a write
    const bigContent = 'x'.repeat(5 * 1024 * 1024); // 5 MB
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, bigContent, 'utf8');

    logger.info('after rotation');

    const backup = logPath + '.1';
    assert.ok(fs.existsSync(backup), 'backup .1 file should exist after rotation');
    // Current log should only contain the new entry
    const [line] = readLines();
    assert.strictEqual(line.msg, 'after rotation');
  });

  it('should overwrite any existing backup when rotating', () => {
    const logger = new Logger({ logPath, level: 'info' });
    const backup = logPath + '.1';

    // Pre-create a stale backup
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(backup, 'old backup', 'utf8');
    fs.writeFileSync(logPath, 'x'.repeat(5 * 1024 * 1024), 'utf8');

    logger.info('rotate again');

    assert.ok(fs.existsSync(backup));
    // Backup should now be the rotated log (not the stale one)
    assert.notStrictEqual(fs.readFileSync(backup, 'utf8'), 'old backup');
  });

  it('should not throw when the log directory is not writable', () => {
    // Use a path that can't be created
    const impossiblePath = path.join(tmpDir, '\0', 'log.txt');
    const logger = new Logger({ logPath: impossiblePath, level: 'info' });
    assert.doesNotThrow(() => logger.info('should silently fail'));
  });
});
