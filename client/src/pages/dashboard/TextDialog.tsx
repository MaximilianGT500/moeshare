import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import NoteAddOutlined from '@mui/icons-material/NoteAddOutlined';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { ApiError, createText, type UploadResponse } from '../../lib/api';
import type { TagCount, UploadOptionsInfo } from '../../lib/types';
import { formatBytes } from '../../lib/format';
import { t } from '../../lib/i18n';
import { GrowTransition } from '../../components/transitions';
import { ExpirySelect, ProtectionFields, TagInput, UrlStyleSelect, expiryLabel, urlStyleLabel } from '../../components/ShareOptions';
import type { UploadPrefs } from './options';
import { EMPTY_PREFS, toUploadOptions } from './options';
import { c, css, fonts } from '../../theme/tokens';

export const SYNTAXES: Array<{ key: string; label: string }> = [
  { key: 'auto', label: t('Automatisch erkennen') },
  { key: 'plaintext', label: t('Klartext') },
  { key: 'markdown', label: t('Markdown') },
  { key: 'javascript', label: t('JavaScript') },
  { key: 'typescript', label: t('TypeScript') },
  { key: 'json', label: 'JSON' },
  { key: 'python', label: t('Python') },
  { key: 'bash', label: t('Bash / Shell') },
  { key: 'powershell', label: t('PowerShell') },
  { key: 'xml', label: t('HTML / XML') },
  { key: 'css', label: 'CSS' },
  { key: 'scss', label: 'SCSS' },
  { key: 'sql', label: 'SQL' },
  { key: 'yaml', label: 'YAML' },
  { key: 'ini', label: t('INI / TOML') },
  { key: 'java', label: t('Java') },
  { key: 'kotlin', label: t('Kotlin') },
  { key: 'csharp', label: 'C#' },
  { key: 'cpp', label: t('C / C++') },
  { key: 'go', label: t('Go') },
  { key: 'rust', label: t('Rust') },
  { key: 'php', label: 'PHP' },
  { key: 'ruby', label: t('Ruby') },
  { key: 'swift', label: t('Swift') },
  { key: 'lua', label: t('Lua') },
  { key: 'diff', label: t('Diff') },
  { key: 'dos', label: t('Batch') },
];

export function TextDialog({
  open,
  info,
  tags,
  initialText = '',
  onClose,
  onDone,
}: {
  open: boolean;
  info: UploadOptionsInfo;
  tags: TagCount[];
  initialText?: string;
  onClose: () => void;
  onDone: (result: UploadResponse) => void;
}) {
  const fullScreen = useMediaQuery('(max-width: 599.95px)');
  const [title, setTitle] = useState('');
  const [syntax, setSyntax] = useState('auto');
  const [content, setContent] = useState(initialText);
  const [prefs, setPrefs] = useState<UploadPrefs>(EMPTY_PREFS);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && initialText) setContent(initialText);
  }, [open, initialText]);

  const bytes = new TextEncoder().encode(content).length;
  const tooLong = !!info.textMaxBytes && bytes > info.textMaxBytes;

  const reset = () => {
    setTitle('');
    setSyntax('auto');
    setContent('');
    setPrefs(EMPTY_PREFS);
    setMore(false);
    setError('');
  };

  const submit = async () => {
    if (!content.trim() || tooLong || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await createText(content, { ...toUploadOptions(prefs), title: title.trim() || undefined, syntax });
      reset();
      onDone(result);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Der Text konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="md"
      fullWidth
      fullScreen={fullScreen}
      slots={{ transition: GrowTransition }}
      aria-labelledby="text-title"
    >
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: c.secondary }}>
        <NoteAddOutlined sx={{ fontSize: 28 }} />
      </Box>
      <DialogTitle id="text-title" sx={{ textAlign: 'center' }}>
        {t('Neuer Text')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 220px' }, mt: 0.5 }}>
          <TextField
            label={t('Titel (optional)')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            size="small"
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField select label={t('Sprache')} value={syntax} onChange={(event) => setSyntax(event.target.value)} size="small">
            {SYNTAXES.map((entry) => (
              <MenuItem key={entry.key} value={entry.key}>
                {entry.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={fullScreen ? 12 : 14}
          maxRows={26}
          placeholder={t('Text oder Code hier einfügen …')}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            if (error) setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit();
            if (event.key === 'Tab' && !event.shiftKey) {
              event.preventDefault();
              const target = event.currentTarget.querySelector('textarea');
              if (!target) return;
              const { selectionStart, selectionEnd } = target;
              const next = `${content.slice(0, selectionStart)}  ${content.slice(selectionEnd)}`;
              setContent(next);
              window.requestAnimationFrame(() => target.setSelectionRange(selectionStart + 2, selectionStart + 2));
            }
          }}
          error={tooLong || !!error}
          helperText={
            error ||
            (tooLong
              ? t('Zu lang: höchstens {max} sind erlaubt.', { max: formatBytes(info.textMaxBytes || 0) })
              : t('{size} · Strg+Enter speichert', { size: formatBytes(bytes) }))
          }
          sx={{ mt: 2, '& textarea': { fontFamily: fonts.mono, fontSize: '0.875rem', lineHeight: 1.55 } }}
          slotProps={{ htmlInput: { spellCheck: false, 'aria-label': t('Inhalt') } }}
        />
        <Button
          onClick={() => setMore((value) => !value)}
          endIcon={
            <ExpandMoreRounded sx={{ transform: more ? 'rotate(180deg)' : 'none', transition: `transform 200ms ${css.standard}` }} />
          }
          sx={{ mt: 1 }}
        >
          {t('Ablauf, Schutz und Adresse')}
        </Button>
        <Collapse in={more}>
          <Box sx={{ display: 'grid', gap: 2, pt: 1.5 }}>
            <ExpirySelect
              value={prefs.expires}
              onChange={(expires) => setPrefs({ ...prefs, expires })}
              max={info.maxExpiry}
              includeDefault={t('Standard ({value})', { value: expiryLabel(info.expiry) })}
            />
            <ProtectionFields
              value={prefs}
              onChange={(next) => setPrefs({ ...prefs, ...next })}
              onceHelp={t('Nach dem ersten Öffnen ist der Text für alle anderen weg.')}
            />
            <UrlStyleSelect
              value={prefs.urlStyle}
              onChange={(urlStyle) => setPrefs({ ...prefs, urlStyle })}
              includeDefault={t('Standard ({value})', { value: urlStyleLabel(info.urlStyle) })}
            />
            <TagInput value={prefs.tags} onChange={(next) => setPrefs({ ...prefs, tags: next })} suggestions={tags} />
          </Box>
        </Collapse>
        {!more && (prefs.expires || prefs.passwordEnabled || prefs.once) && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
            {t('Zusätzliche Optionen sind gesetzt.')}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('Abbrechen')}
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy || !content.trim() || tooLong || (prefs.passwordEnabled && !prefs.password)}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <NoteAddOutlined />}
        >
          {busy ? t('Wird gespeichert') : t('Speichern und teilen')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
