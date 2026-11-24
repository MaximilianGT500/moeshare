'use strict';

const sharp = require('sharp');

const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 8: 2, 9: 4, 10: 8 };

const TAGS = {
  make: 0x010f,
  model: 0x0110,
  exifPointer: 0x8769,
  exposure: 0x829a,
  aperture: 0x829d,
  iso: 0x8827,
  isoSpeed: 0x8833,
  taken: 0x9003,
  digitized: 0x9004,
  offset: 0x9011,
  bias: 0x9204,
  flash: 0x9209,
  focal: 0x920a,
  focal35: 0xa405,
  lensMake: 0xa433,
  lens: 0xa434,
};

const MAKES = [
  [/^nikon/i, 'Nikon'],
  [/^canon/i, 'Canon'],
  [/^sony/i, 'Sony'],
  [/^fujifilm/i, 'Fujifilm'],
  [/^olympus/i, 'Olympus'],
  [/^om digital/i, 'OM System'],
  [/^panasonic/i, 'Panasonic'],
  [/^leica/i, 'Leica'],
  [/^ricoh/i, 'Ricoh'],
  [/^pentax/i, 'Pentax'],
  [/^samsung/i, 'Samsung'],
  [/^huawei/i, 'Huawei'],
  [/^xiaomi/i, 'Xiaomi'],
  [/^apple/i, 'Apple'],
  [/^google/i, 'Google'],
  [/^hasselblad/i, 'Hasselblad'],
  [/^sigma/i, 'Sigma'],
  [/^dji/i, 'DJI'],
  [/^gopro/i, 'GoPro'],
  [/^oneplus/i, 'OnePlus'],
  [/^motorola/i, 'Motorola'],
];

function clean(value, max = 80) {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/[\u0000-\u001f\u007f�]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, max) : null;
}

const makeOf = (value) => {
  const text = clean(value, 40);
  if (!text) return null;
  const known = MAKES.find(([pattern]) => pattern.test(text));
  return known ? known[1] : text;
};

function cameraName(make, model) {
  if (!model) return make;
  if (!make) return model;
  const token = make.split(' ')[0].toLowerCase();
  const rest = model.toLowerCase().startsWith(token) ? model.slice(token.length).replace(/^[\s_-]+/, '') : model;
  return rest ? `${make} ${rest}` : make;
}

const within = (value, min, max) => (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null);

const round = (value, digits) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

function dateOf(value) {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(clean(value, 40) || '');
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
}

function reader(buffer) {
  const base = buffer.length > 6 && buffer.toString('latin1', 0, 6) === 'Exif\0\0' ? 6 : 0;
  const tiff = buffer.subarray(base);
  if (tiff.length < 8) return null;
  const order = tiff.toString('latin1', 0, 2);
  const little = order === 'II';
  if (!little && order !== 'MM') return null;
  const u16 = (at) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  const s32 = (at) => (little ? tiff.readInt32LE(at) : tiff.readInt32BE(at));
  if (u16(2) !== 42) return null;

  function directory(offset) {
    const found = new Map();
    if (!offset || offset < 8 || offset + 2 > tiff.length) return found;
    const count = Math.min(u16(offset), 512);
    for (let index = 0; index < count; index++) {
      const at = offset + 2 + index * 12;
      if (at + 12 > tiff.length) break;
      const type = u16(at + 2);
      const items = u32(at + 4);
      const size = (SIZES[type] || 0) * items;
      if (!size || size > 65536) continue;
      const position = size <= 4 ? at + 8 : u32(at + 8);
      if (position + size > tiff.length) continue;
      found.set(u16(at), { type, items, position });
    }
    return found;
  }

  function value(entry) {
    if (!entry) return null;
    const { type, items, position } = entry;
    if (type === 2) return tiff.toString('utf8', position, position + items).replace(/\0[\s\S]*$/, '');
    if (type === 3) return u16(position);
    if (type === 4) return u32(position);
    if (type === 9) return s32(position);
    if (type === 5) {
      const below = u32(position + 4);
      return below ? u32(position) / below : null;
    }
    if (type === 10) {
      const below = s32(position + 4);
      return below ? s32(position) / below : null;
    }
    return null;
  }

  const main = directory(u32(4));
  const pointer = value(main.get(TAGS.exifPointer));
  const details = typeof pointer === 'number' ? directory(pointer) : new Map();
  return (tag) => value(details.get(tag) || main.get(tag));
}

function parse(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 14 || buffer.length > 4 * 1024 * 1024) return null;
  let get;
  try {
    get = reader(buffer);
  } catch {
    return null;
  }
  if (!get) return null;
  const read = (tag) => {
    try {
      return get(tag);
    } catch {
      return null;
    }
  };
  const make = makeOf(read(TAGS.make));
  const model = clean(read(TAGS.model), 60);
  const lensMake = makeOf(read(TAGS.lensMake));
  const lensModel = clean(read(TAGS.lens), 80);
  const flash = read(TAGS.flash);
  const offset = clean(read(TAGS.offset), 8);
  const result = {
    camera: cameraName(make, model),
    lens: lensModel
      ? lensMake && !lensModel.toLowerCase().startsWith(lensMake.toLowerCase()) && lensMake !== make
        ? `${lensMake} ${lensModel}`
        : lensModel
      : null,
    focal: round(within(read(TAGS.focal), 0.5, 5000), 1),
    focal35: within(read(TAGS.focal35), 1, 5000),
    aperture: round(within(read(TAGS.aperture), 0.5, 128), 1),
    exposure: within(read(TAGS.exposure), 0.000001, 3600),
    iso: within(read(TAGS.iso), 1, 65535) || within(read(TAGS.isoSpeed), 1, 10000000),
    bias: round(within(read(TAGS.bias), -20, 20), 1),
    flash: typeof flash === 'number' ? (flash & 1) === 1 : null,
    taken: dateOf(read(TAGS.taken)) || dateOf(read(TAGS.digitized)),
    offset: offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : null,
  };
  if (result.exposure !== null) result.exposure = Number(result.exposure.toPrecision(4));
  const present = Object.fromEntries(Object.entries(result).filter(([, entry]) => entry !== null && entry !== undefined));
  const useful = ['camera', 'lens', 'focal', 'aperture', 'exposure', 'iso', 'taken'].some((key) => key in present);
  return useful ? present : null;
}

async function read(source) {
  const meta = await sharp(source, { failOn: 'none' }).metadata();
  return meta && meta.exif ? parse(meta.exif) : null;
}

function stored(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

module.exports = { parse, read, stored };
