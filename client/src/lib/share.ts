import type { FileType } from './types';

export interface ShareFormat {
  key: 'view' | 'direct' | 'markdown' | 'bbcode' | 'html';
  label: string;
  value: string;
  copied: string;
}

interface Shareable {
  filename: string;
  type: FileType;
  urls: { view: string; direct: string };
}

export function shareFormats(file: Shareable): ShareFormat[] {
  const { filename } = file;
  const { view, direct } = file.urls;
  const isImage = file.type === 'image';
  return [
    { key: 'view', label: 'Ansichts-Link', value: view, copied: 'Ansichts-Link kopiert' },
    { key: 'direct', label: 'Direktlink', value: direct, copied: 'Direktlink kopiert' },
    {
      key: 'markdown',
      label: 'Markdown',
      value: isImage ? `![${filename}](${direct})` : `[${filename}](${view})`,
      copied: 'Markdown kopiert',
    },
    {
      key: 'bbcode',
      label: 'BBCode',
      value: isImage ? `[img]${direct}[/img]` : `[url=${view}]${filename}[/url]`,
      copied: 'BBCode kopiert',
    },
    {
      key: 'html',
      label: 'HTML',
      value: isImage
        ? `<a href="${view}" target="_blank"><img src="${direct}" alt="${filename}" /></a>`
        : `<a href="${view}" target="_blank">${filename}</a>`,
      copied: 'HTML kopiert',
    },
  ];
}
