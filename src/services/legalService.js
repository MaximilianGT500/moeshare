'use strict';

const { badRequest } = require('../lib/errors');
const settings = require('./settingsService');

const MODES = ['template', 'text', 'url'];
const LIMITS = { imprint: 20000, privacy: 100000 };

const IMPRINT_FIELDS = {
  name: { max: 160, required: true, label: 'Name oder Firma' },
  representative: { max: 200 },
  street: { max: 160, required: true, label: 'Straße und Hausnummer' },
  postcode: { max: 16, required: true, label: 'Postleitzahl' },
  city: { max: 100, required: true, label: 'Ort' },
  country: { max: 80, required: true, label: 'Land' },
  email: { max: 191, required: true, email: true, label: 'E-Mail-Adresse' },
  phone: { max: 40 },
  register: { max: 200 },
  vatId: { max: 40 },
  responsible: { max: 400, multiline: true },
  extra: { max: 2000, multiline: true },
};

const PRIVACY_FIELDS = {
  controller: { max: 600, multiline: true },
  email: { max: 191, email: true },
  dpo: { max: 300, multiline: true },
  authority: { max: 300, multiline: true },
  extra: { max: 4000, multiline: true },
};

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

function cleanText(value, { max, multiline }) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const text = multiline
    ? value
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : value.replace(/\s+/g, ' ').trim();
  return text.length > max ? null : text;
}

function cleanFields(input, fields, prefix) {
  const source = input && typeof input === 'object' ? input : {};
  const data = {};
  for (const [key, rule] of Object.entries(fields)) {
    const value = cleanText(source[key], rule);
    if (value === null) throw badRequest('Dieser Text ist zu lang.', { field: `${prefix}.${key}` });
    if (value && rule.email && !EMAIL.test(value))
      throw badRequest('Bitte eine gültige E-Mail-Adresse eingeben.', { field: `${prefix}.${key}` });
    if (value) data[key] = value;
  }
  return data;
}

function cleanUrl(value, field) {
  if (typeof value !== 'string' || !value.trim()) return '';
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw badRequest('Das ist keine gültige Adresse.', { field });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw badRequest('Nur http- und https-Adressen sind erlaubt.', { field });
  if (url.username || url.password) throw badRequest('Die Adresse darf keine Zugangsdaten enthalten.', { field });
  return url.toString();
}

function cleanPart(kind, input) {
  const source = input && typeof input === 'object' ? input : {};
  const mode = MODES.includes(source.mode) ? source.mode : 'template';
  const fields = kind === 'imprint' ? IMPRINT_FIELDS : PRIVACY_FIELDS;
  const part = { mode };
  const data = cleanFields(source.data, fields, `${kind}.data`);
  if (Object.keys(data).length) part.data = data;
  const text = cleanText(source.text, { max: LIMITS[kind], multiline: true });
  if (text === null) throw badRequest('Der Text ist zu lang.', { field: `${kind}.text` });
  if (text) part.text = text;
  const url = cleanUrl(source.url, `${kind}.url`);
  if (url) part.url = url;
  return part;
}

function normalize(input) {
  const source = input && typeof input === 'object' ? input : {};
  return { imprint: cleanPart('imprint', source.imprint), privacy: cleanPart('privacy', source.privacy) };
}

function parse(raw) {
  if (!raw) return null;
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && typeof value === 'object' ? normalize(value) : null;
  } catch {
    return null;
  }
}

function missingImprint(part) {
  if (!part) return ['mode'];
  if (part.mode === 'url') return part.url ? [] : ['url'];
  if (part.mode === 'text') return part.text && part.text.length >= 40 ? [] : ['text'];
  const data = part.data || {};
  return Object.entries(IMPRINT_FIELDS)
    .filter(([key, rule]) => rule.required && !data[key])
    .map(([key]) => `data.${key}`);
}

function controllerOf(legal) {
  const privacy = (legal && legal.privacy && legal.privacy.data) || {};
  const imprint = legal && legal.imprint && legal.imprint.mode === 'template' ? legal.imprint.data || {} : null;
  if (privacy.controller) return { lines: privacy.controller.split('\n'), email: privacy.email || (imprint && imprint.email) || '' };
  if (imprint && !missingImprint(legal.imprint).length) {
    return {
      lines: [imprint.name, imprint.street, `${imprint.postcode} ${imprint.city}`, imprint.country].filter(Boolean),
      email: privacy.email || imprint.email,
    };
  }
  return null;
}

function missingPrivacy(legal) {
  const part = legal && legal.privacy;
  if (!part) return ['mode'];
  if (part.mode === 'url') return part.url ? [] : ['url'];
  if (part.mode === 'text') return part.text && part.text.length >= 80 ? [] : ['text'];
  const controller = controllerOf(legal);
  if (!controller) return ['data.controller'];
  return controller.email ? [] : ['data.email'];
}

function status(legal) {
  const imprint = missingImprint(legal && legal.imprint);
  const privacy = missingPrivacy(legal);
  return { complete: !imprint.length && !privacy.length, imprint, privacy };
}

