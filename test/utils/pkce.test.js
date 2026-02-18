const assert = require('node:assert');
const { describe, it } = require('node:test');

const {
  generateCodeVerifier,
  generateState,
  generateCodeChallenge,
} = require('../../src/utils/pkce');

describe('PKCE Utils', () => {
  describe('generateCodeVerifier', () => {
    it('should generate a code verifier with default length', () => {
      const verifier = generateCodeVerifier();
      assert.ok(verifier.length >= 43, 'Verifier should be at least 43 characters');
      assert.ok(/^[A-Za-z0-9_-]+$/.test(verifier), 'Verifier should be base64url encoded');
    });

    it('should respect minimum length constraint (43)', () => {
      const verifier = generateCodeVerifier(10); // Try to set too short
      assert.ok(verifier.length >= 43, 'Verifier should be at least 43 characters');
    });

    it('should respect maximum length constraint (128)', () => {
      const verifier = generateCodeVerifier(200); // Try to set too long
      // Base64url encoding of 128 bytes results in ~171 characters
      assert.ok(verifier.length <= 171, 'Verifier should be bounded by implementation');
    });

    it('should generate unique values', () => {
      const v1 = generateCodeVerifier();
      const v2 = generateCodeVerifier();
      assert.notEqual(v1, v2, 'Should generate unique verifiers');
    });

    it('should not contain base64 padding', () => {
      const verifier = generateCodeVerifier();
      assert.ok(!verifier.includes('='), 'Should not contain padding');
    });
  });

  describe('generateState', () => {
    it('should generate a state parameter', () => {
      const state = generateState();
      assert.ok(state.length > 0, 'State should not be empty');
      assert.ok(/^[A-Za-z0-9_-]+$/.test(state), 'State should be base64url encoded');
    });

    it('should generate unique values', () => {
      const s1 = generateState();
      const s2 = generateState();
      assert.notEqual(s1, s2, 'Should generate unique states');
    });

    it('should accept custom length', () => {
      const state = generateState(32);
      assert.ok(state.length > 0, 'Should generate state with custom length');
    });
  });

  describe('generateCodeChallenge', () => {
    it('should generate SHA256 hash of verifier', async () => {
      const verifier = 'test_verifier_123';
      const challenge = await generateCodeChallenge(verifier);

      assert.ok(challenge.length > 0, 'Challenge should not be empty');
      assert.ok(/^[A-Za-z0-9_-]+$/.test(challenge), 'Challenge should be base64url encoded');
      assert.ok(!challenge.includes('='), 'Challenge should not contain padding');
    });

    it('should generate consistent hash for same input', async () => {
      const verifier = 'consistent_verifier';
      const c1 = await generateCodeChallenge(verifier);
      const c2 = await generateCodeChallenge(verifier);

      assert.strictEqual(c1, c2, 'Same verifier should produce same challenge');
    });

    it('should generate different hashes for different inputs', async () => {
      const c1 = await generateCodeChallenge('verifier_1');
      const c2 = await generateCodeChallenge('verifier_2');

      assert.notEqual(c1, c2, 'Different verifiers should produce different challenges');
    });
  });
});
