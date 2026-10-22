import type { ReactElement } from 'react';
import ForumRounded from '@mui/icons-material/ForumRounded';
import GitHub from '@mui/icons-material/GitHub';
import Google from '@mui/icons-material/Google';
import Microsoft from '@mui/icons-material/Microsoft';
import CodeRounded from '@mui/icons-material/CodeRounded';
import KeyRounded from '@mui/icons-material/KeyRounded';
import { t } from './i18n';

const ICONS: Record<string, ReactElement> = {
  discord: <ForumRounded />,
  github: <GitHub />,
  google: <Google />,
  microsoft: <Microsoft />,
  gitlab: <CodeRounded />,
  oidc: <KeyRounded />,
};

export const providerIcon = (key: string) => ICONS[key] || <KeyRounded />;

export const PROVIDER_LABELS: Record<string, string> = {
  discord: 'Discord',
  github: 'GitHub',
  google: 'Google',
  microsoft: 'Microsoft',
  gitlab: 'GitLab',
  oidc: 'SSO',
  password: t('Passwort'),
  passkey: t('Passkey'),
  token: t('Token'),
  setup: t('Einrichtung'),
};

export const providerLabel = (key: string, fallback?: string) => fallback || PROVIDER_LABELS[key] || key;

export const authUrl = (provider: string, params: Record<string, string | undefined>) => {
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
  const suffix = query.toString();
  return `/auth/${encodeURIComponent(provider)}${suffix ? `?${suffix}` : ''}`;
};
