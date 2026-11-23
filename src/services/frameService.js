'use strict';

const { escapeHtml, formatBytes } = require('../lib/format');
const path = require('path');
const { isSealedName } = require('../lib/sealed');
const { baseNameOf, filePaths } = require('../lib/storage');
const i18n = require('../lib/i18n');
const files = require('./fileService');
const settings = require('./settingsService');
const storage = require('./storageService');

const THEMES = ['auto', 'light', 'dark'];

const enabled = () => Boolean(settings.get('frames.enabled'));

const themeOf = (value) => (THEMES.includes(value) ? value : 'auto');

const POLICY = [
  "default-src 'none'",
  "img-src 'self' data: https:",
  "media-src 'self' blob: https:",
  "style-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
  'frame-ancestors *',
].join('; ');

const PALETTE = {
  light: '--bg:#fdf8fd;--card:#f3edf7;--fg:#1d1b20;--muted:#625b71;--line:rgba(29,27,32,.12);--accent:#6750a4',
  dark: '--bg:#141218;--card:#211f26;--fg:#e6e0e9;--muted:#cac4d0;--line:rgba(230,224,233,.14);--accent:#d0bcff',
};

function colors(theme) {
  if (theme === 'light') return `:root{color-scheme:light;${PALETTE.light}}`;
  if (theme === 'dark') return `:root{color-scheme:dark;${PALETTE.dark}}`;
  return `:root{color-scheme:light dark;${PALETTE.light}}@media (prefers-color-scheme:dark){:root{${PALETTE.dark}}}`;
}

const STYLE = `html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
*{box-sizing:border-box}a{color:inherit}
.frame{display:flex;flex-direction:column;height:100%;overflow:hidden}
.media{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#0b0a0d}
.media img,.media video{max-width:100%;max-height:100%;object-fit:contain;display:block}
.sound{flex:1;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:16px;background:var(--card)}
.sound strong{font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sound audio{width:100%}
.card{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;text-align:center;background:var(--card)}
.card svg{width:44px;height:44px;fill:var(--accent)}
.card strong{font-size:16px;max-width:100%;overflow-wrap:anywhere}
.card span{color:var(--muted)}
.card a.open{margin-top:6px;padding:8px 18px;border-radius:999px;background:var(--accent);color:var(--bg);font-weight:600;text-decoration:none}
.bar{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--line);background:var(--bg)}
.bar a{flex:1;min-width:0;font-weight:600;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar a:hover{text-decoration:underline}
.bar span{color:var(--muted);flex-shrink:0;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--tile,120px),1fr));gap:4px;padding:4px;align-content:start}
.grid a{position:relative;display:block;aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--card)}
.grid img{width:100%;height:100%;object-fit:cover;display:block}
.grid .hidden{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:8px;color:var(--muted);font-size:12px;text-align:center}
.grid .play{position:absolute;inset:auto 6px 6px auto;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.6)}
.grid .play::after{content:"";position:absolute;left:8px;top:6px;border-style:solid;border-width:5px 0 5px 8px;border-color:transparent transparent transparent #fff}
.profile{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:10px;padding:20px 16px;text-align:center;background:var(--card)}
.profile .avatar{width:72px;height:72px;border-radius:50%;object-fit:cover;display:block;background:var(--line)}
.profile .initial{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;background:var(--accent);color:var(--bg)}
.profile h1{margin:0;font-size:18px;line-height:1.25;overflow-wrap:anywhere}
.profile .handle{color:var(--muted);margin-top:-6px}
.profile p{margin:0;color:var(--fg);max-width:44ch;white-space:pre-line;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.profile ul{list-style:none;margin:4px 0 0;padding:0;width:100%;max-width:360px;display:grid;gap:8px}
.profile li a{display:flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--bg);font-weight:600;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.profile li a:hover{border-color:var(--accent)}
.profile li img{width:18px;height:18px;border-radius:4px;flex-shrink:0}
.profile .more{color:var(--muted);font-size:13px}`;

const ICONS = {
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Zm-5 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm2-9h-4V6a2 2 0 0 1 4 0Z"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm-1 7V3.5L18.5 9Z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C6.5 5 2.7 8.6 1.5 12c1.2 3.4 5 7 10.5 7s9.3-3.6 10.5-7C21.3 8.6 17.5 5 12 5Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 10.6 3.3 3.3-1.4 1.4-3.9-3.9V6h2Z"/></svg>',
};

