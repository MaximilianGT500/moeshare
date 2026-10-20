import { useSyncExternalStore } from 'react';

interface State {
  src: string | null;
  playing: boolean;
  progress: number;
}

let audio: HTMLAudioElement | null = null;
let state: State = { src: null, playing: false, progress: 0 };
const listeners = new Set<() => void>();

const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

function element() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'none';
  audio.addEventListener('play', () => emit({ playing: true }));
  audio.addEventListener('pause', () => emit({ playing: false }));
  audio.addEventListener('ended', () => emit({ playing: false, progress: 0 }));
  audio.addEventListener('timeupdate', () => {
    if (audio && audio.duration) emit({ progress: audio.currentTime / audio.duration });
  });
  return audio;
}

export function toggleAudio(src: string) {
  const el = element();
  if (state.src === src) {
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
    return;
  }
  el.src = src;
  emit({ src, progress: 0 });
  void el.play().catch(() => emit({ playing: false }));
}

export function stopAudio() {
  if (audio) audio.pause();
}

export function useAudioState(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
}
