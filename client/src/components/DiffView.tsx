import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { mix } from '../lib/color';
import { t, tn } from '../lib/i18n';
import { c, fonts, radius } from '../theme/tokens';

const LINES_PER_FILE = 2000;

type Kind = 'add' | 'del' | 'context' | 'hunk' | 'note';

interface DiffLine {
  kind: Kind;
  text: string;
  old: number | null;
  next: number | null;
}

interface DiffFile {
  name: string;
  previous: string | null;
  lines: DiffLine[];
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface ParsedDiff {
  files: DiffFile[];
  additions: number;
  deletions: number;
}

const cleanPath = (value: string) =>
  value
    .replace(/\t.*$/, '')
    .replace(/^"(.*)"$/, '$1')
    .replace(/^[ab]\//, '');

export function parseDiff(text: string): ParsedDiff | null {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;
  let oldLeft = 0;
  let newLeft = 0;
  const start = (name: string): DiffFile => {
    const file: DiffFile = { name, previous: null, lines: [], additions: 0, deletions: 0, binary: false };
    files.push(file);
    current = file;
    return file;
  };
  for (const row of rows) {
    const file = current as DiffFile | null;
    const inHunk = oldLeft > 0 || newLeft > 0;
    if (inHunk && file) {
      if (row.startsWith('+')) {
        file.lines.push({ kind: 'add', text: row.slice(1), old: null, next: newLine++ });
        file.additions += 1;
        newLeft -= 1;
        continue;
      }
      if (row.startsWith('-')) {
        file.lines.push({ kind: 'del', text: row.slice(1), old: oldLine++, next: null });
        file.deletions += 1;
        oldLeft -= 1;
        continue;
      }
      if (row.startsWith(' ') || row === '') {
        file.lines.push({ kind: 'context', text: row.slice(1), old: oldLine++, next: newLine++ });
        oldLeft -= 1;
        newLeft -= 1;
        continue;
      }
    }
    if (row.startsWith('\\') && file && file.lines.length) {
      file.lines.push({ kind: 'note', text: row.slice(1).trim(), old: null, next: null });
      continue;
    }
    oldLeft = 0;
    newLeft = 0;
    if (row.startsWith('diff --git ')) {
      const match = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(row);
      start(match ? match[2] : row.slice(11));
      continue;
    }
    if (row.startsWith('--- ')) {
      const previous = cleanPath(row.slice(4));
      const target = file && !file.lines.length && !file.previous ? file : start(previous);
      target.previous = previous === '/dev/null' ? null : previous;
      continue;
    }
    if (row.startsWith('+++ ') && file) {
      const name = cleanPath(row.slice(4));
      file.name = name === '/dev/null' ? file.previous || name : name;
      continue;
    }
    if (row.startsWith('Binary files ') && file) {
      file.binary = true;
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(row);
    if (hunk) {
      const target = file || start(t('Änderungen'));
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[3]);
      oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
      newLeft = hunk[4] === undefined ? 1 : Number(hunk[4]);
      target.lines.push({ kind: 'hunk', text: row, old: null, next: null });
    }
  }
  const useful = files.filter((entry) => entry.lines.length || entry.binary);
  if (!useful.length) return null;
  return {
    files: useful,
    additions: useful.reduce((sum, entry) => sum + entry.additions, 0),
    deletions: useful.reduce((sum, entry) => sum + entry.deletions, 0),
  };
}

const TONE: Record<Kind, { bg: string; fg: string; mark: string }> = {
  add: { bg: mix(c.success, 14), fg: c.onSurface, mark: '+' },
  del: { bg: mix(c.error, 12), fg: c.onSurface, mark: '−' },
  context: { bg: 'transparent', fg: c.onSurface, mark: ' ' },
  hunk: { bg: mix(c.primary, 10), fg: c.onSurfaceVariant, mark: '' },
  note: { bg: 'transparent', fg: c.onSurfaceVariant, mark: '' },
};

function FileBlock({ file }: { file: DiffFile }) {
  const [all, setAll] = useState(false);
  const lines = all ? file.lines : file.lines.slice(0, LINES_PER_FILE);
  const renamed = file.previous && file.previous !== file.name;
  return (
    <Box component="section" sx={{ borderRadius: `${radius.md}px`, border: `1px solid ${c.outlineVariant}`, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 1.5,
          py: 1,
          bgcolor: c.surfaceContainerHigh,
          borderBottom: `1px solid ${c.outlineVariant}`,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="body2" component="h3" sx={{ fontFamily: fonts.mono, fontWeight: 700, overflowWrap: 'anywhere', flex: 1 }}>
          {renamed ? `${file.previous} → ${file.name}` : file.name}
        </Typography>
        <Typography variant="caption" sx={{ fontFamily: fonts.mono }}>
          <Box component="span" sx={{ color: c.success, fontWeight: 700 }}>{`+${file.additions}`}</Box>{' '}
          <Box component="span" sx={{ color: c.error, fontWeight: 700 }}>{`−${file.deletions}`}</Box>
        </Typography>
      </Box>
      {file.binary && !file.lines.length ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 1.5, py: 1.25 }}>
          {t('Binärdatei geändert')}
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            component="table"
            sx={{
              borderCollapse: 'collapse',
              width: '100%',
              fontFamily: fonts.mono,
              fontSize: { xs: '0.75rem', sm: '0.8125rem' },
              lineHeight: 1.55,
              '& td': { p: 0, verticalAlign: 'top' },
            }}
          >
            <tbody>
              {lines.map((line, index) => {
                const tone = TONE[line.kind];
                return (
                  <Box component="tr" key={index} sx={{ bgcolor: tone.bg, color: tone.fg }}>
                    <Box
                      component="td"
                      aria-hidden
                      sx={{
                        width: '1%',
                        px: '8px !important',
                        textAlign: 'right',
                        color: c.onSurfaceVariant,
                        opacity: 0.7,
                        userSelect: 'none',
                      }}
                    >
                      {line.old ?? ''}
                    </Box>
                    <Box
                      component="td"
                      aria-hidden
                      sx={{
                        width: '1%',
                        px: '8px !important',
                        textAlign: 'right',
                        color: c.onSurfaceVariant,
                        opacity: 0.7,
                        userSelect: 'none',
                      }}
                    >
                      {line.next ?? ''}
                    </Box>
                    <Box component="td" sx={{ width: '1%', px: '4px !important', userSelect: 'none', fontWeight: 700 }}>
                      {line.kind === 'add' || line.kind === 'del' ? (
                        <>
                          <span aria-hidden>{tone.mark}</span>
                          <Box
                            component="span"
                            sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
                          >
                            {line.kind === 'add' ? t('hinzugefügt') : t('entfernt')}
                          </Box>
                        </>
                      ) : null}
                    </Box>
                    <Box
                      component="td"
                      sx={{
                        pr: '12px !important',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontStyle: line.kind === 'note' ? 'italic' : undefined,
                      }}
                    >
                      {line.text || ' '}
                    </Box>
                  </Box>
                );
              })}
            </tbody>
          </Box>
          {!all && file.lines.length > LINES_PER_FILE && (
            <Button size="small" onClick={() => setAll(true)} sx={{ m: 1 }}>
              {tn(file.lines.length - LINES_PER_FILE, '1 weitere Zeile zeigen', '{count} weitere Zeilen zeigen')}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

export function DiffView({ diff }: { diff: ParsedDiff }) {
  return (
    <Box sx={{ display: 'grid', gap: 1.5, p: { xs: 1.5, sm: 2 } }}>
      {diff.files.map((file, index) => (
        <FileBlock key={`${file.name}-${index}`} file={file} />
      ))}
    </Box>
  );
}
