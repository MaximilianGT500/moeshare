import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import Box from '@mui/material/Box';
import GlobalStyles from '@mui/material/GlobalStyles';
import { readBoot } from '../../lib/boot';
import { DesignProvider, accentOf, toolsFor, useInjectedCss, withDefaults } from '../../lib/design';
import { SAMPLE_COLOR, sampleView } from '../../lib/samples';
import type { FileType, ViewBoot, ViewDesign, ViewFile, ViewUrls } from '../../lib/types';
import { linkWithKey } from '../../lib/sealed';
import { t } from '../../lib/i18n';
import { useThemeSeed } from '../../app/mount';
import { LockedScreen } from '../../components/LockedScreen';
import { waveformKeyframes } from '../../components/Waveform';
import { ImageZoom, labelOf, useSchemeSync, type UnsealedView, type ViewModel } from './parts';
import { LAYOUTS } from './layouts';
import { WarningGate } from './WarningGate';

export function ViewPage() {
  const boot = readBoot<ViewBoot>();
  if (boot.locked) return <LockedScreen site={boot.site} locked={boot.locked} />;
  return <DesignedView boot={boot} />;
}

const TEXT_NAME =
  /\.(txt|md|markdown|csv|tsv|json|log|xml|ya?ml|ini|toml|conf|cfg|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|bash|ps1|bat|sql|css|scss|lua|swift|diff|patch|srt|vtt)$/i;
const SYNTAX: Record<string, string> = {
  md: 'markdown',
  markdown: 'markdown',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  ps1: 'powershell',
  bat: 'dos',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  ini: 'ini',
  toml: 'ini',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  lua: 'lua',
  swift: 'swift',
  diff: 'diff',
  patch: 'diff',
  csv: 'plaintext',
  tsv: 'plaintext',
  txt: 'plaintext',
};

function unsealedType(meta: UnsealedView['meta']): FileType {
  if (meta.kind === 'text') return 'text';
  const type = (meta.type || '').toLowerCase();
  if (/^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/') || TEXT_NAME.test(meta.name)) return 'text';
  return 'file';
}

function unsealedView(file: ViewFile, opened: UnsealedView): { file: ViewFile; urls: ViewUrls } {
  const { meta, url, key } = opened;
  const type = unsealedType(meta);
  const ext = (/\.([a-z0-9]+)$/i.exec(meta.name)?.[1] || '').toLowerCase();
  const syntax = meta.syntax && meta.syntax !== 'auto' ? meta.syntax : SYNTAX[ext] || 'auto';
  return {
    file: {
      ...file,
      filename: meta.name,
      originalName: meta.name,
      title: null,
      type,
      isGif: ext === 'gif',
      syntax: type === 'text' ? syntax : null,
      textBytes: type === 'text' ? meta.size : null,
      textPreview: type === 'text' && meta.size <= 512 * 1024,
      width: 0,
      height: 0,
      sizeBytes: meta.size,
      sealed: true,
    },
    urls: {
      view: linkWithKey(window.location.href, key),
      direct: url,
      raw: url,
      download: url,
      display: url,
      poster: null,
      hls: null,
      playback: null,
    },
  };
}

interface DesignMessage {
  type: 'moeshare:design';
  design: ViewDesign;
  css: string;
}

const isDesignMessage = (value: unknown): value is DesignMessage =>
  !!value && typeof value === 'object' && (value as DesignMessage).type === 'moeshare:design' && !!(value as DesignMessage).design;

function DesignedView({ boot }: { boot: ViewBoot }) {
  const preview = !!boot.preview;
  const [design, setDesign] = useState(() => withDefaults(boot.design));
  const [css, setCss] = useState(boot.css || '');
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState<DOMRect | null>(null);
  const [revealed, setRevealed] = useState(false);
  const setSeed = useThemeSeed();
  const syncScheme = useSchemeSync();
  const [unsealed, setUnsealed] = useState<UnsealedView | null>(null);
  const sample = useMemo(() => (boot.sample ? sampleView(boot.sampleUser || boot.site.title) : null), [boot]);
  const baseFile = sample ? sample.file : boot.file;
  const baseUrls = sample ? sample.urls : boot.urls;
  const opened = useMemo(() => (unsealed ? unsealedView(baseFile, unsealed) : null), [baseFile, unsealed]);
  const file = opened ? opened.file : baseFile;
  const urls = opened ? opened.urls : baseUrls;
  const dominant = sample ? SAMPLE_COLOR : boot.accent;
  const accent = accentOf(design, dominant, boot.site.seedColor);

  useInjectedCss(css);

  useEffect(() => {
    setSeed(accent);
  }, [accent, setSeed]);

  useEffect(() => {
    if (file.type !== 'image') setLoaded(true);
  }, [file.type]);

  useEffect(() => {
    if (unsealed) document.title = `${unsealed.meta.name} » ${boot.site.title}`;
  }, [unsealed, boot.site.title]);

  useEffect(() => {
    if (!preview) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || !isDesignMessage(event.data)) return;
      const next = withDefaults(event.data.design);
      setDesign(next);
      setCss(event.data.css || '');
      syncScheme(next.scheme);
    };
    const blockLinks = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a[href]');
      if (anchor) event.preventDefault();
    };
    window.addEventListener('message', onMessage);
    document.addEventListener('click', blockLinks, true);
    window.parent.postMessage({ type: 'moeshare:ready' }, window.location.origin);
    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('click', blockLinks, true);
    };
  }, [preview]);

  const tools = useMemo(() => toolsFor(design, preview), [design, preview]);
  const model: ViewModel = {
    site: boot.site,
    file,
    urls,
    label: unsealed ? unsealed.meta.name : baseFile.sealed ? t('Verschlüsselte Datei') : labelOf(file),
    accent,
    boot,
    downloadName: unsealed ? unsealed.meta.name : undefined,
    onUnseal: baseFile.sealed && !unsealed && !preview && !sample ? setUnsealed : undefined,
  };
  const Layout = LAYOUTS[design.layout] || LAYOUTS.standard;

  return (
    <DesignProvider value={tools}>
      <GlobalStyles styles={waveformKeyframes} />
      <Box
        className="ms-page"
        data-page="view"
        data-layout={design.layout}
        data-type={file.type}
        sx={{
          fontFamily: tools.font,
          '& .MuiTypography-root, & .MuiButtonBase-root, & .MuiInputBase-root, & .MuiChip-label': { fontFamily: 'inherit' },
        }}
      >
        {typeof file.warning === 'string' && !revealed && !preview ? (
          <WarningGate model={model} onReveal={() => setRevealed(true)} />
        ) : (
          <Layout model={model} loaded={loaded} onLoaded={() => setLoaded(true)} zooming={!!zoom} onZoom={setZoom} />
        )}
      </Box>
      <AnimatePresence>
        {zoom && file.type === 'image' && (
          <ImageZoom src={urls.direct} origin={zoom} width={file.width} height={file.height} onClose={() => setZoom(null)} />
        )}
      </AnimatePresence>
    </DesignProvider>
  );
}
