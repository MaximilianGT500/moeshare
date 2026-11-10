const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const SEEK_HEAD = 0x114d9b74;
const INFO = 0x1549a966;
const CLUSTER = 0x1f43b675;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
const HEAD_BYTES = 256 * 1024;

interface Vint {
  length: number;
  value: number;
  unknown: boolean;
}

function readId(bytes: Uint8Array, pos: number): { id: number; length: number } | null {
  const first = bytes[pos];
  if (first === undefined) return null;
  let length = 1;
  let mask = 0x80;
  while (length <= 4 && !(first & mask)) {
    length += 1;
    mask >>= 1;
  }
  if (length > 4 || pos + length > bytes.length) return null;
  let id = 0;
  for (let i = 0; i < length; i++) id = id * 256 + bytes[pos + i];
  return { id, length };
}

function readSize(bytes: Uint8Array, pos: number): Vint | null {
  const first = bytes[pos];
  if (first === undefined) return null;
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && !(first & mask)) {
    length += 1;
    mask >>= 1;
  }
  if (length > 8 || pos + length > bytes.length) return null;
  let value = first & (mask - 1);
  let unknown = value === mask - 1;
  for (let i = 1; i < length; i++) {
    const byte = bytes[pos + i];
    value = value * 256 + byte;
    if (byte !== 0xff) unknown = false;
  }
  return { length, value, unknown };
}

function encodeSize(value: number, length = 0): Uint8Array | null {
  let size = length || 1;
  while (value > 2 ** (7 * size) - 2) {
    if (length || size === 8) return null;
    size += 1;
  }
  const out = new Uint8Array(size);
  let rest = value;
  for (let i = size - 1; i >= 0; i--) {
    out[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  out[0] |= 0x80 >> (size - 1);
  return out;
}

function readUint(bytes: Uint8Array, pos: number, length: number) {
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + bytes[pos + i];
  return value;
}

function float64(value: number) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value);
  return out;
}

export async function fixWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
  if (!(durationMs > 0)) return blob;
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
  const rest = blob.slice(head.length);
  const header = readId(head, 0);
  if (!header || header.id !== EBML) return blob;
  const headerSize = readSize(head, header.length);
  if (!headerSize || headerSize.unknown) return blob;
  const segmentAt = header.length + headerSize.length + headerSize.value;
  const segment = readId(head, segmentAt);
  if (!segment || segment.id !== SEGMENT) return blob;
  const segmentSize = readSize(head, segmentAt + segment.length);
  if (!segmentSize) return blob;
  const segmentSizeAt = segmentAt + segment.length;
  let pos = segmentSizeAt + segmentSize.length;
  let seekHead = false;
  while (pos < head.length) {
    const child = readId(head, pos);
    if (!child) return blob;
    const size = readSize(head, pos + child.length);
    if (!size || size.unknown || child.id === CLUSTER) return blob;
    if (child.id === SEEK_HEAD) seekHead = true;
    if (child.id === INFO) break;
    pos += child.length + size.length + size.value;
  }
  const infoId = readId(head, pos);
  if (!infoId || infoId.id !== INFO) return blob;
  const infoSize = readSize(head, pos + infoId.length)!;
  const contentStart = pos + infoId.length + infoSize.length;
  const contentEnd = contentStart + infoSize.value;
  if (contentEnd > head.length) return blob;

  let scale = 1000000;
  let durationAt = -1;
  let durationLength = 0;
  for (let at = contentStart; at < contentEnd;) {
    const child = readId(head, at);
    const size = child ? readSize(head, at + child.length) : null;
    if (!child || !size || size.unknown) return blob;
    const valueAt = at + child.length + size.length;
    if (child.id === TIMECODE_SCALE) scale = readUint(head, valueAt, size.value) || scale;
    if (child.id === DURATION) {
      durationAt = valueAt;
      durationLength = size.value;
    }
    at = valueAt + size.value;
  }
  const units = (durationMs * 1000000) / scale;

  if (durationAt >= 0) {
    const patched = head.slice();
    const view = new DataView(patched.buffer);
    if (durationLength !== 8 && durationLength !== 4) return blob;
    const existing = durationLength === 8 ? view.getFloat64(durationAt) : view.getFloat32(durationAt);
    if (existing > 0) return blob;
    if (durationLength === 8) view.setFloat64(durationAt, units);
    else view.setFloat32(durationAt, units);
    return new Blob([patched, rest], { type: blob.type });
  }
  if (seekHead) return blob;

  const element = new Uint8Array([0x44, 0x89, 0x88, ...float64(units)]);
  const nextInfoSize = encodeSize(infoSize.value + element.length);
  if (!nextInfoSize) return blob;
  const grown = infoId.length + nextInfoSize.length + infoSize.value + element.length - (contentEnd - pos);
  let segmentPatch: Uint8Array | null = null;
  if (!segmentSize.unknown) {
    segmentPatch = encodeSize(segmentSize.value + grown, segmentSize.length);
    if (!segmentPatch) return blob;
  }
  const before = head.slice(0, pos);
  if (segmentPatch) before.set(segmentPatch, segmentSizeAt);
  const parts = [
    before,
    head.slice(pos, pos + infoId.length),
    nextInfoSize,
    head.slice(contentStart, contentEnd),
    element,
    head.slice(contentEnd),
    rest,
  ];
  return new Blob(parts as BlobPart[], { type: blob.type });
}
