import type { AnyBoot, SiteInfo } from './types';

const FALLBACK_SITE: SiteInfo = {
  title: 'MoeShare',
  favicon: '',
  version: '',
  baseUrl: window.location.origin,
  seedColor: '#8b5cf6',
  copyright: '',
  links: [],
  legal: [],
};

let cached: AnyBoot | null = null;

export function readBoot<T extends AnyBoot>(): T {
  if (!cached) {
    const el = document.getElementById('moeshare-data');
    try {
      cached = JSON.parse(el?.textContent || '{}') as AnyBoot;
    } catch {
      cached = { page: 'notfound', site: FALLBACK_SITE, message: '' };
    }
    cached.site = { ...FALLBACK_SITE, ...(cached.site || {}) };
  }
  return cached as T;
}

export const siteName = () => readBoot().site.title || 'MoeShare';

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

export const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char])
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');

export const siteSlug = () => slugOf(siteName()) || 'moeshare';
