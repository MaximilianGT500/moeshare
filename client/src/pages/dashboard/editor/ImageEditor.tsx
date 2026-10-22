import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';
import BlurOnRounded from '@mui/icons-material/BlurOnRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import CropRounded from '@mui/icons-material/CropRounded';
import CropSquareRounded from '@mui/icons-material/CropSquareRounded';
import DrawRounded from '@mui/icons-material/DrawRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import FlipRounded from '@mui/icons-material/FlipRounded';
import NorthEastRounded from '@mui/icons-material/NorthEastRounded';
import RedoRounded from '@mui/icons-material/RedoRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import RotateLeftRounded from '@mui/icons-material/RotateLeftRounded';
import RotateRightRounded from '@mui/icons-material/RotateRightRounded';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import TitleRounded from '@mui/icons-material/TitleRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import type { FileItem } from '../../../lib/types';
import { errorMessage, fileContentUrl, replaceFile } from '../../../lib/api';
import { formatNumber } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toaster';
import { c, css, radius } from '../../../theme/tokens';
import {
  INITIAL_DOC,
  TEXT_FONT,
  applyOrientation,
  drawCoverPreview,
  drawShape,
  exportImage,
  fitRatio,
  flipDoc,
  isFull,
  moveRect,
  normalizeRect,
  orientedSize,
  outlineFor,
  renderComposite,
  resizeRect,
  rotateDoc,
  roundRect,
  toBase,
  visibleRegion,
  type Doc,
  type Handle,
  type Point,
  type Rect,
  type Shape,
  type Size,
} from './model';

type Tool = 'crop' | 'pen' | 'arrow' | 'rect' | 'text' | 'cover';
type Weight = 's' | 'm' | 'l';
type RatioKey = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9' | '9:16';

const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 8192;
const HISTORY_LIMIT = 80;
const COLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#32d74b', '#0a84ff', '#bf5af2', '#ffffff', '#000000'];
const COLOR_NAMES = () => [t('Rot'), t('Orange'), t('Gelb'), t('Grün'), t('Blau'), t('Lila'), t('Weiß'), t('Schwarz')];
const STROKE: Record<Weight, number> = { s: 3, m: 6, l: 12 };
const TEXT: Record<Weight, number> = { s: 28, m: 44, l: 72 };
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const RATIOS: Array<{ key: RatioKey; label: () => string; value: number | null }> = [
  { key: 'free', label: () => t('Frei'), value: null },
  { key: 'original', label: () => t('Original'), value: null },
  { key: '1:1', label: () => t('Quadrat'), value: 1 },
  { key: '4:3', label: () => '4:3', value: 4 / 3 },
  { key: '3:2', label: () => '3:2', value: 3 / 2 },
  { key: '16:9', label: () => '16:9', value: 16 / 9 },
  { key: '9:16', label: () => '9:16', value: 9 / 16 },
];

const TOOLS: Array<{ key: Tool; label: () => string; icon: ReactNode; shortcut: string }> = [
  { key: 'crop', label: () => t('Zuschneiden'), icon: <CropRounded />, shortcut: 'c' },
  { key: 'pen', label: () => t('Stift'), icon: <DrawRounded />, shortcut: 'p' },
  { key: 'arrow', label: () => t('Pfeil'), icon: <NorthEastRounded />, shortcut: 'a' },
  { key: 'rect', label: () => t('Rahmen'), icon: <CropSquareRounded />, shortcut: 'r' },
  { key: 'text', label: () => t('Text'), icon: <TitleRounded />, shortcut: 't' },
  { key: 'cover', label: () => t('Verdecken'), icon: <BlurOnRounded />, shortcut: 'v' },
];

const extensionOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase();
const stemOf = (name: string) => name.replace(/\.[^.]+$/, '') || 'bild';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

interface Drawing {
  pointer: number;
  origin: Point;
  shape: Shape;
  last: { x: number; y: number };
}

interface CropDrag {
  pointer: number;
  handle: Handle | 'move';
  x: number;
  y: number;
  rect: Rect;
}

function Swatch({ color, name, selected, onClick }: { color: string; name: string; selected: boolean; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={name}
      aria-pressed={selected}
      sx={{
        width: 32,
        height: 32,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        boxShadow: selected ? `0 0 0 2px ${c.onSurface}` : 'none',
        transition: `box-shadow 140ms ${css.standard}`,
        '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: color, boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.25)' }} />
    </ButtonBase>
  );
}

function Chip({ selected, onClick, children, label }: { selected: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      sx={{
        height: 32,
        px: 1.5,
        flexShrink: 0,
        borderRadius: `${radius.sm}px`,
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: selected ? c.onSecondaryContainer : c.onSurfaceVariant,
        bgcolor: selected ? c.secondaryContainer : 'transparent',
        boxShadow: selected ? 'none' : `inset 0 0 0 1px ${c.outlineVariant}`,
        transition: `background-color 140ms ${css.standard}`,
        '&:hover': { bgcolor: selected ? c.secondaryContainer : c.surfaceContainerHigh },
        '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
      }}
    >
      {children}
    </ButtonBase>
  );
}

