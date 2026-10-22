import { t } from './i18n';

export type ShareXKind = 'files' | 'texts' | 'links';

export interface ShareXFeatures {
  texts?: boolean;
  links?: boolean;
}

interface ShareXOptions {
  siteTitle: string;
  baseUrl: string;
  token: string;
  kind?: ShareXKind;
  features?: ShareXFeatures;
}

export const shareXKinds = (features: ShareXFeatures = {}): ShareXKind[] =>
  ['files', features.texts ? 'texts' : null, features.links ? 'links' : null].filter(Boolean) as ShareXKind[];

export const shareXKindLabel = (kind: ShareXKind) =>
  kind === 'texts' ? t('Text-Uploader') : kind === 'links' ? t('Link-Kürzer') : t('Datei-Uploader');

export function shareXConfig({ siteTitle, baseUrl, token, kind = 'files', features = {} }: ShareXOptions): string {
  const name = siteTitle || 'MoeShare';
  const base = { Version: '17.0.0', RequestMethod: 'POST', Headers: { Authorization: token }, ErrorMessage: '{json:error}' };
  if (kind === 'texts') {
    return JSON.stringify(
      {
        ...base,
        Name: `${name} (${t('Texte')})`,
        DestinationType: 'TextUploader',
        RequestURL: `${baseUrl}/api/texts`,
        Body: 'FormURLEncoded',
        Arguments: { content: '{input}' },
        URL: '{json:view}',
        DeletionURL: '{json:delete}',
      },
      null,
      2
    );
  }
  if (kind === 'links') {
    return JSON.stringify(
      {
        ...base,
        Name: `${name} (${t('Kurzlinks')})`,
        DestinationType: 'URLShortener',
        RequestURL: `${baseUrl}/api/shorten`,
        Body: 'FormURLEncoded',
        Arguments: { url: '{input}' },
        URL: '{json:url}',
      },
      null,
      2
    );
  }
  return JSON.stringify(
    {
      ...base,
      Name: name,
      DestinationType: features.texts ? 'ImageUploader, FileUploader' : 'ImageUploader, TextUploader, FileUploader',
      RequestURL: `${baseUrl}/upload`,
      Body: 'MultipartFormData',
      FileFormName: 'file',
      URL: '{json:view}',
      ThumbnailURL: '{json:preview}',
      DeletionURL: '{json:delete}',
    },
    null,
    2
  );
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function shareXFilename(siteTitle: string, kind: ShareXKind = 'files') {
  const base = (siteTitle || 'MoeShare').replace(/[^\w.-]+/g, '-');
  if (kind === 'texts') return `${base}-${t('Texte')}.sxcu`;
  if (kind === 'links') return `${base}-${t('Kurzlinks')}.sxcu`;
  return `${base}.sxcu`;
}

export function downloadShareX(options: ShareXOptions) {
  const kind = options.kind || 'files';
  downloadText(shareXFilename(options.siteTitle, kind), shareXConfig({ ...options, kind }));
}
