import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import { CopyTextButton } from './CopyButton';
import { readBoot } from '../lib/boot';
import { t } from '../lib/i18n';
import { c, fonts, radius } from '../theme/tokens';

export interface ShareTarget {
  kind: 'file' | 'album' | 'profile';
  name: string;
  alt?: string | null;
  view: string;
  direct?: string | null;
  frame?: string | null;
  type?: string;
  width?: number;
  height?: number;
}

type CodeTab = 'frame' | 'markdown' | 'bbcode' | 'html' | 'link';
type FrameTheme = 'auto' | 'light' | 'dark';
type FrameWidth = 'full' | '640' | '480' | '360';

const BAR = 41;

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeMarkdown = (value: string) => value.replace(/([\\[\]()])/g, '\\$1');

function localPath(url: string) {
  try {
    const parsed = new URL(url, window.location.href);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function frameHeight(target: ShareTarget, width: number) {
  if (target.kind === 'profile') return 520;
  if (target.kind === 'album') return Math.round(width * 0.75);
  if (target.type === 'audio') return 130;
  if ((target.type === 'image' || target.type === 'video') && target.width && target.height) {
    return Math.min(900, Math.round((width * target.height) / target.width) + BAR);
  }
  if (target.type === 'image' || target.type === 'video') return Math.round(width * 0.5625) + BAR;
  return 240;
}

export function ShareCodesDialog({ target, onClose, zIndex }: { target: ShareTarget | null; onClose: () => void; zIndex?: number }) {
  const phone = useMediaQuery('(max-width:599.95px)');
  const site = readBoot().site;
  const frames = Boolean(site.frames && target?.frame);
  const [tab, setTab] = useState<CodeTab>(frames ? 'frame' : 'markdown');
  const [theme, setTheme] = useState<FrameTheme>('auto');
  const [width, setWidth] = useState<FrameWidth>('640');

  useEffect(() => {
    if (!target) return;
    setTab(site.frames && target.frame ? 'frame' : 'markdown');
    setWidth(target.kind === 'profile' ? '360' : '640');
  }, [target, site.frames]);

  const codes = useMemo(() => {
    if (!target) return null;
    const media = target.type === 'image' && target.direct;
    const label = target.alt || target.name;
    const pixels = width === 'full' ? 640 : Number(width);
    const src = target.frame ? `${target.frame}${theme === 'auto' ? '' : `?theme=${theme}`}` : '';
    const frame = src
      ? `<iframe src="${escapeAttr(src)}" width="${width === 'full' ? '100%' : pixels}" height="${frameHeight(target, pixels)}" style="border:0;border-radius:12px;max-width:100%" loading="lazy" allowfullscreen title="${escapeAttr(target.name)}"></iframe>`
      : '';
    return {
      frame,
      markdown: media
        ? `[![${escapeMarkdown(label)}](${target.direct})](${target.view})`
        : `[${escapeMarkdown(target.name)}](${target.view})`,
      bbcode: media ? `[url=${target.view}][img]${target.direct}[/img][/url]` : `[url=${target.view}]${target.name}[/url]`,
      html: media
        ? `<a href="${escapeAttr(target.view)}"><img src="${escapeAttr(target.direct || '')}" alt="${escapeAttr(label)}"></a>`
        : target.type === 'video' && target.direct
          ? `<video src="${escapeAttr(target.direct)}" controls playsinline></video>`
          : `<a href="${escapeAttr(target.view)}">${escapeAttr(target.name)}</a>`,
      link: target.view,
      preview: src ? localPath(src) : '',
      previewHeight: frameHeight(target, 420),
    };
  }, [target, theme, width]);

  if (!target || !codes) return null;
  const code = codes[tab];
  const menu = zIndex ? { select: { MenuProps: { sx: { zIndex: zIndex + 1 } } } } : undefined;

  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={phone}
      aria-labelledby="share-codes-title"
      sx={zIndex ? { zIndex } : undefined}
    >
      <DialogTitle id="share-codes-title">{t('Einbetten und Codes')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5, wordBreak: 'break-word' }}>
          {target.name}
        </Typography>
        <Tabs
          value={tab}
          onChange={(_event, next: CodeTab) => setTab(next)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label={t('Art des Codes')}
          sx={{ mb: 2, borderBottom: `1px solid ${c.outlineVariant}` }}
        >
          {frames && <Tab value="frame" label={t('Einbetten')} />}
          <Tab value="markdown" label="Markdown" />
          <Tab value="bbcode" label="BBCode" />
          <Tab value="html" label="HTML" />
          <Tab value="link" label={t('Link')} />
        </Tabs>

        {tab === 'frame' && (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
            <TextField
              select
              size="small"
              label={t('Breite')}
              value={width}
              onChange={(event) => setWidth(event.target.value as FrameWidth)}
              slotProps={menu}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="full">{t('Volle Breite')}</MenuItem>
              <MenuItem value="640">640 px</MenuItem>
              <MenuItem value="480">480 px</MenuItem>
              <MenuItem value="360">360 px</MenuItem>
            </TextField>
            <TextField
              select
              size="small"
              label={t('Farben')}
              value={theme}
              onChange={(event) => setTheme(event.target.value as FrameTheme)}
              slotProps={menu}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="auto">{t('Wie das Gerät')}</MenuItem>
              <MenuItem value="light">{t('Hell')}</MenuItem>
              <MenuItem value="dark">{t('Dunkel')}</MenuItem>
            </TextField>
          </Box>
        )}

        <Box
          component="pre"
          aria-label={t('Code')}
          sx={{
            m: 0,
            p: 1.75,
            borderRadius: `${radius.md}px`,
            bgcolor: c.surfaceContainerHighest,
            fontFamily: fonts.mono,
            fontSize: '0.8125rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: 180,
            overflow: 'auto',
          }}
        >
          {code}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
          <CopyTextButton value={code} variant="contained" message={t('Code kopiert')} icon={<ContentCopyRounded fontSize="inherit" />}>
            {t('Code kopieren')}
          </CopyTextButton>
          {tab !== 'frame' && tab !== 'link' && site.hotlink && (
            <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1, minWidth: 200 }}>
              {t('Der Hotlink-Schutz ist an. Auf fremden Seiten erscheinen Bilder nur über „Einbetten“.')}
            </Typography>
          )}
          {tab === 'link' && site.frames && (
            <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1, minWidth: 200 }}>
              {t('Seiten mit oEmbed wie WordPress, Ghost oder Notion betten den Link von selbst ein.')}
            </Typography>
          )}
        </Box>

        {tab === 'frame' && codes.preview && (
          <Box sx={{ mt: 2.5 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('Vorschau')}
            </Typography>
            <Box
              component="iframe"
              src={codes.preview}
              title={t('Vorschau: {name}', { name: target.name })}
              loading="lazy"
              sx={{
                display: 'block',
                width: '100%',
                maxWidth: target.kind === 'profile' ? 360 : 420,
                height: codes.previewHeight,
                border: 0,
                borderRadius: '12px',
                bgcolor: c.surfaceContainer,
              }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Fertig')}</Button>
      </DialogActions>
    </Dialog>
  );
}
