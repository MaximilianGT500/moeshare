'use strict';

const LIMIT = 75;

const escape = (value) => String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

function fold(line) {
  if (Buffer.byteLength(line) <= LIMIT) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    const room = parts.length ? LIMIT - 1 : LIMIT;
    if (size + bytes > room) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function build({ name, nickname = '', note = '', urls = [], emails = [], phones = [], photo = null }) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escape(name)}`, `N:;${escape(name)};;;`];
  if (nickname) lines.push(`NICKNAME:${escape(nickname)}`);
  if (note) lines.push(`NOTE:${escape(note)}`);
  let item = 0;
  for (const { url, label } of urls) {
    item += 1;
    lines.push(`item${item}.URL:${url}`);
    if (label) lines.push(`item${item}.X-ABLabel:${escape(label)}`);
  }
  for (const email of emails) lines.push(`EMAIL;TYPE=INTERNET:${escape(email)}`);
  for (const phone of phones) lines.push(`TEL;TYPE=CELL:${escape(phone)}`);
  if (photo) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${photo.toString('base64')}`);
  lines.push('END:VCARD');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

module.exports = { build, escape, fold };
