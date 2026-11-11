'use strict';

const GRADIENT = ['#67e8f9', '#0e7490'];

const GLYPH =
  '<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M16.5 41.5 V27.5 L19 14 L27.5 21 H36.5 L45 14 L47.5 27.5 V41.5 C47.5 46.7 43.2 51 38 51 H26 C20.8 51 16.5 46.7 16.5 41.5 Z"/>' +
  '<path d="M32 43 V29.5"/><path d="M25.8 35.5 L32 29.3 L38.2 35.5"/></g>';

const gradient = (id) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GRADIENT[0]}"/><stop offset="1" stop-color="${GRADIENT[1]}"/></linearGradient></defs>`;

function svg({ shape = 'circle', scale = 1, id = 'g' } = {}) {
  const background =
    shape === 'square' ? `<rect width="64" height="64" fill="url(#${id})"/>` : `<circle cx="32" cy="32" r="32" fill="url(#${id})"/>`;
  const glyph = scale === 1 ? GLYPH : `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${GLYPH}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${gradient(id)}${background}${glyph}</svg>`;
}

const SVG = svg();

const badge = (size = 96) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><g transform="translate(32 32) scale(1.42) translate(-32 -32.5)">${GLYPH}</g></svg>`;

module.exports = { GRADIENT, SVG, svg, badge };
