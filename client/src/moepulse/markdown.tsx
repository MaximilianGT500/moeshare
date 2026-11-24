import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'text'; text: string };

const INLINE = /(`[^`\n]{1,200}`)|(\*\*[^*\n]{1,300}\*\*)|(\[[^\]\n]{1,200}\]\(https:\/\/[^)\s]{3,400}\))/g;

function parse(source: string) {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').slice(0, 40_000).split('\n');
  let paragraph: string[] = [];
  let fence: string[] | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'text', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (fence) {
        blocks.push({ kind: 'code', text: fence.join('\n') });
        fence = null;
      } else {
        flush();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const item = /^\s*(?:([-*+])|(\d{1,3})[.)])\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
    } else if (item) {
      flush();
      const ordered = Boolean(item[2]);
      const last = blocks.at(-1);
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item[3]);
      else blocks.push({ kind: 'list', ordered, items: [item[3]] });
    } else if (!line.trim()) {
      flush();
    } else {
      paragraph.push(line.trim());
    }
    if (blocks.length > 300) break;
  }
  if (fence) blocks.push({ kind: 'code', text: fence.join('\n') });
  flush();
  return blocks;
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [whole] = match;
    if (match[1]) {
      parts.push(
        <Box
          key={index++}
          component="code"
          sx={{
            fontFamily: 'var(--moe-mono, ui-monospace, monospace)',
            fontSize: '0.85em',
            px: 0.5,
            py: 0.125,
            borderRadius: '6px',
            bgcolor: 'action.selected',
          }}
        >
          {whole.slice(1, -1)}
        </Box>
      );
    } else if (match[2]) {
      parts.push(
        <Box key={index++} component="strong" sx={{ fontWeight: 700 }}>
          {whole.slice(2, -2)}
        </Box>
      );
    } else {
      const split = whole.indexOf('](');
      parts.push(
        <Link key={index++} href={whole.slice(split + 2, -1)} target="_blank" rel="noopener noreferrer" underline="hover">
          {whole.slice(1, split)}
        </Link>
      );
    }
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text, dense = false }: { text: string; dense?: boolean }) {
  const blocks = parse(text);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: dense ? 0.75 : 1.25, minWidth: 0, overflowWrap: 'anywhere' }}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading')
          return (
            <Typography key={index} variant="subtitle2" component="p" sx={{ fontWeight: 700, mt: index ? 0.5 : 0 }}>
              {inline(block.text)}
            </Typography>
          );
        if (block.kind === 'list')
          return (
            <Box
              key={index}
              component={block.ordered ? 'ol' : 'ul'}
              sx={{ m: 0, pl: 2.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}
            >
              {block.items.map((item, position) => (
                <Typography key={position} component="li" variant="body2">
                  {inline(item)}
                </Typography>
              ))}
            </Box>
          );
        if (block.kind === 'code')
          return (
            <Box
              key={index}
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                borderRadius: '12px',
                bgcolor: 'action.hover',
                overflowX: 'auto',
                fontFamily: 'var(--moe-mono, ui-monospace, monospace)',
                fontSize: '0.8125rem',
              }}
            >
              {block.text}
            </Box>
          );
        return (
          <Typography key={index} variant="body2">
            {inline(block.text)}
          </Typography>
        );
      })}
    </Box>
  );
}