function ToolButton({
  selected,
  label,
  icon,
  onClick,
  shortcut,
}: {
  selected: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  shortcut: string;
}) {
  return (
    <Tooltip title={`${label} (${shortcut.toUpperCase()})`} placement="top">
      <ButtonBase
        onClick={onClick}
        aria-pressed={selected}
        sx={{
          flexShrink: 0,
          display: 'grid',
          justifyItems: 'center',
          gap: 0.5,
          minWidth: { xs: 58, sm: 68 },
          px: { xs: 0.25, sm: 1 },
          py: 0.75,
          borderRadius: `${radius.md}px`,
          color: selected ? c.onSurface : c.onSurfaceVariant,
          '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 },
        }}
      >
        <Box
          sx={{
            width: { xs: 48, sm: 56 },
            height: 32,
            borderRadius: `${radius.full}px`,
            display: 'grid',
            placeItems: 'center',
            bgcolor: selected ? c.secondaryContainer : 'transparent',
            color: selected ? c.onSecondaryContainer : 'inherit',
            transition: `background-color 160ms ${css.standard}`,
          }}
        >
          {icon}
        </Box>
        <Typography variant="caption" sx={{ fontWeight: selected ? 700 : 500, color: 'inherit', lineHeight: 1.2 }}>
          {label}
        </Typography>
      </ButtonBase>
    </Tooltip>
  );
}

export interface ImageEditorProps {
  file: FileItem | null;
  onClose: () => void;
  onSaveCopy: (file: File) => void;
  onReplaced: (file: FileItem) => void;
}

