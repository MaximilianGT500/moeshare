import { fonts } from '../../../theme/tokens';

export type Rotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export type Shape =
  | { kind: 'pen'; points: Point[]; color: string; width: number }
  | { kind: 'arrow'; from: Point; to: Point; color: string; width: number }
  | { kind: 'rect'; rect: Rect; color: string; width: number }
  | { kind: 'cover'; rect: Rect; mode: 'mosaic' | 'solid'; block: number }
  | { kind: 'text'; at: Point; text: string; color: string; size: number; rot: Rotation; flipX: boolean; flipY: boolean };

export interface Doc {
  rot: Rotation;
  flipX: boolean;
  flipY: boolean;
  crop: Rect | null;
  shapes: Shape[];
}

export const INITIAL_DOC: Doc = { rot: 0, flipX: false, flipY: false, crop: null, shapes: [] };

export const TEXT_FONT = fonts.sans;

export const orientedSize = (base: Size, rot: Rotation): Size => (rot % 180 === 0 ? { w: base.w, h: base.h } : { w: base.h, h: base.w });

export function toOriented(point: Point, doc: Doc, base: Size): Point {
  let { x, y } = point;
  if (doc.flipX) x = base.w - x;
  if (doc.flipY) y = base.h - y;
  if (doc.rot === 90) return { x: base.h - y, y: x };
  if (doc.rot === 180) return { x: base.w - x, y: base.h - y };
  if (doc.rot === 270) return { x: y, y: base.w - x };
  return { x, y };
}

export function toBase(point: Point, doc: Doc, base: Size): Point {
  const { x: u, y: v } = point;
  let x = u;
  let y = v;
  if (doc.rot === 90) {
    x = v;
    y = base.h - u;
  } else if (doc.rot === 180) {
    x = base.w - u;
    y = base.h - v;
  } else if (doc.rot === 270) {
    x = base.w - v;
    y = u;
  }
  if (doc.flipX) x = base.w - x;
  if (doc.flipY) y = base.h - y;
  return { x, y };
}

export function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

const mapRect = (rect: Rect, map: (point: Point) => Point) =>
  normalizeRect(map({ x: rect.x, y: rect.y }), map({ x: rect.x + rect.w, y: rect.y + rect.h }));

export function rotateDoc(doc: Doc, base: Size, clockwise: boolean): Doc {
  const size = orientedSize(base, doc.rot);
  const rot = ((doc.rot + (clockwise ? 90 : 270)) % 360) as Rotation;
  const crop = doc.crop ? mapRect(doc.crop, (p) => (clockwise ? { x: size.h - p.y, y: p.x } : { x: p.y, y: size.w - p.x })) : null;
  return { ...doc, rot, crop };
}

export function flipDoc(doc: Doc, base: Size, axis: 'x' | 'y'): Doc {
  const size = orientedSize(base, doc.rot);
  const rot = ((360 - doc.rot) % 360) as Rotation;
  const crop = doc.crop ? mapRect(doc.crop, (p) => (axis === 'x' ? { x: size.w - p.x, y: p.y } : { x: p.x, y: size.h - p.y })) : null;
  return axis === 'x' ? { ...doc, rot, flipX: !doc.flipX, crop } : { ...doc, rot, flipY: !doc.flipY, crop };
}

export function rotateRect(rect: Rect, size: Size, clockwise: boolean): Rect {
  return mapRect(rect, (p) => (clockwise ? { x: size.h - p.y, y: p.x } : { x: p.y, y: size.w - p.x }));
}

export function flipRect(rect: Rect, size: Size, axis: 'x' | 'y'): Rect {
  return mapRect(rect, (p) => (axis === 'x' ? { x: size.w - p.x, y: p.y } : { x: p.x, y: size.h - p.y }));
}

export function applyOrientation(ctx: CanvasRenderingContext2D, doc: Doc, base: Size) {
  if (doc.rot === 90) {
    ctx.translate(base.h, 0);
    ctx.rotate(Math.PI / 2);
  } else if (doc.rot === 180) {
    ctx.translate(base.w, base.h);
    ctx.rotate(Math.PI);
  } else if (doc.rot === 270) {
    ctx.translate(0, base.w);
    ctx.rotate(-Math.PI / 2);
  }
  if (doc.flipX) {
    ctx.translate(base.w, 0);
    ctx.scale(-1, 1);
  }
  if (doc.flipY) {
    ctx.translate(0, base.h);
    ctx.scale(1, -1);
  }
}