function page({ title, body, theme, language }) {
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>${colors(theme)}${STYLE}</style></head>
<body><div class="frame">${body}</div></body></html>`;
}

function bar(href, label, site) {
  return `<div class="bar"><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a><span>${escapeHtml(site)}</span></div>`;
}

function card({ icon, heading, note, href, action }) {
  return `<div class="card">${ICONS[icon]}<strong>${escapeHtml(heading)}</strong>${note ? `<span>${escapeHtml(note)}</span>` : ''}<a class="open" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(action)}</a></div>`;
}

function fileFrame(record, { access, theme = 'auto', locale = 'de', domain = null } = {}) {
  const language = locale === 'en' ? 'en' : 'de';
  const t = (text, values) => i18n.translate(language, text, values);
  const site = settings.get('site.title');
  const urls = files.urlsFor(record, { domain });
  const sealed = isSealedName(record.filename);
  const label = sealed ? t('Verschlüsselte Datei') : record.title || record.original_name || record.filename;
  const { type, isGif } = files.typeOf(record.filename, record.syntax);
  const open = t('Auf {site} ansehen', { site });
  let body;
  if (access.state === 'scheduled') {
    const locale = language === 'en' ? 'en-GB' : 'de-DE';
    const at = new Date(access.at);
    body = card({
      icon: 'clock',
      heading: t('Noch nicht veröffentlicht'),
      note: t('Erscheint am {date} um {time} Uhr.', {
        date: new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Berlin', dateStyle: 'long' }).format(at),
        time: new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Berlin', timeStyle: 'short' }).format(at),
      }),
      href: urls.view,
      action: open,
    });
  } else if (access.state !== 'open') {
    body = card({
      icon: 'lock',
      heading: t('Geschützte Datei'),
      note: t('Öffne sie auf der Ansichtsseite.'),
      href: urls.view,
      action: open,
    });
  } else if (sealed) {
    body = card({ icon: 'lock', heading: label, note: t('Ende-zu-Ende verschlüsselt'), href: urls.view, action: open });
  } else if (typeof record.warning === 'string') {
    body = card({ icon: 'eye', heading: t('Inhaltswarnung'), note: record.warning || null, href: urls.view, action: open });
  } else {
    const local = `/uploads/${record.username}/${record.filename}`;
    const alt = record.alt_text || label;
    if (type === 'image') {
      const display = !isGif && storage.hasVariant(record, 'preview') ? `/uploads/${record.username}/preview/${record.filename}` : local;
      body = `<a class="media" href="${escapeHtml(urls.view)}" target="_blank" rel="noopener"><img src="${escapeHtml(display)}" alt="${escapeHtml(alt)}"></a>`;
    } else if (type === 'video') {
      const source = storage.hasVariant(record, 'web')
        ? `/uploads/${record.username}/web/${path.basename(filePaths(record.username, record.filename).web)}`
        : local;
      const poster = storage.hasVariant(record, 'poster')
        ? ` poster="${escapeHtml(`/uploads/${record.username}/preview/${baseNameOf(record.filename)}.jpg`)}"`
        : '';
      body = `<div class="media"><video controls playsinline preload="metadata"${poster} src="${escapeHtml(source)}" aria-label="${escapeHtml(alt)}"></video></div>`;
    } else if (type === 'audio') {
      body = `<div class="sound"><strong>${escapeHtml(label)}</strong><audio controls preload="metadata" src="${escapeHtml(local)}"></audio></div>`;
    } else {
      body = card({ icon: 'file', heading: label, note: formatBytes(Number(record.size_bytes) || 0), href: urls.view, action: open });
    }
  }
  const shown = access.state === 'open' ? label : access.state === 'scheduled' ? t('Noch nicht veröffentlicht') : t('Geschützte Datei');
  return page({ title: shown, theme, language, body: `${body}${bar(urls.view, shown, site)}` });
}

function albumFrame(view, { access, theme = 'auto', locale = 'de', size = 120 } = {}) {
  const language = locale === 'en' ? 'en' : 'de';
  const t = (text, values) => i18n.translate(language, text, values);
  const site = settings.get('site.title');
  const { album, items } = view;
  const open = t('Auf {site} ansehen', { site });
  if (access.state !== 'open') {
    const body = card({
      icon: 'lock',
      heading: t('Geschütztes Album'),
      note: t('Öffne es auf der Albumseite.'),
      href: album.url,
      action: open,
    });
    return page({ title: album.title, theme, language, body: `${body}${bar(album.url, album.title, site)}` });
  }
  const tiles = items
    .slice(0, 60)
    .map((item) => {
      if (item.locked || typeof item.warning === 'string' || !item.preview) {
        const note = item.locked
          ? t('Geschützt')
          : typeof item.warning === 'string'
            ? t('Inhaltswarnung')
            : item.name || item.filename || '';
        return `<a href="${escapeHtml(item.view)}" target="_blank" rel="noopener"><span class="hidden">${escapeHtml(note)}</span></a>`;
      }
      const play = item.type === 'video' ? '<span class="play"></span>' : '';
      return `<a href="${escapeHtml(item.view)}" target="_blank" rel="noopener" title="${escapeHtml(item.name || '')}"><img src="${escapeHtml(item.preview)}" alt="${escapeHtml(item.alt || item.name || '')}" loading="lazy">${play}</a>`;
    })
    .join('');
  const count = t(items.length === 1 ? '1 Datei' : '{count} Dateien', { count: items.length });
  const body = `<div class="grid" style="--tile:${Math.min(240, Math.max(80, Number(size) || 120))}px">${tiles}</div><div class="bar"><a href="${escapeHtml(album.url)}" target="_blank" rel="noopener">${escapeHtml(album.title)}</a><span>${escapeHtml(count)}</span></div>`;
  return page({ title: album.title, theme, language, body });
}

const MAX_PROFILE_LINKS = 6;

function profileFrame(data, { theme = 'auto', locale = 'de' } = {}) {
  const language = locale === 'en' ? 'en' : 'de';
  const t = (text, values) => i18n.translate(language, text, values);
  const site = settings.get('site.title');
  const { profile } = data;
  const links = profile.links.filter((link) => link.type === 'link');
  const shown = links.slice(0, MAX_PROFILE_LINKS);
  const avatar = profile.avatar
    ? `<img class="avatar" src="${escapeHtml(profile.avatar)}" alt="">`
    : `<span class="initial" aria-hidden="true">${escapeHtml((profile.name || profile.username).slice(0, 1).toUpperCase())}</span>`;
  const icon = (link) => {
    if (link.iconUrl) return `<img src="${escapeHtml(link.iconUrl)}" alt="">`;
    if (typeof link.icon === 'string' && link.icon.startsWith('e:'))
      return `<span aria-hidden="true">${escapeHtml(link.icon.slice(2))}</span>`;
    return '';
  };
  const items = shown
    .map(
      (link) =>
        `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener nofollow">${icon(link)}<span>${escapeHtml(link.label)}</span></a></li>`
    )
    .join('');
  const more =
    links.length > shown.length
      ? `<span class="more">${escapeHtml(t('und {count} weitere Links', { count: links.length - shown.length }))}</span>`
      : '';
  const body = `<div class="profile">${avatar}<h1>${escapeHtml(profile.name || profile.username)}</h1><span class="handle">@${escapeHtml(profile.username)}</span>${
    profile.bio ? `<p>${escapeHtml(profile.bio)}</p>` : ''
  }${items ? `<ul>${items}</ul>` : ''}${more}</div>${bar(profile.url, t('Profil öffnen'), site)}`;
  return page({ title: profile.name || profile.username, theme, language, body });
}

function missingFrame({ theme = 'auto', locale = 'de' } = {}) {
  const language = locale === 'en' ? 'en' : 'de';
  const t = (text, values) => i18n.translate(language, text, values);
  const site = settings.get('site.title');
  const home = `${settings.get('site.baseUrl')}/`;
  const body = card({
    icon: 'file',
    heading: t('Nicht mehr verfügbar'),
    note: t('Die Datei wurde gelöscht oder ist abgelaufen.'),
    href: home,
    action: site,
  });
  return page({ title: t('Nicht mehr verfügbar'), theme, language, body });
}

module.exports = { enabled, themeOf, POLICY, fileFrame, albumFrame, profileFrame, missingFrame };
