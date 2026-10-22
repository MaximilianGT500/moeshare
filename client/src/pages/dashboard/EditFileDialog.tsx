import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { ApiError, updateFile, type FilePatch } from '../../lib/api';
import type { ExpiryChoice, FileItem, TagCount, UploadOptionsInfo } from '../../lib/types';
import { formatDateTime } from '../../lib/format';
import { t } from '../../lib/i18n';
import { GrowTransition } from '../../components/transitions';
import { ExpirySelect, ProtectionFields, TagInput } from '../../components/ShareOptions';
import { SYNTAXES } from './TextDialog';
import { c } from '../../theme/tokens';

export function EditFileDialog({
  file,
  info,
  tags,
  onClose,
  onSaved,
}: {
  file: FileItem | null;
  info: UploadOptionsInfo;
  tags: TagCount[];
  onClose: () => void;
  onSaved: (file: FileItem) => void;
}) {
  const [title, setTitle] = useState('');
  const [fileTags, setFileTags] = useState<string[]>([]);
  const [expires, setExpires] = useState<ExpiryChoice | ''>('');
  const [protection, setProtection] = useState({ passwordEnabled: false, password: '', once: false });
  const [syntax, setSyntax] = useState('auto');
  const [listed, setListed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    setTitle(file.title || '');
    setFileTags(file.tags || []);
    setExpires('');
    setProtection({ passwordEnabled: file.password, password: '', once: Boolean(file.maxViews) });
    setSyntax(file.syntax || 'auto');
    setListed(Boolean(file.listed));
    setError('');
  }, [file]);

  if (!file) return null;

  const save = async () => {
    const patch: FilePatch = { title: title.trim() || null, tags: fileTags };
    if (expires) patch.expires = expires;
    if (!protection.passwordEnabled && file.password) patch.password = null;
    if (protection.passwordEnabled && protection.password) patch.password = protection.password;
    if (protection.once !== Boolean(file.maxViews)) patch.maxViews = protection.once ? 1 : null;
    if (file.type === 'text') patch.syntax = syntax;
    if (info.profiles && listed !== Boolean(file.listed)) patch.listed = listed;
    setBusy(true);
    setError('');
    try {
      const { file: updated } = await updateFile(file.id, patch);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Die Änderungen konnten nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  };

  const passwordMissing = protection.passwordEnabled && !file.password && !protection.password;

  return (
    <Dialog
      open={!!file}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slots={{ transition: GrowTransition }}
      aria-labelledby="edit-title"
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        <EditOutlined sx={{ fontSize: 28 }} />
      </Box>
      <DialogTitle id="edit-title" sx={{ textAlign: 'center' }}>
        {t('Datei bearbeiten')}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mb: 2.5, wordBreak: 'break-all' }}>
          {file.originalName || file.filename}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <TextField
            label={t('Titel')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            size="small"
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          {file.type === 'text' && (
            <TextField select label={t('Sprache')} value={syntax} onChange={(event) => setSyntax(event.target.value)} size="small">
              {SYNTAXES.map((entry) => (
                <MenuItem key={entry.key} value={entry.key}>
                  {entry.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TagInput value={fileTags} onChange={setFileTags} suggestions={tags} />
          <Box>
            <ExpirySelect
              value={expires}
              onChange={setExpires}
              max={info.maxExpiry}
              label={t('Ablauf')}
              includeDefault={
                file.expiresAt
                  ? t('Unverändert ({when})', { when: formatDateTime(new Date(file.expiresAt)) })
                  : t('Unverändert (läuft nie ab)')
              }
            />
            {expires && expires !== 'never' && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                {t('Die Zeit zählt ab jetzt.')}
              </Typography>
            )}
          </Box>
          <ProtectionFields value={protection} onChange={setProtection} hasPassword={file.password} />
          {info.profiles && (
            <Box>
              <FormControlLabel
                control={<Switch checked={listed} onChange={(event) => setListed(event.target.checked)} />}
                label={t('Im Profil zeigen')}
              />
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: -0.5 }}>
                {protection.passwordEnabled || protection.once
                  ? t('Geschützte Dateien erscheinen nicht im Profil.')
                  : t('Die Datei erscheint auf deiner öffentlichen Profilseite, sobald du sie eingeschaltet hast.')}
              </Typography>
            </Box>
          )}
          {error && (
            <Typography variant="body2" sx={{ color: c.error }}>
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={busy || passwordMissing}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {t('Speichern')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
