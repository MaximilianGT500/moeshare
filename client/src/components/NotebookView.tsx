import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MarkdownView } from './MarkdownView';
import { highlight } from '../lib/highlight';
import { hljsTheme } from '../lib/codeTheme';
import { mix } from '../lib/color';
import { t } from '../lib/i18n';
import { c, fonts, radius } from '../theme/tokens';

const MAX_CELLS = 600;
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

type Source = string | string[] | undefined;

interface Output {
  output_type?: string;
  name?: string;
  text?: Source;
  data?: Record<string, Source>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

interface Cell {
  cell_type?: string;
  source?: Source;
  input?: Source;
  outputs?: Output[];
  execution_count?: number | null;
  prompt_number?: number | null;
}

export interface Notebook {
  cells: Cell[];
  language: string;
}

const join = (value: Source) => (Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : '');

export function parseNotebook(text: string): Notebook | null {
  try {
    const raw = JSON.parse(text) as {
      cells?: Cell[];
      worksheets?: Array<{ cells?: Cell[] }>;
      metadata?: { language_info?: { name?: string }; kernelspec?: { language?: string } };
    };
    const cells = Array.isArray(raw.cells)
      ? raw.cells
      : Array.isArray(raw.worksheets) && raw.worksheets[0]
        ? raw.worksheets[0].cells
        : null;
    if (!Array.isArray(cells)) return null;
    const language = raw.metadata?.language_info?.name || raw.metadata?.kernelspec?.language || 'python';
    return { cells, language: String(language).toLowerCase() };
  } catch {
    return null;
  }
}

function Code({ text, language }: { text: string; language: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setHtml(null);
    if (!text || text.length > 100_000) return;
    highlight(text, language)
      .then((result) => alive && setHtml(result.html))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [text, language]);
  return (
    <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...hljsTheme }}>
      {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{text}</code>}
    </Box>
  );
}

function Plain({ text, tone = 'normal' }: { text: string; tone?: 'normal' | 'error' }) {
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: tone === 'error' ? c.error : c.onSurface,
      }}
    >
      {text.replace(ANSI, '')}
    </Box>
  );
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function Rich({ data }: { data: Record<string, Source> }) {
  const image = IMAGE_TYPES.find((type) => data[type]);
  if (image) {
    const encoded = join(data[image]).replace(/\s+/g, '');
    return (
      <Box
        component="img"
        src={`data:${image};base64,${encoded}`}
        alt={join(data['text/plain']) || t('Ausgabe')}
        sx={{ maxWidth: '100%', display: 'block' }}
      />
    );
  }
  if (data['image/svg+xml']) {
    return (
      <Box
        component="img"
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(join(data['image/svg+xml']))}`}
        alt={join(data['text/plain']) || t('Ausgabe')}
        sx={{ maxWidth: '100%', display: 'block' }}
      />
    );
  }
  if (data['text/markdown']) return <MarkdownView text={join(data['text/markdown'])} />;
  if (data['text/plain']) return <Plain text={join(data['text/plain'])} />;
  if (data['text/html'] || data['application/javascript']) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: fonts.sans }}>
        {t('Diese Ausgabe enthält HTML oder Skripte und wird hier nicht angezeigt.')}
      </Typography>
    );
  }
  return null;
}

function OutputBlock({ output }: { output: Output }) {
  switch (output.output_type) {
    case 'stream':
      return <Plain text={join(output.text)} tone={output.name === 'stderr' ? 'error' : 'normal'} />;
    case 'execute_result':
    case 'display_data':
    case 'pyout':
      return output.data ? <Rich data={output.data} /> : output.text ? <Plain text={join(output.text)} /> : null;
    case 'error':
    case 'pyerr':
      return <Plain text={[`${output.ename || ''}: ${output.evalue || ''}`, ...(output.traceback || [])].join('\n')} tone="error" />;
    default:
      return output.text ? <Plain text={join(output.text)} /> : null;
  }
}

function Prompt({ label }: { label: string }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: { xs: 'auto', sm: 64 },
        flexShrink: 0,
        textAlign: { xs: 'left', sm: 'right' },
        color: c.onSurfaceVariant,
        fontFamily: fonts.mono,
        fontSize: '0.75rem',
        pt: { xs: 0, sm: 1.25 },
        opacity: 0.8,
      }}
    >
      {label}
    </Box>
  );
}

export function NotebookView({ notebook }: { notebook: Notebook }) {
  const cells = useMemo(() => notebook.cells.slice(0, MAX_CELLS), [notebook]);
  return (
    <Box sx={{ display: 'grid', gap: 1.5, px: { xs: 1.5, sm: 2.5 }, py: { xs: 2, sm: 3 } }}>
      {cells.map((cell, index) => {
        const source = join(cell.source ?? cell.input);
        if (cell.cell_type === 'markdown') {
          return (
            <Box key={index} sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
              <Box sx={{ width: 64, flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <MarkdownView text={source} />
              </Box>
            </Box>
          );
        }
        if (cell.cell_type !== 'code') {
          return (
            <Box key={index} sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
              <Prompt label="" />
              <Box sx={{ minWidth: 0, flex: 1, fontFamily: fonts.mono, fontSize: '0.875rem' }}>
                <Plain text={source} />
              </Box>
            </Box>
          );
        }
        const count = cell.execution_count ?? cell.prompt_number ?? null;
        const outputs = (cell.outputs || []).filter(Boolean);
        return (
          <Box key={index} sx={{ display: 'grid', gap: 0.75 }}>
            <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
              <Prompt label={`In [${count ?? ' '}]:`} />
              <Box
                sx={{
                  minWidth: 0,
                  flex: 1,
                  p: 1.25,
                  borderRadius: `${radius.sm}px`,
                  bgcolor: mix(c.surfaceContainerHighest, 70),
                  border: `1px solid ${c.outlineVariant}`,
                  fontFamily: fonts.mono,
                  fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                  lineHeight: 1.55,
                }}
              >
                <Code text={source} language={notebook.language} />
              </Box>
            </Box>
            {outputs.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
                <Prompt label={count !== null ? `Out [${count}]:` : ''} />
                <Box
                  sx={{
                    minWidth: 0,
                    flex: 1,
                    px: 1.25,
                    display: 'grid',
                    gap: 1,
                    fontFamily: fonts.mono,
                    fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                    lineHeight: 1.55,
                    overflowX: 'auto',
                  }}
                >
                  {outputs.map((output, position) => (
                    <OutputBlock key={position} output={output} />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        );
      })}
      {notebook.cells.length > MAX_CELLS && (
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
          {t('Gezeigt werden die ersten {count} Zellen. Den Rest siehst du im Quelltext.', { count: MAX_CELLS })}
        </Typography>
      )}
    </Box>
  );
}
