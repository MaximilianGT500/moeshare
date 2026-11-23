import { useEffect, useState, type FormEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import PhotoAlbumOutlined from '@mui/icons-material/PhotoAlbumOutlined';
import type { Album, ApiTokenInfo, ExpiryChoice, TokenPreset, TokenScope, UrlStyle } from '../lib/types';
import { listAlbums } from '../lib/api';
import { t } from '../lib/i18n';
import { ExpirySelect, UrlStyleSelect, expiryLabel, urlStyleLabel } from './ShareOptions';
import { GrowTransition } from './transitions';
import { c, radius } from '../theme/tokens';

export const TOKEN_SCOPES: TokenScope[] = ['upload', 'links', 'read', 'delete'];

const SCOPE_INFO: Record<TokenScope, { label: () => string; description: () => string }> = {
  upload: { label: () => t('Hochladen'), description: () => t('Dateien, Texte und neue Fassungen') },
  links: { label: () => t('Links kürzen'), description: () => t('Kurzlinks über die API anlegen') },
  read: { label: () => t('Dateiliste lesen'), description: () => t('Die Namen deiner Dateien abrufen, etwa für Skripte') },
  delete: { label: () => t('Löschen'), description: () => t('Dateien über die API löschen oder in den Papierkorb legen') },
};

export const scopeLabel = (scope: TokenScope) => SCOPE_INFO[scope].label();

export function presetSummary(preset: TokenPreset | null, albums: Album[] = []) {
  if (!preset) return [];
  const parts: string[] = [];
  if (preset.album) {
    const album = albums.find((item) => item.id === preset.album);
    parts.push(album ? t('Album „{title}“', { title: album.title }) : t('ein Album'));
  }
  if (preset.tags)
    parts.push(
      preset.tags
        .split(',')
        .map((tag) => `#${tag}`)
        .join(' ')
    );
  if (preset.expires)
    parts.push(
      preset.expires === 'never' ? t('läuft nie ab') : t('löschen nach {time}', { time: expiryLabel(preset.expires as ExpiryChoice) })
    );
  if (preset.urlStyle) parts.push(urlStyleLabel(preset.urlStyle as UrlStyle));
  if (preset.warning) parts.push(preset.warning === true ? t('mit Inhaltswarnung') : t('Warnung „{text}“', { text: preset.warning }));
  return parts;
}

export interface TokenDraft {
  name: string;
  scopes: TokenScope[] | null;
  preset: TokenPreset | null;
}

export function TokenDialog({
  open,
  token,
  maxExpiry,
  onClose,
  onSubmit,
}: {
  open: boolean;
  token: ApiTokenInfo | null;
  maxExpiry: ExpiryChoice;
  onClose: () => void;
  onSubmit: (draft: TokenDraft) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<TokenScope[]>(TOKEN_SCOPES);
  const [album, setAlbum] = useState<number | ''>('');
  const [tags, setTags] = useState('');
  const [expires, setExpires] = useState<ExpiryChoice | ''>('');
  const [style, setStyle] = useState<UrlStyle | ''>('');
  const [warning, setWarning] = useState(false);
  const [warningText, setWarningText] = useState('');
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(token?.name ?? '');
    setScopes(token?.scopes ?? TOKEN_SCOPES);
    const preset = token?.preset ?? {};
    setAlbum(preset.album ?? '');
    setTags(preset.tags ? preset.tags.split(',').join(', ') : '');
    setExpires((preset.expires as ExpiryChoice) ?? '');
    setStyle((preset.urlStyle as UrlStyle) ?? '');
    setWarning(Boolean(preset.warning));
    setWarningText(typeof preset.warning === 'string' ? preset.warning : '');
    setBusy(false);
    listAlbums()
      .then((result) => setAlbums(result.albums.filter((item) => !item.rule)))
      .catch(() => setAlbums([]));
  }, [open, token]);

  const toggle = (scope: TokenScope) =>
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : TOKEN_SCOPES.filter((item) => item === scope || current.includes(item))
    );

  const uploads = scopes.includes('upload');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const preset: TokenPreset = {};
    if (uploads) {
      if (album) preset.album = album;
      if (tags.trim()) preset.tags = tags;
      if (expires) preset.expires = expires;
      if (style) preset.urlStyle = style;
      if (warning) preset.warning = warningText.trim() || true;
    }
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        scopes: scopes.length === TOKEN_SCOPES.length ? null : scopes,
        preset: Object.keys(preset).length ? preset : null,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="token-dialog-title"
    >
      <Box component="form" onSubmit={submit}>
        <DialogTitle id="token-dialog-title">{token ? t('Token bearbeiten') : t('Neues API-Token')}</DialogTitle>
        <DialogContent>
          <TextField
            label={t('Name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus={!token}
            fullWidth
            helperText={t('Woran du das Token später erkennst, z. B. „ShareX am PC“ oder „Backup-Skript“.')}
            slotProps={{ htmlInput: { maxLength: 60 } }}
            sx={{ mt: 1 }}
          />

          <Typography variant="subtitle2" component="h3" sx={{ mt: 3, mb: 0.5 }}>
            {t('Was darf das Token?')}
          </Typography>
          <Box
            role="group"
            aria-label={t('Rechte')}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2 }}
          >
            {TOKEN_SCOPES.map((scope) => (
              <FormControlLabel
                key={scope}
                sx={{ alignItems: 'flex-start', mr: 0, py: 0.5 }}
                control={
                  <Checkbox
                    checked={scopes.includes(scope)}
                    disabled={busy || (scopes.length === 1 && scopes.includes(scope))}
                    onChange={() => toggle(scope)}
                    sx={{ mt: -0.75 }}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {SCOPE_INFO[scope].label()}
                    </Typography>
                    <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
                      {SCOPE_INFO[scope].description()}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </Box>

          <Collapse in={uploads}>
            <Box sx={{ mt: 2.5, p: 2, borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerLow }}>
              <Typography variant="subtitle2" component="h3">
                {t('Vorgaben für Uploads')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                {t('Gelten für alles, was mit diesem Token hochgeladen wird, solange das Programm selbst nichts anderes angibt.')}
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                <TextField
                  select
                  size="small"
                  label={t('Album')}
                  value={albums === null ? '' : album}
                  onChange={(event) => setAlbum(event.target.value === '' ? '' : Number(event.target.value))}
                  disabled={busy || albums === null}
                  slotProps={{
                    select: { displayEmpty: true },
                    inputLabel: { shrink: true },
                    input: { startAdornment: <PhotoAlbumOutlined sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" /> },
                  }}
                >
                  <MenuItem value="">{t('Kein Album')}</MenuItem>
                  {(albums || []).map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.title}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  label={t('Tags')}
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="screenshot, arbeit"
                  disabled={busy}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <ExpirySelect
                  value={expires}
                  onChange={setExpires}
                  max={maxExpiry}
                  includeDefault={t('Wie im Konto eingestellt')}
                  disabled={busy}
                />
                <UrlStyleSelect value={style} onChange={setStyle} includeDefault={t('Wie im Konto eingestellt')} />
              </Box>
              <FormControlLabel
                sx={{ mt: 1.5 }}
                control={<Switch checked={warning} onChange={(event) => setWarning(event.target.checked)} disabled={busy} />}
                label={t('Mit Inhaltswarnung')}
              />
              <Collapse in={warning}>
                <TextField
                  size="small"
                  fullWidth
                  label={t('Warnung (optional)')}
                  value={warningText}
                  onChange={(event) => setWarningText(event.target.value)}
                  placeholder={t('z. B. Spoiler zur neuen Folge')}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                  sx={{ mt: 1.5 }}
                />
              </Collapse>
            </Box>
          </Collapse>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            {t('Abbrechen')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !name.trim()}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {token ? t('Speichern') : t('Erstellen')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
