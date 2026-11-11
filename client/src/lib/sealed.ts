export const SEALED_EXTENSION = '.mse';
export const SEALED_LIMIT = 1024 ** 3;

const MAGIC = [0x4d, 0x53, 0x45, 0x31];
const CHUNK = 1024 * 1024;
const HEADER = 20;
const TAG = 16;
const META_COUNTER = 0xffffffff;

export interface SealedMeta {
  name: string;
  type: string;
  size: number;
  kind: 'file' | 'text';
  syntax?: string;
}

export class SealedError extends Error {
  constructor(public reason: 'key' | 'format' | 'corrupt') {
    super(reason);
  }
}

export const isSealedName = (name: string) => name.toLowerCase().endsWith(SEALED_EXTENSION);

export function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function parseKey(text: string): Uint8Array | null {
  const value = text.trim();
  const match = /(?:^|[#&?])k=([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/.exec(value) || /^#?([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return null;
  const padded = match[1].replace(/-/g, '+').replace(/_/g, '/') + '=';
  try {
    const binary = atob(padded);
    if (binary.length !== 32) return null;
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export const keyFromHash = (hash = window.location.hash) => (hash.length > 1 ? parseKey(hash.slice(1)) : null);

export const linkWithKey = (url: string, key: string) => `${url.replace(/#.*$/, '')}#k=${key}`;

function nonce(prefix: Uint8Array, counter: number) {
  const value = new Uint8Array(12);
  value.set(prefix, 0);
  new DataView(value.buffer).setUint32(8, counter);
  return value;
}

function chunkData(header: Uint8Array, last: boolean) {
  const data = new Uint8Array(17);
  data.set(header.subarray(0, 16), 0);
  data[16] = last ? 1 : 0;
  return data;
}

export async function seal(file: Blob, meta: SealedMeta, onProgress?: (fraction: number) => void) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const prefix = crypto.getRandomValues(new Uint8Array(8));
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const header = new Uint8Array(HEADER);
  header.set(MAGIC, 0);
  const view = new DataView(header.buffer);
  view.setUint32(4, CHUNK);
  header.set(prefix, 8);
  view.setUint32(16, metaBytes.length + TAG);
  const sealedMeta = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce(prefix, META_COUNTER), additionalData: header },
    key,
    metaBytes
  );
  const parts: BlobPart[] = [header, new Blob([sealedMeta])];
  const count = Math.max(1, Math.ceil(file.size / CHUNK));
  for (let index = 0; index < count; index++) {
    const plain = await file.slice(index * CHUNK, (index + 1) * CHUNK).arrayBuffer();
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce(prefix, index), additionalData: chunkData(header, index === count - 1) },
      key,
      plain
    );
    parts.push(new Blob([cipher]));
    onProgress?.((index + 1) / count);
  }
  return { blob: new Blob(parts, { type: 'application/octet-stream' }), key: toBase64Url(raw) };
}

class ByteQueue {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array) {
    if (!bytes.length) return;
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  take(count: number) {
    const out = new Uint8Array(count);
    let filled = 0;
    while (filled < count) {
      const head = this.parts[0];
      const needed = count - filled;
      if (head.length <= needed) {
        out.set(head, filled);
        filled += head.length;
        this.parts.shift();
      } else {
        out.set(head.subarray(0, needed), filled);
        this.parts[0] = head.subarray(needed);
        filled += needed;
      }
    }
    this.length -= count;
    return out;
  }
}

export interface Opened {
  meta: SealedMeta;
  blob: Blob;
}

export async function unseal(
  stream: ReadableStream<Uint8Array>,
  rawKey: Uint8Array,
  { onMeta, onProgress }: { onMeta?: (meta: SealedMeta) => void; onProgress?: (bytes: number) => void } = {}
): Promise<Opened> {
  const key = await crypto.subtle.importKey('raw', rawKey as BufferSource, 'AES-GCM', false, ['decrypt']);
  const reader = stream.getReader();
  const queue = new ByteQueue();
  let received = 0;
  let done = false;
  const fill = async (count: number) => {
    while (queue.length < count && !done) {
      const next = await reader.read();
      if (next.done) done = true;
      else {
        queue.push(next.value);
        received += next.value.length;
        onProgress?.(received);
      }
    }
    return queue.length >= count;
  };
  const decrypt = async (iv: Uint8Array, additionalData: Uint8Array, data: Uint8Array, reason: 'key' | 'corrupt') => {
    try {
      return await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: additionalData as BufferSource },
        key,
        data as BufferSource
      );
    } catch {
      throw new SealedError(reason);
    }
  };

  if (!(await fill(HEADER))) throw new SealedError('format');
  const header = queue.take(HEADER);
  if (!MAGIC.every((byte, index) => header[index] === byte)) throw new SealedError('format');
  const view = new DataView(header.buffer);
  const chunk = view.getUint32(4);
  const metaLength = view.getUint32(16);
  if (chunk < 1024 || chunk > 64 * 1024 * 1024 || metaLength <= TAG || metaLength > 1024 * 1024) throw new SealedError('format');
  const prefix = header.subarray(8, 16);
  if (!(await fill(metaLength))) throw new SealedError('corrupt');
  let meta: SealedMeta;
  try {
    meta = JSON.parse(new TextDecoder().decode(await decrypt(nonce(prefix, META_COUNTER), header, queue.take(metaLength), 'key')));
  } catch (error) {
    if (error instanceof SealedError) throw error;
    throw new SealedError('corrupt');
  }
  if (!meta || typeof meta.name !== 'string' || typeof meta.size !== 'number') throw new SealedError('corrupt');
  onMeta?.(meta);
  const frame = chunk + TAG;
  const parts: BlobPart[] = [];
  let index = 0;
  let size = 0;
  for (;;) {
    const more = await fill(frame + 1);
    if (!more) {
      if (queue.length < TAG) throw new SealedError('corrupt');
      const plain = await decrypt(nonce(prefix, index), chunkData(header, true), queue.take(queue.length), 'corrupt');
      parts.push(new Blob([plain]));
      size += plain.byteLength;
      break;
    }
    const plain = await decrypt(nonce(prefix, index), chunkData(header, false), queue.take(frame), 'corrupt');
    parts.push(new Blob([plain]));
    size += plain.byteLength;
    index += 1;
  }
  if (size !== meta.size) throw new SealedError('corrupt');
  return { meta, blob: new Blob(parts, { type: meta.type || 'application/octet-stream' }) };
}
