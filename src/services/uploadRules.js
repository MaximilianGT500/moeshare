'use strict';

const fsp = require('fs').promises;
const { HttpError } = require('../lib/errors');
const { extensionOf } = require('../lib/storage');
const settings = require('./settingsService');
const sealed = require('../lib/sealed');

const RECOMMENDED = [
  '.exe',
  '.msi',
  '.msix',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.pif',
  '.cpl',
  '.vbs',
  '.vbe',
  '.jse',
  '.wsf',
  '.wsh',
  '.ps1',
  '.hta',
  '.lnk',
  '.reg',
  '.dll',
  '.jar',
  '.apk',
];

const MAGIC = [
  [0x4d, 0x5a],
  [0x7f, 0x45, 0x4c, 0x46],
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xca, 0xfe, 0xba, 0xbe],
].map((bytes) => Buffer.from(bytes));

const exempt = (user, via) => via !== 'request' && Boolean(user && (user.isAdmin || user.role === 'admin'));

const blocked = (name) => {
  const ext = extensionOf(name || '');
  return ext && settings.get('uploads.blockedTypes').includes(ext) ? ext : null;
};

const refuse = (message, values) => new HttpError(415, message, { code: 'blocked_type', extra: values });

function assertSealedAllowed(names) {
  if (!settings.get('uploads.encrypted') && names.some((name) => sealed.isSealedName(name))) {
    throw refuse('Ende-zu-Ende-verschlüsselte Dateien sind auf diesem Server abgeschaltet.', { extension: '.mse' });
  }
}

function assertName(user, name, { via = 'upload' } = {}) {
  assertSealedAllowed([name]);
  if (exempt(user, via)) return;
  const ext = blocked(name);
  if (ext) throw refuse(`Dateien vom Typ ${ext} sind auf diesem Server nicht erlaubt.`, { extension: ext });
}

async function isProgram(file) {
  const handle = await fsp.open(file, 'r');
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await handle.read(head, 0, 4, 0);
    return MAGIC.some((magic) => bytesRead >= magic.length && head.subarray(0, magic.length).equals(magic));
  } finally {
    await handle.close();
  }
}

async function assertFile(user, file, names, { via = 'upload' } = {}) {
  assertSealedAllowed(names.filter(Boolean));
  if (names.some((name) => sealed.isSealedName(name)) && !(await sealed.inspect(file))) {
    throw new HttpError(400, 'Die verschlüsselte Datei ist beschädigt. Lade sie noch einmal hoch.', { code: 'sealed_invalid' });
  }
  if (exempt(user, via)) return;
  for (const name of names) if (name) assertName(user, name, { via });
  if (settings.get('uploads.blockPrograms') && (await isProgram(file))) {
    throw refuse('Programme dürfen auf diesem Server nicht hochgeladen werden.', { extension: null });
  }
}

const rulesFor = (user) =>
  exempt(user, 'upload')
    ? { blocked: [], programs: false }
    : { blocked: settings.get('uploads.blockedTypes'), programs: settings.get('uploads.blockPrograms') };

module.exports = { RECOMMENDED, assertName, assertFile, isProgram, rulesFor };
