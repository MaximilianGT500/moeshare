'use strict';

const sharp = require('sharp');

const FAMILIES = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'neutral'];
const HASH = /^[0-9a-f]{16}$/;

async function differenceHash(input) {
  const { data } = await sharp(input, { failOn: 'none', animated: false })
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let high = 0;
  let low = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const bit = data[y * 9 + x] > data[y * 9 + x + 1] ? 1 : 0;
      const index = y * 8 + x;
      if (index < 32) high = ((high << 1) | bit) >>> 0;
      else low = ((low << 1) | bit) >>> 0;
    }
  }
  return `${high.toString(16).padStart(8, '0')}${low.toString(16).padStart(8, '0')}`;
}

function bitCount(value) {
  let v = value >>> 0;
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function distance(a, b) {
  if (!HASH.test(a || '') || !HASH.test(b || '')) return 64;
  const high = Number.parseInt(a.slice(0, 8), 16) ^ Number.parseInt(b.slice(0, 8), 16);
  const low = Number.parseInt(a.slice(8), 16) ^ Number.parseInt(b.slice(8), 16);
  return bitCount(high) + bitCount(low);
}

function informative(hash) {
  const bits = bitCount(Number.parseInt(hash.slice(0, 8), 16)) + bitCount(Number.parseInt(hash.slice(8), 16));
  return bits >= 4 && bits <= 60;
}

function groups(items, { threshold = 6 } = {}) {
  const valid = items.filter((item) => HASH.test(item.hash || '') && informative(item.hash));
  const parent = valid.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== root) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const best = new Map();
  for (let band = 0; band < 8; band++) {
    const buckets = new Map();
    valid.forEach((item, index) => {
      const key = item.hash.slice(band * 2, band * 2 + 2);
      const list = buckets.get(key);
      if (list) list.push(index);
      else buckets.set(key, [index]);
    });
    for (const list of buckets.values()) {
      if (list.length < 2 || list.length > 400) continue;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (find(a) === find(b)) continue;
          const gap = distance(valid[a].hash, valid[b].hash);
          if (gap > threshold) continue;
          parent[find(a)] = find(b);
          const pair = `${Math.min(a, b)}:${Math.max(a, b)}`;
          if (!best.has(pair)) best.set(pair, gap);
        }
      }
    }
  }
  const grouped = new Map();
  valid.forEach((item, index) => {
    const root = find(index);
    const list = grouped.get(root);
    if (list) list.push(item);
    else grouped.set(root, [item]);
  });
  return [...grouped.values()].filter((list) => list.length > 1);
}

function toHsl(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { hue: 0, saturation: 0, lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
  else if (max === g) hue = ((b - r) / delta + 2) * 60;
  else hue = ((r - g) / delta + 4) * 60;
  return { hue, saturation, lightness };
}

function familyOf(color) {
  const hex = String(color || '').toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex) || hex === '#ffffff') return 'neutral';
  const { hue, saturation, lightness } = toHsl(hex);
  if (saturation < 0.15 || lightness < 0.1 || lightness > 0.94) return 'neutral';
  if (hue >= 15 && hue < 50 && lightness < 0.38 && saturation < 0.75) return 'brown';
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 195) return 'teal';
  if (hue < 255) return 'blue';
  if (hue < 290) return 'purple';
  return 'pink';
}

module.exports = { FAMILIES, HASH, differenceHash, distance, informative, groups, familyOf };