const complete = (legal) => status(legal).complete;

const block = (heading, ...lines) =>
  [`## ${heading}`, ...lines.filter((line) => line !== null && line !== undefined && line !== '')].join('\n');

const IMPRINT_TEXT = {
  de: {
    title: 'Angaben gemäß § 5 DDG',
    representative: 'Vertreten durch: {value}',
    contact: 'Kontakt',
    email: 'E-Mail: {value}',
    phone: 'Telefon: {value}',
    register: 'Registereintrag',
    vat: 'Umsatzsteuer-ID',
    vatLine: 'Umsatzsteuer-Identifikationsnummer nach § 27a Umsatzsteuergesetz: {value}',
    responsible: 'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV',
    hosting: 'Technischer Betrieb',
    hostingLine:
      'Diese Domain wird technisch über {site} ({url}) bereitgestellt. Für die Inhalte unter dieser Domain ist der oben genannte Anbieter verantwortlich.',
  },
  en: {
    title: 'Information according to § 5 DDG (German Digital Services Act)',
    representative: 'Represented by: {value}',
    contact: 'Contact',
    email: 'Email: {value}',
    phone: 'Phone: {value}',
    register: 'Register entry',
    vat: 'VAT ID',
    vatLine: 'VAT identification number according to § 27a of the German VAT Act: {value}',
    responsible: 'Responsible for the content according to § 18 (2) MStV',
    hosting: 'Technical operation',
    hostingLine:
      'This domain is technically provided through {site} ({url}). The provider named above is responsible for the content on this domain.',
  },
};

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));

function imprintText(data, language, context) {
  const words = IMPRINT_TEXT[language === 'en' ? 'en' : 'de'];
  const parts = [
    block(
      words.title,
      data.name,
      data.representative ? fill(words.representative, { value: data.representative }) : null,
      data.street,
      `${data.postcode} ${data.city}`,
      data.country
    ),
    block(words.contact, fill(words.email, { value: data.email }), data.phone ? fill(words.phone, { value: data.phone }) : null),
  ];
  if (data.register) parts.push(block(words.register, data.register));
  if (data.vatId) parts.push(block(words.vat, fill(words.vatLine, { value: data.vatId })));
  if (data.responsible) parts.push(block(words.responsible, data.responsible));
  if (data.extra) parts.push(data.extra);
  if (context && context.hosted) parts.push(block(words.hosting, fill(words.hostingLine, { site: context.site, url: context.url })));
  return parts.join('\n\n');
}

const PRIVACY_TEXT = {
  de: {
    controller: 'Verantwortlich',
    email: 'E-Mail: {value}',
    dpo: 'Datenschutzbeauftragte Person',
    overview: 'Welche Daten anfallen',
    overviewLine:
      'Wenn Sie Seiten unter dieser Domain aufrufen, verarbeitet der Server technisch notwendige Daten: die IP-Adresse Ihres Geräts, Datum und Uhrzeit, die aufgerufene Adresse, die Seite, von der Sie kommen, sowie Angaben zu Browser und Betriebssystem. Ohne diese Daten lassen sich die Seiten nicht ausliefern.',
    stats:
      'Aufrufe werden gezählt, ohne dass IP-Adressen gespeichert werden. Erfasst werden nur die Zahl der Aufrufe und die Website, von der ein Aufruf kam.',
    logs: 'Zur Abwehr von Missbrauch und zur Fehlersuche kann der Server Zugriffe für kurze Zeit protokollieren.',
    basis: 'Rechtsgrundlage',
    basisLine:
      'Die Verarbeitung erfolgt nach Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt darin, die Inhalte sicher und zuverlässig bereitzustellen.',
    cookies: 'Cookies und lokale Speicherung',
    cookiesLine:
      'Es werden nur technisch notwendige Cookies gesetzt: für die gewählte Sprache und bei geschützten Dateien für die Freigabe nach Eingabe des Passworts. Im Browser wird außerdem die Wahl zwischen hellem und dunklem Design gespeichert. Eine Einwilligung ist dafür nicht erforderlich (§ 25 Abs. 2 TDDDG).',
    external: 'Es werden keine Analyse- oder Werbedienste eingesetzt.',
    reports: 'Meldungen',
    reportsLine:
      'Über „Inhalt melden“ können Inhalte gemeldet werden. Die Angaben im Formular gehen an die Betreiber von {site} und werden zur Bearbeitung der Meldung gespeichert.',
    hosting: 'Hosting',
    hostingLine: 'Technisch bereitgestellt werden diese Seiten von {site} ({url}).',
    hostingPolicy: 'Wie dort mit Daten umgegangen wird, steht in der Datenschutzerklärung von {site}: {policy}',
    retention: 'Speicherdauer',
    retentionLine: 'Daten werden gelöscht, sobald sie für den jeweiligen Zweck nicht mehr benötigt werden.',
    rights: 'Ihre Rechte',
    rightsLine:
      'Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) und Widerspruch gegen die Verarbeitung (Art. 21 DSGVO). Wenden Sie sich dafür an die oben genannte Adresse.',
    complaint: 'Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO).',
    authority: 'Zuständig ist: {value}',
  },
  en: {
    controller: 'Controller',
    email: 'Email: {value}',
    dpo: 'Data protection officer',
    overview: 'What data is processed',
    overviewLine:
      'When you visit pages on this domain, the server processes technically necessary data: the IP address of your device, the date and time, the requested address, the page you came from and details about your browser and operating system. The pages cannot be delivered without this data.',
    stats: 'Visits are counted without storing IP addresses. Only the number of visits and the website a visit came from are recorded.',
    logs: 'To prevent abuse and to find errors, the server may log requests for a short time.',
    basis: 'Legal basis',
    basisLine:
      'The processing is based on Art. 6 (1) (f) GDPR. The legitimate interest lies in providing the content securely and reliably.',
    cookies: 'Cookies and local storage',
    cookiesLine:
      'Only technically necessary cookies are set: for the chosen language and, for protected files, to remember access after the password was entered. Your browser also stores the choice between light and dark mode. No consent is required for this (§ 25 (2) TDDDG).',
    external: 'No analytics or advertising services are used.',
    reports: 'Reports',
    reportsLine:
      'Content can be reported through “Report content”. The details entered in the form go to the operators of {site} and are stored to handle the report.',
    hosting: 'Hosting',
    hostingLine: 'These pages are technically provided by {site} ({url}).',
    hostingPolicy: 'How data is handled there is described in the privacy policy of {site}: {policy}',
    retention: 'Storage period',
    retentionLine: 'Data is deleted as soon as it is no longer needed for its purpose.',
    rights: 'Your rights',
    rightsLine:
      'You have the right to access (Art. 15 GDPR), rectification (Art. 16 GDPR), erasure (Art. 17 GDPR), restriction of processing (Art. 18 GDPR), data portability (Art. 20 GDPR) and to object to the processing (Art. 21 GDPR). Please contact the address above.',
    complaint: 'You can also lodge a complaint with a data protection supervisory authority (Art. 77 GDPR).',
    authority: 'The competent authority is: {value}',
  },
};