export const visibleRegion = (doc: Doc, base: Size, cropping: boolean): Rect => {
  const size = orientedSize(base, doc.rot);
  return !cropping && doc.crop ? doc.crop : { x: 0, y: 0, w: size.w, h: size.h };
};

function luminance(hex: string) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

export const outlineFor = (color: string) => (luminance(color) > 0.45 ? 'rgb(0 0 0 / 0.55)' : 'rgb(255 255 255 / 0.9)');

function drawPen(ctx: CanvasRenderingContext2D, shape: Extract<Shape, { kind: 'pen' }>) {
  const { points } = shape;
  if (!points.length) return;
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = shape.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, shape.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const next = points[index + 1];
    ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function drawArrow(ctx: CanvasRenderingContext2D, shape: Extract<Shape, { kind: 'arrow' }>) {
  const { from, to, width } = shape;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const head = Math.min(length * 0.6, Math.max(width * 3.6, 12));
  const spread = Math.PI / 7;
  const neck = { x: to.x - Math.cos(angle) * head * 0.7, y: to.y - Math.sin(angle) * head * 0.7 };
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(neck.x, neck.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - spread) * head, to.y - Math.sin(angle - spread) * head);
  ctx.lineTo(to.x - Math.cos(angle + spread) * head, to.y - Math.sin(angle + spread) * head);
  ctx.closePath();
  ctx.lineWidth = Math.max(1, width / 2);
  ctx.fill();
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, shape: Extract<Shape, { kind: 'text' }>) {
  ctx.save();
  ctx.translate(shape.at.x, shape.at.y);
  ctx.scale(shape.flipX ? -1 : 1, shape.flipY ? -1 : 1);
  ctx.rotate((-shape.rot * Math.PI) / 180);
  ctx.font = `700 ${shape.size}px ${TEXT_FONT}`;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, shape.size / 7);
  ctx.strokeStyle = outlineFor(shape.color);
  ctx.fillStyle = shape.color;
  shape.text.split('\n').forEach((line, index) => {
    const y = index * shape.size * 1.2;
    ctx.strokeText(line, 0, y);
    ctx.fillText(line, 0, y);
  });
  ctx.restore();
}

function clampRect(rect: Rect, size: Size): Rect {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  return {
    x,
    y,
    w: Math.max(0, Math.min(size.w, Math.ceil(rect.x + rect.w)) - x),
    h: Math.max(0, Math.min(size.h, Math.ceil(rect.y + rect.h)) - y),
  };
}

function drawCover(ctx: CanvasRenderingContext2D, shape: Extract<Shape, { kind: 'cover' }>, size: Size) {
  const area = clampRect(shape.rect, size);
  if (area.w < 1 || area.h < 1) return;
  if (shape.mode === 'solid') {
    ctx.fillStyle = '#000';
    ctx.fillRect(area.x, area.y, area.w, area.h);
    return;
  }
  const cols = Math.max(1, Math.round(area.w / shape.block));
  const rows = Math.max(1, Math.round(area.h / shape.block));
  const small = document.createElement('canvas');
  small.width = cols;
  small.height = rows;
  const tiny = small.getContext('2d');
  if (!tiny) return;
  tiny.imageSmoothingEnabled = true;
  tiny.imageSmoothingQuality = 'high';
  tiny.drawImage(ctx.canvas, area.x, area.y, area.w, area.h, 0, 0, cols, rows);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, cols, rows, area.x, area.y, area.w, area.h);
  ctx.restore();
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, size: Size) {
  ctx.save();
  if (shape.kind === 'pen') drawPen(ctx, shape);
  else if (shape.kind === 'arrow') drawArrow(ctx, shape);
  else if (shape.kind === 'rect') {
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.width;
    ctx.lineJoin = 'round';
    ctx.strokeRect(shape.rect.x, shape.rect.y, shape.rect.w, shape.rect.h);
  } else if (shape.kind === 'text') drawText(ctx, shape);
  else drawCover(ctx, shape, size);
  ctx.restore();
}

