import type { ReactElement } from 'react';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import LinkRounded from '@mui/icons-material/LinkRounded';
import InsertLinkRounded from '@mui/icons-material/InsertLinkRounded';
import NotesRounded from '@mui/icons-material/NotesRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import CodeRounded from '@mui/icons-material/CodeRounded';
import { shareFormats, type ShareFormat } from '../lib/share';
import type { FileType } from '../lib/types';
import { copyText } from '../lib/clipboard';
import { useToast } from './Toaster';
import { fonts } from '../theme/tokens';
import { t } from '../lib/i18n';

export const SHARE_ICONS: Record<ShareFormat['key'], ReactElement> = {
  view: <LinkRounded />,
  direct: <InsertLinkRounded />,
  markdown: <NotesRounded />,
  bbcode: <ForumRounded />,
  html: <CodeRounded />,
};

export function ShareMenuItems({
  file,
  onDone,
}: {
  file: { filename: string; type: FileType; urls: { view: string; direct: string } };
  onDone?: () => void;
}) {
  const toast = useToast();
  return shareFormats(file).map((format) => (
    <MenuItem
      key={format.key}
      onClick={async () => {
        onDone?.();
        const ok = await copyText(format.value);
        toast(ok ? format.copied : t('Kopieren hat nicht geklappt.'), { variant: ok ? 'success' : 'error', duration: 2400 });
      }}
    >
      <ListItemIcon>{SHARE_ICONS[format.key]}</ListItemIcon>
      <ListItemText
        primary={t('{label} kopieren', { label: format.label })}
        secondary={format.value}
        slotProps={{
          secondary: {
            noWrap: true,
            sx: { fontFamily: fonts.mono, fontSize: '0.6875rem', maxWidth: 240 },
          },
        }}
      />
    </MenuItem>
  ));
}