function privacyText(legal, language, context) {
  const words = PRIVACY_TEXT[language === 'en' ? 'en' : 'de'];
  const data = (legal.privacy && legal.privacy.data) || {};
  const controller = controllerOf(legal) || { lines: [], email: '' };
  const parts = [block(words.controller, ...controller.lines, controller.email ? fill(words.email, { value: controller.email }) : null)];
  if (data.dpo) parts.push(block(words.dpo, data.dpo));
  const overview = [words.overviewLine];
  if (context.stats) overview.push(words.stats);
  overview.push(words.logs, words.external);
  parts.push(block(words.overview, overview.join(' ')));
  parts.push(block(words.basis, words.basisLine));
  parts.push(block(words.cookies, words.cookiesLine));
  if (context.reports) parts.push(block(words.reports, fill(words.reportsLine, { site: context.site })));
  const hosting = [fill(words.hostingLine, { site: context.site, url: context.url })];
  if (context.policy) hosting.push(fill(words.hostingPolicy, { site: context.site, policy: context.policy }));
  parts.push(block(words.hosting, hosting.join(' ')));
  parts.push(block(words.retention, words.retentionLine));
  const rights = [words.rightsLine, words.complaint];
  if (data.authority) rights.push(fill(words.authority, { value: data.authority }));
  parts.push(block(words.rights, rights.join(' ')));
  if (data.extra) parts.push(data.extra);
  return parts.join('\n\n');
}

function instancePolicy() {
  const url = settings.get('legal.privacyUrl');
  if (url) return /^https?:\/\//.test(url) ? url : `${settings.get('site.baseUrl')}${url}`;
  return settings.get('legal.privacyText') ? `${settings.get('site.baseUrl')}/datenschutz` : '';
}

function context() {
  return {
    site: settings.get('site.title'),
    url: settings.get('site.baseUrl'),
    policy: instancePolicy(),
    stats: settings.get('stats.enabled') !== false,
    reports: settings.get('reports.enabled') !== false,
    hosted: true,
  };
}

function pageText(kind, legal, language) {
  const part = legal && legal[kind];
  if (!part) return null;
  if (part.mode === 'text') return part.text || null;
  if (part.mode === 'url') return null;
  if (kind === 'imprint') return missingImprint(part).length ? null : imprintText(part.data, language, context());
  return missingPrivacy(legal).length ? null : privacyText(legal, language, context());
}

const pageUrl = (kind, legal) => {
  const part = legal && legal[kind];
  return part && part.mode === 'url' && part.url ? part.url : null;
};

module.exports = {
  MODES,
  IMPRINT_FIELDS,
  PRIVACY_FIELDS,
  normalize,
  parse,
  status,
  complete,
  pageText,
  pageUrl,
  imprintText,
  privacyText,
  context,
};
