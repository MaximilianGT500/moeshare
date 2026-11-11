import type { ReactNode } from 'react';

export type Align = 'left' | 'center' | 'right' | null;

export interface ListItem {
  task: boolean | null;
  children: Block[];
}

export type Block =
  | { type: 'heading'; level: number; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; loose: boolean; items: ListItem[] }
  | { type: 'table'; align: Align[]; head: string[]; rows: string[][] }
  | { type: 'hr' };

export interface LinkRef {
  href: string;
  title: string;
}

export interface Document {
  blocks: Block[];
  refs: Map<string, LinkRef>;
}

const MAX_DEPTH = 12;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ ]?(.*)$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const BLANK = /^[ \t]*$/;
const INDENTED = /^ {4}/;
const REF = /^ {0,3}\[([^\]]{1,200})\]:[ \t]*<?([^\s>]+)>?(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/;

interface Marker {
  ordered: boolean;
  bullet: string;
  start: number;
  indent: number;
  content: string;
}

function fenceOf(line: string) {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  const info = match[3].trim();
  if (match[2][0] === '`' && info.includes('`')) return null;
  return { indent: match[1].length, marker: match[2], lang: info.split(/\s+/)[0] || '' };
}

function listMarker(line: string): Marker | null {
  const bullet = /^( {0,3})([-*+])([ \t]+|$)(.*)$/.exec(line);
  if (bullet && !HR.test(line)) {
    const spaces = bullet[3].length;
    const gap = spaces === 0 || spaces > 4 ? 1 : spaces;
    return {
      ordered: false,
      bullet: bullet[2],
      start: 1,
      indent: bullet[1].length + 1 + gap,
      content: spaces > 4 ? bullet[3].slice(1) + bullet[4] : bullet[4],
    };
  }
  const ordered = /^( {0,3})(\d{1,9})([.)])([ \t]+|$)(.*)$/.exec(line);
  if (ordered) {
    const spaces = ordered[4].length;
    const gap = spaces === 0 || spaces > 4 ? 1 : spaces;
    return {
      ordered: true,
      bullet: ordered[3],
      start: Number(ordered[2]),
      indent: ordered[1].length + ordered[2].length + 1 + gap,
      content: spaces > 4 ? ordered[4].slice(1) + ordered[5] : ordered[5],
    };
  }
  return null;
}

const startsBlock = (line: string) => Boolean(ATX.test(line) || fenceOf(line) || HR.test(line) || QUOTE.test(line));

function delimiterRow(line: string): Align[] | null {
  let text = line.trim();
  if (!text.includes('-')) return null;
  const piped = text.includes('|');
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  const cells = text.split('|').map((cell) => cell.trim());
  if (!cells.every((cell) => /^:?-+:?$/.test(cell))) return null;
  if (!piped && cells.length < 2) return null;
  return cells.map((cell) => {
    if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
    if (cell.endsWith(':')) return 'right';
    if (cell.startsWith(':')) return 'left';
    return null;
  });
}

