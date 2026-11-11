import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import { ANCHOR_PREFIX, parseMarkdown, renderInline, sameOrigin, type Block, type Document, type InlineRenderers } from '../lib/markdown';
import { hljsTheme } from '../lib/codeTheme';
import { t } from '../lib/i18n';
import { c, fonts, radius } from '../theme/tokens';

const external = (href: string) =>
  href.startsWith('#') || sameOrigin(href) ? {} : { target: '_blank', rel: 'noopener noreferrer nofollow ugc' };

const renderers: InlineRenderers = {
  text: (value) => value,
  code: (value, key) => <code key={key}>{value}</code>,
  strong: (children, key) => <strong key={key}>{children}</strong>,
  em: (children, key) => <em key={key}>{children}</em>,
  del: (children, key) => <del key={key}>{children}</del>,
  br: (key) => <br key={key} />,
  link: (href, children, title, key) =>
    href ? (
      <a key={key} href={href} title={title || undefined} {...external(href)}>
        {children}
      </a>
    ) : (
      <span key={key}>{children}</span>
    ),
  image: (src, alt, title, key) => {
    if (src && sameOrigin(src)) return <img key={key} src={src} alt={alt} title={title || undefined} loading="lazy" />;
    if (!src) return <span key={key}>{alt}</span>;
    return (
      <a key={key} className="md-image" href={src} title={t('Externes Bild öffnen')} {...external(src)}>
        <ImageOutlined fontSize="inherit" />
        {alt || t('Bild')}
      </a>
    );
  },
};

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    setHtml(null);
    if (!lang || text.length > 200_000) return;
    let alive = true;
    import('highlight.js/lib/common')
      .then(({ default: hljs }) => {
        if (alive && hljs.getLanguage(lang)) setHtml(hljs.highlight(text, { language: lang, ignoreIllegals: true }).value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lang, text]);
  return <pre>{html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{text}</code>}</pre>;
}

