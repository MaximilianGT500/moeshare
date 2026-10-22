'use strict';

const db = require('../lib/db');
const cache = require('../lib/cache');
const { forbidden } = require('../lib/errors');
const { DEFAULT_DESIGN, normalizeDesign, parseDesign, compiledCss } = require('../lib/viewDesign');
const settings = require('./settingsService');

const cssMode = () => settings.get('view.customCss');

function cssAllowedFor(role) {
  const mode = cssMode();
  return mode === 'all' || (mode === 'admins' && role === 'admin');
}

function publicDesign(design) {
  const { css, ...rest } = design;
  return rest;
}

async function ownDesign(userId) {
  const row = await db.get('SELECT design FROM users WHERE id = ?', [userId]);
  return parseDesign(row && row.design);
}

async function setOwnDesign(user, design) {
  if (design !== null && !settings.get('view.allowUserDesigns') && !user.isAdmin) {
    throw forbidden('Auf diesem Server gilt ein einheitliches Design für alle Vorschauseiten.');
  }
  let value = null;
  if (design !== null) {
    const normalized = normalizeDesign(design);
    if (normalized.css && !cssAllowedFor(user.role)) normalized.css = '';
    value = JSON.stringify(normalized);
  }
  await db.run('UPDATE users SET design = ? WHERE id = ?', [value, user.id]);
  cache.clear();
  return ownDesign(user.id);
}

function resolve(row) {
  const own = settings.get('view.allowUserDesigns') ? parseDesign(row && row.design) : null;
  if (own) {
    return { source: 'own', design: own, css: cssAllowedFor(row.role) ? compiledCss(own.css) : '' };
  }
  const fallback = settings.get('view.default') || DEFAULT_DESIGN;
  return { source: 'default', design: fallback, css: cssMode() === 'off' ? '' : compiledCss(fallback.css) };
}

const forOwner = (username) =>
  cache.remember(`design:${username}`, 15000, async () => {
    const row = await db.get('SELECT role, design FROM users WHERE username = ?', [username]);
    const { source, design, css } = resolve(row);
    return { source, design: publicDesign(design), css };
  });

function preview(design, { allowCss }) {
  const normalized = normalizeDesign(design);
  return { design: publicDesign(normalized), css: allowCss ? compiledCss(normalized.css) : '' };
}

module.exports = { cssMode, cssAllowedFor, ownDesign, setOwnDesign, forOwner, preview, publicDesign, DEFAULT_DESIGN };
