import { useMemo } from 'react';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

/** Course content is authored by us (trusted), so rendering its HTML directly is safe. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => marked.parse(text, { async: false }) as string, [text]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function inline(text: string): string {
  return marked.parseInline(text, { async: false }) as string;
}
