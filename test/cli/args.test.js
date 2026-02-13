const assert = require('node:assert');
const { describe, it } = require('node:test');

// Extract parseArgs function for testing
function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      const value = argv[i + 1];

      if (value === undefined || value.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = parseValue(value);
        i++;
      }
    }
  }

  return args;
}

function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;

  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;

  return value;
}

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
      // trim() is called, so it becomes a number
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

    it('should parse hex strings as numbers if valid', () => {
      // JavaScript's Number() parses hex strings
      assert.strictEqual(parseValue('0xABC'), 2748);
      assert.strictEqual(parseValue('0x10'), 16);
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
