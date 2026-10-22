import { Fragment, createElement, type ReactNode } from 'react';
import { readBoot } from './boot';

export type Language = 'de' | 'en';
type Params = Record<string, string | number | null | undefined>;

const boot = readBoot() as { language?: string };

export const language: Language = boot.language === 'en' ? 'en' : 'de';
export const locale = language === 'en' ? 'en-GB' : 'de-DE';

const messages: Record<string, string> =
  (language === 'en' && (window as { __MOESHARE_MESSAGES__?: Record<string, string> }).__MOESHARE_MESSAGES__) || {};

export function t(text: string, params?: Params): string {
  const template = messages[text] ?? text;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key] ?? '') : match));
}

export function rich(text: string, nodes: Record<string, ReactNode>, params?: Params): ReactNode[] {
  return t(text, params)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part, index) => {
      const match = /^\{(\w+)\}$/.exec(part);
      return createElement(Fragment, { key: index }, match && match[1] in nodes ? nodes[match[1]] : part);
    });
}

export function tn(count: number, one: string, other: string, params?: Params): string {
  return t(count === 1 ? one : other, { count: new Intl.NumberFormat(locale).format(count), ...params });
}

export async function switchLanguage(next: Language) {
  try {
    document.cookie = `ms_lang=${next}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
    await fetch('/api/language', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ language: next }),
    });
  } catch {}
  window.location.reload();
}
