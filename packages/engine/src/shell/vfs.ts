/** An in-memory Linux filesystem (JSON-serialisable so it can be saved). */

export interface FsNode {
  type: 'dir' | 'file';
  mode: string; // "rwxr-xr-x"
  owner: string;
  group: string;
  mtime: number;
  content?: string;
  children?: Record<string, FsNode>;
}

export function dir(owner = 'root', mode = 'rwxr-xr-x', children: Record<string, FsNode> = {}): FsNode {
  return { type: 'dir', mode, owner, group: owner, mtime: Date.now(), children };
}

export function file(content: string, owner = 'root', mode = 'rw-r--r--'): FsNode {
  return { type: 'file', mode, owner, group: owner, mtime: Date.now(), content };
}

export function normalizePath(path: string, cwd: string, home: string): string {
  let p = path.replace(/^~(?=\/|$)/, home);
  if (!p.startsWith('/')) p = `${cwd}/${p}`;
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

export class Vfs {
  constructor(public root: FsNode) {}

  get(path: string): FsNode | undefined {
    if (path === '/') return this.root;
    let node: FsNode | undefined = this.root;
    for (const seg of path.split('/').filter(Boolean)) {
      if (!node || node.type !== 'dir') return undefined;
      node = node.children![seg];
    }
    return node;
  }

  parentOf(path: string): { parent: FsNode | undefined; name: string } {
    const idx = path.lastIndexOf('/');
    const parentPath = idx <= 0 ? '/' : path.slice(0, idx);
    return { parent: this.get(parentPath), name: path.slice(idx + 1) };
  }

  mkdir(path: string, owner: string, parents = false): string | undefined {
    if (this.get(path)) return parents ? undefined : `mkdir: cannot create directory '${path}': File exists`;
    const { parent, name } = this.parentOf(path);
    if (!parent) {
      if (!parents) return `mkdir: cannot create directory '${path}': No such file or directory`;
      const idx = path.lastIndexOf('/');
      const err = this.mkdir(path.slice(0, idx) || '/', owner, true);
      if (err) return err;
      return this.mkdir(path, owner, false);
    }
    if (parent.type !== 'dir') return `mkdir: cannot create directory '${path}': Not a directory`;
    parent.children![name] = dir(owner);
    return undefined;
  }

  write(path: string, content: string, owner: string, append = false): string | undefined {
    const existing = this.get(path);
    if (existing?.type === 'dir') return `${path}: Is a directory`;
    if (existing) {
      existing.content = append ? (existing.content ?? '') + content : content;
      existing.mtime = Date.now();
      return undefined;
    }
    const { parent, name } = this.parentOf(path);
    if (!parent || parent.type !== 'dir') return `${path}: No such file or directory`;
    parent.children![name] = file(content, owner);
    return undefined;
  }

  read(path: string): string | undefined {
    const n = this.get(path);
    return n?.type === 'file' ? n.content ?? '' : undefined;
  }

  remove(path: string): boolean {
    const { parent, name } = this.parentOf(path);
    if (!parent?.children?.[name]) return false;
    delete parent.children[name];
    return true;
  }

  clone(node: FsNode): FsNode {
    return JSON.parse(JSON.stringify(node));
  }
}

export function modeToOctal(mode: string): string {
  let out = '';
  for (let i = 0; i < 9; i += 3) {
    const t = mode.slice(i, i + 3);
    out += String((t[0] === 'r' ? 4 : 0) + (t[1] === 'w' ? 2 : 0) + (t[2] === 'x' ? 1 : 0));
  }
  return out;
}

export function octalToMode(oct: string): string {
  return oct
    .padStart(3, '0')
    .slice(-3)
    .split('')
    .map((d) => {
      const n = Number(d);
      return (n & 4 ? 'r' : '-') + (n & 2 ? 'w' : '-') + (n & 1 ? 'x' : '-');
    })
    .join('');
}

/** chmod u+x / g-w / o=r / a+x / +x */
export function applySymbolic(mode: string, spec: string): string | undefined {
  const m = spec.match(/^([ugoa]*)([+\-=])([rwx]+)$/);
  if (!m) return undefined;
  const who = m[1] || 'a';
  const idx: number[] = [];
  if (who.includes('u') || who.includes('a')) idx.push(0);
  if (who.includes('g') || who.includes('a')) idx.push(3);
  if (who.includes('o') || who.includes('a')) idx.push(6);
  const arr = mode.split('');
  for (const base of idx) {
    const bits = ['r', 'w', 'x'];
    bits.forEach((b, k) => {
      if (m[2] === '=') arr[base + k] = m[3].includes(b) ? b : '-';
      else if (m[3].includes(b)) arr[base + k] = m[2] === '+' ? b : '-';
    });
  }
  return arr.join('');
}
