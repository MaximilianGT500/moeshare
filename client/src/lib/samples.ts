import type { ViewFile, ViewUrls } from './types';

const sampleSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a8b"/><stop offset=".55" stop-color="#ff6a88"/><stop offset="1" stop-color="#7b2ff7"/></linearGradient></defs><rect width="1600" height="900" fill="url(#s)"/><circle cx="1150" cy="430" r="150" fill="#ffe29a" opacity=".9"/><path d="M0 700 L320 520 L560 650 L860 460 L1180 640 L1600 500 L1600 900 L0 900Z" fill="#3a1c71" opacity=".85"/><path d="M0 780 L400 640 L760 760 L1100 620 L1600 760 L1600 900 L0 900Z" fill="#22104a"/></svg>`
);

export const SAMPLE_IMAGE = `data:image/svg+xml;charset=utf-8,${sampleSvg}`;

export const SAMPLE_COLOR = '#ff6a88';

export function sampleView(username: string): { file: ViewFile; urls: ViewUrls } {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
  return {
    file: {
      id: 0,
      slug: 'sonnenuntergang.png',
      filename: 'sonnenuntergang.png',
      title: null,
      originalName: 'sonnenuntergang.png',
      type: 'image',
      isGif: false,
      syntax: null,
      textBytes: null,
      textPreview: false,
      width: 1600,
      height: 900,
      sizeBytes: 1468006,
      views: 42,
      date,
      createdAt: now.getTime(),
      expiresAt: null,
      once: false,
      protected: false,
      username,
      owner: false,
    },
    urls: { view: '#', direct: SAMPLE_IMAGE, raw: SAMPLE_IMAGE, download: '#', display: SAMPLE_IMAGE, poster: null, hls: null },
  };
}