function Blocks({ blocks, doc, tight = false }: { blocks: Block[]; doc: Document; tight?: boolean }) {
  const key = { value: 0 };
  const inline = (text: string) => renderInline(text, doc.refs, renderers, key);
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading': {
            const Tag = `h${block.level}` as 'h1';
            return (
              <Tag key={index} id={`${ANCHOR_PREFIX}${block.id}`}>
                {inline(block.text)}
              </Tag>
            );
          }
          case 'paragraph':
            return tight ? <Fragment key={index}>{inline(block.text)}</Fragment> : <p key={index}>{inline(block.text)}</p>;
          case 'code':
            return <CodeBlock key={index} lang={block.lang} text={block.text} />;
          case 'quote':
            return (
              <blockquote key={index}>
                <Blocks blocks={block.children} doc={doc} />
              </blockquote>
            );
          case 'list': {
            const items = block.items.map((item, position) => (
              <li key={position} className={item.task !== null ? 'md-task' : undefined}>
                {item.task !== null && (
                  <input type="checkbox" checked={item.task} disabled readOnly aria-label={item.task ? t('Erledigt') : t('Offen')} />
                )}
                <Blocks blocks={item.children} doc={doc} tight={!block.loose} />
              </li>
            ));
            return block.ordered ? (
              <ol key={index} start={block.start !== 1 ? block.start : undefined}>
                {items}
              </ol>
            ) : (
              <ul key={index}>{items}</ul>
            );
          }
          case 'table':
            return (
              <div key={index} className="md-table">
                <table>
                  <thead>
                    <tr>
                      {block.head.map((cell, column) => (
                        <th key={column} style={{ textAlign: block.align[column] || undefined }}>
                          {inline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, line) => (
                      <tr key={line}>
                        {row.map((cell, column) => (
                          <td key={column} style={{ textAlign: block.align[column] || undefined }}>
                            {inline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'hr':
            return <hr key={index} />;
          default:
            return null;
        }
      })}
    </>
  );
}

export function MarkdownView({ text, children }: { text: string; children?: ReactNode }) {
  const doc = useMemo(() => parseMarkdown(text), [text]);
  return (
    <Box
      className="ms-markdown"
      onClick={(event) => {
        const anchor = (event.target as HTMLElement).closest('a[href^="#"]');
        if (!anchor) return;
        event.preventDefault();
        const id = decodeURIComponent((anchor.getAttribute('href') || '').slice(1));
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
      sx={{
        color: c.onSurface,
        fontSize: { xs: '0.9375rem', sm: '1rem' },
        lineHeight: 1.7,
        overflowWrap: 'anywhere',
        '& > :first-child': { mt: 0 },
        '& > :last-child': { mb: 0 },
        '& h1, & h2, & h3, & h4, & h5, & h6': { fontWeight: 800, lineHeight: 1.3, mt: 3.5, mb: 1.25, scrollMarginTop: 80 },
        '& h1': { fontSize: '1.875rem', pb: 1, borderBottom: `1px solid ${c.outlineVariant}` },
        '& h2': { fontSize: '1.5rem', pb: 0.75, borderBottom: `1px solid ${c.outlineVariant}` },
        '& h3': { fontSize: '1.25rem' },
        '& h4': { fontSize: '1.0625rem' },
        '& h5, & h6': { fontSize: '1rem', color: c.onSurfaceVariant },
        '& p': { my: 1.5 },
        '& a': { color: c.primary, textDecorationThickness: '1px', textUnderlineOffset: '2px' },
        '& a:hover': { textDecorationThickness: '2px' },
        '& .md-image': {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.125,
          borderRadius: `${radius.sm}px`,
          bgcolor: c.surfaceContainerHighest,
          textDecoration: 'none',
          fontSize: '0.875em',
        },
        '& img': { maxWidth: '100%', height: 'auto', borderRadius: `${radius.sm}px`, verticalAlign: 'middle' },
        '& ul, & ol': { pl: 3.5, my: 1.5 },
        '& li + li': { mt: 0.5 },
        '& li > ul, & li > ol': { my: 0.5 },
        '& li.md-task': { listStyle: 'none' },
        '& li.md-task > input': { ml: '-1.6em', mr: 1, verticalAlign: 'middle', accentColor: c.primary },
        '& blockquote': {
          mx: 0,
          my: 2,
          pl: 2,
          pr: 1,
          py: 0.25,
          borderLeft: `4px solid ${c.primary}`,
          color: c.onSurfaceVariant,
          '& > :first-child': { mt: 0.5 },
          '& > :last-child': { mb: 0.5 },
        },
        '& code': {
          fontFamily: fonts.mono,
          fontSize: '0.875em',
          px: 0.75,
          py: 0.25,
          borderRadius: `${radius.xs}px`,
          bgcolor: c.surfaceContainerHighest,
        },
        '& pre': {
          my: 2,
          p: 2,
          overflow: 'auto',
          borderRadius: `${radius.md}px`,
          bgcolor: c.surfaceContainerHighest,
          lineHeight: 1.55,
          '& code': { p: 0, bgcolor: 'transparent', fontSize: '0.875rem', whiteSpace: 'pre' },
          ...hljsTheme,
        },
        '& hr': { border: 0, borderTop: `1px solid ${c.outlineVariant}`, my: 3 },
        '& .md-table': { overflowX: 'auto', my: 2 },
        '& table': { borderCollapse: 'collapse', fontSize: '0.9375em' },
        '& th, & td': { border: `1px solid ${c.outlineVariant}`, px: 1.5, py: 0.75, verticalAlign: 'top' },
        '& th': { fontWeight: 700, bgcolor: c.surfaceContainerHigh },
        '& del': { color: c.onSurfaceVariant },
      }}
    >
      <Blocks blocks={doc.blocks} doc={doc} />
      {children}
    </Box>
  );
}
