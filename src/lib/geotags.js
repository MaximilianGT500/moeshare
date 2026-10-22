'use strict';

const fs = require('fs');
const fsp = fs.promises;
const zlib = require('zlib');

const SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
const GPS_IFD = 0x8825;
const XMP_TAG = 700;
const MAX_IFDS = 16;
const MAX_BOXES = 4096;
const XMP_ATTRIBUTE = /([\w.-]+:(?:GPS|Gps)\w*\s*=\s*)("[^"]*"|'[^']*')/g;
const XMP_ELEMENT = /(<([\w.-]+:(?:GPS|Gps)\w*)(?:\s[^>]*)?(?<!\/)>)([\s\S]*?)(<\/\2\s*>)/g;
const RAW_PROFILE = /^Raw profile type (exif|app1|xmp)$/i;
const XMP_KEYWORD = 'XML:com.adobe.xmp';

const spaces = (text) => ' '.repeat(text.length);

function scrubXmpText(text) {
  let changed = false;
  const blank = (value) => {
    if (value.trim()) changed = true;
    return spaces(value);
  };
  const result = text
    .replace(XMP_ATTRIBUTE, (match, name, quoted) => `${name}${quoted[0]}${blank(quoted.slice(1, -1))}${quoted[0]}`)
    .replace(XMP_ELEMENT, (match, open, name, content, close) => `${open}${blank(content)}${close}`);
  return { text: result, changed };
}

function scrubXmpBuffer(buffer) {
  const { text, changed } = scrubXmpText(buffer.toString('latin1'));
  if (changed) buffer.write(text, 0, 'latin1');
  return changed;
}

const bufferIo = (buffer, base = 0) => ({
  size: Math.max(0, buffer.length - base),
  read: async (offset, length) => buffer.subarray(base + offset, base + offset + length),
  write: async (offset, data) => {
    data.copy(buffer, base + offset);
  },
});

const fileIo = (handle, base, size) => ({
  size,
  async read(offset, length) {
    const target = Buffer.alloc(Math.max(0, Math.min(length, size - offset)));
    if (target.length) await handle.read(target, 0, target.length, base + offset);
    return target;
  },
  async write(offset, data) {
    const length = Math.max(0, Math.min(data.length, size - offset));
    if (length) await handle.write(data, 0, length, base + offset);
  },
});

async function scrubTiff(io) {
  if (io.size < 8) return false;
  const header = await io.read(0, 8);
  const order = header.toString('latin1', 0, 2);
  if (order !== 'II' && order !== 'MM') return false;
  const little = order === 'II';
  const u16 = (buffer, at) => (little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at));
  const u32 = (buffer, at) => (little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at));
  if (u16(header, 2) !== 42) return false;

  const readIfd = async (offset) => {
    if (!offset || offset + 2 > io.size) return null;
    const count = u16(await io.read(offset, 2), 0);
    const body = await io.read(offset + 2, count * 12 + 4);
    const entries = [];
    for (let at = 0; at + 12 <= Math.min(body.length, count * 12); at += 12) {
      entries.push({ tag: u16(body, at), type: u16(body, at + 2), count: u32(body, at + 4), value: u32(body, at + 8) });
    }
    const next = body.length >= count * 12 + 4 ? u32(body, count * 12) : 0;
    return { count, entries, next };
  };

  const clearGps = async (offset) => {
    const ifd = await readIfd(offset);
    if (!ifd || !ifd.count) return false;
    for (const entry of ifd.entries) {
      const size = (SIZES[entry.type] || 0) * entry.count;
      if (size > 4 && entry.value < io.size) await io.write(entry.value, Buffer.alloc(Math.min(size, io.size - entry.value)));
    }
    await io.write(offset, Buffer.alloc(Math.min(io.size - offset, 2 + ifd.count * 12 + 4)));
    return true;
  };

  let changed = false;
  const seen = new Set();
  let offset = u32(header, 4);
  while (offset && !seen.has(offset) && seen.size < MAX_IFDS) {
    seen.add(offset);
    const ifd = await readIfd(offset);
    if (!ifd) break;
    for (const entry of ifd.entries) {
      if (entry.tag === GPS_IFD && (await clearGps(entry.value))) changed = true;
      if (entry.tag === XMP_TAG && entry.count > 4 && entry.value < io.size) {
        const length = Math.min(entry.count, io.size - entry.value);
        const packet = Buffer.from(await io.read(entry.value, length));
        if (scrubXmpBuffer(packet)) {
          await io.write(entry.value, packet);
          changed = true;
        }
      }
    }
    offset = ifd.next;
  }
  return changed;
}

