import { Fragment, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

const TOKEN = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

function linkify(line: string): ReactNode[] {
  return line.split(TOKEN).map((part, index) => {
    if (index % 2 === 0) return part;
    const email = !part.startsWith('http');
    return (
      <Link
        key={index}
        href={email ? `mailto:${part}` : part}
        target={email ? undefined : '_blank'}
        rel={email ? undefined : 'noopener noreferrer'}
        underline="hover"
        sx={{ wordBreak: 'break-word' }}
      >
        {part}
      </Link>
    );
  });
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {linkify(line)}
        </Fragment>
      ))}
    </>
  );
}

export function LegalText({ text, dense = false }: { text: string; dense?: boolean }) {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim());
  return (
    <Box sx={{ '& > :first-of-type': { mt: 0 } }}>
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        const heading = /^##\s+/.test(lines[0]) ? lines[0].replace(/^##\s+/, '') : null;
        const body = heading ? lines.slice(1) : lines;
        return (
          <Box key={index} sx={{ mt: index ? (heading ? (dense ? 2.5 : 3.5) : 2) : 0 }}>
            {heading && (
              <Typography
                variant="h6"
                component="h2"
                sx={{ fontSize: dense ? '1rem' : '1.125rem', fontWeight: 800, mb: body.length ? 0.75 : 0, lineHeight: 1.35 }}
              >
                {heading}
              </Typography>
            )}
            {body.length > 0 && (
              <Typography variant="body1" sx={{ lineHeight: 1.7, fontSize: dense ? '0.9375rem' : undefined }}>
                <Lines lines={body} />
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
