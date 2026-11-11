import { c } from '../theme/tokens';

export const hljsTheme = {
  '& .hljs-comment, & .hljs-quote': { color: c.onSurfaceVariant, fontStyle: 'italic' },
  '& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal, & .hljs-doctag, & .hljs-section': { color: c.primary, fontWeight: 600 },
  '& .hljs-string, & .hljs-regexp, & .hljs-addition, & .hljs-meta .hljs-string': { color: c.tertiary },
  '& .hljs-number, & .hljs-symbol, & .hljs-bullet, & .hljs-variable, & .hljs-template-variable': { color: c.secondary },
  '& .hljs-title, & .hljs-title.function_, & .hljs-name, & .hljs-selector-id, & .hljs-selector-class': { color: c.primary },
  '& .hljs-attr, & .hljs-attribute, & .hljs-property, & .hljs-params': { color: c.onSurface },
  '& .hljs-built_in, & .hljs-type, & .hljs-class .hljs-title, & .hljs-title.class_': { color: c.tertiary, fontWeight: 600 },
  '& .hljs-meta, & .hljs-meta .hljs-keyword': { color: c.secondary },
  '& .hljs-deletion': { color: c.error },
  '& .hljs-emphasis': { fontStyle: 'italic' },
  '& .hljs-strong': { fontWeight: 700 },
  '& .hljs-link': { textDecoration: 'underline' },
};
