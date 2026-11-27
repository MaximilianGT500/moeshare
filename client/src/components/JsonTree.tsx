import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { t, tn } from '../lib/i18n';
import { c, fonts } from '../theme/tokens';

const PAGE = 200;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const COLORS = {
  key: c.primary,
  string: c.tertiary,
  number: c.secondary,
  literal: c.error,
};

function Scalar({ value }: { value: Json }) {
  if (value === null) return <span style={{ color: COLORS.literal }}>null</span>;
  if (typeof value === 'boolean') return <span style={{ color: COLORS.literal }}>{String(value)}</span>;
  if (typeof value === 'number') return <span style={{ color: COLORS.number }}>{String(value)}</span>;
  return <span style={{ color: COLORS.string, wordBreak: 'break-word' }}>{JSON.stringify(value)}</span>;
}

function Key({ name }: { name: string | number | null }) {
  if (name === null) return null;
  return (
    <>
      <span style={{ color: typeof name === 'number' ? c.onSurfaceVariant : COLORS.key }}>
        {typeof name === 'number' ? name : JSON.stringify(name)}
      </span>
      <span style={{ color: c.onSurfaceVariant }}>: </span>
    </>
  );
}

function Node({ name, value, depth, open }: { name: string | number | null; value: Json; depth: number; open: number }) {
  const [shown, setShown] = useState(PAGE);
  if (value === null || typeof value !== 'object') {
    return (
      <div className="json-row">
        <Key name={name} />
        <Scalar value={value} />
      </div>
    );
  }
  const list = Array.isArray(value);
  const entries: Array<[string | number, Json]> = list ? value.map((item, index) => [index, item]) : Object.entries(value);
  const [opening, closing] = list ? ['[', ']'] : ['{', '}'];
  if (!entries.length) {
    return (
      <div className="json-row">
        <Key name={name} />
        <span style={{ color: c.onSurfaceVariant }}>{`${opening}${closing}`}</span>
      </div>
    );
  }
  const summary = list ? tn(entries.length, '1 Eintrag', '{count} Einträge') : tn(entries.length, '1 Feld', '{count} Felder');
  return (
    <details open={depth < open} className="json-node">
      <summary>
        <Key name={name} />
        <span style={{ color: c.onSurfaceVariant }}>{opening}</span>
        <span className="json-count">{summary}</span>
        <span className="json-closed" style={{ color: c.onSurfaceVariant }}>
          {closing}
        </span>
      </summary>
      <div className="json-children">
        {entries.slice(0, shown).map(([key, child]) => (
          <Node key={key} name={key} value={child} depth={depth + 1} open={open} />
        ))}
        {entries.length > shown && (
          <Button size="small" onClick={() => setShown((count) => count + PAGE)} sx={{ my: 0.25, fontFamily: fonts.sans }}>
            {t('{count} weitere zeigen', { count: Math.min(PAGE, entries.length - shown) })}
          </Button>
        )}
      </div>
      <div style={{ color: c.onSurfaceVariant }}>{closing}</div>
    </details>
  );
}

export function parseJson(text: string): { ok: true; value: Json } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as Json };
  } catch {
    return { ok: false };
  }
}

export function JsonTree({ value }: { value: unknown }) {
  const [open, setOpen] = useState(2);
  const [version, setVersion] = useState(0);
  const set = (depth: number) => {
    setOpen(depth);
    setVersion((current) => current + 1);
  };
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, px: 2, pt: 1.5 }}>
        <Button size="small" onClick={() => set(Number.POSITIVE_INFINITY)}>
          {t('Alles aufklappen')}
        </Button>
        <Button size="small" onClick={() => set(1)}>
          {t('Alles zuklappen')}
        </Button>
      </Box>
      <Box
        key={version}
        sx={{
          fontFamily: fonts.mono,
          fontSize: { xs: '0.8125rem', sm: '0.875rem' },
          lineHeight: 1.65,
          px: 2,
          py: 1.5,
          '& details > summary': {
            cursor: 'pointer',
            listStyle: 'none',
            borderRadius: '4px',
            '&::-webkit-details-marker': { display: 'none' },
            '&::before': {
              content: '"›"',
              display: 'inline-block',
              width: '1.1em',
              textAlign: 'center',
              fontWeight: 700,
              color: c.onSurfaceVariant,
              transition: 'transform 120ms',
            },
            '&:hover': { bgcolor: c.surfaceContainerHigh },
            '&:focus-visible': { outline: `2px solid ${c.primary}`, outlineOffset: 1 },
          },
          '& details[open] > summary::before': { transform: 'rotate(90deg)' },
          '& details[open] > summary .json-count, & details[open] > summary .json-closed': { display: 'none' },
          '& .json-count': { color: c.onSurfaceVariant, fontFamily: fonts.sans, fontSize: '0.75rem', mx: 0.75 },
          '& .json-children': { pl: '1.4em', borderLeft: `1px solid ${c.outlineVariant}`, ml: '0.45em' },
          '& .json-row': { pl: '1.1em' },
          '& details > div:last-child': { pl: '1.1em' },
        }}
      >
        <Node name={null} value={value as Json} depth={0} open={open} />
      </Box>
    </Box>
  );
}
