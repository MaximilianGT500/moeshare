import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { t } from './i18n';

export type PaletteGroup = 'actions' | 'goto';

export interface PaletteCommand {
  id: string;
  group: PaletteGroup;
  label: string;
  icon: ReactNode;
  keywords?: string;
  hint?: string;
  run: () => void;
}

let pageCommands: PaletteCommand[] = [];
const listeners = new Set<() => void>();
const openers = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function usePaletteCommands(commands: PaletteCommand[]) {
  useEffect(() => {
    pageCommands = commands;
    notify();
    return () => {
      if (pageCommands === commands) {
        pageCommands = [];
        notify();
      }
    };
  }, [commands]);
}

export const usePageCommands = () => useSyncExternalStore(subscribe, () => pageCommands);

export function onPaletteOpen(listener: () => void) {
  openers.add(listener);
  return () => {
    openers.delete(listener);
  };
}

export const openPalette = () => openers.forEach((listener) => listener());

export const paletteShortcut = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : t('Strg+K'));
