interface JustifiedCell<T> {
  item: T;
  aspect: number;
  width: number;
}

interface JustifiedRow<T> {
  cells: JustifiedCell<T>[];
  height: number;
  complete: boolean;
}

interface JustifyOptions {
  targetHeight: number;
  gap: number;
  maxHeight?: number;
}

export function justify<T>(
  items: T[],
  aspectOf: (item: T) => number,
  containerWidth: number,
  { targetHeight, gap, maxHeight = targetHeight * 1.6 }: JustifyOptions
): JustifiedRow<T>[] {
  const rows: JustifiedRow<T>[] = [];
  if (containerWidth <= 0) return rows;

  let pending: { item: T; aspect: number }[] = [];
  let aspectSum = 0;

  const flush = (complete: boolean) => {
    if (!pending.length) return;
    const gaps = gap * (pending.length - 1);
    let height = complete ? (containerWidth - gaps) / aspectSum : targetHeight;
    height = Math.min(height, maxHeight);
    if (!complete) height = Math.min(height, (containerWidth - gaps) / aspectSum);
    rows.push({
      cells: pending.map(({ item, aspect }) => ({ item, aspect, width: aspect * height })),
      height,
      complete,
    });
    pending = [];
    aspectSum = 0;
  };

  for (const item of items) {
    const aspect = aspectOf(item);
    pending.push({ item, aspect });
    aspectSum += aspect;
    const widthAtTarget = aspectSum * targetHeight + gap * (pending.length - 1);
    if (widthAtTarget >= containerWidth) flush(true);
  }
  flush(false);
  return rows;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function tileAspect(file: { type: string; width: number; height: number }): number {
  if ((file.type === 'image' || file.type === 'video') && file.width > 0 && file.height > 0) {
    return clamp(file.width / file.height, 0.62, 2.4);
  }
  if (file.type === 'video') return 16 / 9;
  if (file.type === 'image') return 4 / 3;
  if (file.type === 'audio') return 1;
  return 0.82;
}
