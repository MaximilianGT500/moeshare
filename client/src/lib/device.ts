export function isAppleMobile() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function canEmbedPdf() {
  if (isAppleMobile() || /Android|Mobile/i.test(navigator.userAgent)) return false;
  const viewer = (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
  return viewer !== false;
}
