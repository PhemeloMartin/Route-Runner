/**
 * A tiny IOS-style command matcher.
 *
 * IOS lets you type the shortest unique prefix of every keyword:
 *   "sh ip int br" == "show ip interface brief"
 *   "conf t"       == "configure terminal"
 * Patterns use keywords plus typed placeholders:
 *   <ip> <mask> <wild> <num> <word> <iface> <rest>
 */

export type ArgMap = Record<string, string>;

export interface Spec<C> {
  pattern: string;
  help: string;
  run: (ctx: C, args: ArgMap, tokens: string[]) => string | void;
}

interface Compiled<C> extends Spec<C> {
  parts: string[];
}

export type MatchOutcome<C> =
  | { kind: 'ok'; spec: Spec<C>; args: ArgMap; tokens: string[] }
  | { kind: 'invalid'; at: number }
  | { kind: 'incomplete' }
  | { kind: 'ambiguous'; word: string };

const IP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function placeholderOk(ph: string, tok: string): boolean {
  switch (ph) {
    case '<ip>':
    case '<mask>':
    case '<wild>':
      return IP.test(tok);
    case '<num>':
      return /^\d+$/.test(tok);
    case '<iface>':
      return /^[a-zA-Z-]+\s*\d[\d/.]*$/.test(tok);
    case '<cidr>':
      return /^[0-9a-fA-F:.]+\/\d+$/.test(tok);
    default:
      return tok.length > 0;
  }
}

export class CommandTable<C> {
  private specs: Compiled<C>[] = [];

  add(pattern: string, help: string, run: Spec<C>['run']): this {
    this.specs.push({ pattern, help, run, parts: pattern.split(' ') });
    return this;
  }

  /** Keywords that can follow the given tokens (for "?" and Tab). */
  nextWords(tokens: string[], partial = ''): { word: string; help: string }[] {
    const seen = new Map<string, string>();
    for (const s of this.specs) {
      let ok = true;
      for (let i = 0; i < tokens.length; i++) {
        const p = s.parts[i];
        if (!p) {
          ok = false;
          break;
        }
        if (p === '<rest>') break;
        if (p.startsWith('<') ? !placeholderOk(p, tokens[i]) : !p.startsWith(tokens[i].toLowerCase())) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const nxt = s.parts[tokens.length];
      if (nxt === undefined) {
        seen.set('<cr>', '');
        continue;
      }
      if (nxt.startsWith('<') || nxt.startsWith(partial.toLowerCase())) {
        const word = nxt === '<rest>' ? 'LINE' : nxt.startsWith('<') ? nxt.replace(/[<>]/g, '').toUpperCase() : nxt;
        if (!seen.has(word)) seen.set(word, tokens.length === s.parts.length - 1 ? s.help : '');
      }
    }
    return [...seen.entries()].map(([word, help]) => ({ word, help }));
  }

  match(line: string): MatchOutcome<C> {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    // Join "g 0/0" style interface names written with a space.
    for (let i = 0; i < tokens.length - 1; i++) {
      if (/^(g|gi|gig|gigabitethernet|f|fa|fastethernet|s|se|serial|lo|loopback|vlan|po|port-channel)$/i.test(tokens[i]) && /^\d+([/.]\d+)*$/.test(tokens[i + 1])) {
        const prev = tokens[i - 1]?.toLowerCase() ?? '';
        if (['interface', 'int', 'in', 'interfac', 'interfa', 'interf', 'inte', 'inter', 'interfaces'].includes(prev) || prev === 'range') {
          tokens.splice(i, 2, tokens[i] + tokens[i + 1]);
        }
      }
    }
    let furthestFail = 0;
    let incomplete = false;
    const candidates: { s: Compiled<C>; args: ArgMap; exact: number }[] = [];
    for (const s of this.specs) {
      const args: ArgMap = {};
      let exact = 0;
      let i = 0;
      let failed = false;
      for (; i < s.parts.length; i++) {
        const p = s.parts[i];
        if (p === '<rest>') {
          if (i >= tokens.length) {
            failed = true;
            incomplete = true;
            break;
          }
          args.rest = tokens.slice(i).join(' ');
          i = tokens.length;
          break;
        }
        const tok = tokens[i];
        if (tok === undefined) {
          failed = true;
          if (i > 0) incomplete = true;
          break;
        }
        if (p.startsWith('<')) {
          if (!placeholderOk(p, tok)) {
            failed = true;
            furthestFail = Math.max(furthestFail, i);
            break;
          }
          let key = p.replace(/[<>]/g, '');
          let n = 2;
          while (args[key] !== undefined) key = p.replace(/[<>]/g, '') + n++;
          args[key] = tok;
          exact += 1;
        } else {
          const low = tok.toLowerCase();
          if (!p.startsWith(low)) {
            failed = true;
            furthestFail = Math.max(furthestFail, i);
            break;
          }
          exact += p === low ? 3 : 2; // keywords beat placeholders; exact beats prefix
        }
      }
      if (!failed && i < tokens.length) {
        furthestFail = Math.max(furthestFail, i);
        continue;
      }
      if (!failed) candidates.push({ s, args, exact });
    }
    if (candidates.length === 0) {
      if (incomplete && furthestFail < tokens.length) {
        // tokens all valid so far, just missing more words
        const anyPrefix = this.specs.some((s) =>
          tokens.every((tk, idx) => {
            const p = s.parts[idx];
            if (!p) return false;
            if (p === '<rest>') return true;
            return p.startsWith('<') ? placeholderOk(p, tk) : p.startsWith(tk.toLowerCase());
          }),
        );
        if (anyPrefix) return { kind: 'incomplete' };
      }
      return { kind: 'invalid', at: furthestFail };
    }
    if (candidates.length > 1) {
      // Prefer the most exact; if the keywords differ and nothing is exact, IOS calls it ambiguous.
      candidates.sort((a, b) => b.exact - a.exact);
      const [top, second] = candidates;
      if (top.exact === second.exact) {
        for (let i = 0; i < tokens.length; i++) {
          const ka = top.s.parts[i];
          const kb = second.s.parts[i];
          if (!ka || !kb || ka.startsWith('<') || kb.startsWith('<')) continue;
          if (ka !== kb && ka !== tokens[i].toLowerCase()) return { kind: 'ambiguous', word: tokens[i] };
        }
      }
      return { kind: 'ok', spec: top.s, args: top.args, tokens };
    }
    return { kind: 'ok', spec: candidates[0].s, args: candidates[0].args, tokens };
  }

  complete(partialLine: string): string[] {
    const endsWithSpace = /\s$/.test(partialLine);
    const toks = partialLine.trim().split(/\s+/).filter(Boolean);
    const partial = endsWithSpace ? '' : toks.pop() ?? '';
    return this.nextWords(toks, partial)
      .map((w) => w.word)
      .filter((w) => !w.startsWith('<') && w === w.toLowerCase() && w !== 'LINE');
  }
}
