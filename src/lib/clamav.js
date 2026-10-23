'use strict';

const fs = require('fs');
const net = require('net');

const CHUNK = 64 * 1024;
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

function connect({ host, port, socket, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const conn = socket ? net.createConnection({ path: socket }) : net.createConnection({ host, port });
    const fail = (error) => {
      conn.destroy();
      reject(error);
    };
    conn.setTimeout(timeoutMs);
    conn.once('connect', () => {
      conn.off('error', fail);
      resolve(conn);
    });
    conn.once('error', fail);
    conn.once('timeout', () => fail(Object.assign(new Error('ClamAV antwortet nicht.'), { code: 'ETIMEDOUT' })));
  });
}

function collect(conn) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let failure = null;
    conn.on('data', (chunk) => chunks.push(chunk));
    conn.on('error', (error) => {
      failure = error;
    });
    conn.on('timeout', () => conn.destroy(Object.assign(new Error('ClamAV antwortet nicht.'), { code: 'ETIMEDOUT' })));
    conn.on('close', () => {
      const text = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
      if (text) resolve(text);
      else reject(failure || new Error('ClamAV hat die Verbindung ohne Antwort beendet.'));
    });
  });
}

function write(conn, buffer) {
  return new Promise((resolve, reject) => {
    if (conn.destroyed || conn.writableEnded) return reject(new Error('Verbindung geschlossen'));
    const ok = conn.write(buffer, (error) => error && reject(error));
    if (ok) return resolve();
    const done = () => {
      conn.off('drain', done);
      conn.off('close', done);
      resolve();
    };
    conn.once('drain', done);
    conn.once('close', done);
    return undefined;
  });
}

async function command(options, name) {
  const conn = await connect(options);
  const answer = collect(conn);
  conn.end(`z${name}\0`);
  return answer;
}

function parse(text) {
  const line = text.split('\n')[0].trim();
  const found = /^(?:stream|[^:]*):\s*(.+?)\s+FOUND$/.exec(line);
  if (found) return { infected: true, signature: found[1] };
  if (/:\s*OK$/.test(line)) return { infected: false, signature: null };
  const error = new Error(line.replace(/\s*ERROR$/, '') || 'Unbekannte Antwort von ClamAV');
  error.code = /size limit/i.test(line) ? 'ETOOLARGE' : 'ECLAMAV';
  throw error;
}

async function scanStream(source, options) {
  const conn = await connect(options);
  const answer = collect(conn);
  try {
    await write(conn, Buffer.from('zINSTREAM\0'));
    for await (const chunk of source) {
      for (let offset = 0; offset < chunk.length; offset += CHUNK) {
        const part = chunk.subarray(offset, offset + CHUNK);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(part.length);
        await write(conn, Buffer.concat([header, part]));
      }
    }
    await write(conn, Buffer.alloc(4));
    conn.end();
  } catch {
    if (typeof source.destroy === 'function') source.destroy();
  }
  return parse(await answer);
}

const scanFile = (file, options) => scanStream(fs.createReadStream(file, { highWaterMark: CHUNK * 4 }), options);
const scanBuffer = (buffer, options) => scanStream([buffer], options);

const version = (options) => command(options, 'VERSION');

module.exports = { EICAR, scanFile, scanBuffer, version };
