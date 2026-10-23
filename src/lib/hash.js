'use strict';

const crypto = require('crypto');
const fs = require('fs');

async function hashStream(stream) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

const hashFile = (file) => hashStream(fs.createReadStream(file, { highWaterMark: 1024 * 1024 }));

module.exports = { hashFile, hashStream };
