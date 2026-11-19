/** A terminal session (Cisco IOS, Windows-style PC prompt or Linux shell) - the UI just feeds it lines. */
export interface CliResult {
  output: string;
  /** Ask the UI to hide the next typed line (password prompt). */
  secret?: boolean;
  /** Push a nested session (e.g. SSH into a router from a PC). */
  push?: CliSession;
  /** Pop this session (exit / logout). */
  exit?: boolean;
  clear?: boolean;
  /** Event names emitted for mission checkers & achievements, e.g. "ping:ok", "ssh:ok". */
  events?: string[];
}

export interface CliSession {
  readonly kind: 'ios' | 'host' | 'linux';
  title(): string;
  prompt(): string;
  exec(line: string): CliResult;
  complete?(partial: string): string[];
  banner?(): string;
}

export function caretError(prompt: string, line: string, badTokenIndex: number): string {
  const tokens = line.split(/(\s+)/);
  let col = prompt.length;
  let wordIdx = 0;
  for (const tk of tokens) {
    if (/^\s+$/.test(tk)) {
      col += tk.length;
      continue;
    }
    if (wordIdx === badTokenIndex) break;
    col += tk.length;
    wordIdx++;
  }
  return `${' '.repeat(col)}^\n% Invalid input detected at '^' marker.\n`;
}
