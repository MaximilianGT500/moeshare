'use strict';

const zlib = require('zlib');

const LIMIT = 0xffffffff;
const ZIP64_THRESHOLD = 0xfffffff0;
const FLAGS = 0x0008 | 0x0800;
const UNIX_FILE = (0o100644 << 16) >>> 0;

function dosDateTime(value) {
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    time: ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xffff,
    date: (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff,
  };
}

const uint64 = (value) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
};

function cleanName(raw) {
  const text = String(raw || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 180);
  return text || 'datei';
}

function uniqueNames() {
  const used = new Set();
  return (raw) => {
    const name = cleanName(raw);
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let counter = 2; used.has(candidate.toLowerCase()); counter++) candidate = `${stem} (${counter})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };
}

class ZipWriter {
  constructor(output) {
    this.output = output;
    this.offset = 0;
    this.entries = [];
    this.closed = false;
    output.once('close', () => {
      this.closed = true;
    });
  }

  async write(buffer) {
    if (this.closed || this.output.destroyed) {
      const error = new Error('Download abgebrochen');
      error.code = 'ABORTED';
      throw error;
    }
    this.offset += buffer.length;
    if (!this.output.write(buffer)) {
      await new Promise((resolve) => {
        const done = () => {
          this.output.off('drain', done);
          this.output.off('close', done);
          resolve();
        };
        this.output.on('drain', done);
        this.output.on('close', done);
      });
    }
  }

  async add(name, source, { size = 0, date = new Date() } = {}) {
    const encoded = Buffer.from(name, 'utf8');
    const stamp = dosDateTime(date);
    const start = this.offset;
    const zip64 = size >= ZIP64_THRESHOLD || start >= ZIP64_THRESHOLD;
    const extra = zip64 ? Buffer.concat([Buffer.from([0x01, 0x00, 0x10, 0x00]), uint64(0), uint64(0)]) : Buffer.alloc(0);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(zip64 ? 45 : 20, 4);
    header.writeUInt16LE(FLAGS, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(stamp.time, 10);
    header.writeUInt16LE(stamp.date, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(zip64 ? LIMIT : 0, 18);
    header.writeUInt32LE(zip64 ? LIMIT : 0, 22);
    header.writeUInt16LE(encoded.length, 26);
    header.writeUInt16LE(extra.length, 28);
    await this.write(Buffer.concat([header, encoded, extra]));

    let crc = 0;
    let length = 0;
    try {
      for await (const chunk of source) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        crc = zlib.crc32(buffer, crc);
        length += buffer.length;
        await this.write(buffer);
      }
    } finally {
      if (typeof source.destroy === 'function' && !source.destroyed) source.destroy();
    }
    if (!zip64 && length >= LIMIT) {
      const error = new Error('Die Datei ist größer als angegeben.');
      error.code = 'SIZE_MISMATCH';
      throw error;
    }

    const descriptor = Buffer.alloc(zip64 ? 24 : 16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc >>> 0, 4);
    if (zip64) {
      descriptor.writeBigUInt64LE(BigInt(length), 8);
      descriptor.writeBigUInt64LE(BigInt(length), 16);
    } else {
      descriptor.writeUInt32LE(length, 8);
      descriptor.writeUInt32LE(length, 12);
    }
    await this.write(descriptor);
    this.entries.push({ encoded, stamp, crc: crc >>> 0, size: length, offset: start, zip64 });
  }

  async finish() {
    const start = this.offset;
    for (const entry of this.entries) {
      const bigSize = entry.size >= LIMIT;
      const bigOffset = entry.offset >= LIMIT;
      const fields = [];
      if (bigSize) fields.push(uint64(entry.size), uint64(entry.size));
      if (bigOffset) fields.push(uint64(entry.offset));
      const body = Buffer.concat(fields);
      const extra = body.length ? Buffer.concat([Buffer.from([0x01, 0x00, body.length & 0xff, body.length >> 8]), body]) : Buffer.alloc(0);
      const needs64 = entry.zip64 || bigSize || bigOffset;
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE((3 << 8) | (needs64 ? 45 : 20), 4);
      header.writeUInt16LE(needs64 ? 45 : 20, 6);
      header.writeUInt16LE(FLAGS, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(entry.stamp.time, 12);
      header.writeUInt16LE(entry.stamp.date, 14);
      header.writeUInt32LE(entry.crc, 16);
      header.writeUInt32LE(bigSize ? LIMIT : entry.size, 20);
      header.writeUInt32LE(bigSize ? LIMIT : entry.size, 24);
      header.writeUInt16LE(entry.encoded.length, 28);
      header.writeUInt16LE(extra.length, 30);
      header.writeUInt16LE(0, 32);
      header.writeUInt16LE(0, 34);
      header.writeUInt16LE(0, 36);
      header.writeUInt32LE(UNIX_FILE, 38);
      header.writeUInt32LE(bigOffset ? LIMIT : entry.offset, 42);
      await this.write(Buffer.concat([header, entry.encoded, extra]));
    }
    const size = this.offset - start;
    const count = this.entries.length;
    const zip64 = count >= 0xffff || size >= LIMIT || start >= LIMIT;
    if (zip64) {
      const recordStart = this.offset;
      const record = Buffer.alloc(56);
      record.writeUInt32LE(0x06064b50, 0);
      record.writeBigUInt64LE(44n, 4);
      record.writeUInt16LE((3 << 8) | 45, 12);
      record.writeUInt16LE(45, 14);
      record.writeUInt32LE(0, 16);
      record.writeUInt32LE(0, 20);
      record.writeBigUInt64LE(BigInt(count), 24);
      record.writeBigUInt64LE(BigInt(count), 32);
      record.writeBigUInt64LE(BigInt(size), 40);
      record.writeBigUInt64LE(BigInt(start), 48);
      const locator = Buffer.alloc(20);
      locator.writeUInt32LE(0x07064b50, 0);
      locator.writeUInt32LE(0, 4);
      locator.writeBigUInt64LE(BigInt(recordStart), 8);
      locator.writeUInt32LE(1, 16);
      await this.write(Buffer.concat([record, locator]));
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(zip64 ? 0xffff : count, 8);
    end.writeUInt16LE(zip64 ? 0xffff : count, 10);
    end.writeUInt32LE(zip64 ? LIMIT : size, 12);
    end.writeUInt32LE(zip64 ? LIMIT : start, 16);
    end.writeUInt16LE(0, 20);
    await this.write(end);
  }
}

module.exports = { ZipWriter, uniqueNames, cleanName };
