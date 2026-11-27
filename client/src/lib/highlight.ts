export interface Highlighted {
  html: string;
  language: string;
}

export async function highlight(text: string, syntax: string): Promise<Highlighted> {
  const { default: hljs } = await import('highlight.js/lib/common');
  if ((syntax === 'powershell' || syntax === 'dos') && !hljs.getLanguage(syntax)) {
    const module =
      syntax === 'powershell' ? await import('highlight.js/lib/languages/powershell') : await import('highlight.js/lib/languages/dos');
    hljs.registerLanguage(syntax, module.default);
  }
  if (text.length > 400_000) return { html: hljs.highlight(text, { language: 'plaintext' }).value, language: 'plaintext' };
  if (syntax && syntax !== 'auto' && hljs.getLanguage(syntax)) {
    return { html: hljs.highlight(text, { language: syntax, ignoreIllegals: true }).value, language: syntax };
  }
  const auto = hljs.highlightAuto(text);
  return { html: auto.value, language: auto.language || 'plaintext' };
}
