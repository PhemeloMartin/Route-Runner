import { useEffect, useImperativeHandle, useRef, useState, forwardRef, type ReactNode } from 'react';
import type { CliSession } from '@route-runner/engine';

const COLORS: Record<string, string> = { '31': '#f87171', '32': '#4ade80', '33': '#facc15', '34': '#60a5fa', '35': '#c084fc', '36': '#22d3ee', '37': '#e5e7eb', '90': '#94a3b8' };

function ansi(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const parts = text.split(/\x1b\[([0-9;]*)m/);
  let style: React.CSSProperties = {};
  parts.forEach((p, i) => {
    if (i % 2 === 1) {
      const codes = p.split(';');
      if (p === '' || codes.includes('0')) style = {};
      for (const c of codes) {
        if (c === '1') style = { ...style, fontWeight: 700 };
        if (COLORS[c]) style = { ...style, color: COLORS[c] };
      }
    } else if (p) out.push(<span key={i} style={style}>{p}</span>);
  });
  return out;
}

interface Line {
  text: string;
  input?: boolean;
}

export interface TerminalHandle {
  run: (cmd: string) => void;
  focus: () => void;
}

export const Terminal = forwardRef<TerminalHandle, { session: CliSession; onEvents?: (ev: string[]) => void; title?: string; accent?: string; onExit?: () => void }>(function Terminal({ session, onEvents, title, accent = '#22d3ee', onExit }, ref) {
  const [stack, setStack] = useState<CliSession[]>([session]);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [secret, setSecret] = useState(false);
  const [hist, setHist] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const outRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);
  const cur = stack[stack.length - 1];

  useEffect(() => {
    setStack([session]);
    setLines(session.banner ? [{ text: session.banner() }] : []);
    setSecret(false);
  }, [session]);

  useEffect(() => {
    outRef.current?.scrollTo(0, outRef.current.scrollHeight);
  }, [lines, input]);

  const exec = (raw: string, echo = true) => {
    const prompt = cur.prompt();
    const r = cur.exec(raw);
    const add: Line[] = [];
    if (echo) add.push({ text: prompt + (secret ? '' : raw), input: true });
    if (r.clear) {
      setLines([]);
    } else if (r.output) add.push({ text: r.output.replace(/\n$/, '') });
    onEvents?.(r.events ?? []); // called after EVERY command so labs can re-check objectives
    let next = stack;
    if (r.push) {
      next = [...stack, r.push];
      if (r.push.banner) add.push({ text: r.push.banner() });
    } else if (r.exit) {
      if (stack.length > 1) {
        next = stack.slice(0, -1);
        add.push({ text: `[Connection to ${cur.title()} closed]` });
      } else {
        add.push({ text: '[Session ended - press Enter to reconnect]' });
        onExit?.();
      }
    }
    setStack(next);
    if (!r.clear) setLines((l) => [...l, ...add].slice(-1500));
    setSecret(!!r.secret);
  };

  useImperativeHandle(ref, () => ({ run: (c: string) => exec(c), focus: () => inRef.current?.focus() }));

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (input.trim() && !secret) setHist((h) => [...h, input].slice(-200));
      setHIdx(-1);
      exec(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hist.length) return;
      const i = hIdx < 0 ? hist.length - 1 : Math.max(0, hIdx - 1);
      setHIdx(i);
      setInput(hist[i]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hIdx < 0) return;
      const i = hIdx + 1;
      if (i >= hist.length) {
        setHIdx(-1);
        setInput('');
      } else {
        setHIdx(i);
        setInput(hist[i]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const opts = cur.complete?.(input) ?? [];
      if (opts.length === 1) {
        const parts = input.split(/(\s+)/);
        parts[parts.length - 1] = opts[0];
        setInput(parts.join('') + (opts[0].endsWith('/') ? '' : ' '));
      } else if (opts.length > 1) setLines((l) => [...l, { text: cur.prompt() + input, input: true }, { text: opts.join('   ') }]);
    } else if (e.key === '?' && cur.kind === 'ios' && !secret) {
      // Cisco IOS shows help the instant you press "?" (no Enter needed)
      e.preventDefault();
      const prompt = cur.prompt();
      const r = cur.exec(input + '?');
      setLines((l) => [...l, { text: prompt + input + '?', input: true }, { text: r.output.replace(/\n$/, '') }]);
    } else if (e.key.toLowerCase() === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    } else if (e.key.toLowerCase() === 'c' && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault();
      setLines((l) => [...l, { text: cur.prompt() + input + '^C', input: true }]);
      setInput('');
    } else if (e.key.toLowerCase() === 'z' && e.ctrlKey && cur.kind === 'ios') {
      e.preventDefault();
      exec('end');
      setInput('');
    }
  };

  return (
    <div className="term-wrap" onClick={() => !window.getSelection()?.toString() && inRef.current?.focus()}>
      <div className="term-head">
        <span className="term-dots">
          <span style={{ background: '#ef4444' }} />
          <span style={{ background: '#f59e0b' }} />
          <span style={{ background: '#22c55e' }} />
        </span>
        <span style={{ color: accent, fontWeight: 600 }}>{title ?? cur.title()}</span>
        {stack.length > 1 && <span className="pill">nested session · type exit to return</span>}
        <span className="grow" />
        <span className="dim">↑↓ history · Tab complete{cur.kind === 'ios' ? ' · ? help · Ctrl+Z end' : ''} · Ctrl+L clear</span>
      </div>
      <div className="term-out" ref={outRef}>
        {lines.map((l, i) => (
          <div key={i} style={l.input ? { color: '#f8fafc' } : undefined}>
            {ansi(l.text)}
          </div>
        ))}
        <div className="term-line">
          <span>{ansi(cur.prompt())}</span>
          <input
            ref={inRef}
            className="term-input"
            value={input}
            type={secret ? 'password' : 'text'}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
      </div>
    </div>
  );
});
