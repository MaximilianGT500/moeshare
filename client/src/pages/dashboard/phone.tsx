import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import MoreTimeRounded from '@mui/icons-material/MoreTimeRounded';
import SmartphoneRounded from '@mui/icons-material/SmartphoneRounded';
import type { Album, PhoneLink } from '../../lib/types';
import { closePhoneLink, createPhoneLink, errorMessage, extendPhoneLink, fetchPhoneLink } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { useToast } from '../../components/Toaster';
import { c, ease, fonts, radius } from '../../theme/tokens';
import { t, tn } from '../../lib/i18n';

const POLL_MS = 2500;
const MAX_LIFETIME_MS = 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');
const countdown = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
};

function Thumb({ file }: { file: PhoneLink['files'][number] }) {
  const visual = file.type === 'image' || file.type === 'video';
  return (
    <Tooltip title={file.originalName || file.filename}>
      <Box
        component="a"
        href={file.urls.view}
        target="_blank"
        rel="noopener"
        aria-label={file.originalName || file.filename}
        sx={{
          width: 56,
          height: 56,
          flexShrink: 0,
          borderRadius: `${radius.sm}px`,
          overflow: 'hidden',
          display: 'grid',
          placeItems: 'center',
          bgcolor: c.surfaceContainerHighest,
          color: c.onSurfaceVariant,
          outlineOffset: 2,
          '&:focus-visible': { outline: `2px solid ${c.primary}` },
        }}
      >
        {visual && file.urls.preview ? (
          <Box component="img" src={file.urls.preview} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <InsertDriveFileOutlined />
        )}
      </Box>
    </Tooltip>
  );
}