function splitRow(line: string) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (text[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += text[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

const leadingSpaces = (line: string) => line.length - line.replace(/^ +/, '').length;

function stripIndent(line: string, amount: number) {
  let index = 0;
  while (index < amount && line[index] === ' ') index += 1;
  return line.slice(index);
}

function parseList(lines: string[], start: number, depth: number): { block: Block; next: number } {
  const first = listMarker(lines[start]) as Marker;
  const items: ListItem[] = [];
  let loose = false;
  let i = start;
  while (i < lines.length) {
    const marker = listMarker(lines[i]);
    if (!marker || marker.ordered !== first.ordered || marker.bullet !== first.bullet) break;
    const body = [marker.content];
    i += 1;
    let blank = false;
    while (i < lines.length) {
      const current = lines[i];
      if (BLANK.test(current)) {
        body.push('');
        blank = true;
        i += 1;
        continue;
      }
      if (leadingSpaces(current) >= marker.indent) {
        if (blank && body.some((line) => line.trim())) loose = true;
        body.push(current.slice(marker.indent));
        blank = false;
        i += 1;
        continue;
      }
      if (blank || listMarker(current) || startsBlock(current)) break;
      body.push(current.trimStart());
      i += 1;
    }
    let trailing = 0;
    while (body.length > 1 && body[body.length - 1] === '') {
      body.pop();
      trailing += 1;
    }
    if (trailing && i < lines.length && listMarker(lines[i])) loose = true;
    let task: boolean | null = null;
    const check = /^\[([ xX])\](?:[ \t]+|$)/.exec(body[0]);
    if (check) {
      task = check[1] !== ' ';
      body[0] = body[0].slice(check[0].length);
    }
    items.push({ task, children: depth < MAX_DEPTH ? parseBlocks(body, depth + 1) : [{ type: 'paragraph', text: body.join('\n') }] });
  }
  return { block: { type: 'list', ordered: first.ordered, start: first.start, loose, items }, next: i };
}

function parseBlocks(lines: string[], depth = 0): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BLANK.test(line)) {
      flush();
      i += 1;
      continue;
    }
    const fence = fenceOf(line);
    if (fence) {
      flush();
      const body: string[] = [];
      const closing = new RegExp(`^ {0,3}${fence.marker[0] === '`' ? '`' : '~'}{${fence.marker.length},}[ \\t]*$`);
      i += 1;
      while (i < lines.length && !closing.test(lines[i])) {
        body.push(stripIndent(lines[i], fence.indent));
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', lang: fence.lang, text: body.join('\n') });
      continue;
    }
    if (!paragraph.length && INDENTED.test(line)) {
      const body: string[] = [];
      while (i < lines.length && (INDENTED.test(lines[i]) || BLANK.test(lines[i]))) {
        body.push(lines[i].replace(INDENTED, ''));
        i += 1;
      }
      while (body.length && BLANK.test(body[body.length - 1])) body.pop();
      blocks.push({ type: 'code', lang: '', text: body.join('\n') });
      continue;
    }
    const atx = ATX.exec(line);
    if (atx) {
      flush();
      blocks.push({ type: 'heading', level: atx[1].length, text: (atx[2] || '').trim(), id: '' });
      i += 1;
      continue;
    }
    if (paragraph.length && SETEXT.test(line)) {
      blocks.push({ type: 'heading', level: line.trim()[0] === '=' ? 1 : 2, text: paragraph.join('\n').trim(), id: '' });
      paragraph = [];
      i += 1;
      continue;
    }
    if (HR.test(line)) {
      flush();
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length) {
      const align = delimiterRow(lines[i + 1]);
      const head = splitRow(line);
      if (align && align.length === head.length) {
        flush();
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && !BLANK.test(lines[i]) && lines[i].includes('|') && !startsBlock(lines[i])) {
          const cells = splitRow(lines[i]);
          rows.push(head.map((_, index) => cells[index] ?? ''));
          i += 1;
        }
        blocks.push({ type: 'table', align, head, rows });
        continue;
      }
    }
    if (QUOTE.test(line)) {
      flush();
      const inner: string[] = [];
      while (i < lines.length) {
        const quoted = QUOTE.exec(lines[i]);
        if (quoted) {
          inner.push(quoted[1]);
          i += 1;
          continue;
        }
        const last = inner[inner.length - 1];
        if (!BLANK.test(lines[i]) && last !== undefined && !BLANK.test(last) && !startsBlock(lines[i]) && !listMarker(lines[i])) {
          inner.push(lines[i]);
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({
        type: 'quote',
        children: depth < MAX_DEPTH ? parseBlocks(inner, depth + 1) : [{ type: 'paragraph', text: inner.join('\n') }],
      });
      continue;
    }
    const marker = listMarker(line);
    if (marker && (!paragraph.length || (marker.content.trim() && (!marker.ordered || marker.start === 1)))) {
      flush();
      const { block, next } = parseList(lines, i, depth);
      blocks.push(block);
      i = next;
      continue;
    }
    paragraph.push(line.replace(/^[ \t]+/, ''));
    i += 1;
  }
  flush();
  return blocks;
}

export const plainText = (text: string) =>
  text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~[\]]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();

function slugOf(text: string) {
  return (
    plainText(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'abschnitt'
  );
}

function assignIds(blocks: Block[], used: Map<string, number>) {
  for (const block of blocks) {
    if (block.type === 'heading') {
      const base = slugOf(block.text);
      const count = used.get(base) || 0;
      used.set(base, count + 1);
      block.id = count ? `${base}-${count}` : base;
    } else if (block.type === 'quote') {
      assignIds(block.children, used);
    } else if (block.type === 'list') {
      for (const item of block.items) assignIds(item.children, used);
    }
  }
}

export const normalizeLabel = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();

export function parseMarkdown(source: string): Document {
  const refs = new Map<string, LinkRef>();
  const lines: string[] = [];
  let fence: string | null = null;
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\t/g, '    ');
    const opened = fenceOf(line);
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`).test(line)) fence = null;
      lines.push(line);
      continue;
    }
    if (opened) {
      fence = opened.marker;
      lines.push(line);
      continue;
    }
    const ref = REF.exec(line);
    const previous = lines[lines.length - 1];
    if (ref && (previous === undefined || BLANK.test(previous) || REF.test(previous))) {
      const key = normalizeLabel(ref[1]);
      if (!refs.has(key)) refs.set(key, { href: ref[2], title: ref[3] ?? ref[4] ?? ref[5] ?? '' });
      continue;
    }
    lines.push(line);
  }
  const blocks = parseBlocks(lines);
  assignIds(blocks, new Map());
  return { blocks, refs };
}

export const ANCHOR_PREFIX = 'md-';

export function safeHref(href: string): string | null {
  const value = href.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (!value) return null;
  if (value.startsWith('#')) return `#${ANCHOR_PREFIX}${value.slice(1)}`;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!scheme) return value;
  return ['http', 'https', 'mailto'].includes(scheme[1].toLowerCase()) ? value : null;
}

export function sameOrigin(href: string) {
  try {
    return new URL(href, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export interface InlineRenderers {
  text: (value: string, key: number) => ReactNode;
  code: (value: string, key: number) => ReactNode;
  strong: (children: ReactNode[], key: number) => ReactNode;
  em: (children: ReactNode[], key: number) => ReactNode;
  del: (children: ReactNode[], key: number) => ReactNode;
  br: (key: number) => ReactNode;
  link: (href: string | null, children: ReactNode[], title: string, key: number) => ReactNode;
  image: (src: string | null, alt: string, title: string, key: number) => ReactNode;
}

interface Context {
  refs: Map<string, LinkRef>;
  render: InlineRenderers;
  links: boolean;
  depth: number;
  key: { value: number };
}

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD = /[\p{L}\p{N}]/u;
const BRACKET_LIMIT = 1000;

interface Misses {
  ticks: Map<number, number>;
  marks: Map<string, number>;
}

const newMisses = (): Misses => ({ ticks: new Map(), marks: new Map() });

function closingBackticks(text: string, from: number, length: number, misses: Misses) {
  const missed = misses.ticks.get(length);
  if (missed !== undefined && from >= missed) return -1;
  for (let i = from; i < text.length; i++) {
    if (text[i] !== '`') continue;
    let run = 0;
    while (text[i + run] === '`') run += 1;
    if (run === length) return i;
    i += run - 1;
  }
  misses.ticks.set(length, missed === undefined ? from : Math.min(missed, from));
  return -1;
}

function closingBracket(text: string, open: number, misses: Misses) {
  let depth = 0;
  for (let i = open; i < text.length && i < open + BRACKET_LIMIT; i++) {
    const char = text[i];
    if (char === '\\') {
      i += 1;
    } else if (char === '`') {
      let run = 0;
      while (text[i + run] === '`') run += 1;
      const close = closingBackticks(text, i + run, run, misses);
      if (close >= 0) i = close + run - 1;
      else i += run - 1;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function destination(text: string, from: number) {
  let i = from;
  while (text[i] === ' ' || text[i] === '\n') i += 1;
  let href = '';
  if (text[i] === '<') {
    const close = text.indexOf('>', i);
    if (close < 0 || text.slice(i, close).includes('\n')) return null;
    href = text.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    const begin = i;
    while (i < text.length && !/\s/.test(text[i])) {
      if (text[i] === '\\') i += 1;
      else if (text[i] === '(') depth += 1;
      else if (text[i] === ')') {
        if (depth === 0) break;
        depth -= 1;
      }
      i += 1;
    }
    href = text.slice(begin, i);
  }
  while (text[i] === ' ' || text[i] === '\n') i += 1;
  let title = '';
  const quote = text[i];
  if (quote === '"' || quote === "'" || quote === '(') {
    const closer = quote === '(' ? ')' : quote;
    const close = text.indexOf(closer, i + 1);
    if (close < 0) return null;
    title = text.slice(i + 1, close);
    i = close + 1;
    while (text[i] === ' ' || text[i] === '\n') i += 1;
  }
  if (text[i] !== ')') return null;
  return { href: href.replace(/\\([!-/:-@[-`{-~])/g, '$1'), title, end: i + 1 };
}

function parseLink(text: string, open: number, refs: Map<string, LinkRef>, misses: Misses) {
  const close = closingBracket(text, open, misses);
  if (close < 0) return null;
  const label = text.slice(open + 1, close);
  if (text[close + 1] === '(') {
    const target = destination(text, close + 2);
    if (target) return { label, href: target.href, title: target.title, end: target.end };
  }
  if (text[close + 1] === '[') {
    const end = text.indexOf(']', close + 2);
    if (end > 0) {
      const name = text.slice(close + 2, end) || label;
      const ref = refs.get(normalizeLabel(name));
      if (ref) return { label, href: ref.href, title: ref.title, end: end + 1 };
    }
  }
  const ref = refs.get(normalizeLabel(label));
  if (ref) return { label, href: ref.href, title: ref.title, end: close + 1 };
  return null;
}

function emphasisCloser(text: string, from: number, char: string, size: number, misses: Misses) {
  const mark = `${char}${size}`;
  const missed = misses.marks.get(mark);
  if (missed !== undefined && from >= missed) return -1;
  for (let i = from; i < text.length; i++) {
    const current = text[i];
    if (current === '\\') {
      i += 1;
      continue;
    }
    if (current === '`') {
      let run = 0;
      while (text[i + run] === '`') run += 1;
      const close = closingBackticks(text, i + run, run, misses);
      i = close >= 0 ? close + run - 1 : i + run - 1;
      continue;
    }
    if (current !== char) continue;
    let run = 0;
    while (text[i + run] === char) run += 1;
    const before = text[i - 1] || ' ';
    const after = text[i + run] || ' ';
    const flanking = !/\s/.test(before) && (char !== '_' || !WORD.test(after));
    if (flanking && run >= size && (size !== 1 || run === 1 || run >= 3)) return i + (run - size);
    i += run - 1;
  }
  misses.marks.set(mark, missed === undefined ? from : Math.min(missed, from));
  return -1;
}

function trimUrl(url: string) {
  let result = url.replace(/[.,:;!?"'*_~]+$/, '');
  while (result.endsWith(')') && (result.match(/\(/g) || []).length < (result.match(/\)/g) || []).length) result = result.slice(0, -1);
  return result;
}

function inline(text: string, context: Context): ReactNode[] {
  const out: ReactNode[] = [];
  const { render } = context;
  let buffer = '';
  const key = () => (context.key.value += 1);
  const flush = () => {
    if (buffer) out.push(render.text(buffer, key()));
    buffer = '';
  };
  const push = (node: ReactNode) => {
    flush();
    out.push(node);
  };
  const nested = (value: string, links = context.links) =>
    context.depth > 24 ? [render.text(value, key())] : inline(value, { ...context, links, depth: context.depth + 1 });
  const misses = newMisses();

  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '\\' && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === '\n') {
        push(render.br(key()));
        i += 2;
        continue;
      }
      if (PUNCTUATION.test(next)) {
        buffer += next;
        i += 2;
        continue;
      }
    }
    if (char === '\n') {
      let end = buffer.length;
      while (end > 0 && buffer.charCodeAt(end - 1) === 32) end -= 1;
      const hard = buffer.length - end >= 2;
      buffer = buffer.slice(0, end);
      if (hard) push(render.br(key()));
      else buffer += '\n';
      i += 1;
      while (text[i] === ' ') i += 1;
      continue;
    }
    if (char === '`') {
      let run = 0;
      while (text[i + run] === '`') run += 1;
      const close = closingBackticks(text, i + run, run, misses);
      if (close >= 0) {
        let code = text.slice(i + run, close).replace(/\n/g, ' ');
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        push(render.code(code, key()));
        i = close + run;
        continue;
      }
      buffer += '`'.repeat(run);
      i += run;
      continue;
    }
    if (char === '<') {
      const rest = text.slice(i, i + 2048);
      const auto = /^<((?:https?|mailto):[^\s<>]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)>/i.exec(rest);
      if (auto && context.links) {
        const href = auto[1].includes(':') ? auto[1] : `mailto:${auto[1]}`;
        push(render.link(safeHref(href), [render.text(auto[1], key())], '', key()));
        i += auto[0].length;
        continue;
      }
      const br = /^<br\s*\/?>/i.exec(rest);
      if (br) {
        push(render.br(key()));
        i += br[0].length;
        continue;
      }
    }
    if (char === '!' && text[i + 1] === '[') {
      const parsed = parseLink(text, i + 1, context.refs, misses);
      if (parsed) {
        push(render.image(safeHref(parsed.href), plainText(parsed.label), parsed.title, key()));
        i = parsed.end;
        continue;
      }
    }
    if (char === '[' && context.links) {
      const parsed = parseLink(text, i, context.refs, misses);
      if (parsed) {
        push(render.link(safeHref(parsed.href), nested(parsed.label, false), parsed.title, key()));
        i = parsed.end;
        continue;
      }
    }
    if (char === '~' && text[i + 1] === '~' && text[i + 2] !== '~' && !/\s/.test(text[i + 2] || ' ')) {
      const close = text.indexOf('~~', i + 2);
      if (close > i + 2 && !/\s/.test(text[close - 1])) {
        push(render.del(nested(text.slice(i + 2, close)), key()));
        i = close + 2;
        continue;
      }
    }
    if (char === '*' || char === '_') {
      let run = 0;
      while (text[i + run] === char) run += 1;
      const before = text[i - 1] || ' ';
      const after = text[i + run] || ' ';
      const opens = !/\s/.test(after) && (char !== '_' || !WORD.test(before));
      if (opens) {
        const size = Math.min(run, 3);
        const close = emphasisCloser(text, i + size, char, size, misses);
        if (close > i + size) {
          const inner = nested(text.slice(i + size, close));
          const node =
            size === 3
              ? render.strong([render.em(inner, key())], key())
              : size === 2
                ? render.strong(inner, key())
                : render.em(inner, key());
          if (run > size) buffer += char.repeat(run - size);
          push(node);
          i = close + size;
          continue;
        }
      }
      buffer += char.repeat(run);
      i += run;
      continue;
    }
    if ((char === 'h' || char === 'H' || char === 'w' || char === 'W') && context.links && (i === 0 || /[\s(]/.test(text[i - 1]))) {
      const match = /^(?:https?:\/\/|www\.)[^\s<]+/i.exec(text.slice(i, i + 2048));
      if (match) {
        const url = trimUrl(match[0]);
        if (url.length > 4) {
          push(render.link(safeHref(/^www\./i.test(url) ? `https://${url}` : url), [render.text(url, key())], '', key()));
          i += url.length;
          continue;
        }
      }
    }
    buffer += char;
    i += 1;
  }
  flush();
  return out;
}

export function renderInline(text: string, refs: Map<string, LinkRef>, render: InlineRenderers, key: { value: number }) {
  return inline(text, { refs, render, links: true, depth: 0, key });
}