function Editor({ file, onClose, onSaveCopy, onReplaced, closer }: ImageEditorProps & { file: FileItem; closer: { current: () => void } }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [base, setBase] = useState<Size | null>(null);
  const [downscaled, setDownscaled] = useState(false);
  const [tool, setTool] = useState<Tool>('crop');
  const [color, setColor] = useState(COLORS[0]);
  const [weight, setWeight] = useState<Weight>('m');
  const [textWeight, setTextWeight] = useState<Weight>('m');
  const [coverMode, setCoverMode] = useState<'mosaic' | 'solid'>('mosaic');
  const [ratio, setRatio] = useState<RatioKey>('free');
  const [cropDraft, setCropDraft] = useState<Rect | null>(null);
  const [textDraft, setTextDraft] = useState<{ at: Point; value: string } | null>(null);
  const [stage, setStage] = useState<Size>({ w: 0, h: 0 });
  const [saveAnchor, setSaveAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const history = useRef<{ list: Doc[]; index: number }>({ list: [INITIAL_DOC], index: 0 });
  const source = useRef<CanvasImageSource | null>(null);
  const composite = useRef<HTMLCanvasElement | null>(null);
  const view = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef<Drawing | null>(null);
  const cropDrag = useRef<CropDrag | null>(null);
  const frame = useRef(0);
  const fontReady = useRef<Promise<unknown>>(Promise.resolve());

  const doc = history.current.list[history.current.index];
  const cropping = tool === 'crop';
  const region = base ? visibleRegion(doc, base, cropping) : null;
  const small = region ? region.w < 480 && region.h < 480 : false;
  const scale = region && stage.w > 0 && stage.h > 0 ? Math.min(stage.w / region.w, stage.h / region.h, small ? 2 : 1) : 0;
  const oriented = base ? orientedSize(base, doc.rot) : null;
  const unit = base ? Math.max(0.6, Math.max(base.w, base.h) / 1000) : 1;
  const draft = cropping && cropDraft && oriented ? cropDraft : null;
  const pendingCrop = !!(
    draft &&
    oriented &&
    JSON.stringify(isFull(draft, oriented) ? null : roundRect(draft)) !== JSON.stringify(doc.crop)
  );
  const dirty = history.current.index > 0 || pendingCrop || !!textDraft?.value.trim();

  const live = useRef({ doc, base, region, scale, cropping });
  live.current = { doc, base, region, scale, cropping };

  useEffect(() => {
    let cancelled = false;
    fontReady.current = document.fonts ? document.fonts.load(`700 40px ${TEXT_FONT}`).catch(() => undefined) : Promise.resolve();
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height) {
        setStatus('error');
        return;
      }
      const factor = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)), MAX_SIDE / Math.max(width, height));
      const size = { w: Math.max(1, Math.round(width * factor)), h: Math.max(1, Math.round(height * factor)) };
      let input: CanvasImageSource = image;
      if (factor < 1) {
        const scaled = document.createElement('canvas');
        scaled.width = size.w;
        scaled.height = size.h;
        const ctx = scaled.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(image, 0, 0, size.w, size.h);
        }
        input = scaled;
      }
      const target = document.createElement('canvas');
      target.width = size.w;
      target.height = size.h;
      renderComposite(target, input, size, []);
      source.current = input;
      composite.current = target;
      history.current = { list: [INITIAL_DOC], index: 0 };
      setDownscaled(factor < 1);
      setBase(size);
      setCropDraft({ x: 0, y: 0, w: size.w, h: size.h });
      setStatus('ready');
    };
    image.onerror = () => !cancelled && setStatus('error');
    image.src = fileContentUrl(file.id);
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [file.id]);

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return undefined;
    const measure = () => {
      const pad = element.clientWidth < 600 ? 16 : 40;
      setStage({ w: Math.max(40, element.clientWidth - pad * 2), h: Math.max(40, element.clientHeight - pad * 2) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [status]);

  const paint = useCallback(() => {
    const canvas = view.current;
    const art = composite.current;
    const { doc: current, base: size, region: area, scale: zoom } = live.current;
    if (!canvas || !art || !size || !area || !zoom) return;
    const ratioPx = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(area.w * zoom * ratioPx));
    const height = Math.max(1, Math.round(area.h * zoom * ratioPx));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(zoom * ratioPx, 0, 0, zoom * ratioPx, 0, 0);
    ctx.translate(-area.x, -area.y);
    applyOrientation(ctx, current, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art, 0, 0);
    const preview = drawing.current?.shape;
    if (preview) {
      if (preview.kind === 'cover') drawCoverPreview(ctx, preview.rect, 1 / zoom);
      else drawShape(ctx, preview, size);
    }
  }, []);

  const schedulePaint = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(paint);
  }, [paint]);

  useLayoutEffect(() => {
    paint();
  });

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const syncComposite = useCallback((before: Doc, after: Doc) => {
    const art = composite.current;
    const size = live.current.base;
    if (!art || !size || before.shapes === after.shapes) return;
    const appended =
      after.shapes.length === before.shapes.length + 1 && before.shapes.every((shape, index) => shape === after.shapes[index]);
    const ctx = art.getContext('2d');
    if (appended && ctx) drawShape(ctx, after.shapes[after.shapes.length - 1], size);
    else if (source.current) renderComposite(art, source.current, size, after.shapes);
  }, []);

  const commit = useCallback(
    (next: Doc) => {
      const state = history.current;
      const before = state.list[state.index];
      let list = [...state.list.slice(0, state.index + 1), next];
      if (list.length > HISTORY_LIMIT) list = list.slice(list.length - HISTORY_LIMIT);
      history.current = { list, index: list.length - 1 };
      syncComposite(before, next);
      rerender();
    },
    [syncComposite]
  );

  const cropDoc = useCallback((): Doc => {
    const current = history.current.list[history.current.index];
    const size = live.current.base;
    if (!live.current.cropping || !cropDraft || !size) return current;
    const full = orientedSize(size, current.rot);
    const crop = isFull(cropDraft, full) ? null : roundRect(cropDraft);
    return JSON.stringify(crop) === JSON.stringify(current.crop) ? current : { ...current, crop };
  }, [cropDraft]);

  const settleCrop = useCallback(() => {
    const next = cropDoc();
    if (next !== history.current.list[history.current.index]) commit(next);
    return next;
  }, [cropDoc, commit]);

  const resetDraft = (target: Doc) => {
    if (!base) return;
    const size = orientedSize(base, target.rot);
    setCropDraft(target.crop ? { ...target.crop } : { x: 0, y: 0, w: size.w, h: size.h });
  };

  const textShape = (entry: { at: Point; value: string }, current: Doc, size: Size): Shape | null => {
    const text = entry.value.replace(/\s+$/, '');
    if (!text.trim()) return null;
    return {
      kind: 'text',
      at: toBase(entry.at, current, size),
      text,
      color,
      size: Math.round(TEXT[textWeight] * unit),
      rot: current.rot,
      flipX: current.flipX,
      flipY: current.flipY,
    };
  };

  const finishText = useCallback(async () => {
    const entry = textDraft;
    setTextDraft(null);
    if (!entry || !base) return;
    await fontReady.current;
    const current = history.current.list[history.current.index];
    const shape = textShape(entry, current, base);
    if (shape) commit({ ...current, shapes: [...current.shapes, shape] });
  }, [textDraft, base, commit, color, textWeight, unit]);

  const chooseTool = (next: Tool) => {
    if (next === tool) return;
    if (textDraft) finishText();
    if (tool === 'crop') settleCrop();
    if (next === 'crop') resetDraft(history.current.list[history.current.index]);
    setTool(next);
  };

  const undo = () => {
    if (textDraft) {
      setTextDraft(null);
      return;
    }
    const state = history.current;
    if (state.index === 0) return;
    const before = state.list[state.index];
    history.current = { ...state, index: state.index - 1 };
    syncComposite(before, history.current.list[history.current.index]);
    resetDraft(history.current.list[history.current.index]);
    rerender();
  };

  const redo = () => {
    const state = history.current;
    if (state.index >= state.list.length - 1) return;
    const before = state.list[state.index];
    history.current = { ...state, index: state.index + 1 };
    syncComposite(before, history.current.list[history.current.index]);
    resetDraft(history.current.list[history.current.index]);
    rerender();
  };

  const transform = (kind: 'left' | 'right' | 'flipX' | 'flipY') => {
    if (!base) return;
    const current = cropDoc();
    const next =
      kind === 'left'
        ? rotateDoc(current, base, false)
        : kind === 'right'
          ? rotateDoc(current, base, true)
          : flipDoc(current, base, kind === 'flipX' ? 'x' : 'y');
    commit(next);
    resetDraft(next);
  };

  const resetGeometry = () => {
    const current = history.current.list[history.current.index];
    const next = { ...current, rot: 0 as const, flipX: false, flipY: false, crop: null };
    setRatio('free');
    if (JSON.stringify({ ...current, shapes: null }) !== JSON.stringify({ ...next, shapes: null })) commit(next);
    resetDraft(next);
  };

  const ratioValue = (key: RatioKey) => {
    if (key === 'original') return oriented ? oriented.w / oriented.h : null;
    return RATIOS.find((entry) => entry.key === key)?.value ?? null;
  };

  const pickRatio = (key: RatioKey) => {
    setRatio(key);
    if (!oriented || !cropDraft) return;
    const value = ratioValue(key);
    if (value) setCropDraft(fitRatio(cropDraft, oriented, value));
  };

  const pointFrom = (event: { clientX: number; clientY: number }): Point | null => {
    const canvas = view.current;
    const { region: area, scale: zoom } = live.current;
    if (!canvas || !area || !zoom) return null;
    const bounds = canvas.getBoundingClientRect();
    const x = area.x + (event.clientX - bounds.left) / zoom;
    const y = area.y + (event.clientY - bounds.top) / zoom;
    return { x: Math.min(area.x + area.w, Math.max(area.x, x)), y: Math.min(area.y + area.h, Math.max(area.y, y)) };
  };

  const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!base || cropping || busy) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (tool === 'text') return;
    const point = pointFrom(event);
    if (!point) return;
    const current = history.current.list[history.current.index];
    const at = toBase(point, current, base);
    const width = Math.max(2, Math.round(STROKE[weight] * unit));
    const shape: Shape =
      tool === 'pen'
        ? { kind: 'pen', points: [at], color, width }
        : tool === 'arrow'
          ? { kind: 'arrow', from: at, to: at, color, width }
          : tool === 'rect'
            ? { kind: 'rect', rect: { x: at.x, y: at.y, w: 0, h: 0 }, color, width }
            : {
                kind: 'cover',
                rect: { x: at.x, y: at.y, w: 0, h: 0 },
                mode: coverMode,
                block: Math.max(6, Math.round(Math.max(base.w, base.h) / 80)),
              };
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = { pointer: event.pointerId, origin: at, shape, last: { x: event.clientX, y: event.clientY } };
    setDragging(true);
    schedulePaint();
  };

  const placeText = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'text' || !base || busy) return;
    const point = pointFrom(event);
    if (point) setTextDraft({ at: point, value: '' });
  };

  const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = drawing.current;
    if (!active || active.pointer !== event.pointerId || !base) return;
    const point = pointFrom(event);
    if (!point) return;
    const at = toBase(point, live.current.doc, base);
    const shape = active.shape;
    if (shape.kind === 'pen') {
      if (Math.hypot(event.clientX - active.last.x, event.clientY - active.last.y) < 1.5) return;
      active.last = { x: event.clientX, y: event.clientY };
      shape.points.push(at);
    } else if (shape.kind === 'arrow') {
      shape.to = at;
    } else if (shape.kind === 'rect' || shape.kind === 'cover') {
      shape.rect = normalizeRect(active.origin, at);
    }
    schedulePaint();
  };

  const endDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = drawing.current;
    if (!active || active.pointer !== event.pointerId) return;
    drawing.current = null;
    setDragging(false);
    const shape = active.shape;
    const zoom = live.current.scale || 1;
    const valid =
      event.type !== 'pointercancel' &&
      (shape.kind === 'pen' ||
        (shape.kind === 'arrow' && Math.hypot(shape.to.x - shape.from.x, shape.to.y - shape.from.y) * zoom >= 8) ||
        ((shape.kind === 'rect' || shape.kind === 'cover') && shape.rect.w * zoom >= 4 && shape.rect.h * zoom >= 4));
    if (valid) {
      const current = history.current.list[history.current.index];
      commit({ ...current, shapes: [...current.shapes, shape] });
    } else {
      schedulePaint();
    }
  };

  const startCropDrag = (handle: Handle | 'move') => (event: ReactPointerEvent<HTMLElement>) => {
    if (!cropDraft || busy) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDrag.current = { pointer: event.pointerId, handle, x: event.clientX, y: event.clientY, rect: cropDraft };
    setDragging(true);
  };

  const moveCropDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const active = cropDrag.current;
    if (!active || active.pointer !== event.pointerId || !oriented || !scale) return;
    const dx = (event.clientX - active.x) / scale;
    const dy = (event.clientY - active.y) / scale;
    const minimum = Math.min(24 / scale, oriented.w, oriented.h);
    setCropDraft(
      active.handle === 'move'
        ? moveRect(active.rect, dx, dy, oriented)
        : resizeRect(active.rect, active.handle, dx, dy, oriented, ratioValue(ratio), minimum)
    );
  };

  const endCropDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (cropDrag.current?.pointer !== event.pointerId) return;
    cropDrag.current = null;
    setDragging(false);
  };

  const nudgeCrop = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!cropDraft || !oriented) return;
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setCropDraft(moveRect(cropDraft, move[0] / (scale || 1), move[1] / (scale || 1), oriented));
  };

  const render = async (): Promise<{ blob: Blob; name: string } | null> => {
    const art = composite.current;
    if (!art || !base) return null;
    let current = cropDoc();
    if (textDraft) {
      await fontReady.current;
      const shape = textShape(textDraft, current, base);
      setTextDraft(null);
      if (shape) current = { ...current, shapes: [...current.shapes, shape] };
      if (current !== history.current.list[history.current.index]) commit(current);
    } else if (current !== history.current.list[history.current.index]) {
      commit(current);
    }
    const output = exportImage(art, current, base);
    const wanted = MIME[extensionOf(file.filename)] || 'image/png';
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, wanted, wanted === 'image/png' ? undefined : 0.92));
    if (!blob) return null;
    const extension = EXTENSION[blob.type] || 'png';
    const stem = stemOf(file.originalName || file.title || file.filename);
    return { blob, name: `${stem}.${extension}` };
  };

  const saveCopy = async () => {
    setSaveAnchor(null);
    setBusy(true);
    try {
      const result = await render();
      if (!result) throw new Error(t('Das Bild konnte nicht erzeugt werden.'));
      const stem = result.name.replace(/\.[^.]+$/, '');
      const extension = result.name.slice(stem.length);
      onSaveCopy(new File([result.blob], `${stem} (${t('bearbeitet')})${extension}`, { type: result.blob.type }));
      onClose();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const replace = async () => {
    setSaveAnchor(null);
    const ok = await confirm({
      title: t('Original ersetzen?'),
      message: t(
        'Die bisherige Fassung wird überschrieben und lässt sich nicht wiederherstellen. Bestehende Links zeigen danach das bearbeitete Bild.'
      ),
      confirmLabel: t('Ersetzen'),
      icon: <SaveOutlined />,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await render();
      if (!result) throw new Error(t('Das Bild konnte nicht erzeugt werden.'));
      const response = await replaceFile(file.id, result.blob, result.name);
      onReplaced(response.file);
      onClose();
    } catch (failure) {
      toast(errorMessage(failure), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const requestClose = async () => {
    if (busy) return;
    if (dirty) {
      const ok = await confirm({
        title: t('Änderungen verwerfen?'),
        message: t('Deine Bearbeitung wird nicht gespeichert.'),
        confirmLabel: t('Verwerfen'),
      });
      if (!ok) return;
    }
    onClose();
  };
  closer.current = requestClose;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || busy) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        if (isTyping(event.target)) return;
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        if (isTyping(event.target)) return;
        event.preventDefault();
        redo();
        return;
      }
      if (mod || event.altKey || isTyping(event.target)) return;
      const match = TOOLS.find((entry) => entry.shortcut === event.key.toLowerCase());
      if (match && status === 'ready') {
        event.preventDefault();
        chooseTool(match.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const canUndo = history.current.index > 0 || !!textDraft;
  const canRedo = history.current.index < history.current.list.length - 1;
  const output = region && (cropping && draft ? roundRect(draft) : region);
  const box = draft && scale ? { left: draft.x * scale, top: draft.y * scale, width: draft.w * scale, height: draft.h * scale } : null;

  const options = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        overflowX: 'auto',
        px: { xs: 1.5, sm: 2 },
        py: 1,
        minHeight: 52,
        scrollbarWidth: 'none',
      }}
    >
      {cropping && (
        <>
          <Tooltip title={t('Nach links drehen')}>
            <IconButton aria-label={t('Nach links drehen')} onClick={() => transform('left')} disabled={busy}>
              <RotateLeftRounded />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('Nach rechts drehen')}>
            <IconButton aria-label={t('Nach rechts drehen')} onClick={() => transform('right')} disabled={busy}>
              <RotateRightRounded />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('Waagerecht spiegeln')}>
            <IconButton aria-label={t('Waagerecht spiegeln')} onClick={() => transform('flipX')} disabled={busy}>
              <FlipRounded />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('Senkrecht spiegeln')}>
            <IconButton aria-label={t('Senkrecht spiegeln')} onClick={() => transform('flipY')} disabled={busy}>
              <FlipRounded sx={{ transform: 'rotate(90deg)' }} />
            </IconButton>
          </Tooltip>
          <Box sx={{ width: '1px', alignSelf: 'stretch', my: 0.5, mx: 0.5, bgcolor: c.outlineVariant, flexShrink: 0 }} />
          {RATIOS.map((entry) => (
            <Chip key={entry.key} selected={ratio === entry.key} onClick={() => pickRatio(entry.key)}>
              {entry.label()}
            </Chip>
          ))}
          <Box sx={{ width: '1px', alignSelf: 'stretch', my: 0.5, mx: 0.5, bgcolor: c.outlineVariant, flexShrink: 0 }} />
          <Button size="small" startIcon={<RestartAltRounded />} onClick={resetGeometry} disabled={busy} sx={{ flexShrink: 0 }}>
            {t('Zurücksetzen')}
          </Button>
        </>
      )}
      {(tool === 'pen' || tool === 'arrow' || tool === 'rect' || tool === 'text') && (
        <>
          {COLORS.map((entry, index) => (
            <Swatch key={entry} color={entry} name={COLOR_NAMES()[index]} selected={color === entry} onClick={() => setColor(entry)} />
          ))}
          <Box sx={{ width: '1px', alignSelf: 'stretch', my: 0.5, mx: 0.5, bgcolor: c.outlineVariant, flexShrink: 0 }} />
          {(['s', 'm', 'l'] as Weight[]).map((entry) =>
            tool === 'text' ? (
              <Chip
                key={entry}
                selected={textWeight === entry}
                onClick={() => setTextWeight(entry)}
                label={{ s: t('Klein'), m: t('Mittel'), l: t('Groß') }[entry]}
              >
                <Box component="span" sx={{ fontSize: { s: 12, m: 15, l: 19 }[entry], fontWeight: 800, lineHeight: 1 }}>
                  A
                </Box>
              </Chip>
            ) : (
              <Chip
                key={entry}
                selected={weight === entry}
                onClick={() => setWeight(entry)}
                label={{ s: t('Dünn'), m: t('Mittel'), l: t('Dick') }[entry]}
              >
                <Box
                  sx={{
                    width: { s: 4, m: 8, l: 14 }[entry],
                    height: { s: 4, m: 8, l: 14 }[entry],
                    borderRadius: '50%',
                    bgcolor: 'currentColor',
                  }}
                />
              </Chip>
            )
          )}
        </>
      )}
      {tool === 'cover' && (
        <>
          <Chip selected={coverMode === 'mosaic'} onClick={() => setCoverMode('mosaic')}>
            {t('Verpixeln')}
          </Chip>
          <Chip selected={coverMode === 'solid'} onClick={() => setCoverMode('solid')}>
            {t('Schwärzen')}
          </Chip>
          <Typography variant="body2" sx={{ color: 'text.secondary', ml: 1, whiteSpace: 'nowrap' }}>
            {t('Zieh einen Rahmen über das, was niemand sehen soll.')}
          </Typography>
        </>
      )}
    </Box>
  );

  return (
    <Box
      data-mui-color-scheme="dark"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: c.surfaceContainerLowest, color: c.onSurface }}
    >
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 0.5, sm: 1.5 }, height: 64, flexShrink: 0 }}>
        <Tooltip title={t('Schließen')}>
          <IconButton aria-label={t('Schließen')} onClick={requestClose} disabled={busy}>
            <CloseRounded />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" component="h2" noWrap sx={{ fontWeight: 700, display: { xs: 'none', sm: 'block' } }}>
            {t('Bild bearbeiten')}
          </Typography>
          <Typography variant="caption" component="p" noWrap sx={{ color: 'text.secondary' }}>
            {output
              ? `${formatNumber(Math.round(output.w))} × ${formatNumber(Math.round(output.h))} px`
              : file.originalName || file.filename}
            {downscaled ? `, ${t('zum Bearbeiten verkleinert')}` : ''}
          </Typography>
        </Box>
        <Tooltip title={t('Rückgängig (Strg+Z)')}>
          <span>
            <IconButton aria-label={t('Rückgängig')} onClick={undo} disabled={!canUndo || busy}>
              <UndoRounded />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('Wiederholen (Strg+Umschalt+Z)')}>
          <span>
            <IconButton aria-label={t('Wiederholen')} onClick={redo} disabled={!canRedo || busy}>
              <RedoRounded />
            </IconButton>
          </span>
        </Tooltip>
        <Button
          variant="contained"
          onClick={(event) => setSaveAnchor(event.currentTarget)}
          disabled={!dirty || busy || status !== 'ready'}
          endIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ExpandMoreRounded />}
          aria-haspopup="menu"
          sx={{ ml: 0.5, mr: { xs: 0.5, sm: 0 } }}
        >
          {t('Speichern')}
        </Button>
        <Menu
          anchorEl={saveAnchor}
          open={!!saveAnchor}
          onClose={() => setSaveAnchor(null)}
          disablePortal
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { width: 320, maxWidth: 'calc(100vw - 24px)' } } }}
        >
          <MenuItem onClick={saveCopy} sx={{ alignItems: 'flex-start', py: 1.25, whiteSpace: 'normal' }}>
            <ListItemIcon sx={{ mt: 0.25 }}>
              <AddPhotoAlternateOutlined />
            </ListItemIcon>
            <ListItemText primary={t('Als neue Datei speichern')} secondary={t('Das Original bleibt unverändert.')} />
          </MenuItem>
          <MenuItem onClick={replace} sx={{ alignItems: 'flex-start', py: 1.25, whiteSpace: 'normal' }}>
            <ListItemIcon sx={{ mt: 0.25 }}>
              <SaveOutlined />
            </ListItemIcon>
            <ListItemText primary={t('Original ersetzen')} secondary={t('Gleiche Links, neues Bild.')} />
          </MenuItem>
        </Menu>
      </Box>

      <Box ref={stageRef} sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {status === 'loading' && <CircularProgress aria-label={t('Bild wird geladen')} />}
        {status === 'error' && (
          <Box sx={{ textAlign: 'center', px: 3 }}>
            <Typography variant="h6">{t('Das Bild konnte nicht geladen werden.')}</Typography>
            <Button sx={{ mt: 2 }} variant="tonal" onClick={onClose}>
              {t('Schließen')}
            </Button>
          </Box>
        )}
        {status === 'ready' && region && scale > 0 && (
          <Box
            sx={{
              position: 'relative',
              width: region.w * scale,
              height: region.h * scale,
              overflow: 'hidden',
              background: 'repeating-conic-gradient(#3b3940 0 25%, #2b2930 0 50%) 0 0 / 20px 20px',
              boxShadow: '0 12px 40px rgb(0 0 0 / 0.45)',
            }}
          >
            <canvas
              ref={view}
              role="img"
              aria-label={t('Bild')}
              onPointerDown={startDraw}
              onClick={placeText}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
              style={{
                display: 'block',
                width: region.w * scale,
                height: region.h * scale,
                touchAction: cropping ? 'auto' : 'none',
                cursor: cropping ? 'default' : tool === 'text' ? 'text' : 'crosshair',
              }}
            />
            {cropping && box && (
              <Box
                role="group"
                aria-label={t('Zuschnitt, mit den Pfeiltasten verschieben')}
                tabIndex={0}
                onKeyDown={nudgeCrop}
                onPointerDown={startCropDrag('move')}
                onPointerMove={moveCropDrag}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
                sx={{
                  position: 'absolute',
                  ...box,
                  cursor: 'move',
                  touchAction: 'none',
                  outline: '1px solid rgb(255 255 255 / 0.9)',
                  boxShadow: '0 0 0 100vmax rgb(0 0 0 / 0.58)',
                  '&:focus-visible': { outline: `2px solid ${c.primary}` },
                }}
              >
                {dragging && (
                  <Box
                    aria-hidden
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      backgroundImage:
                        'linear-gradient(to right, transparent calc(33.33% - 0.5px), rgb(255 255 255 / 0.5) calc(33.33% - 0.5px), rgb(255 255 255 / 0.5) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), rgb(255 255 255 / 0.5) calc(66.66% - 0.5px), rgb(255 255 255 / 0.5) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px)), linear-gradient(to bottom, transparent calc(33.33% - 0.5px), rgb(255 255 255 / 0.5) calc(33.33% - 0.5px), rgb(255 255 255 / 0.5) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), rgb(255 255 255 / 0.5) calc(66.66% - 0.5px), rgb(255 255 255 / 0.5) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px))',
                    }}
                  />
                )}
                {HANDLES.map((handle) => {
                  const corner = handle.length === 2;
                  const vertical = handle === 'n' || handle === 's';
                  return (
                    <Box
                      key={handle}
                      aria-hidden
                      onPointerDown={startCropDrag(handle)}
                      sx={{
                        position: 'absolute',
                        width: corner ? 32 : vertical ? 40 : 24,
                        height: corner ? 32 : vertical ? 24 : 40,
                        touchAction: 'none',
                        cursor: `${handle}-resize`,
                        ...(handle.includes('n') ? { top: -12 } : handle.includes('s') ? { bottom: -12 } : { top: 'calc(50% - 20px)' }),
                        ...(handle.includes('w') ? { left: -12 } : handle.includes('e') ? { right: -12 } : { left: 'calc(50% - 20px)' }),
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          bgcolor: '#fff',
                          borderRadius: '2px',
                          boxShadow: '0 0 2px rgb(0 0 0 / 0.6)',
                          ...(corner
                            ? {
                                width: 18,
                                height: 18,
                                bgcolor: 'transparent',
                                borderStyle: 'solid',
                                borderColor: '#fff',
                                borderRadius: 0,
                                boxShadow: 'none',
                                borderWidth: `${handle.includes('n') ? 4 : 0}px ${handle.includes('e') ? 4 : 0}px ${handle.includes('s') ? 4 : 0}px ${handle.includes('w') ? 4 : 0}px`,
                                ...(handle.includes('n') ? { top: 9 } : { bottom: 9 }),
                                ...(handle.includes('w') ? { left: 9 } : { right: 9 }),
                              }
                            : vertical
                              ? { width: 24, height: 4, left: 8, top: 10 }
                              : { width: 4, height: 24, top: 8, left: 10 }),
                        },
                      }}
                    />
                  );
                })}
              </Box>
            )}
            {textDraft && (
              <Box
                component="textarea"
                autoFocus
                value={textDraft.value}
                rows={Math.max(1, textDraft.value.split('\n').length)}
                cols={Math.max(2, ...textDraft.value.split('\n').map((line) => line.length + 1))}
                aria-label={t('Text')}
                placeholder={t('Text')}
                style={{ fieldSizing: 'content' } as CSSProperties}
                onChange={(event) => setTextDraft((current) => (current ? { ...current, value: event.target.value } : current))}
                onBlur={() => finishText()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setTextDraft(null);
                  } else if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    finishText();
                  }
                }}
                sx={{
                  position: 'absolute',
                  left: (textDraft.at.x - region.x) * scale,
                  top: (textDraft.at.y - region.y) * scale,
                  m: 0,
                  p: 0,
                  border: 0,
                  outline: '1px dashed rgb(255 255 255 / 0.8)',
                  outlineOffset: 4,
                  resize: 'none',
                  overflow: 'hidden',
                  background: 'transparent',
                  color,
                  caretColor: color,
                  font: `700 ${Math.max(10, TEXT[textWeight] * unit * scale)}px ${TEXT_FONT}`,
                  lineHeight: 1.2,
                  whiteSpace: 'pre',
                  minWidth: '2ch',
                  maxWidth: Math.max(40, (region.x + region.w - textDraft.at.x) * scale),
                  textShadow: `0 0 3px ${outlineFor(color)}, 0 0 1px ${outlineFor(color)}`,
                  '&::placeholder': { color, opacity: 0.5 },
                }}
              />
            )}
          </Box>
        )}
        {status === 'ready' && tool === 'text' && !textDraft && (
          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              px: 1.5,
              py: 0.5,
              borderRadius: `${radius.full}px`,
              bgcolor: 'rgb(0 0 0 / 0.55)',
              color: '#fff',
              pointerEvents: 'none',
            }}
          >
            {t('Klicke ins Bild, um Text zu setzen.')}
          </Typography>
        )}
      </Box>

      <Box
        component="footer"
        sx={{
          flexShrink: 0,
          bgcolor: c.surfaceContainerLow,
          borderTop: `1px solid ${c.outlineVariant}`,
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        {status === 'ready' && options}
        <Box
          role="toolbar"
          aria-label={t('Werkzeuge')}
          sx={{
            display: 'flex',
            justifyContent: { xs: 'space-between', sm: 'center' },
            gap: { xs: 0, sm: 0.5 },
            overflowX: 'auto',
            px: { xs: 0.5, sm: 1 },
            pb: 1,
            scrollbarWidth: 'none',
          }}
        >
          {TOOLS.map((entry) => (
            <ToolButton
              key={entry.key}
              selected={tool === entry.key}
              label={entry.label()}
              icon={entry.icon}
              shortcut={entry.shortcut}
              onClick={() => chooseTool(entry.key)}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export function ImageEditor(props: ImageEditorProps) {
  const { file } = props;
  const closer = useRef<() => void>(() => undefined);
  return (
    <Dialog
      open={!!file}
      fullScreen
      onClose={() => closer.current()}
      sx={{ zIndex: 1450 }}
      slotProps={{ paper: { 'aria-label': t('Bild bearbeiten'), sx: { p: 0, borderRadius: 0, boxShadow: 'none', overflow: 'hidden' } } }}
    >
      {file && <Editor key={file.id} {...props} file={file} closer={closer} />}
    </Dialog>
  );
}
