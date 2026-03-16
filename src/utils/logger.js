'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, off: 4 };
const MAX_BYTES = 5 * 1024 * 1024; // rotate at 5 MB, keep one backup

class Logger {
  constructor(opts = {}) {
    this._logPathOverride = opts.logPath || null;
    this._levelOverride = opts.level || null;
    this._configured = false;
    this._logPath = null;
    this._level = LEVELS.info;
  }

  _configure() {
    if (this._configured) return;
    this._configured = true;
    this._logPath =
      this._logPathOverride ||
      process.env.FDX_LOG_PATH ||
      path.join(os.homedir(), '.fdx', 'fdx.log');
    const levelStr = (this._levelOverride || process.env.FDX_LOG_LEVEL || 'info').toLowerCase();
    this._level = LEVELS[levelStr] ?? LEVELS.info;
  }

  _write(level, message, data) {
    this._configure();
    if (LEVELS[level] < this._level) return;

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...(data != null ? { data } : {}),
    });

    try {
      this._maybeRotate();
      fs.mkdirSync(path.dirname(this._logPath), { recursive: true });
      fs.appendFileSync(this._logPath, line + '\n', { encoding: 'utf8' });
    } catch {
      // Logging must never crash the application
    }
  }

  _maybeRotate() {
    try {
      const stat = fs.statSync(this._logPath);
      if (stat.size >= MAX_BYTES) {
        const backup = this._logPath + '.1';
        try {
          fs.unlinkSync(backup);
        } catch {
          // no existing backup — ignore
        }
        fs.renameSync(this._logPath, backup);
      }
    } catch {
      // file may not exist yet — that is fine
    }
  }

  debug(message, data) {
    this._write('debug', message, data);
  }
  info(message, data) {
    this._write('info', message, data);
  }
  warn(message, data) {
    this._write('warn', message, data);
  }
  error(message, data) {
    this._write('error', message, data);
  }
}

// Singleton for production use; Logger class exported for testing
const logger = new Logger();
logger.Logger = Logger;

module.exports = logger;
