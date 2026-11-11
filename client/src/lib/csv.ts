import { t } from './i18n';

export interface CsvData {
  rows: string[][];
  total: number;
  columns: number;
}

const CANDIDATES = [',', ';', '\t', '|'];

export function parseCsv(text: string, delimiter: string, limit = Number.POSITIVE_INFINITY): CsvData {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let total = 0;
  let columns = 0;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const length = text.length;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.length > 1 || row[0] !== '') {
      total += 1;
      if (rows.length < limit) {
        rows.push(row);
        if (row.length > columns) columns = row.length;
      }
    }
    row = [];
  };
  while (i < length) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
    } else if (char === '\n') {
      endRow();
    } else {
      field += char;
    }
    i += 1;
  }
  if (field !== '' || row.length) endRow();
  return { rows, total, columns };
}

export function detectDelimiter(text: string, preferred?: string) {
  const sample = text.slice(0, 64 * 1024);
  const order = preferred ? [preferred, ...CANDIDATES.filter((item) => item !== preferred)] : CANDIDATES;
  let best = preferred || ',';
  let bestScore = -1;
  for (const candidate of order) {
    const { rows } = parseCsv(sample, candidate, 40);
    const complete = rows.length > 1 && sample.length < text.length ? rows.slice(0, -1) : rows;
    const width = complete[0] ? complete[0].length : 0;
    if (width < 2) continue;
    const matching = complete.filter((row) => row.length === width).length;
    const score = matching * 1000 + width;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

const NUMBER = /^[-+−]?(?:[$€£¥]\s?)?(?:\d{1,3}(?:[.,'   ]\d{3})+|\d+)(?:[.,]\d+)?(?:\s?[%€$£¥])?$/;

export function numericColumns(rows: string[][], columns: number) {
  const result: boolean[] = [];
  for (let column = 0; column < columns; column++) {
    let filled = 0;
    let numeric = 0;
    for (const row of rows) {
      const value = (row[column] || '').trim();
      if (!value) continue;
      filled += 1;
      if (NUMBER.test(value)) numeric += 1;
    }
    result.push(filled > 0 && numeric / filled >= 0.8);
  }
  return result;
}

export const delimiterLabel = (delimiter: string) =>
  delimiter === '\t' ? t('Tabulator') : delimiter === ';' ? t('Semikolon') : delimiter === '|' ? t('Senkrechter Strich') : t('Komma');
