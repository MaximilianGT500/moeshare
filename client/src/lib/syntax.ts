import { t } from './i18n';

const LABELS: Record<string, string> = {
  plaintext: t('Klartext'),
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  json: 'JSON',
  markdown: 'Markdown',
  xml: 'HTML / XML',
  css: 'CSS',
  scss: 'SCSS',
  bash: 'Bash',
  shell: 'Shell',
  powershell: 'PowerShell',
  sql: 'SQL',
  yaml: 'YAML',
  ini: 'INI / TOML',
  java: 'Java',
  kotlin: 'Kotlin',
  csharp: 'C#',
  cpp: 'C++',
  c: 'C',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  ruby: 'Ruby',
  swift: 'Swift',
  lua: 'Lua',
  diff: 'Diff',
  dos: 'Batch',
};

export const syntaxLabel = (key: string) => LABELS[key] || key;
