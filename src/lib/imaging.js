'use strict';

const fonts = require('./fonts');
const crypto = require('crypto');
const fsp = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const PROCESSABLE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);
const LOSSLESS = new Set(['.png', '.tif', '.tiff']);
const FORMAT_OF = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp', '.avif': 'avif', '.tif': 'tiff', '.tiff': 'tiff' };
const EXTENSION_OF = { jpeg: '.jpg', png: '.png', webp: '.webp', avif: '.avif', tiff: '.tiff' };

const POSITIONS = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

const canProcess = (ext) => PROCESSABLE.has(String(ext || '').toLowerCase());

const escapeMarkup = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

function encode(pipeline, format, { quality, lossless }) {
  if (format === 'jpeg') return pipeline.jpeg({ quality, mozjpeg: true });
  if (format === 'png') return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  if (format === 'webp')
    return lossless ? pipeline.webp({ lossless: true, effort: 5 }) : pipeline.webp({ quality, effort: 5, smartSubsample: true });
  if (format === 'avif')
    return pipeline.avif({ quality: Math.max(30, quality - 22), effort: 4, chromaSubsampling: lossless ? '4:4:4' : '4:2:0' });
  return pipeline.tiff({ compression: 'lzw' });
}

async function fade(data, opacity) {
  if (opacity >= 1) return data;
  return sharp(data)
    .composite([
      {
        input: Buffer.from([255, 255, 255, Math.max(0, Math.min(255, Math.round(255 * opacity)))]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
}

async function renderText(markup, px, maxWidth) {
  const { data, info } = await sharp({
    text: {
      text: markup,
      font: `${fonts.NAME} ${px}`,
      fontfile: fonts.FILE,
      rgba: true,
      dpi: 72,
      width: Math.max(px, maxWidth),
      wrap: 'word-char',
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function textLayer(text, { px, color, shadow, maxWidth }) {
  const content = escapeMarkup(text);
  const main = await renderText(`<span foreground="${color}">${content}</span>`, px, maxWidth);
  if (!shadow) return main;
  const pad = Math.max(2, Math.round(px * 0.14));
  const offset = Math.max(1, Math.round(px * 0.05));
  const dark = await renderText(`<span foreground="#000000">${content}</span>`, px, maxWidth);
  const blurred = await sharp(dark.data)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(Math.max(0.8, px * 0.06))
    .png()
    .toBuffer();
  const width = main.width + pad * 2 + offset;
  const height = main.height + pad * 2 + offset;
  const data = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: await fade(blurred, 0.55), left: offset, top: offset },
      { input: main.data, left: pad, top: pad },
    ])
    .png()
    .toBuffer();
  return { data, width, height };
}

async function logoLayer(image, { width, height, size, margin }) {
  const { data, info } = await sharp(Buffer.from(image, 'base64'))
    .resize({
      width: Math.max(8, Math.min(Math.round((width * size) / 100), width - margin * 2)),
      height: Math.max(8, height - margin * 2),
      fit: 'inside',
    })
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function fitInside(layer, width, height) {
  if (layer.width <= width && layer.height <= height) return layer;
  const { data, info } = await sharp(layer.data).resize({ width, height, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function watermarkLayers(config, { width, height }) {
  const shorter = Math.min(width, height);
  const margin = Math.round(shorter * 0.03);
  let layer =
    config.kind === 'image' && config.image
      ? await logoLayer(config.image, { width, height, size: config.size, margin })
      : await textLayer(config.text, {
          px: Math.max(10, Math.round((shorter * config.size) / 100)),
          color: config.color,
          shadow: config.shadow !== false,
          maxWidth: Math.max(10, width - margin * 2),
        });
  layer = { ...layer, data: await fade(layer.data, config.opacity / 100) };
  if (config.position === 'tile') {
    const gap = Math.round(Math.max(layer.width, layer.height) * 0.35);
    const rotated = await sharp(layer.data)
      .rotate(-30, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: gap, bottom: gap, left: gap, right: gap, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });
    const tile = await fitInside({ data: rotated.data, width: rotated.info.width, height: rotated.info.height }, width, height);
    return [{ input: tile.data, tile: true, gravity: 'northwest' }];
  }
  layer = await fitInside(layer, width, height);
  const [fx, fy] = POSITIONS[config.position] || POSITIONS['bottom-right'];
  const left = Math.max(0, Math.min(width - layer.width, Math.round(margin + (width - margin * 2 - layer.width) * fx)));
  const top = Math.max(0, Math.min(height - layer.height, Math.round(margin + (height - margin * 2 - layer.height) * fy)));
  return [{ input: layer.data, left, top }];
}

async function dimensions(source) {
  const meta = await sharp(source, { failOn: 'none' }).metadata();
  const rotated = (meta.orientation || 1) >= 5;
  return { width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height, pages: meta.pages || 1 };
}

async function processImage(source, { ext, optimize = null, watermark = null }) {
  const extension = String(ext || '').toLowerCase();
  if (!canProcess(extension) || (!optimize && !watermark)) return null;
  const meta = await dimensions(source);
  if (meta.pages > 1 || !meta.width || !meta.height) return null;
  let { width, height } = meta;
  let pipeline = sharp(source, { failOn: 'none' }).rotate();
  let resized = false;
  const limit = optimize ? Number(optimize.maxDimension) || 0 : 0;
  if (limit && Math.max(width, height) > limit) {
    const scale = limit / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    pipeline = pipeline.resize({ width, height, fit: 'fill' });
    resized = true;
  }
  if (watermark) pipeline = pipeline.composite(await watermarkLayers(watermark, { width, height }));
  const sourceFormat = FORMAT_OF[extension];
  const format = optimize && optimize.format && optimize.format !== 'keep' ? optimize.format : sourceFormat;
  const target = path.join(path.dirname(source), `.${crypto.randomUUID()}${EXTENSION_OF[format]}`);
  try {
    await encode(pipeline, format, { quality: optimize ? optimize.quality : 90, lossless: LOSSLESS.has(extension) }).toFile(target);
    const before = (await fsp.stat(source)).size;
    const after = (await fsp.stat(target)).size;
    if (!watermark && !resized && after >= before) {
      await fsp.rm(target, { force: true });
      return null;
    }
    return { file: target, ext: EXTENSION_OF[format], width, height, before, after, watermarked: Boolean(watermark) };
  } catch (error) {
    await fsp.rm(target, { force: true });
    throw error;
  }
}

async function normalizeLogo(buffer) {
  const meta = await sharp(buffer, { failOn: 'error' }).metadata();
  if (!['png', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'heif'].includes(meta.format)) throw new Error('unsupported');
  return sharp(buffer, { animated: false, failOn: 'error' })
    .rotate()
    .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27466f"/><stop offset="0.62" stop-color="#d98a5f"/><stop offset="1" stop-color="#f2c38a"/></linearGradient></defs><rect width="1200" height="800" fill="url(#s)"/><circle cx="860" cy="430" r="96" fill="#ffd98f"/><path d="M0 560 L210 420 L420 540 L650 370 L910 560 L1200 440 L1200 800 L0 800 Z" fill="#3b3150"/><path d="M0 660 L300 560 L560 668 L850 588 L1200 700 L1200 800 L0 800 Z" fill="#211b30"/></svg>`;

async function preview(source, watermark) {
  const input = source || Buffer.from(SAMPLE);
  const base = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const layers = await watermarkLayers(watermark, { width: base.info.width, height: base.info.height });
  return sharp(base.data).composite(layers).jpeg({ quality: 82 }).toBuffer();
}

const blurred = (source) =>
  sharp(source, { failOn: 'none' })
    .rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .blur(28)
    .modulate({ brightness: 0.9 })
    .jpeg({ quality: 70 })
    .toBuffer();

module.exports = { POSITIONS, canProcess, processImage, normalizeLogo, preview, blurred };
