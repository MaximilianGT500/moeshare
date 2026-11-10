import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import GlobalStyles from '@mui/material/GlobalStyles';
import Typography from '@mui/material/Typography';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import PrintRounded from '@mui/icons-material/PrintRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import { CopyIconButton } from './CopyButton';
import { useToast } from './Toaster';
import { siteName } from '../lib/boot';
import { c, fonts, radius } from '../theme/tokens';
import { t } from '../lib/i18n';

export interface QrPoster {
  heading: string;
  text?: string;
}

export const qrSource = (value: string) => `/api/qr.svg?text=${encodeURIComponent(value)}`;

const fileStem = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .toLowerCase() || 'qr-code';

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function pngOf(source: string, size = 1024): Promise<Blob> {
  const image = new Image();
  image.decoding = 'async';
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png'));
}

function Poster({ url, poster }: { url: string; poster: QrPoster }) {
  return createPortal(
    <div className="ms-print-poster">
      <h1>{poster.heading}</h1>
      {poster.text && <p className="ms-print-text">{poster.text}</p>}
      <img src={qrSource(url)} alt="" />
      <p className="ms-print-hint">{t('Mit der Handykamera scannen oder die Adresse eingeben:')}</p>
      <p className="ms-print-url">{url}</p>
      <p className="ms-print-site">{siteName()}</p>
    </div>,
    document.body
  );
}

const printStyles = (
  <GlobalStyles
    styles={{
      '.ms-print-poster': { display: 'none' },
      '@media print': {
        '@page': { size: 'A4 portrait', margin: '18mm' },
        'body > *:not(.ms-print-poster)': { display: 'none !important' },
        body: { background: '#ffffff !important' },
        '.ms-print-poster': {
          display: 'flex !important',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          color: '#000000',
          fontFamily: fonts.sans,
          gap: '6mm',
          '& h1': { fontSize: '30pt', lineHeight: 1.15, margin: 0, fontWeight: 800 },
          '& .ms-print-text': { fontSize: '15pt', margin: 0, maxWidth: '150mm', whiteSpace: 'pre-line' },
          '& img': { width: '120mm', height: '120mm', imageRendering: 'pixelated' },
          '& .ms-print-hint': { fontSize: '12pt', margin: 0 },
          '& .ms-print-url': { fontFamily: fonts.mono, fontSize: '12pt', margin: 0, wordBreak: 'break-all' },
          '& .ms-print-site': { fontSize: '11pt', margin: '8mm 0 0', color: '#555555' },
        },
      },
    }}
  />
);

export function QrDialog({
  url,
  title,
  poster,
  zIndex,
  onClose,
}: {
  url: string | null;
  title?: string;
  poster?: QrPoster;
  zIndex?: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const [printing, setPrinting] = useState(false);
  const [busy, setBusy] = useState(false);
  const stem = `qr-${fileStem(title || url || '')}`;

  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const timer = window.setTimeout(() => window.print(), 250);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const download = async (kind: 'png' | 'svg') => {
    if (!url) return;
    setBusy(true);
    try {
      if (kind === 'png') save(await pngOf(qrSource(url)), `${stem}.png`);
      else save(await (await fetch(qrSource(url))).blob(), `${stem}.svg`);
    } catch {
      toast(t('Der QR-Code ließ sich nicht speichern.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {printStyles}
      <Dialog open={Boolean(url)} onClose={onClose} maxWidth="xs" fullWidth sx={zIndex ? { zIndex } : undefined}>
        <DialogTitle>{t('QR-Code')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
          {title && (
            <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', width: '100%', overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
          )}
          {url && (
            <Box
              component="img"
              src={qrSource(url)}
              alt={t('QR-Code für {url}', { url })}
              sx={{
                width: 'min(240px, 70vw)',
                aspectRatio: '1',
                borderRadius: `${radius.md}px`,
                bgcolor: '#ffffff',
                imageRendering: 'pixelated',
              }}
            />
          )}
          {url && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                width: '100%',
                minWidth: 0,
                pl: 1.5,
                pr: 0.5,
                py: 0.5,
                borderRadius: `${radius.sm}px`,
                bgcolor: c.surfaceContainerHighest,
                fontFamily: fonts.mono,
                fontSize: '0.8125rem',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{url}</Box>
              <CopyIconButton
                value={url}
                label={t('Link kopieren')}
                message={t('Link kopiert')}
                icon={<ContentCopyRounded fontSize="inherit" />}
                size="small"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2.5 }}>
          {poster && (
            <Button startIcon={<PrintRounded />} onClick={() => setPrinting(true)} disabled={!url} sx={{ mr: 'auto' }}>
              {t('Aushang drucken')}
            </Button>
          )}
          <Button startIcon={<DownloadRounded />} onClick={() => download('svg')} disabled={busy || !url}>
            {t('SVG')}
          </Button>
          <Button variant="tonal" startIcon={<DownloadRounded />} onClick={() => download('png')} disabled={busy || !url}>
            {t('PNG')}
          </Button>
        </DialogActions>
      </Dialog>
      {printing && url && poster && <Poster url={url} poster={poster} />}
    </>
  );
}
