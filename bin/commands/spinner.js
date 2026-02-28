const { createSpinner } = require('nanospinner');

const ASCII_FRAMES = ['|', '/', '-', '\\'];
const USE_ASCII = process.platform === 'win32';

module.exports = function spinner(text) {
  const s = createSpinner(text, USE_ASCII ? { frames: ASCII_FRAMES } : {});
  if (!USE_ASCII) return s;

  const _success = s.success.bind(s);
  const _error = s.error.bind(s);
  s.success = (opts = {}) => _success({ mark: '+', ...opts });
  s.error = (opts = {}) => _error({ mark: 'x', ...opts });
  return s;
};