export function PhoneDialog({
  open,
  onClose,
  albums,
  initialAlbum,
  onReceived,
}: {
  open: boolean;
  onClose: () => void;
  albums: Album[];
  initialAlbum: number | null;
  onReceived: (names: string[]) => void;
}) {
  const toast = useToast();
  const [album, setAlbum] = useState<number | ''>('');
  const [link, setLink] = useState<PhoneLink | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const current = useRef<PhoneLink | null>(null);
  const round = useRef(0);
  const seen = useRef(0);
  const onReceivedRef = useRef(onReceived);
  onReceivedRef.current = onReceived;
  const usable = albums.filter((entry) => !entry.rule);

  const start = async (chosen: number | '') => {
    const mine = ++round.current;
    setBusy(true);
    setError('');
    const previous = current.current;
    current.current = null;
    if (previous && previous.open) closePhoneLink(previous.id).catch(() => {});
    try {
      const result = await createPhoneLink(chosen === '' ? null : chosen);
      if (mine !== round.current) {
        closePhoneLink(result.link.id).catch(() => {});
        return;
      }
      current.current = result.link;
      seen.current = result.link.uploads;
      setLink(result.link);
      setUrl(result.link.url || '');
    } catch (failure) {
      if (mine !== round.current) return;
      setLink(null);
      setError(errorMessage(failure));
    } finally {
      if (mine === round.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const chosen = initialAlbum && usable.some((entry) => entry.id === initialAlbum) ? initialAlbum : '';
    setAlbum(chosen);
    void start(chosen);
    return () => {
      round.current += 1;
      const active = current.current;
      current.current = null;
      if (active && active.open) closePhoneLink(active.id).catch(() => {});
      setLink(null);
      setUrl('');
    };
  }, [open]);

  useEffect(() => {
    if (!open || !link || !link.open) return;
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => {
      const active = current.current;
      if (!active || document.visibilityState !== 'visible') return;
      fetchPhoneLink(active.id)
        .then(({ link: next }) => {
          if (current.current?.id !== next.id) return;
          if (next.uploads > seen.current) {
            const fresh = next.files.slice(0, next.uploads - seen.current).map((file) => file.filename);
            seen.current = next.uploads;
            onReceivedRef.current(fresh);
          }
          current.current = next;
          setLink(next);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
    };
  }, [open, link?.id, link?.open]);

  const left = link ? link.expiresAt - now : 0;
  const expired = Boolean(link) && (!link!.open || left <= 0);
  const canExtend = Boolean(link) && !expired && link!.expiresAt < link!.createdAt + MAX_LIFETIME_MS - 60000;

  const extend = async () => {
    if (!link) return;
    try {
      const result = await extendPhoneLink(link.id);
      current.current = result.link;
      setLink(result.link);
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    }
  };

  const copy = async () => {
    if (url && (await copyText(url))) toast(t('Link kopiert'), { variant: 'success', duration: 2000 });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="phone-dialog-title">
      <DialogTitle id="phone-dialog-title">{t('Vom Handy hochladen')}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t(
            'Scanne den Code mit der Kamera deines Handys. Fotos und Dateien, die du dort auswählst, erscheinen hier sofort. Du musst dich am Handy nicht anmelden.'
          )}
        </Typography>
        {usable.length > 0 && (
          <TextField
            id="phone-album"
            select
            size="small"
            label={t('Album')}
            value={album}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value === '' ? '' : Number(event.target.value);
              setAlbum(next);
              void start(next);
            }}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">{t('Kein Album')}</MenuItem>
            {usable.map((entry) => (
              <MenuItem key={entry.id} value={entry.id}>
                {entry.title}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Box sx={{ display: 'grid', justifyItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              position: 'relative',
              width: 232,
              height: 232,
              p: 1.5,
              borderRadius: `${radius.lg}px`,
              bgcolor: '#fff',
              display: 'grid',
              placeItems: 'center',
              boxShadow: `0 0 0 1px ${c.outlineVariant}`,
            }}
          >
            {url && !expired && (
              <Box
                component="img"
                src={`/api/qr.svg?text=${encodeURIComponent(url)}`}
                alt={t('QR-Code zum Hochladen vom Handy')}
                sx={{ width: '100%', height: '100%', display: 'block', opacity: busy ? 0.3 : 1, transition: 'opacity 150ms' }}
              />
            )}
            {(busy || (!url && !error)) && <CircularProgress size={32} sx={{ position: 'absolute' }} aria-label={t('Wird geladen …')} />}
            {expired && !busy && (
              <Box sx={{ textAlign: 'center', color: '#1d1b20', px: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {t('Der Code ist abgelaufen')}
                </Typography>
                <Button size="small" variant="contained" sx={{ mt: 1.5 }} onClick={() => start(album)}>
                  {t('Neuen Code zeigen')}
                </Button>
              </Box>
            )}
          </Box>
          {link && !expired && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', color: left < 60000 ? c.error : 'text.secondary' }}>
                {t('Gültig noch {time}', { time: countdown(left) })}
              </Typography>
              {canExtend && (
                <Button size="small" startIcon={<MoreTimeRounded />} onClick={extend}>
                  {t('Verlängern')}
                </Button>
              )}
            </Box>
          )}
          {url && !expired && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, maxWidth: '100%' }}>
              <Typography
                variant="caption"
                sx={{ fontFamily: fonts.mono, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {url}
              </Typography>
              <Tooltip title={t('Link kopieren')}>
                <IconButton size="small" onClick={copy} aria-label={t('Link kopieren')}>
                  <ContentCopyRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {link && link.uploads > 0 && (
          <Box sx={{ borderRadius: `${radius.md}px`, bgcolor: c.surfaceContainerHigh, p: 1.5, display: 'grid', gap: 1 }} aria-live="polite">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SmartphoneRounded fontSize="small" sx={{ color: c.primary }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {link.device
                  ? tn(link.uploads, '1 Datei von {device}', '{count} Dateien von {device}', { device: link.device })
                  : tn(link.uploads, '1 Datei angekommen', '{count} Dateien angekommen')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
              <AnimatePresence initial={false}>
                {link.files.map((file) => (
                  <m.div
                    key={file.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25, ease: ease.emphasizedDecelerate }}
                  >
                    <Thumb file={file} />
                  </m.div>
                ))}
              </AnimatePresence>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', mr: 'auto' }}>
          {t('Beim Schließen endet der Link.')}
        </Typography>
        <Button onClick={onClose}>{link && link.uploads > 0 ? t('Fertig') : t('Schließen')}</Button>
      </DialogActions>
    </Dialog>
  );
}
