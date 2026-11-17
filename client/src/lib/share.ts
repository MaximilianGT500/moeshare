import type { FileType } from './types';
import { t } from './i18n';

export interface ShareFormat {
  key: 'view' | 'direct' | 'markdown' | 'bbcode' | 'html';
  label: string;
  value: string;
  copied: string;
}

interface Shareable {
  filename: string;
  alt?: string | null;
  type: FileType;
  urls: { view: string; direct: string };
}

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function shareFormats(file: Shareable): ShareFormat[] {
  const { filename } = file;
  const { view, direct } = file.urls;
  const isImage = file.type === 'image';
  const label = file.alt || filename;
  return [
    { key: 'view', label: t('Ansichts-Link'), value: view, copied: t('Ansichts-Link kopiert') },
    { key: 'direct', label: t('Direktlink'), value: direct, copied: t('Direktlink kopiert') },
    {
      key: 'markdown',
      label: t('Markdown'),
      value: isImage ? `![${label.replace(/([\\[\]])/g, '\\$1')}](${direct})` : `[${filename}](${view})`,
      copied: t('Markdown kopiert'),
    },
    {
      key: 'bbcode',
      label: t('BBCode'),
      value: isImage ? `[img]${direct}[/img]` : `[url=${view}]${filename}[/url]`,
      copied: t('BBCode kopiert'),
    },
    {
      key: 'html',
      label: 'HTML',
      value: isImage
        ? `<a href="${view}" target="_blank"><img src="${direct}" alt="${escapeAttr(label)}" /></a>`
        : `<a href="${view}" target="_blank">${filename}</a>`,
      copied: t('HTML kopiert'),
    },
  ];
}