export function drawCoverPreview(ctx: CanvasRenderingContext2D, rect: Rect, pixel: number) {
  ctx.save();
  ctx.fillStyle = 'rgb(0 0 0 / 0.35)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([pixel * 6, pixel * 4]);
  ctx.lineWidth = pixel * 2;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

export function renderComposite(target: HTMLCanvasElement, source: CanvasImageSource, size: Size, shapes: Shape[]) {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.drawImage(source, 0, 0, size.w, size.h);
  for (const shape of shapes) drawShape(ctx, shape, size);
}

export function exportImage(composite: HTMLCanvasElement, doc: Doc, base: Size): HTMLCanvasElement {
  const region = visibleRegion(doc, base, false);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(region.w));
  out.height = Math.max(1, Math.round(region.h));
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(-region.x, -region.y);
  applyOrientation(ctx, doc, base);
  ctx.drawImage(composite, 0, 0);
  return out;
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function moveRect(start: Rect, dx: number, dy: number, bounds: Size): Rect {
  return { ...start, x: clamp(start.x + dx, 0, bounds.w - start.w), y: clamp(start.y + dy, 0, bounds.h - start.h) };
}

export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, bounds: Size, ratio: number | null, min = 16): Rect {
  const east = handle.includes('e');
  const west = handle.includes('w');
  const north = handle.includes('n');
  const south = handle.includes('s');
  if (!ratio) {
    let x1 = start.x;
    let y1 = start.y;
    let x2 = start.x + start.w;
    let y2 = start.y + start.h;
    if (west) x1 = clamp(start.x + dx, 0, x2 - min);
    if (east) x2 = clamp(x2 + dx, x1 + min, bounds.w);
    if (north) y1 = clamp(start.y + dy, 0, y2 - min);
    if (south) y2 = clamp(y2 + dy, y1 + min, bounds.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  const minW = Math.max(min, min * ratio);
  if ((east || west) && (north || south)) {
    const anchor = { x: east ? start.x : start.x + start.w, y: south ? start.y : start.y + start.h };
    const fromX = east ? start.w + dx : start.w - dx;
    const fromY = (south ? start.h + dy : start.h - dy) * ratio;
    const maxW = Math.min(east ? bounds.w - anchor.x : anchor.x, (south ? bounds.h - anchor.y : anchor.y) * ratio);
    const w = clamp(Math.max(fromX, fromY), Math.min(minW, maxW), maxW);
    const h = w / ratio;
    return { x: east ? anchor.x : anchor.x - w, y: south ? anchor.y : anchor.y - h, w, h };
  }
  if (east || west) {
    const centerY = start.y + start.h / 2;
    const anchorX = east ? start.x : start.x + start.w;
    const maxW = Math.min(east ? bounds.w - anchorX : anchorX, 2 * Math.min(centerY, bounds.h - centerY) * ratio);
    const w = clamp(east ? start.w + dx : start.w - dx, Math.min(minW, maxW), maxW);
    const h = w / ratio;
    return { x: east ? anchorX : anchorX - w, y: centerY - h / 2, w, h };
  }
  const centerX = start.x + start.w / 2;
  const anchorY = south ? start.y : start.y + start.h;
  const maxH = Math.min(south ? bounds.h - anchorY : anchorY, (2 * Math.min(centerX, bounds.w - centerX)) / ratio);
  const h = clamp(south ? start.h + dy : start.h - dy, Math.min(min, maxH), maxH);
  const w = h * ratio;
  return { x: centerX - w / 2, y: south ? anchorY : anchorY - h, w, h };
}

export function fitRatio(current: Rect, bounds: Size, ratio: number | null): Rect {
  if (!ratio) return current;
  let w = bounds.w;
  let h = w / ratio;
  if (h > bounds.h) {
    h = bounds.h;
    w = h * ratio;
  }
  const cx = current.x + current.w / 2;
  const cy = current.y + current.h / 2;
  return { x: clamp(cx - w / 2, 0, bounds.w - w), y: clamp(cy - h / 2, 0, bounds.h - h), w, h };
}

export const roundRect = (rect: Rect): Rect => {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  return { x, y, w: Math.max(1, Math.round(rect.x + rect.w) - x), h: Math.max(1, Math.round(rect.y + rect.h) - y) };
};

export const isFull = (rect: Rect, size: Size) =>
  rect.x <= 0.5 && rect.y <= 0.5 && Math.abs(rect.w - size.w) <= 1 && Math.abs(rect.h - size.h) <= 1;
