'use strict';

const fsp = require('fs').promises;

const MAGIC = Buffer.from('MSE1');
const HEADER = 20;
const TAG = 16;

const isSealedName = (name) => /\.mse$/i.test(String(name || ''));

async function inspect(file) {
  const handle = await fsp.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const head = Buffer.alloc(HEADER);
    const { bytesRead } = await handle.read(head, 0, HEADER, 0);
    if (bytesRead < HEADER || !head.subarray(0, MAGIC.length).equals(MAGIC)) return false;
    const chunk = head.readUInt32BE(4);
    const meta = head.readUInt32BE(16);
    if (chunk < 1024 || chunk > 64 * 1024 * 1024 || meta <= TAG || meta > 1024 * 1024) return false;
    return size >= HEADER + meta + TAG;
  } finally {
    await handle.close();
  }
}

module.exports = { isSealedName, inspect };
