const fs = require('fs/promises');
const path = require('path');

async function ensureDirectoryExists(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

async function readStore(storePath) {
  if (!storePath) throw new Error('storePath is required');

  try {
    const raw = await fs.readFile(storePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function writeStore(payload, storePath) {
  if (!storePath) throw new Error('storePath is required');

  await ensureDirectoryExists(storePath);
  const json = JSON.stringify(payload, null, 2);
  await fs.writeFile(storePath, `${json}\n`, { mode: 0o600 });
  await fs.chmod(storePath, 0o600);
}

module.exports = {
  readStore,
  writeStore,
};
