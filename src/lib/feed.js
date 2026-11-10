'use strict';

const mime = require('mime-types');
const { escapeHtml } = require('./format');

const iso = (value) => new Date(Number(value) || Date.now()).toISOString();
const MAX_ENTRIES = 50;

function entryOf(item) {
  const parts = [
    '<entry>',
    `<id>${escapeHtml(item.id)}</id>`,
    `<title>${escapeHtml(item.title)}</title>`,
    `<link rel="alternate" type="text/html" href="${escapeHtml(item.link)}"/>`,
    `<published>${iso(item.date)}</published>`,
    `<updated>${iso(item.date)}</updated>`,
  ];
  if (item.summary) parts.push(`<summary>${escapeHtml(item.summary)}</summary>`);
  if (item.html) parts.push(`<content type="html">${escapeHtml(item.html)}</content>`);
  if (item.enclosure)
    parts.push(`<link rel="enclosure" type="${escapeHtml(item.enclosure.type)}" href="${escapeHtml(item.enclosure.url)}"/>`);
  parts.push('</entry>');
  return parts.join('');
}

function atom({ title, subtitle, link, self, author, icon, generator, entries }) {
  const list = [...entries].sort((a, b) => Number(b.date || 0) - Number(a.date || 0)).slice(0, MAX_ENTRIES);
  const updated = list.length ? list[0].date : Date.now();
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `<id>${escapeHtml(link)}</id>`,
    `<title>${escapeHtml(title)}</title>`,
    subtitle ? `<subtitle>${escapeHtml(subtitle)}</subtitle>` : '',
    `<link rel="alternate" type="text/html" href="${escapeHtml(link)}"/>`,
    `<link rel="self" type="application/atom+xml" href="${escapeHtml(self)}"/>`,
    `<updated>${iso(updated)}</updated>`,
    author ? `<author><name>${escapeHtml(author)}</name></author>` : '',
    icon ? `<icon>${escapeHtml(icon)}</icon>` : '',
    generator ? `<generator>${escapeHtml(generator)}</generator>` : '',
    ...list.map(entryOf),
    '</feed>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

const MEDIA = new Set(['image', 'video', 'audio']);

function fileEntry(file, { t, absolute }) {
  const name = file.name || file.title || file.filename || t('Datei');
  const warned = file.warning !== null && file.warning !== undefined;
  const picture =
    !warned && !file.locked && file.preview && (file.type === 'image' || file.type === 'video') ? absolute(file.preview) : null;
  const html = [
    picture ? `<p><a href="${escapeHtml(absolute(file.view))}"><img src="${escapeHtml(picture)}" alt="${escapeHtml(name)}"/></a></p>` : '',
    warned ? `<p>${escapeHtml(file.warning ? t('Inhaltswarnung: {reason}', { reason: file.warning }) : t('Inhaltswarnung'))}</p>` : '',
    `<p><a href="${escapeHtml(absolute(file.view))}">${escapeHtml(t('Ansehen'))}</a></p>`,
  ].join('');
  return {
    id: absolute(file.view),
    title: name,
    link: absolute(file.view),
    date: file.createdAt,
    html,
    enclosure:
      !warned && !file.locked && file.direct && MEDIA.has(file.type)
        ? { url: absolute(file.direct), type: mime.lookup(file.direct.split('?')[0]) || `${file.type}/*` }
        : null,
  };
}

module.exports = { atom, fileEntry };
