export interface ZipEntry {
  name: string;
  path: string;
  size: number;
  compressedSize: number;
  method: number;
  offset: number;
  date: Date;
}

interface ZipListing {
  entries: ZipEntry[];
  skipped: number;
}

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX = 0xffffffff;

export const canUnzip = () => typeof window !== 'undefined' && 'DecompressionStream' in window;

export const isZip = (file: File) =>
  /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

async function bytes(file: Blob, start: number, end: number) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

const u64 = (view: DataView, offset: number) => Number(view.getBigUint64(offset, true));

function decodeName(raw: Uint8Array, utf8: boolean) {
  if (utf8) return new TextDecoder('utf-8').decode(raw);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    return new TextDecoder('windows-1252').decode(raw);
  }
}

const hidden = (path: string) =>
  path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX') || /(^|\/)(Thumbs\.db|desktop\.ini)$/i.test(path);

function dosDate(time: number, date: number) {
  return new Date(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2);
}

export async function listZip(file: File): Promise<ZipListing> {
  const tailStart = Math.max(0, file.size - 65557);
  const tail = await bytes(file, tailStart, file.size);
  let end = -1;
  for (let index = tail.byteLength - 22; index >= 0; index--) {
    if (tail.getUint32(index, true) === EOCD) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip');
  let count = tail.getUint16(end + 10, true);
  let directorySize = tail.getUint32(end + 12, true);
  let directoryOffset = tail.getUint32(end + 16, true);
  if (count === 0xffff || directorySize === MAX || directoryOffset === MAX) {
    const locator = end - 20;
    if (locator < 0 || tail.getUint32(locator, true) !== ZIP64_LOCATOR) throw new Error('broken zip64');
    const recordOffset = u64(tail, locator + 8);
    const record = await bytes(file, recordOffset, recordOffset + 56);
    if (record.getUint32(0, true) !== ZIP64_EOCD) throw new Error('broken zip64');
    count = u64(record, 32);
    directorySize = u64(record, 40);
    directoryOffset = u64(record, 48);
  }
  const directory = await bytes(file, directoryOffset, directoryOffset + directorySize);
  const entries: ZipEntry[] = [];
  let skipped = 0;
  let cursor = 0;
  for (let index = 0; index < count && cursor + 46 <= directory.byteLength; index++) {
    if (directory.getUint32(cursor, true) !== CENTRAL) break;
    const flags = directory.getUint16(cursor + 8, true);
    const method = directory.getUint16(cursor + 10, true);
    const time = directory.getUint16(cursor + 12, true);
    const date = directory.getUint16(cursor + 14, true);
    let compressedSize = directory.getUint32(cursor + 20, true);
    let size = directory.getUint32(cursor + 24, true);
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);
    let offset = directory.getUint32(cursor + 42, true);
    const nameBytes = new Uint8Array(directory.buffer, directory.byteOffset + cursor + 46, nameLength);
    const path = decodeName(nameBytes, Boolean(flags & 0x800)).replace(/\\/g, '/');
    let extra = cursor + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = directory.getUint16(extra, true);
      const length = directory.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        if (size === MAX) {
          size = u64(directory, field);
          field += 8;
        }
        if (compressedSize === MAX) {
          compressedSize = u64(directory, field);
          field += 8;
        }
        if (offset === MAX) offset = u64(directory, field);
      }
      extra += 4 + length;
    }
    cursor = extraEnd + commentLength;
    const directoryEntry = path.endsWith('/');
    if (directoryEntry) continue;
    if (flags & 1 || (method !== 0 && method !== 8) || hidden(path) || size === 0) {
      skipped += 1;
      continue;
    }
    entries.push({ name: path.split('/').pop() || path, path, size, compressedSize, method, offset, date: dosDate(time, date) });
  }
  return { entries, skipped };
}

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  txt: 'text/plain',
  pdf: 'application/pdf',
};

export async function extractEntry(file: File, entry: ZipEntry): Promise<File> {
  const header = await bytes(file, entry.offset, entry.offset + 30);
  if (header.getUint32(0, true) !== LOCAL) throw new Error('broken entry');
  const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const raw = file.slice(start, start + entry.compressedSize);
  const data = entry.method === 0 ? raw : await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  const ext = entry.name.split('.').pop()?.toLowerCase() || '';
  return new File([data], entry.name, { type: TYPES[ext] || '', lastModified: entry.date.getTime() });
}

export function commonFolder(entries: ZipEntry[]) {
  const firsts = new Set(entries.map((entry) => (entry.path.includes('/') ? entry.path.split('/')[0] : '')));
  return firsts.size === 1 ? [...firsts][0] : '';
}
