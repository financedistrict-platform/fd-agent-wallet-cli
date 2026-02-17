const assert = require('node:assert');
const { describe, it } = require('node:test');

const { parseArgs, parseValue } = require('../../src/utils/args');

describe('CLI Argument Parser', () => {
  describe('parseArgs', () => {
    it('should parse string arguments', () => {
      const args = parseArgs(['--name', 'Alice', '--city', 'Berlin']);
      assert.deepStrictEqual(args, { name: 'Alice', city: 'Berlin' });
    });

    it('should parse boolean flags', () => {
      const args = parseArgs(['--verbose', '--debug']);
      assert.deepStrictEqual(args, { verbose: true, debug: true });
    });

    it('should parse number arguments', () => {
      const args = parseArgs(['--port', '8080', '--count', '42']);
      assert.deepStrictEqual(args, { port: 8080, count: 42 });
    });

    it('should parse "true" and "false" as booleans', () => {
      const args = parseArgs(['--enabled', 'true', '--disabled', 'false']);
      assert.deepStrictEqual(args, { enabled: true, disabled: false });
    });

    it('should handle mixed argument types', () => {
      const args = parseArgs(['--name', 'Bob', '--age', '30', '--active', 'true', '--verbose']);
      assert.deepStrictEqual(args, { name: 'Bob', age: 30, active: true, verbose: true });
    });

    it('should handle empty argv', () => {
      const args = parseArgs([]);
      assert.deepStrictEqual(args, {});
    });

    it('should handle arguments with spaces in values', () => {
      const args = parseArgs(['--message', 'Hello World']);
      assert.deepStrictEqual(args, { message: 'Hello World' });
    });

    it('should treat flag at end as boolean', () => {
      const args = parseArgs(['--name', 'Alice', '--verbose']);
      assert.deepStrictEqual(args, { name: 'Alice', verbose: true });
    });

    it('should handle consecutive flags', () => {
      const args = parseArgs(['--flag1', '--flag2', '--name', 'test']);
      assert.deepStrictEqual(args, { flag1: true, flag2: true, name: 'test' });
    });

    it('should parse decimal numbers', () => {
      const args = parseArgs(['--amount', '0.5', '--price', '99.99']);
      assert.deepStrictEqual(args, { amount: 0.5, price: 99.99 });
    });

    it('should parse number-like string with whitespace', () => {
      const args = parseArgs(['--value', ' 123 ']);
      assert.strictEqual(args.value, 123);
    });
  });

  describe('parseValue', () => {
    it('should parse "true" as boolean', () => {
      assert.strictEqual(parseValue('true'), true);
    });

    it('should parse "false" as boolean', () => {
      assert.strictEqual(parseValue('false'), false);
    });

    it('should parse integer strings as numbers', () => {
      assert.strictEqual(parseValue('42'), 42);
      assert.strictEqual(parseValue('0'), 0);
      assert.strictEqual(parseValue('-10'), -10);
    });

    it('should parse decimal strings as numbers', () => {
      assert.strictEqual(parseValue('3.14'), 3.14);
      assert.strictEqual(parseValue('0.001'), 0.001);
    });

    it('should preserve hex strings as strings', () => {
      assert.strictEqual(parseValue('0xABC'), '0xABC');
      assert.strictEqual(parseValue('0x10'), '0x10');
      assert.strictEqual(
        parseValue('0x1234567890abcdef1234567890abcdef12345678'),
        '0x1234567890abcdef1234567890abcdef12345678',
      );
    });

    it('should return string for non-numeric text', () => {
      assert.strictEqual(parseValue('hello'), 'hello');
      assert.strictEqual(parseValue('test123'), 'test123');
    });

    it('should return string for empty string', () => {
      assert.strictEqual(parseValue(''), '');
    });
  });
});
