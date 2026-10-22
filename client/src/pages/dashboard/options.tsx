import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import TuneRounded from '@mui/icons-material/TuneRounded';
import type { UploadOptions } from '../../lib/api';
import type { Album, ExpiryChoice, TagCount, UploadOptionsInfo, UrlStyle } from '../../lib/types';
import { t } from '../../lib/i18n';
import { GrowTransition } from '../../components/transitions';
import {
  DomainSelect,
  ExpirySelect,
  ProtectionFields,
  TagInput,
  UrlStyleSelect,
  expiryLabel,
  urlStyleLabel,
} from '../../components/ShareOptions';
import { c } from '../../theme/tokens';

export interface UploadPrefs {
  expires: ExpiryChoice | '';
  passwordEnabled: boolean;
  password: string;
  once: boolean;
  urlStyle: UrlStyle | '';
  domain: string;
  tags: string[];
  album: number | null;
}

export const EMPTY_PREFS: UploadPrefs = {
  expires: '',
  passwordEnabled: false,
  password: '',
  once: false,
  urlStyle: '',
  domain: '',
  tags: [],
  album: null,
};

export const prefsActive = (prefs: UploadPrefs) =>
  Boolean(
    prefs.expires ||
    (prefs.passwordEnabled && prefs.password) ||
    prefs.once ||
    prefs.urlStyle ||
    prefs.domain ||
    prefs.tags.length ||
    prefs.album
  );

export function toUploadOptions(prefs: UploadPrefs): UploadOptions {
  return {
    expires: prefs.expires || undefined,
    password: prefs.passwordEnabled && prefs.password ? prefs.password : undefined,
    maxViews: prefs.once ? 1 : undefined,
    urlStyle: prefs.urlStyle || undefined,
    domain: prefs.domain || undefined,
    tags: prefs.tags.length ? prefs.tags : undefined,
    album: prefs.album || undefined,
  };
}

export function describePrefs(prefs: UploadPrefs, albums: Album[] = []) {
  const parts: string[] = [];
  if (prefs.expires)
    parts.push(prefs.expires === 'never' ? t('Läuft nie ab') : t('Läuft nach {time} ab', { time: expiryLabel(prefs.expires) }));
  if (prefs.passwordEnabled && prefs.password) parts.push(t('Passwort'));
  if (prefs.once) parts.push(t('Einmal-Abruf'));
  if (prefs.urlStyle) parts.push(urlStyleLabel(prefs.urlStyle));
  if (prefs.tags.length) parts.push(prefs.tags.map((tag) => `#${tag}`).join(' '));
  if (prefs.album) parts.push(t('Album: {name}', { name: albums.find((album) => album.id === prefs.album)?.title || '…' }));
  return parts.join(' · ');
}

export function UploadOptionsDialog({
  open,
  value,
  info,
  tags,
  albums,
  onClose,
  onChange,
}: {
  open: boolean;
  value: UploadPrefs;
  info: UploadOptionsInfo;
  tags: TagCount[];
  albums: Album[];
  onClose: () => void;
  onChange: (prefs: UploadPrefs) => void;
}) {
  const [draft, setDraft] = useState<UploadPrefs>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  const passwordMissing = draft.passwordEnabled && !draft.password;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="upload-options-title"
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        <TuneRounded sx={{ fontSize: 28 }} />
      </Box>
      <DialogTitle id="upload-options-title" sx={{ textAlign: 'center' }}>
        {t('Upload-Optionen')}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mb: 2.5 }}>
          {t('Gilt für alle Dateien, die du ab jetzt in diesem Fenster hochlädst. ShareX nutzt die Standardwerte aus deinem Konto.')}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <ExpirySelect
            value={draft.expires}
            onChange={(expires) => setDraft({ ...draft, expires })}
            max={info.maxExpiry}
            includeDefault={t('Standard ({value})', { value: expiryLabel(info.expiry) })}
          />
          <ProtectionFields value={draft} onChange={(next) => setDraft({ ...draft, ...next })} />
          <UrlStyleSelect
            value={draft.urlStyle}
            onChange={(urlStyle) => setDraft({ ...draft, urlStyle })}
            includeDefault={t('Standard ({value})', { value: urlStyleLabel(info.urlStyle) })}
          />
          <DomainSelect
            value={draft.domain}
            onChange={(domain) => setDraft({ ...draft, domain })}
            domains={info.domains}
            includeDefault={t('Standard')}
          />
          <TagInput value={draft.tags} onChange={(next) => setDraft({ ...draft, tags: next })} suggestions={tags} />
          {info.albums && albums.length > 0 && (
            <TextField
              select
              fullWidth
              size="small"
              label={t('Album')}
              value={draft.album ?? ''}
              onChange={(event) => setDraft({ ...draft, album: event.target.value === '' ? null : Number(event.target.value) })}
            >
              <MenuItem value="">{t('Kein Album')}</MenuItem>
              {albums.map((album) => (
                <MenuItem key={album.id} value={album.id}>
                  {album.title}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDraft(EMPTY_PREFS)} disabled={!prefsActive(draft)} sx={{ mr: 'auto' }}>
          {t('Zurücksetzen')}
        </Button>
        <Button onClick={onClose}>{t('Abbrechen')}</Button>
        <Button
          variant="contained"
          disabled={passwordMissing}
          onClick={() => {
            onChange(draft);
            onClose();
          }}
        >
          {t('Übernehmen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
