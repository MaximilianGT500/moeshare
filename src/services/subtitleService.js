'use strict';

const db = require('../lib/db');
const { badRequest, notFound } = require('../lib/errors');

const MAX_BYTES = 512 * 1024;
const MAX_PER_FILE = 10;
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const TIME = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})(.*)$/;

function toVtt(input) {
  if (typeof input !== 'string' || !input.trim()) throw badRequest('Die Datei mit den Untertiteln ist leer.', { field: 'content' });
  if (Buffer.byteLength(input) > MAX_BYTES) throw badRequest('Untertitel dürfen höchstens 512 KB groß sein.', { field: 'content' });
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  const blocks = text.split(/\n{2,}/);
  const vtt = /^WEBVTT(?:[ \t].*)?$/.test(blocks[0].split('\n')[0]);
  const cues = [];
  for (const block of vtt ? blocks.slice(1) : blocks) {
    const lines = block.split('\n');
    if (vtt && /^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    const at = lines.findIndex((line) => TIME.test(line));
    if (at === -1 || at > 1) continue;
    const [, start, end, rest] = TIME.exec(lines[at]);
    const body = lines
      .slice(at + 1)
      .map((line) => line.replace(/-->/g, '→'))
      .join('\n')
      .trim();
    if (!body) continue;
    const settings = vtt ? rest.trim() : '';
    cues.push(`${start.replace(',', '.')} --> ${end.replace(',', '.')}${settings ? ` ${settings}` : ''}\n${body}`);
  }
  if (!cues.length) throw badRequest('Das sind keine Untertitel im Format SRT oder WebVTT.', { field: 'content' });
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function present(row) {
  return {
    id: Number(row.id),
    language: row.language,
    label: row.label,
    default: Boolean(Number(row.is_default)),
    url: `/subtitles/${row.id}.vtt`,
    createdAt: Number(row.created_at),
  };
}

function cleanLanguage(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!LANGUAGE.test(text)) throw badRequest('Gib die Sprache als Kürzel an, etwa de oder en.', { field: 'language' });
  return text;
}

function cleanLabel(value, fallback) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length > 60) throw badRequest('Der Name darf höchstens 60 Zeichen lang sein.', { field: 'label' });
  return text || fallback;
}

async function list(fileId) {
  const rows = await db.all(
    'SELECT id, file_id, language, label, is_default, created_at FROM file_subtitles WHERE file_id = ? ORDER BY id',
    [fileId]
  );
  return rows.map(present);
}

async function clearDefault(fileId, except = null) {
  await db.run(
    `UPDATE file_subtitles SET is_default = 0 WHERE file_id = ?${except ? ' AND id <> ?' : ''}`,
    except ? [fileId, except] : [fileId]
  );
}

async function add(fileId, input) {
  const source = input && typeof input === 'object' ? input : {};
  if ((await db.count('SELECT COUNT(*) FROM file_subtitles WHERE file_id = ?', [fileId])) >= MAX_PER_FILE) {
    throw badRequest(`Höchstens ${MAX_PER_FILE} Untertitel pro Video.`);
  }
  const language = cleanLanguage(source.language);
  const label = cleanLabel(source.label, language.toUpperCase());
  const content = toVtt(source.content);
  const makeDefault = source.default === true || (await db.count('SELECT COUNT(*) FROM file_subtitles WHERE file_id = ?', [fileId])) === 0;
  if (makeDefault) await clearDefault(fileId);
  const id = await db.insertRow('file_subtitles', {
    file_id: fileId,
    language,
    label,
    content,
    is_default: makeDefault ? 1 : 0,
    created_at: Date.now(),
  });
  return present(await db.get('SELECT id, file_id, language, label, is_default, created_at FROM file_subtitles WHERE id = ?', [id]));
}

async function find(fileId, id) {
  const row = Number.isSafeInteger(Number(id))
    ? await db.get('SELECT id, file_id, language, label, is_default, created_at FROM file_subtitles WHERE id = ? AND file_id = ?', [
        Number(id),
        fileId,
      ])
    : null;
  if (!row) throw notFound('Diese Untertitel gibt es nicht (mehr).');
  return row;
}

async function update(fileId, id, input) {
  const row = await find(fileId, id);
  const source = input && typeof input === 'object' ? input : {};
  const fields = {};
  if (source.language !== undefined) fields.language = cleanLanguage(source.language);
  if (source.label !== undefined) fields.label = cleanLabel(source.label, (fields.language || row.language).toUpperCase());
  if (source.content !== undefined) fields.content = toVtt(source.content);
  if (source.default !== undefined) {
    fields.is_default = source.default === true ? 1 : 0;
    if (fields.is_default) await clearDefault(fileId, row.id);
  }
  const columns = Object.keys(fields);
  if (columns.length) {
    await db.run(`UPDATE file_subtitles SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`, [
      ...columns.map((column) => fields[column]),
      row.id,
    ]);
  }
  return present(await find(fileId, row.id));
}

async function remove(fileId, id) {
  const row = await find(fileId, id);
  await db.run('DELETE FROM file_subtitles WHERE id = ?', [row.id]);
  if (Number(row.is_default)) {
    const next = await db.get('SELECT id FROM file_subtitles WHERE file_id = ? ORDER BY id LIMIT 1', [fileId]);
    if (next) await db.run('UPDATE file_subtitles SET is_default = 1 WHERE id = ?', [next.id]);
  }
  return present(row);
}

async function content(id) {
  const row = Number.isSafeInteger(Number(id))
    ? await db.get('SELECT id, file_id, content FROM file_subtitles WHERE id = ?', [Number(id)])
    : null;
  return row || null;
}

module.exports = { MAX_BYTES, toVtt, list, add, update, remove, content };
