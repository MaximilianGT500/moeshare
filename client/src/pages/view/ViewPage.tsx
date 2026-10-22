import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import Box from '@mui/material/Box';
import GlobalStyles from '@mui/material/GlobalStyles';
import { readBoot } from '../../lib/boot';
import { DesignProvider, accentOf, toolsFor, useInjectedCss, withDefaults } from '../../lib/design';
import { SAMPLE_COLOR, sampleView } from '../../lib/samples';
import type { ViewBoot, ViewDesign } from '../../lib/types';
import { useThemeSeed } from '../../app/mount';
import { LockedScreen } from '../../components/LockedScreen';
import { waveformKeyframes } from '../../components/Waveform';
import { ImageZoom, labelOf, useSchemeSync, type ViewModel } from './parts';
import { LAYOUTS } from './layouts';

export function ViewPage() {
  const boot = readBoot<ViewBoot>();
  if (boot.locked) return <LockedScreen site={boot.site} locked={boot.locked} />;
  return <DesignedView boot={boot} />;
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
  const setSeed = useThemeSeed();
  const syncScheme = useSchemeSync();
  const sample = useMemo(() => (boot.sample ? sampleView(boot.sampleUser || boot.site.title) : null), [boot]);
  const file = sample ? sample.file : boot.file;
  const urls = sample ? sample.urls : boot.urls;
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
  const model: ViewModel = { site: boot.site, file, urls, label: labelOf(file), accent, boot };
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
        <Layout model={model} loaded={loaded} onLoaded={() => setLoaded(true)} zooming={!!zoom} onZoom={setZoom} />
      </Box>
      <AnimatePresence>
        {zoom && file.type === 'image' && (
          <ImageZoom src={urls.direct} origin={zoom} width={file.width} height={file.height} onClose={() => setZoom(null)} />
        )}
      </AnimatePresence>
    </DesignProvider>
  );
}
