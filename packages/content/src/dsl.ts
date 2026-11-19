/**
 * Course content is written in a small, human-friendly text format and parsed here.
 *
 *   @chapter network.n1 | Exploring the Network | 1
 *   @domain 1.0 Network Infrastructure and Connectivity
 *   @sources Cisco ITN Companion Guide ch.1; ComNet Chapter 1.1 slides
 *   @story  (free text until the next @tag)
 *   @lab network:basic-lan | Optional title
 *
 *   === lesson n1-1 | What is a network? | 15
 *   @analogy ...
 *   @objectives
 *   - bullet
 *   @body
 *   markdown ...
 *   @terms
 *   - Term :: plain-English meaning
 *   @pro
 *   - A sentence to say out loud like an engineer.
 *   @interview Question? :: Model answer
 *   @lab linux:first-steps
 *   @quiz
 *   ? Single-answer question
 *   - wrong
 *   + right
 *   > explanation
 *   ?? Multi-answer question (choose all)
 *   ?= Typed-answer question
 *   = accepted answer | another accepted answer
 *   ~~~ exhibit lines (optional, inside a question) ~~~
 *
 * Inline code is written [[like this]] and code blocks are fenced with ~~~ because the
 * files are TypeScript template literals (backticks are reserved).
 *
 *   === boss
 *   (questions in the same format)
 */
import type { Chapter, LabRef, Lesson, Question, StreamId } from './types.js';

function parseLab(s: string): LabRef {
  const [ref, title] = s.split('|').map((x) => x.trim());
  const [kind, id] = ref.split(':');
  return { kind: kind as LabRef['kind'], id, title };
}

function parseQuestions(lines: string[], prefix: string, domain?: string): Question[] {
  const out: Question[] = [];
  let q: Question | null = null;
  let inExhibit = false;
  let exhibit: string[] = [];
  const flush = () => {
    if (!q) return;
    if (q.type !== 'input' && q.correct.length === 0) throw new Error(`Question without a correct answer: ${q.prompt}`);
    if (q.type === 'input' && q.accept.length === 0) throw new Error(`Input question without "=" answers: ${q.prompt}`);
    out.push(q);
    q = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim().startsWith('~~~')) {
      if (inExhibit) {
        if (q) q.exhibit = exhibit.join('\n');
        exhibit = [];
      }
      inExhibit = !inExhibit;
      continue;
    }
    if (inExhibit) {
      exhibit.push(raw);
      continue;
    }
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('?')) {
      flush();
      const type = t.startsWith('??') ? 'multi' : t.startsWith('?=') ? 'input' : 'single';
      const prompt = t.replace(/^\?[?=]?\s*/, '');
      q = { id: `${prefix}-q${out.length + 1}`, type, prompt, choices: [], correct: [], accept: [], explanation: '', domain };
    } else if (q && (t.startsWith('- ') || t.startsWith('+ '))) {
      if (t.startsWith('+ ')) q.correct.push(q.choices.length);
      q.choices.push(t.slice(2));
    } else if (q && t.startsWith('= ')) {
      q.accept.push(...t.slice(2).split('|').map((x) => x.trim()));
    } else if (q && t.startsWith('> ')) {
      q.explanation += (q.explanation ? ' ' : '') + t.slice(2);
    } else if (q) {
      q.prompt += ' ' + t;
    }
  }
  flush();
  return out;
}

const code = (s: string) => s.replace(/\[\[(.+?)\]\]/g, (_, c) => '`' + c + '`');

/** Use as a tagged template:  export default chapter`...`  (raw strings - backslashes are kept). */
export function chapter(strings: TemplateStringsArray | string, ...vals: unknown[]): Chapter {
  const src = typeof strings === 'string' ? strings : strings.raw.reduce((acc, part, i) => acc + part + (i < vals.length ? String(vals[i]) : ''), '');
  const lines = code(src).replace(/\r\n/g, '\n').split('\n');
  const blocks: { head: string; lines: string[] }[] = [{ head: 'chapter', lines: [] }];
  for (const l of lines) {
    if (l.startsWith('=== ')) blocks.push({ head: l.slice(4).trim(), lines: [] });
    else blocks[blocks.length - 1].lines.push(l);
  }
  // ---- chapter header
  const header = sections(blocks[0].lines);
  const [idFull, title, num] = (header.chapter ?? '').split('|').map((x) => x.trim());
  const [stream, id] = idFull.split('.') as [StreamId, string];
  const domain = header.domain?.trim() || undefined;
  const ch: Chapter = {
    id,
    stream,
    number: Number(num),
    title,
    story: (header.story ?? '').trim(),
    domain,
    sources: (header.sources ?? '').split(';').map((x) => x.trim()).filter(Boolean),
    lessons: [],
    boss: [],
    labs: header.__labs.map(parseLab),
  };
  for (const b of blocks.slice(1)) {
    if (b.head === 'boss') {
      ch.boss = parseQuestions(b.lines, `${id}-boss`, domain);
      continue;
    }
    const m = b.head.match(/^lesson\s+(\S+)\s*\|\s*(.+?)\s*\|\s*(\d+)$/);
    if (!m) throw new Error(`Bad lesson header "${b.head}" in ${id}`);
    const s = sections(b.lines);
    const lesson: Lesson = {
      id: m[1],
      chapterId: id,
      stream,
      title: m[2],
      minutes: Number(m[3]),
      analogy: (s.analogy ?? '').trim(),
      objectives: bullets(s.objectives),
      body: (s.body ?? '').trim(),
      // " :: " (with spaces) separates fields, so IPv6 text like FE80::/10 stays intact
      terms: bullets(s.terms).map((x) => {
        const i = x.indexOf(' :: ');
        return i < 0 ? { term: x.trim(), plain: '' } : { term: x.slice(0, i).trim(), plain: x.slice(i + 4).trim() };
      }),
      pro: bullets(s.pro),
      interview: s.interview
        ? (() => {
            const t = s.interview.trim();
            const i = t.indexOf(' :: ');
            return i < 0 ? { q: t, a: '' } : { q: t.slice(0, i).trim(), a: t.slice(i + 4).trim() };
          })()
        : undefined,
      quiz: parseQuestions((s.quiz ?? '').split('\n'), m[1], domain),
      labs: s.__labs.map(parseLab),
    };
    ch.lessons.push(lesson);
  }
  return ch;
}

function bullets(text?: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const l of text.split('\n')) {
    const t = l.trim();
    if (t.startsWith('- ')) out.push(t.slice(2));
    else if (t && out.length) out[out.length - 1] += ' ' + t;
  }
  return out;
}

function sections(lines: string[]): Record<string, string> & { __labs: string[] } {
  const out: Record<string, string> = {};
  const labs: string[] = [];
  let key = '';
  for (const l of lines) {
    const m = l.match(/^@(\w+)\s*(.*)$/);
    if (m) {
      if (m[1] === 'lab') {
        labs.push(m[2]);
        continue;
      }
      key = m[1];
      out[key] = m[2] ? m[2] + '\n' : '';
    } else if (key) out[key] += l + '\n';
  }
  return Object.assign(out, { __labs: labs });
}
