import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import NotesRounded from '@mui/icons-material/NotesRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import { CopyTextButton } from '../../components/CopyButton';
import { formatBytes, formatNumber } from '../../lib/format';
import { t } from '../../lib/i18n';
import { syntaxLabel } from '../../lib/syntax';
import { mix } from '../../lib/color';
import { c, elevation, fonts, radius } from '../../theme/tokens';

const hljsTheme = {
  '& .hljs-comment, & .hljs-quote': { color: c.onSurfaceVariant, fontStyle: 'italic' },
  '& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal, & .hljs-doctag, & .hljs-section': { color: c.primary, fontWeight: 600 },
  '& .hljs-string, & .hljs-regexp, & .hljs-addition, & .hljs-meta .hljs-string': { color: c.tertiary },
  '& .hljs-number, & .hljs-symbol, & .hljs-bullet, & .hljs-variable, & .hljs-template-variable': { color: c.secondary },
  '& .hljs-title, & .hljs-title.function_, & .hljs-name, & .hljs-selector-id, & .hljs-selector-class': { color: c.primary },
  '& .hljs-attr, & .hljs-attribute, & .hljs-property, & .hljs-params': { color: c.onSurface },
  '& .hljs-built_in, & .hljs-type, & .hljs-class .hljs-title, & .hljs-title.class_': { color: c.tertiary, fontWeight: 600 },
  '& .hljs-meta, & .hljs-meta .hljs-keyword': { color: c.secondary },
  '& .hljs-deletion': { color: c.error },
  '& .hljs-emphasis': { fontStyle: 'italic' },
  '& .hljs-strong': { fontWeight: 700 },
  '& .hljs-link': { textDecoration: 'underline' },
};

interface Highlighted {
  html: string;
  language: string;
}

async function highlight(text: string, syntax: string): Promise<Highlighted> {
  const { default: hljs } = await import('highlight.js/lib/common');
  if ((syntax === 'powershell' || syntax === 'dos') && !hljs.getLanguage(syntax)) {
    const module =
      syntax === 'powershell' ? await import('highlight.js/lib/languages/powershell') : await import('highlight.js/lib/languages/dos');
    hljs.registerLanguage(syntax, module.default);
  }
  if (text.length > 400_000) return { html: hljs.highlight(text, { language: 'plaintext' }).value, language: 'plaintext' };
  if (syntax && syntax !== 'auto' && hljs.getLanguage(syntax)) {
    return { html: hljs.highlight(text, { language: syntax, ignoreIllegals: true }).value, language: syntax };
  }
  const auto = hljs.highlightAuto(text);
  return { html: auto.value, language: auto.language || 'plaintext' };
}

export function TextStage({
  rawUrl,
  syntax,
  preview,
  sizeBytes,
  downloadUrl,
}: {
  rawUrl: string;
  syntax: string;
  preview: boolean;
  sizeBytes: number;
  downloadUrl: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [result, setResult] = useState<Highlighted | null>(null);
  const [failed, setFailed] = useState(false);
  const [wrap, setWrap] = useState(true);

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    fetch(rawUrl, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then(async (content) => {
        if (cancelled) return;
        setText(content);
        const highlighted = await highlight(content, syntax).catch(() => null);
        if (!cancelled && highlighted) setResult(highlighted);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [rawUrl, syntax, preview]);

  const lines = useMemo(() => (text === null ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)), [text]);
  const language = result?.language || (syntax !== 'auto' ? syntax : 'plaintext');

  if (!preview || failed) {
    return (
      <Box
        sx={{
          width: 'min(860px, 100%)',
          mx: 'auto',
          py: { xs: 5, sm: 7 },
          px: 3,
          borderRadius: `${radius.xl}px`,
          textAlign: 'center',
          bgcolor: mix(c.surfaceContainerHigh, 88),
          backdropFilter: 'blur(20px)',
          boxShadow: elevation[3],
        }}
      >
        <NotesRounded sx={{ fontSize: 56, color: c.onSurfaceVariant }} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          {failed ? t('Der Text ließ sich nicht laden.') : t('Der Text ist zu groß für die Vorschau.')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          {formatBytes(sizeBytes)}
        </Typography>
        <Button variant="contained" href={downloadUrl} sx={{ mt: 3 }}>
          {t('Herunterladen')}
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: 'min(1100px, 100%)',
        mx: 'auto',
        borderRadius: `${radius.xl}px`,
        bgcolor: mix(c.surfaceContainerLow, 94),
        backdropFilter: 'blur(20px)',
        boxShadow: elevation[3],
        overflow: 'hidden',
        textAlign: 'left',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: `1px solid ${c.outlineVariant}`,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {syntaxLabel(language)}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {text !== null ? t('{lines} Zeilen · {size}', { lines: formatNumber(lines), size: formatBytes(sizeBytes) }) : ''}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <FormControlLabel
          control={<Switch size="small" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />}
          label={<Typography variant="body2">{t('Umbrechen')}</Typography>}
          sx={{ mr: 1 }}
        />
        {text !== null && (
          <CopyTextButton value={text} message={t('Text kopiert')} icon={<ContentCopyRounded fontSize="inherit" />} size="small">
            {t('Kopieren')}
          </CopyTextButton>
        )}
        <Button size="small" startIcon={<OpenInNewRounded />} href={rawUrl} target="_blank" rel="noopener">
          {t('Roh')}
        </Button>
      </Box>
      {text === null ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            maxHeight: { xs: '70vh', md: 'min(78vh, calc(100dvh - 260px))' },
            overflow: 'auto',
            fontFamily: fonts.mono,
            fontSize: { xs: '0.8125rem', sm: '0.875rem' },
            lineHeight: 1.6,
          }}
        >
          <Box
            aria-hidden
            component="pre"
            sx={{
              m: 0,
              py: 1.5,
              px: 1.5,
              textAlign: 'right',
              color: c.onSurfaceVariant,
              opacity: 0.6,
              userSelect: 'none',
              borderRight: `1px solid ${c.outlineVariant}`,
              position: 'sticky',
              left: 0,
              bgcolor: mix(c.surfaceContainerLow, 98),
              display: wrap ? 'none' : 'block',
            }}
          >
            {Array.from({ length: lines }, (_, index) => index + 1).join('\n')}
          </Box>
          <Box
            component="pre"
            sx={{
              m: 0,
              py: 1.5,
              px: 2,
              gridColumn: wrap ? '1 / -1' : 'auto',
              whiteSpace: wrap ? 'pre-wrap' : 'pre',
              wordBreak: wrap ? 'break-word' : 'normal',
              color: c.onSurface,
              ...hljsTheme,
            }}
          >
            {result ? <code dangerouslySetInnerHTML={{ __html: result.html }} /> : <code>{text}</code>}
          </Box>
        </Box>
      )}
    </Box>
  );
}
