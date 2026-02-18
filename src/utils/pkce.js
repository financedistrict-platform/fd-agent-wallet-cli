const crypto = require('crypto');

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function generateCodeVerifier(length) {
  const size = length || 64;
  const bounded = Math.max(43, Math.min(size, 128));
  return base64UrlEncode(crypto.randomBytes(bounded));
}

function generateState(length) {
  const size = length || 24;
  return base64UrlEncode(crypto.randomBytes(size));
}

async function generateCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64UrlEncode(hash);
}

module.exports = {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
};
