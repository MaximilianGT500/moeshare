import { isSealedName, linkWithKey } from './sealed';

const STORE = 'moeshare.sealed';
const LIMIT = 2000;

export interface SavedKey {
  key: string;
  name: string;
  type: string;
  size: number;
  at: number;
}

function read(): Record<string, SavedKey> {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORE) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function write(entries: Record<string, SavedKey>) {
  try {
    const sorted = Object.entries(entries)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, LIMIT);
    window.localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(sorted)));
  } catch {}
}

export function rememberKey(slug: string, saved: Omit<SavedKey, 'at'>) {
  const entries = read();
  entries[slug] = { ...saved, at: Date.now() };
  write(entries);
}

export const savedKey = (slug: string): SavedKey | null => read()[slug] || null;

export function forgetKey(slug: string) {
  const entries = read();
  if (!(slug in entries)) return;
  delete entries[slug];
  write(entries);
}

interface Decoratable {
  slug: string;
  filename: string;
  originalName: string | null;
  urls: { view: string };
}

export function withSavedKey<T extends Decoratable>(file: T): T & { sealedKey?: string | null } {
  if (!isSealedName(file.filename)) return file;
  const saved = savedKey(file.slug);
  if (!saved) return { ...file, sealedKey: null };
  return { ...file, originalName: saved.name, sealedKey: saved.key, urls: { ...file.urls, view: linkWithKey(file.urls.view, saved.key) } };
}
