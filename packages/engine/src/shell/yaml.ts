/**
 * A deliberately small YAML reader - enough for netplan, Kubernetes manifests,
 * docker-compose files and Ansible playbooks written by a learner.
 * Supports: maps, lists ("- x" and "- key: v"), inline [a, b] lists, scalars, comments, "---" documents.
 */
export type Yaml = string | number | boolean | null | Yaml[] | { [k: string]: Yaml };

export class YamlError extends Error {}

interface Line {
  indent: number;
  text: string;
  no: number;
}

function scalar(v: string): Yaml {
  const s = v.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true' || s === 'yes') return true;
  if (s === 'false' || s === 'no') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith('[') && s.endsWith(']'))
    return s
      .slice(1, -1)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map(scalar);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

function stripComment(t: string): string {
  let q: string | null = null;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if ((c === '"' || c === "'") && !q) q = c;
    else if (c === q) q = null;
    else if (c === '#' && !q && (i === 0 || /\s/.test(t[i - 1]))) return t.slice(0, i);
  }
  return t;
}

export function parseYamlDocs(src: string): Yaml[] {
  if (src.includes('\t')) {
    const no = src.split('\n').findIndex((l) => l.includes('\t')) + 1;
    throw new YamlError(`found a tab character on line ${no} - YAML only allows SPACES for indentation`);
  }
  return src
    .split(/^---\s*$/m)
    .map((d) => parseYaml(d))
    .filter((d) => d !== null);
}

export function parseYaml(src: string): Yaml {
  const lines: Line[] = [];
  src.split(/\r?\n/).forEach((raw, i) => {
    const t = stripComment(raw).replace(/\s+$/, '');
    if (!t.trim()) return;
    lines.push({ indent: t.length - t.trimStart().length, text: t.trim(), no: i + 1 });
  });
  if (!lines.length) return null;
  let pos = 0;

  function block(indent: number): Yaml {
    const first = lines[pos];
    if (first.text.startsWith('- ') || first.text === '-') return list(indent);
    return map(indent);
  }

  function map(indent: number): Yaml {
    const out: Record<string, Yaml> = {};
    while (pos < lines.length && lines[pos].indent === indent && !lines[pos].text.startsWith('-')) {
      const ln = lines[pos];
      const m = ln.text.match(/^("[^"]+"|'[^']+'|[^:]+?):(?:\s+(.*)|\s*)$/);
      if (!m) throw new YamlError(`line ${ln.no}: expected "key: value" but found "${ln.text}"`);
      const key = m[1].replace(/^["']|["']$/g, '');
      pos++;
      if (m[2] !== undefined && m[2] !== '' && m[2] !== '|' && m[2] !== '>') out[key] = scalar(m[2]);
      else if (m[2] === '|' || m[2] === '>') {
        const parts: string[] = [];
        while (pos < lines.length && lines[pos].indent > indent) parts.push(lines[pos++].text);
        out[key] = parts.join(m[2] === '|' ? '\n' : ' ');
      } else if (pos < lines.length && lines[pos].indent > indent) out[key] = block(lines[pos].indent);
      else if (pos < lines.length && lines[pos].indent === indent && lines[pos].text.startsWith('- ')) out[key] = list(indent);
      else out[key] = null;
    }
    if (pos < lines.length && lines[pos].indent > indent)
      throw new YamlError(`line ${lines[pos].no}: unexpected indentation (check your spaces)`);
    return out;
  }

  function list(indent: number): Yaml {
    const out: Yaml[] = [];
    while (pos < lines.length && lines[pos].indent === indent && (lines[pos].text.startsWith('- ') || lines[pos].text === '-')) {
      const ln = lines[pos];
      const rest = ln.text === '-' ? '' : ln.text.slice(2);
      if (rest === '') {
        pos++;
        out.push(pos < lines.length && lines[pos].indent > indent ? block(lines[pos].indent) : null);
      } else if (/^[^"'[{][^:]*:(\s|$)/.test(rest)) {
        // "- key: value" starts an inline map; re-feed it as a map line indented by 2
        const innerIndent = indent + 2;
        lines[pos] = { indent: innerIndent, text: rest, no: ln.no };
        out.push(map(innerIndent));
      } else {
        pos++;
        out.push(scalar(rest));
      }
    }
    return out;
  }

  return block(lines[0].indent);
}

export function yget(y: Yaml, path: string): Yaml | undefined {
  let cur: Yaml | undefined = y;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, Yaml>)[k];
  }
  return cur;
}
