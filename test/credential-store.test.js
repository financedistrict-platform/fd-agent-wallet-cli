const assert = require('node:assert');
const { describe, it } = require('node:test');

const credentialStore = require('../src/credential-store');

describe('CredentialStore', () => {
  it('isSupported should return a boolean', () => {
    const result = credentialStore.isSupported();
    assert.strictEqual(typeof result, 'boolean');
  });

  it('getSecret should return null for non-existent account', () => {
    const result = credentialStore.getSecret('fdx-test-nonexistent-' + Date.now());
    assert.strictEqual(result, null);
  });

  it('setSecret should return false when not supported', function () {
    if (credentialStore.isSupported()) {
      this.skip('credential store is supported on this platform — skipping');
      return;
    }
    const result = credentialStore.setSecret('test', 'value');
    assert.strictEqual(result, false);
  });

  const supported = credentialStore.isSupported();

  it('should round-trip a secret', { skip: !supported && 'credential store not available' }, () => {
    const account = `fdx-test-${Date.now()}`;
    const secret = JSON.stringify({ accessToken: 'at-123', refreshToken: 'rt-456' });

    try {
      const stored = credentialStore.setSecret(account, secret);
      assert.strictEqual(stored, true);

      const retrieved = credentialStore.getSecret(account);
      assert.strictEqual(retrieved, secret);
    } finally {
      credentialStore.deleteSecret(account);
    }
  });

  it(
    'should return null after deleting a secret',
    { skip: !supported && 'credential store not available' },
    () => {
      const account = `fdx-test-del-${Date.now()}`;

      credentialStore.setSecret(account, 'to-delete');
      credentialStore.deleteSecret(account);

      const result = credentialStore.getSecret(account);
      assert.strictEqual(result, null);
    },
  );

  it(
    'should overwrite an existing secret',
    { skip: !supported && 'credential store not available' },
    () => {
      const account = `fdx-test-overwrite-${Date.now()}`;

      try {
        credentialStore.setSecret(account, 'first');
        credentialStore.setSecret(account, 'second');

        const result = credentialStore.getSecret(account);
        assert.strictEqual(result, 'second');
      } finally {
        credentialStore.deleteSecret(account);
      }
    },
  );
});
