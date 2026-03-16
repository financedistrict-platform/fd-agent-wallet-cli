const assert = require('node:assert');
const { describe, it } = require('node:test');

const { FdxClient } = require('../../src/fdx-client');

describe('CLI method list sync', () => {
  it('wallet-call.js METHODS should match FdxClient tool methods', () => {
    // Extract METHODS from wallet-call.js source to avoid requiring it (it calls process.exit)
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../../bin/commands/wallet-call.js'),
      'utf8',
    );
    const match = source.match(/const METHOD_INFO = \{([\s\S]*?)\n\};/);
    assert.ok(match, 'Could not find METHOD_INFO in wallet-call.js');

    const cliMethods = [...match[1].matchAll(/^\s{2}(\w+)\s*:/gm)].map((m) => m[1]);

    // Derive tool methods from FdxClient prototype — those that are not
    // inherited from Object, not constructor, and not lifecycle/auth helpers
    const skip = new Set([
      'constructor',
      'register',
      'verifyRegistration',
      'login',
      'verifyLogin',
      'getTokenState',
      'logout',
      'listTools',
      'close',
    ]);
    const proto = FdxClient.prototype;
    const walletMethods = Object.getOwnPropertyNames(proto).filter((m) => !skip.has(m));

    assert.deepStrictEqual(
      cliMethods.sort(),
      walletMethods.sort(),
      'METHODS in wallet-call.js is out of sync with FdxClient',
    );
  });
});
