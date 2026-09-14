const assert = require('node:assert');
const { describe, it } = require('node:test');

const { coerceArgsBySchema } = require('../../bin/helpers/wallet-method-registry');

const schema = {
  properties: {
    networkIds: { type: 'array' },
    currencies: { type: 'array' },
    addresses: { type: 'object' },
    networkWallets: { type: 'object' },
    projectName: { type: 'string' },
    walletAddress: { type: 'string' },
    amount: { type: 'string' },
    fxBufferBasisPoints: { type: 'integer' },
    percent: { type: 'number' },
    includeFdAgentWallets: { type: 'boolean' },
    nullableNetworkWallets: { type: ['object', 'null'] },
    nullableNetworks: { type: ['array', 'null'] },
    nullableProjectId: { type: ['string', 'null'] },
    nullablePriority: { type: ['integer', 'null'] },
  },
};

describe('coerceArgsBySchema', () => {
  it('parses array params from JSON', () => {
    const args = coerceArgsBySchema({ networkIds: '["eth","base"]' }, schema);
    assert.deepStrictEqual(args, { networkIds: ['eth', 'base'] });
  });

  it('parses empty array params from JSON', () => {
    const args = coerceArgsBySchema({ currencies: '[]' }, schema);
    assert.deepStrictEqual(args, { currencies: [] });
  });

  it('parses object params from JSON', () => {
    const args = coerceArgsBySchema({ networkWallets: '{"eth":"0xabc"}' }, schema);
    assert.deepStrictEqual(args, { networkWallets: { eth: '0xabc' } });
  });

  it('leaves string params untouched', () => {
    const raw = {
      projectName: 'Acme',
      walletAddress: '0x00123456789abcdef00123456789abcdef0012345',
      amount: '99999999999999999',
    };
    assert.deepStrictEqual(coerceArgsBySchema(raw, schema), raw);
  });

  it('does not coerce numeric-looking strings declared as string', () => {
    const args = coerceArgsBySchema({ amount: '0.10' }, schema);
    assert.strictEqual(args.amount, '0.10');
  });

  it('coerces integer params to numbers', () => {
    const args = coerceArgsBySchema({ fxBufferBasisPoints: '50' }, schema);
    assert.deepStrictEqual(args, { fxBufferBasisPoints: 50 });
  });

  it('coerces number params to numbers', () => {
    const args = coerceArgsBySchema({ percent: '12.5' }, schema);
    assert.deepStrictEqual(args, { percent: 12.5 });
  });

  it('leaves booleans parsed by the arg parser untouched', () => {
    const args = coerceArgsBySchema({ includeFdAgentWallets: true }, schema);
    assert.deepStrictEqual(args, { includeFdAgentWallets: true });
  });

  it('keeps params absent from the schema unchanged', () => {
    const args = coerceArgsBySchema({ unknownParam: '["a"]' }, schema);
    assert.deepStrictEqual(args, { unknownParam: '["a"]' });
  });

  it('returns args unchanged when the schema has no properties', () => {
    const raw = { networkIds: '["eth"]' };
    assert.deepStrictEqual(coerceArgsBySchema(raw, undefined), raw);
    assert.deepStrictEqual(coerceArgsBySchema(raw, {}), raw);
  });

  it('throws a named error when an array param is not valid JSON', () => {
    assert.throws(() => coerceArgsBySchema({ networkIds: 'not-json' }, schema), {
      message: /--networkIds expects a JSON array.*not valid JSON: not-json/s,
    });
  });

  it('throws a named error when an object param is not valid JSON', () => {
    assert.throws(() => coerceArgsBySchema({ addresses: '{oops' }, schema), {
      message: /--addresses expects a JSON object.*not valid JSON/s,
    });
  });

  it('throws when valid JSON has the wrong structured type', () => {
    assert.throws(() => coerceArgsBySchema({ networkIds: '{"a":1}' }, schema), {
      message: /--networkIds expects a JSON array, but got object/,
    });
    assert.throws(() => coerceArgsBySchema({ addresses: '["a"]' }, schema), {
      message: /--addresses expects a JSON object, but got array/,
    });
    assert.throws(() => coerceArgsBySchema({ addresses: 'null' }, schema), {
      message: /--addresses expects a JSON object, but got null/,
    });
  });

  it('coerces nullable union types declared as ["<type>", "null"]', () => {
    const args = coerceArgsBySchema(
      {
        nullableNetworkWallets: '{"eip155:8453":"0xabc"}',
        nullableNetworks: '[{"networkId":"eip155:1"}]',
        nullablePriority: '3',
        nullableProjectId: '0009',
      },
      schema,
    );
    assert.deepStrictEqual(args, {
      nullableNetworkWallets: { 'eip155:8453': '0xabc' },
      nullableNetworks: [{ networkId: 'eip155:1' }],
      nullablePriority: 3,
      nullableProjectId: '0009',
    });
  });

  it('does not mutate the input args object', () => {
    const raw = { networkIds: '["eth"]' };
    coerceArgsBySchema(raw, schema);
    assert.strictEqual(raw.networkIds, '["eth"]');
  });
});
