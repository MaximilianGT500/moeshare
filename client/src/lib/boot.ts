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
