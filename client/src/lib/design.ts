import { createContext, useContext, useEffect } from 'react';
import type { DesignCorners, DesignElement, DesignFont, ViewDesign } from './types';
import { meaningfulColor } from './color';
import { fonts } from '../theme/tokens';
import { t } from './i18n';

export const DESIGN_ELEMENTS: DesignElement[] = [
  'header',
  'title',
  'owner',
  'date',
  'size',
  'resolution',
  'views',
  'download',
  'copy',
  'share',
  'original',
  'footer',
];

export const FALLBACK_DESIGN: ViewDesign = {
  layout: 'standard',
  accent: 'auto',
  scheme: 'visitor',
  background: 'ambient',
  font: 'rounded',
  corners: 'round',
  show: Object.fromEntries(DESIGN_ELEMENTS.map((key) => [key, true])) as Record<DesignElement, boolean>,
  note: '',
  button: { label: '', url: '' },
  css: '',
};

export const FONT_STACKS: Record<DesignFont, string> = {
  rounded: fonts.sans,
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif',
  mono: fonts.mono,
};

const CORNER_SCALE: Record<DesignCorners, number> = { round: 1, soft: 0.5, sharp: 0.1 };

export interface DesignTools {
  design: ViewDesign;
  r: (px: number) => number;
  shows: (element: DesignElement) => boolean;
  font: string;
  inert: boolean;
}

const DesignContext = createContext<DesignTools>(toolsFor(FALLBACK_DESIGN));

export const DesignProvider = DesignContext.Provider;
export const useDesign = () => useContext(DesignContext);

export function toolsFor(design: ViewDesign, inert = false): DesignTools {
  const scale = CORNER_SCALE[design.corners] ?? 1;
  return {
    design,
    r: (px: number) => Math.round(px * scale),
    shows: (element: DesignElement) => design.show[element] !== false,
    font: FONT_STACKS[design.font] || fonts.sans,
    inert,
  };
}

export function withDefaults(design: Partial<ViewDesign> | null | undefined): ViewDesign {
  const base = { ...FALLBACK_DESIGN, ...(design || {}) };
  return {
    ...base,
    show: { ...FALLBACK_DESIGN.show, ...((design && design.show) || {}) },
    button: { ...FALLBACK_DESIGN.button, ...((design && design.button) || {}) },
  };
}

export function accentOf(design: ViewDesign, dominant: string | null | undefined, site: string): string {
  if (design.accent === 'site') return site;
  if (design.accent === 'auto') return meaningfulColor(dominant) || site;
  return meaningfulColor(design.accent) || site;
}

export function useInjectedCss(css: string | null | undefined, id = 'ms-user-css') {
  useEffect(() => {
    let element = document.getElementById(id) as HTMLStyleElement | null;
    if (!css) {
      element?.remove();
      return;
    }
    if (!element) {
      element = document.createElement('style');
      element.id = id;
      document.head.appendChild(element);
    }
    element.textContent = css;
  }, [css, id]);
}

export const LAYOUT_LABELS = {
  standard: () => t('Klassisch'),
  minimal: () => t('Schlicht'),
  stage: () => t('Bühne'),
  split: () => t('Seitlich'),
  polaroid: () => t('Sofortbild'),
  magazine: () => t('Magazin'),
};

export const LAYOUT_HINTS = {
  standard: () => t('Leuchtender Hintergrund aus dem Bild, darunter eine Karte mit allen Angaben.'),
  minimal: () => t('Nur die Datei auf ruhiger Fläche, Angaben in einer schmalen Zeile.'),
  stage: () => t('Die Datei füllt den Bildschirm, Knöpfe schweben unten darüber.'),
  split: () => t('Datei links, Angaben und Knöpfe in einer eigenen Spalte rechts.'),
  polaroid: () => t('Die Datei liegt wie ein Sofortbild leicht schräg auf dem Tisch.'),
  magazine: () => t('Großer Titel wie in einer Zeitschrift, die Datei darunter in voller Breite.'),
};

export const ELEMENT_LABELS: Record<DesignElement, () => string> = {
  header: () => t('Kopfzeile mit Seitenname'),
  title: () => t('Titel'),
  owner: () => t('Hochgeladen von'),
  date: () => t('Datum'),
  size: () => t('Dateigröße'),
  resolution: () => t('Auflösung'),
  views: () => t('Aufrufe'),
  download: () => t('Herunterladen'),
  copy: () => t('Link kopieren'),
  share: () => t('Teilen'),
  original: () => t('Original öffnen'),
  footer: () => t('Fußzeile mit Links'),
};

export const BACKGROUND_LABELS = {
  ambient: () => t('Leuchten'),
  gradient: () => t('Verlauf'),
  plain: () => t('Einfarbig'),
  dots: () => t('Punkte'),
};

export const FONT_LABELS = {
  rounded: () => t('Rund'),
  system: () => t('System'),
  serif: () => t('Serifen'),
  mono: () => t('Schreibmaschine'),
};

export const CORNER_LABELS = {
  round: () => t('Rund'),
  soft: () => t('Weich'),
  sharp: () => t('Kantig'),
};

export const SCHEME_LABELS = {
  visitor: () => t('Wie beim Besucher'),
  dark: () => t('Immer dunkel'),
  light: () => t('Immer hell'),
};