async function scrubXmpRegion(handle, start, length) {
  if (length <= 0) return false;
  const buffer = Buffer.alloc(length);
  await handle.read(buffer, 0, length, start);
  if (!scrubXmpBuffer(buffer)) return false;
  await handle.write(buffer, 0, length, start);
  return true;
}

async function readAt(handle, position, length) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

async function scrubJpeg(handle, size) {
  let changed = false;
  let position = 2;
  while (position + 4 <= size) {
    const head = await readAt(handle, position, 4);
    if (head.length < 4 || head[0] !== 0xff) break;
    const marker = head[1];
    if (marker === 0xff) {
      position += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      position += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    const length = head.readUInt16BE(2);
    if (length < 2) break;
    const start = position + 4;
    const payload = Math.min(length - 2, size - start);
    if (marker === 0xe1 && payload > 6) {
      const signature = (await readAt(handle, start, Math.min(payload, 35))).toString('latin1');
      if (signature.startsWith('Exif\0\0')) {
        if (await scrubTiff(fileIo(handle, start + 6, payload - 6))) changed = true;
      } else if (signature.startsWith('http://ns.adobe.com/xap/1.0/\0')) {
        if (await scrubXmpRegion(handle, start + 29, payload - 29)) changed = true;
      } else if (signature.startsWith('http://ns.adobe.com/xmp/extension/\0')) {
        if (await scrubXmpRegion(handle, start + 75, payload - 75)) changed = true;
      }
    }
    position += 2 + length;
  }
  return changed;
}

function pngText(type, data) {
  const end = data.indexOf(0);
  if (end < 1) return null;
  const keyword = data.toString('latin1', 0, end);
  if (type === 'tEXt') return { keyword, text: data.subarray(end + 1), offset: end + 1, compressed: false };
  if (type === 'zTXt') return { keyword, text: data.subarray(end + 2), offset: end + 2, compressed: true };
  const compressed = data[end + 1] === 1;
  const language = data.indexOf(0, end + 3);
  const translated = language < 0 ? -1 : data.indexOf(0, language + 1);
  if (translated < 0) return null;
  return { keyword, text: data.subarray(translated + 1), offset: translated + 1, compressed };
}

async function textHasGps(entry) {
  let text;
  try {
    text = (entry.compressed ? zlib.inflateSync(entry.text, { maxOutputLength: 16 * 1024 * 1024 }) : entry.text).toString('latin1');
  } catch {
    return false;
  }
  if (entry.keyword === XMP_KEYWORD) return scrubXmpText(text).changed;
  const hex = text
    .split('\n')
    .slice(3)
    .join('')
    .replace(/[^0-9a-f]/gi, '');
  let bytes = Buffer.from(hex.length % 2 ? hex.slice(0, -1) : hex, 'hex');
  if (/xmp$/i.test(entry.keyword)) return scrubXmpText(bytes.toString('latin1')).changed;
  if (bytes.toString('latin1', 0, 6) === 'Exif\0\0') bytes = bytes.subarray(6);
  return scrubTiff(bufferIo(Buffer.from(bytes)));
}

async function writeWithout(file, size, ranges) {
  const temporary = `${file}.ohne-ort-${process.pid}`;
  const source = await fsp.open(file, 'r');
  const target = await fsp.open(temporary, 'w');
  try {
    let position = 0;
    const copy = async (until) => {
      const chunk = Buffer.alloc(1024 * 1024);
      while (position < until) {
        const { bytesRead } = await source.read(chunk, 0, Math.min(chunk.length, until - position), position);
        if (!bytesRead) break;
        await target.write(chunk, 0, bytesRead);
        position += bytesRead;
      }
    };
    for (const [start, length] of ranges) {
      await copy(start);
      position = start + length;
    }
    await copy(size);
  } finally {
    await source.close();
    await target.close();
  }
  await fsp.rename(temporary, file);
}

async function scrubPng(handle, size) {
  let changed = false;
  const drop = [];
  let position = 8;
  while (position + 12 <= size) {
    const head = await readAt(handle, position, 8);
    const length = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    if (type === 'IEND' || position + 12 + length > size) break;
    if (['eXIf', 'iTXt', 'tEXt', 'zTXt'].includes(type)) {
      const data = await readAt(handle, position + 8, length);
      let modified = false;
      if (type === 'eXIf') {
        modified = await scrubTiff(bufferIo(data, data.toString('latin1', 0, 6) === 'Exif\0\0' ? 6 : 0));
      } else {
        const entry = pngText(type, data);
        if (entry && type === 'iTXt' && entry.keyword === XMP_KEYWORD && !entry.compressed) {
          modified = scrubXmpBuffer(data.subarray(entry.offset));
        } else if (entry && (entry.keyword === XMP_KEYWORD || RAW_PROFILE.test(entry.keyword)) && (await textHasGps(entry))) {
          drop.push([position, 12 + length]);
        }
      }
      if (modified) {
        const checksum = Buffer.alloc(4);
        checksum.writeUInt32BE(zlib.crc32(data, zlib.crc32(Buffer.from(type, 'latin1'))) >>> 0);
        await handle.write(data, 0, data.length, position + 8);
        await handle.write(checksum, 0, 4, position + 8 + length);
        changed = true;
      }
    }
    position += 12 + length;
  }
  return { changed, drop };
}

async function scrubWebp(handle, size) {
  let changed = false;
  let position = 12;
  while (position + 8 <= size) {
    const head = await readAt(handle, position, 8);
    const type = head.toString('latin1', 0, 4);
    const length = head.readUInt32LE(4);
    const start = position + 8;
    const available = Math.min(length, size - start);
    if (type === 'EXIF') {
      const base = (await readAt(handle, start, 6)).toString('latin1') === 'Exif\0\0' ? 6 : 0;
      if (await scrubTiff(fileIo(handle, start + base, available - base))) changed = true;
    } else if (type === 'XMP ') {
      if (await scrubXmpRegion(handle, start, available)) changed = true;
    }
    position = start + length + (length & 1);
  }
  return changed;
}

async function boxesIn(handle, start, end) {
  const boxes = [];
  let position = start;
  while (position + 8 <= end && boxes.length < MAX_BOXES) {
    const head = await readAt(handle, position, 16);
    if (head.length < 8) break;
    let size = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    let header = 8;
    if (size === 1) {
      if (head.length < 16) break;
      size = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (size === 0) {
      size = end - position;
    }
    if (size < header || position + size > end) break;
    boxes.push({ type, start: position, data: position + header, end: position + size });
    position += size;
  }
  return boxes;
}

const readUint = (buffer, at, bytes) => {
  if (bytes === 0) return 0;
  if (bytes === 8) return Number(buffer.readBigUInt64BE(at));
  return buffer.readUIntBE(at, bytes);
};

async function itemTypes(handle, box) {
  const data = await readAt(handle, box.data, box.end - box.data);
  const version = data[0];
  const children = await boxesIn(handle, box.data + 4 + (version === 0 ? 2 : 4), box.end);
  const items = new Map();
  for (const child of children.filter((entry) => entry.type === 'infe')) {
    const info = await readAt(handle, child.data, child.end - child.data);
    const infeVersion = info[0];
    if (infeVersion < 2) continue;
    const idBytes = infeVersion === 2 ? 2 : 4;
    const id = readUint(info, 4, idBytes);
    const typeAt = 4 + idBytes + 2;
    const type = info.toString('latin1', typeAt, typeAt + 4);
    let contentType = '';
    if (type === 'mime') {
      const nameEnd = info.indexOf(0, typeAt + 4);
      const contentEnd = nameEnd < 0 ? -1 : info.indexOf(0, nameEnd + 1);
      if (contentEnd > 0) contentType = info.toString('latin1', nameEnd + 1, contentEnd);
    }
    items.set(id, { type, contentType });
  }
  return items;
}

async function itemLocations(handle, box) {
  const data = await readAt(handle, box.data, box.end - box.data);
  const version = data[0];
  let at = 4;
  const offsetSize = data[at] >> 4;
  const lengthSize = data[at] & 15;
  const baseSize = data[at + 1] >> 4;
  const indexSize = version > 0 ? data[at + 1] & 15 : 0;
  at += 2;
  const count = version < 2 ? data.readUInt16BE(at) : data.readUInt32BE(at);
  at += version < 2 ? 2 : 4;
  const locations = new Map();
  for (let index = 0; index < count && at < data.length; index++) {
    const id = version < 2 ? data.readUInt16BE(at) : data.readUInt32BE(at);
    at += version < 2 ? 2 : 4;
    let method = 0;
    if (version > 0) {
      method = data.readUInt16BE(at) & 15;
      at += 2;
    }
    at += 2;
    const base = readUint(data, at, baseSize);
    at += baseSize;
    const extents = data.readUInt16BE(at);
    at += 2;
    const list = [];
    for (let extent = 0; extent < extents; extent++) {
      at += indexSize;
      const offset = readUint(data, at, offsetSize);
      at += offsetSize;
      const length = readUint(data, at, lengthSize);
      at += lengthSize;
      list.push({ offset: base + offset, length });
    }
    locations.set(id, { method, extents: list });
  }
  return locations;
}

async function scrubIsobmff(handle, size) {
  const meta = (await boxesIn(handle, 0, size)).find((box) => box.type === 'meta');
  if (!meta) return false;
  const children = await boxesIn(handle, meta.data + 4, meta.end);
  const iinf = children.find((box) => box.type === 'iinf');
  const iloc = children.find((box) => box.type === 'iloc');
  if (!iinf || !iloc) return false;
  const idat = children.find((box) => box.type === 'idat');
  const types = await itemTypes(handle, iinf);
  const locations = await itemLocations(handle, iloc);
  let changed = false;
  for (const [id, item] of types) {
    const location = locations.get(id);
    if (!location || location.extents.length !== 1) continue;
    const origin = location.method === 1 ? (idat ? idat.data : null) : location.method === 0 ? 0 : null;
    if (origin === null) continue;
    const { offset, length } = location.extents[0];
    const start = origin + offset;
    const usable = Math.min(length || size - start, size - start);
    if (item.type === 'Exif' && usable > 4) {
      const skip = (await readAt(handle, start, 4)).readUInt32BE(0);
      if (4 + skip < usable && (await scrubTiff(fileIo(handle, start + 4 + skip, usable - 4 - skip)))) changed = true;
    } else if (item.type === 'mime' && /rdf\+xml/i.test(item.contentType)) {
      if (await scrubXmpRegion(handle, start, usable)) changed = true;
    }
  }
  return changed;
}

function formatOf(head) {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 8 && head.toString('latin1', 0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (head.length >= 4 && ['II*\0', 'MM\0*'].includes(head.toString('latin1', 0, 4))) return 'tiff';
  if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') return 'isobmff';
  return null;
}

async function removeLocation(file) {
  const handle = await fsp.open(file, 'r+');
  let result = { format: null, changed: false };
  let drop = [];
  let size = 0;
  try {
    size = (await handle.stat()).size;
    const format = formatOf(await readAt(handle, 0, 16));
    result.format = format;
    if (format === 'jpeg') result.changed = await scrubJpeg(handle, size);
    else if (format === 'webp') result.changed = await scrubWebp(handle, size);
    else if (format === 'tiff') result.changed = await scrubTiff(fileIo(handle, 0, size));
    else if (format === 'isobmff') result.changed = await scrubIsobmff(handle, size);
    else if (format === 'png') {
      const png = await scrubPng(handle, size);
      result.changed = png.changed;
      drop = png.drop;
    }
  } finally {
    await handle.close();
  }
  if (drop.length) {
    await writeWithout(file, size, drop);
    result = { ...result, changed: true };
  }
  return result;
}

module.exports = { removeLocation, scrubXmpText };
