'use strict';

const { Transform } = require('stream');
const zlib = require('zlib');

const EOCD = 0x06054b50;
const EOCD64_LOCATOR = 0x07064b50;
const EOCD64 = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_COMMENT = 0xffff;
const CENTRAL_LIMIT = 16 * 1024 * 1024;
const SUPPORTED = new Set([0, 8]);
const CP437 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

const utf8 = new TextDecoder('utf-8', { fatal: true });

function invalid(message = 'Das ZIP-Archiv ist beschädigt.') {
  const error = new Error(message);
  error.code = 'EZIP';
  return error;
}

function decodeName(bytes, flaggedUtf8) {
  if (flaggedUtf8) return bytes.toString('utf8');
  try {
    return utf8.decode(bytes);
  } catch {
    let text = '';
    for (const byte of bytes) text += byte < 0x80 ? String.fromCharCode(byte) : CP437[byte - 0x80];
    return text;
  }
}

function dosTime(date, time) {
  if (!date) return null;
  const year = 1980 + (date >> 9);
  const month = ((date >> 5) & 0x0f) - 1;
  const day = date & 0x1f;
  const value = Date.UTC(year, month, day, time >> 11, (time >> 5) & 0x3f, (time & 0x1f) * 2);
  return Number.isFinite(value) ? value : null;
}

function readExtra(extra, sizes) {
  const result = { ...sizes, unicodeName: null, mtime: null };
  for (let pos = 0; pos + 4 <= extra.length;) {
    const id = extra.readUInt16LE(pos);
    const length = extra.readUInt16LE(pos + 2);
    const data = extra.subarray(pos + 4, pos + 4 + length);
    if (id === 0x0001) {
      let at = 0;
      const next = () => {
        if (at + 8 > data.length) return null;
        const value = Number(data.readBigUInt64LE(at));
        at += 8;
        return value;
      };
      if (sizes.size === 0xffffffff) result.size = next() ?? result.size;
      if (sizes.packed === 0xffffffff) result.packed = next() ?? result.packed;
      if (sizes.offset === 0xffffffff) result.offset = next() ?? result.offset;
    } else if (id === 0x7075 && data.length > 5 && data[0] === 1) {
      result.unicodeName = data.subarray(5).toString('utf8');
    } else if (id === 0x5455 && data.length >= 5 && data[0] & 1) {
      result.mtime = data.readUInt32LE(1) * 1000;
    }
    pos += 4 + length;
  }
  return result;
}

async function locateDirectory(source) {
  const tailLength = Math.min(source.size, 22 + MAX_COMMENT);
  if (tailLength < 22) throw invalid('Das ist kein ZIP-Archiv.');
  const tail = await source.read(source.size - tailLength, tailLength);
  let at = -1;
  for (let pos = tail.length - 22; pos >= 0; pos--) {
    if (tail.readUInt32LE(pos) === EOCD && pos + 22 + tail.readUInt16LE(pos + 20) <= tail.length) {
      at = pos;
      break;
    }
  }
  if (at < 0) throw invalid('Das ist kein ZIP-Archiv.');
  let count = tail.readUInt16LE(at + 10);
  let size = tail.readUInt32LE(at + 12);
  let offset = tail.readUInt32LE(at + 16);
  const comment = decodeName(tail.subarray(at + 22, at + 22 + tail.readUInt16LE(at + 20)), false);
  if ((count === 0xffff || size === 0xffffffff || offset === 0xffffffff) && at >= 20 && tail.readUInt32LE(at - 20) === EOCD64_LOCATOR) {
    const recordAt = Number(tail.readBigUInt64LE(at - 12));
    const record = await source.read(recordAt, 56);
    if (record.length < 56 || record.readUInt32LE(0) !== EOCD64) throw invalid();
    count = Number(record.readBigUInt64LE(32));
    size = Number(record.readBigUInt64LE(40));
    offset = Number(record.readBigUInt64LE(48));
  }
  if (offset + size > source.size) throw invalid();
  return { count, size, offset, comment };
}

async function list(source, { limit = 10000 } = {}) {
  const directory = await locateDirectory(source);
  const central = await source.read(directory.offset, Math.min(directory.size, CENTRAL_LIMIT));
  const entries = [];
  let pos = 0;
  for (let index = 0; index < directory.count && entries.length < limit; index++) {
    if (pos + 46 > central.length || central.readUInt32LE(pos) !== CENTRAL) break;
    const flags = central.readUInt16LE(pos + 8);
    const method = central.readUInt16LE(pos + 10);
    const nameLength = central.readUInt16LE(pos + 28);
    const extraLength = central.readUInt16LE(pos + 30);
    const commentLength = central.readUInt16LE(pos + 32);
    const end = pos + 46 + nameLength + extraLength + commentLength;
    if (end > central.length) break;
    const extra = readExtra(central.subarray(pos + 46 + nameLength, pos + 46 + nameLength + extraLength), {
      size: central.readUInt32LE(pos + 24),
      packed: central.readUInt32LE(pos + 20),
      offset: central.readUInt32LE(pos + 42),
    });
    const name = (extra.unicodeName || decodeName(central.subarray(pos + 46, pos + 46 + nameLength), Boolean(flags & 0x0800))).replace(
      /\\/g,
      '/'
    );
    const directoryEntry = name.endsWith('/');
    entries.push({
      index,
      name,
      directory: directoryEntry,
      size: extra.size,
      packed: extra.packed,
      offset: extra.offset,
      method,
      encrypted: Boolean(flags & 0x0001),
      supported: !directoryEntry && !(flags & 0x0001) && SUPPORTED.has(method),
      modified: extra.mtime || dosTime(central.readUInt16LE(pos + 14), central.readUInt16LE(pos + 12)),
    });
    pos = end;
  }
  return { entries, total: directory.count, truncated: entries.length < directory.count, comment: directory.comment };
}

function limitTo(bytes) {
  let seen = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      seen += chunk.length;
      if (seen > bytes) return callback(invalid('Die Datei im Archiv ist größer als angegeben.'));
      return callback(null, chunk);
    },
  });
}

async function open(source, entry) {
  if (!entry.supported) throw invalid('Diese Datei lässt sich nicht einzeln entpacken.');
  const header = await source.read(entry.offset, 30);
  if (header.length < 30 || header.readUInt32LE(0) !== LOCAL) throw invalid();
  const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  if (start + entry.packed > source.size) throw invalid();
  const raw = entry.packed > 0 ? await source.stream(start, start + entry.packed - 1) : null;
  return { raw, inflate: entry.method === 8 ? zlib.createInflateRaw() : null, limit: limitTo(entry.size) };
}

module.exports = { list, open };
