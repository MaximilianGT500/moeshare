export interface SharedItems {
  files: File[];
  text: string;
}

export async function takeSharedItems(): Promise<SharedItems> {
  const result: SharedItems = { files: [], text: '' };
  if (!('caches' in window)) return result;
  try {
    const cache = await caches.open('moeshare-share');
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      const path = new URL(request.url).pathname;
      if (response && path === '/__share/text') result.text = await response.text();
      else if (response && path.startsWith('/__share/file/')) {
        const blob = await response.blob();
        const name = decodeURIComponent(response.headers.get('x-name') || 'datei');
        result.files.push(new File([blob], name, { type: blob.type || 'application/octet-stream' }));
      }
      await cache.delete(request);
    }
  } catch {}
  return result;
}

export function sharedUrl(text: string): string | null {
  const match = /https?:\/\/\S+/.exec(text.trim());
  if (!match) return null;
  try {
    return new URL(match[0]).href;
  } catch {
    return null;
  }
}
