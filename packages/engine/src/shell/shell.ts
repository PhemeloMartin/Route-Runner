/**
 * The Linux shell simulator (bash-like).
 * Supports: quotes, $VARS, globs (*), pipes (|), redirection (> >> 2>/dev/null),
 * sequences (; && ||), sudo with password, single-line for-loops and bash scripts.
 */
import { type CliResult, type CliSession } from '../cli/types.js';
import { ansible, ansiblePlaybook, terraform } from '../cloud/iac.js';
import { aws } from '../cloud/aws.js';
import { docker } from '../cloud/docker.js';
import { kubectl, createCluster } from '../cloud/k8s.js';
import { mpirun, moduleCmd, nvidiaSmi, sacct, sbatch, scancel, sinfo, squeue, srun, tickSlurm, createSlurm } from '../cloud/slurm.js';
import { type CmdResult, type Handler, type ShellCtx, fail, ok } from '../cloud/types.js';
import { inNetwork, isIPv4, prefixToMask, broadcastOf, networkOf as ipNetworkOf } from '../net/ip.js';
import { COMMAND_PKG, MAN, PACKAGES, SERVICE_INFO } from './packages.js';
import { type ShellState, createMachine, dhcpLeaseFor, hasInternet, syncAccountFiles, type MachineOptions } from './state.js';
import { Vfs, applySymbolic, dir, file, normalizePath, octalToMode, modeToOctal, type FsNode } from './vfs.js';
import { parseYaml, yget, YamlError } from './yaml.js';

const C = { reset: '\x1b[0m', green: '\x1b[1;32m', blue: '\x1b[1;34m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m' };

type Pending =
  | { kind: 'sudo'; line: string; tries: number }
  | { kind: 'apt'; line: string }
  | { kind: 'passwd'; user: string; step: 1 | 2; first?: string }
  | { kind: 'adduser'; user: string; step: 1 | 2; first?: string };

interface Simple {
  argv: string[];
  redirect?: { path: string; append: boolean };
  silenceErr?: boolean;
}

const PUBLIC_HOSTS: Record<string, string> = {
  'google.com': '142.250.200.14',
  'www.google.com': '142.250.200.4',
  'ubuntu.com': '185.125.190.20',
  'archive.ubuntu.com': '185.125.190.39',
  'github.com': '140.82.121.4',
  'cloudflare.com': '104.16.132.229',
  'one.one.one.one': '1.1.1.1',
  'dns.google': '8.8.8.8',
  'up.ac.za': '137.215.6.53',
  'spu.ac.za': '196.21.20.45',
  'routerunner.dev': '102.65.10.20',
  'ifconfig.me': '34.160.111.145',
};

export class ShellSession implements CliSession {
  readonly kind = 'linux' as const;
  vfs: Vfs;
  pending?: Pending;
  private events: string[] = [];
  private aliases: Record<string, string> = { ll: 'ls -alF', la: 'ls -A', l: 'ls -CF' };
  editSudo = false;

  constructor(public s: ShellState) {
    this.vfs = new Vfs(s.fs);
  }

  static create(opts: MachineOptions = {}): ShellSession {
    const sh = new ShellSession(createMachine(opts));
    if (opts.profile === 'cloud') seedCloud(sh);
    if (opts.profile === 'hpc') seedHpc(sh);
    return sh;
  }

  get home(): string {
    return this.s.user === 'root' ? '/root' : `/home/${this.s.user}`;
  }

  title() {
    return `${this.s.user}@${this.s.hostname}`;
  }

  banner(): string {
    if (this.s.profile === 'hpc')
      return `${C.bold}Welcome to the Route Runner HPC cluster (lengau-sim)${C.reset}\n * Login node: compile and submit jobs here. Do NOT run heavy work on the login node.\n * Try: sinfo, module avail, cat ~/jobs/hello_mpi.sh, sbatch ~/jobs/hello_mpi.sh, squeue\n\n`;
    if (this.s.profile === 'cloud')
      return `${C.bold}Welcome to Route Runner CloudShell${C.reset} (af-south-1, Cape Town)\n * Tools: docker, kubectl, aws, terraform, ansible\n * Try: kubectl get nodes, docker run hello-world, aws ec2 describe-vpcs, cd ~/terraform-demo\n\n`;
    return `Welcome to Ubuntu 24.04.3 LTS (GNU/Linux 6.8.0-48-generic x86_64)\n\n * Documentation:  https://help.ubuntu.com\n * Support:        https://ubuntu.com/pro\n\n  System information as of ${new Date().toUTCString()}\n\n  System load:  0.08               Processes:             121\n  Usage of /:   23.4% of 24.44GB   Users logged in:       1\n  Memory usage: 11%                IPv4 address for ${this.s.net.iface}: ${this.s.net.ip ?? '(none)'}\n\nType "help" for the Route Runner command list. Read README.txt to begin.\n\n`;
  }

  prompt(): string {
    if (this.pending?.kind === 'sudo') return `[sudo] password for ${this.s.user}: `;
    if (this.pending?.kind === 'apt') return 'Do you want to continue? [Y/n] ';
    if (this.pending?.kind === 'passwd' || this.pending?.kind === 'adduser') return this.pending.step === 1 ? 'New password: ' : 'Retype new password: ';
    const p = this.s.cwd === this.home ? '~' : this.s.cwd.startsWith(this.home + '/') ? '~' + this.s.cwd.slice(this.home.length) : this.s.cwd;
    const root = this.s.user === 'root';
    return `${root ? C.red : C.green}${this.s.user}@${this.s.hostname}${C.reset}:${C.blue}${p}${C.reset}${root ? '#' : '$'} `;
  }

  complete(partial: string): string[] {
    const toks = partial.split(/\s+/);
    const last = toks[toks.length - 1] ?? '';
    if (toks.length === 1) return Object.keys(this.commands()).filter((c) => c.startsWith(last)).slice(0, 30);
    const base = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : '';
    const dirPath = normalizePath(base || '.', this.s.cwd, this.home);
    const node = this.vfs.get(dirPath);
    if (!node?.children) return [];
    return Object.entries(node.children)
      .filter(([n]) => n.startsWith(last.slice(base.length)))
      .map(([n, f]) => base + n + (f.type === 'dir' ? '/' : ''));
  }

  // ------------------------------------------------------------------ entry point
  exec(raw: string): CliResult {
    this.events = [];
    let output = '';
    if (this.pending) {
      output = this.handlePending(raw);
    } else if (raw.trim()) {
      this.s.history.push(raw.trim());
      if (raw.trim() === 'clear' || raw.trim() === 'reset') return { output: '', clear: true };
      const r = this.runLine(raw);
      output = r.out + (r.err ? r.err + (r.err.endsWith('\n') ? '' : '\n') : '');
      if (r.code === 99) return { output: '', exit: true };
    }
    if (this.s.slurm) tickSlurm(this.s.slurm, (p, c) => this.vfs.write(p, c, this.s.user));
    const secret = this.pending?.kind === 'sudo' || this.pending?.kind === 'passwd' || this.pending?.kind === 'adduser';
    return { output, secret, events: this.events };
  }

  private handlePending(raw: string): string {
    const p = this.pending!;
    const v = raw.trim();
    if (p.kind === 'sudo') {
      const u = this.s.users.find((x) => x.name === this.s.user);
      if (u && v === u.password) {
        this.pending = undefined;
        this.s.sudoCached = true;
        const r = this.runLine(p.line);
        return r.out + (r.err ? r.err + '\n' : '');
      }
      p.tries++;
      if (p.tries >= 3) {
        this.pending = undefined;
        return 'sudo: 3 incorrect password attempts\n';
      }
      return 'Sorry, try again.\n';
    }
    if (p.kind === 'apt') {
      this.pending = undefined;
      if (v === '' || /^y(es)?$/i.test(v)) {
        const r = this.runLine(p.line + ' -y');
        return r.out + (r.err ? r.err + '\n' : '');
      }
      return 'Abort.\n';
    }
    if (p.kind === 'passwd' || p.kind === 'adduser') {
      if (p.step === 1) {
        p.first = v;
        p.step = 2;
        return '';
      }
      this.pending = undefined;
      if (v !== p.first) return `Sorry, passwords do not match.\npasswd: Authentication token manipulation error\npasswd: password unchanged\n`;
      const u = this.s.users.find((x) => x.name === p.user)!;
      u.password = v;
      syncAccountFiles(this.s);
      if (p.kind === 'adduser') {
        this.events.push(`user:add:${p.user}`);
        return `passwd: password updated successfully\nChanging the user information for ${p.user}\nEnter the new value, or press ENTER for the default\n\tFull Name []: \n\tRoom Number []: \n\tWork Phone []: \n\tHome Phone []: \n\tOther []: \nIs the information correct? [Y/n] Y\ninfo: Adding new user \`${p.user}' to supplemental / extra groups \`users' ...\n`;
      }
      return 'passwd: password updated successfully\n';
    }
    return '';
  }

  // ------------------------------------------------------------------ parsing
  private expandVars(s: string): string {
    return s.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*|\d|\?)\}?/g, (_, k) => (k === '?' ? '0' : this.s.env[k] ?? (k === 'PWD' ? this.s.cwd : k === 'HOSTNAME' ? this.s.hostname : '')));
  }

  /** Split a line into words + operators, honouring quotes. */
  tokenize(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quote: string | null = null;
    let had = false;
    const push = () => {
      if (had || cur) out.push(cur);
      cur = '';
      had = false;
    };
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = null;
        else if (c === '$' && quote === '"') {
          const m = line.slice(i).match(/^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/);
          if (m) {
            cur += this.s.env[m[1]] ?? '';
            i += m[0].length - 1;
          } else cur += c;
        } else cur += c;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        had = true;
        continue;
      }
      if (c === '#' && !cur && !had) break;
      if (/\s/.test(c)) {
        push();
        continue;
      }
      const two = line.slice(i, i + 2);
      if (two === '&&' || two === '||' || two === '>>' || two === '2>') {
        push();
        if (two === '2>') {
          const rest = line.slice(i + 2).match(/^(&1|\s*\/dev\/null)/);
          out.push(rest ? `2>${rest[1].trim()}` : '2>');
          i += 1 + (rest ? rest[0].length : 0);
          continue;
        }
        out.push(two);
        i++;
        continue;
      }
      if (c === '|' || c === ';' || c === '>' || c === '<') {
        push();
        out.push(c);
        continue;
      }
      if (c === '$') {
        const m = line.slice(i).match(/^\$\{?([A-Za-z_][A-Za-z0-9_]*|\d|\?)\}?/);
        if (m) {
          cur += this.expandVars(m[0]);
          had = true;
          i += m[0].length - 1;
          continue;
        }
      }
      if (c === '~' && !cur && (line[i + 1] === undefined || line[i + 1] === '/' || /\s/.test(line[i + 1]))) {
        cur += this.home;
        continue;
      }
      cur += c;
    }
    push();
    return out;
  }

  private glob(word: string): string[] {
    if (!/[*?]/.test(word)) return [word];
    const slash = word.lastIndexOf('/');
    const base = slash >= 0 ? word.slice(0, slash + 1) : '';
    const pat = word.slice(slash + 1);
    const node = this.vfs.get(normalizePath(base || '.', this.s.cwd, this.home));
    if (!node?.children) return [word];
    const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const hits = Object.keys(node.children).filter((n) => re.test(n) && !n.startsWith('.')).sort();
    return hits.length ? hits.map((h) => base + h) : [word];
  }

  runLine(line: string): CmdResult {
    // single-line for loop: for x in a b c; do echo $x; done
    const loop = line.trim().match(/^for\s+(\w+)\s+in\s+(.+?);\s*do\s+(.+?);?\s*done$/);
    if (loop) {
      const items = this.tokenize(loop[2]).flatMap((w) => this.glob(w));
      let out = '';
      for (const it of items) {
        this.s.env[loop[1]] = it;
        const r = this.runLine(loop[3]);
        out += r.out + (r.err ? r.err + '\n' : '');
      }
      return ok(out);
    }
    const assign = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (assign) {
      this.s.env[assign[1]] = this.tokenize(assign[2]).join(' ');
      return ok();
    }
    const toks = this.tokenize(line);
    let out = '';
    let err = '';
    let last: CmdResult = ok();
    let i = 0;
    let skip = false;
    while (i < toks.length) {
      const seg: string[] = [];
      while (i < toks.length && !['&&', '||', ';'].includes(toks[i])) seg.push(toks[i++]);
      const op = toks[i++];
      if (!skip && seg.length) {
        last = this.runPipeline(seg);
        if (last.code === 99) return last;
        out += last.out;
        if (last.err) err += last.err.endsWith('\n') ? last.err : last.err + '\n';
        if (this.pending) break;
      }
      skip = (op === '&&' && (last.code ?? 0) !== 0) || (op === '||' && (last.code ?? 0) === 0);
    }
    return { out, err: err.replace(/\n$/, ''), code: last.code };
  }

  private runPipeline(toks: string[]): CmdResult {
    const cmds: Simple[] = [];
    let cur: Simple = { argv: [] };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t === '|') {
        cmds.push(cur);
        cur = { argv: [] };
      } else if (t === '>' || t === '>>') {
        cur.redirect = { path: toks[++i] ?? '', append: t === '>>' };
      } else if (t.startsWith('2>')) {
        cur.silenceErr = t === '2>/dev/null';
        if (t === '2>') i++;
      } else if (t === '<') {
        const f = this.vfs.read(this.abs(toks[++i] ?? ''));
        cur.argv.push('__stdin__', f ?? '');
      } else cur.argv.push(...this.glob(t));
    }
    cmds.push(cur);
    let stdin = '';
    let res: CmdResult = ok();
    let errs = '';
    for (const c of cmds) {
      const si = c.argv.indexOf('__stdin__');
      if (si >= 0) {
        stdin = c.argv[si + 1];
        c.argv.splice(si, 2);
      }
      res = this.runSimple(c.argv, stdin);
      if (res.code === 99 || this.pending) return res;
      if (res.err && !c.silenceErr) errs += res.err.endsWith('\n') ? res.err : res.err + '\n';
      if (c.redirect) {
        const target = this.abs(c.redirect.path);
        if (target === '/dev/null') {
          stdin = '';
          res = { ...res, out: '' };
          continue;
        }
        const e = this.writeChecked(target, res.out, c.redirect.append);
        if (e) errs += `bash: ${c.redirect.path}: ${e}\n`;
        res = { ...res, out: '' };
      }
      stdin = res.out;
    }
    return { out: res.out, err: errs.replace(/\n$/, ''), code: res.code };
  }

  private ctx(sudo: boolean): ShellCtx {
    return {
      s: this.s,
      vfs: this.vfs,
      sudo,
      abs: (p) => this.abs(p),
      read: (p) => this.vfs.read(p),
      write: (p, c, a) => this.vfs.write(p, c, this.s.user, a),
      emit: (e) => this.events.push(e),
      isRoot: () => this.s.user === 'root',
      inGroup: (g) => !!this.s.users.find((u) => u.name === this.s.user)?.groups.includes(g),
    };
  }

  abs(p: string): string {
    return normalizePath(p, this.s.cwd, this.home);
  }

  private canWrite(path: string, sudo: boolean): boolean {
    if (sudo || this.s.user === 'root') return true;
    if (path === '/tmp' || path.startsWith('/tmp/') || path.startsWith(this.home + '/') || path === this.home) return true;
    const n = this.vfs.get(path);
    if (n) return n.owner === this.s.user;
    const { parent } = this.vfs.parentOf(path);
    return !!parent && parent.owner === this.s.user;
  }

  private canRead(path: string, sudo: boolean): boolean {
    if (sudo || this.s.user === 'root') return true;
    const n = this.vfs.get(path);
    if (!n) return true;
    if (n.owner === this.s.user) return n.mode[0] === 'r';
    if (path.startsWith('/root')) return false;
    if (path.startsWith('/var/log/') && n.mode[6] !== 'r') return !!this.s.users.find((u) => u.name === this.s.user)?.groups.includes('adm');
    return n.mode[6] === 'r';
  }

  private writeChecked(path: string, content: string, append = false, sudo = false): string | undefined {
    if (!this.canWrite(path, sudo)) return 'Permission denied';
    return this.vfs.write(path, content, sudo ? 'root' : this.s.user, append);
  }

  /** Called by the UI editor (nano/vim replacement) when the learner saves. */
  saveFromEditor(path: string, content: string): string | undefined {
    const e = this.writeChecked(path, content, false, this.editSudo);
    if (e) return `[ Error writing ${path}: Permission denied ] - open it with "sudo nano ${path}"`;
    this.events.push(`edit:saved:${path}`);
    return undefined;
  }

  // ------------------------------------------------------------------ command dispatch
  private runSimple(argv: string[], stdin: string, sudo = false): CmdResult {
    if (!argv.length) return ok();
    let [cmd, ...args] = argv;
    if (this.aliases[cmd]) {
      const expanded = this.tokenize(this.aliases[cmd]);
      cmd = expanded[0];
      args = [...expanded.slice(1), ...args];
    }
    if (cmd === 'sudo') {
      if (!args.length) return fail('usage: sudo command');
      if (this.s.user !== 'root') {
        const me = this.s.users.find((u) => u.name === this.s.user);
        if (!me?.groups.includes('sudo')) {
          this.events.push('sudo:denied');
          return fail(`${this.s.user} is not in the sudoers file.\nThis incident has been reported to the administrator.`);
        }
        if (!this.s.sudoCached) {
          this.pending = { kind: 'sudo', line: this.s.history[this.s.history.length - 1] ?? argv.join(' '), tries: 0 };
          return ok();
        }
      }
      if (args[0] === '-i' || (args[0] === 'su' && (args.length === 1 || args[1] === '-'))) return this.switchUser('root');
      return this.runSimple(args, stdin, true);
    }
    const table = this.commands();
    const h = table[cmd];
    const pkg = COMMAND_PKG[cmd];
    if (pkg && !this.s.packages.includes(pkg) && !(cmd === 'aws' && this.s.profile === 'cloud')) {
      return fail(`Command '${cmd}' not found, but can be installed with:\nsudo apt install ${pkg}`, 127);
    }
    if (h) return h(this.ctx(sudo), args, stdin);
    if (cmd.startsWith('./') || cmd.startsWith('/') || cmd.endsWith('.sh')) return this.runScript(cmd, args, sudo);
    return fail(`${cmd}: command not found`, 127);
  }

  private switchUser(name: string): CmdResult {
    this.s.env.__PREV_USER = this.s.user;
    this.s.env.__PREV_CWD = this.s.cwd;
    this.s.user = name;
    this.s.cwd = name === 'root' ? '/root' : `/home/${name}`;
    this.s.env.USER = name;
    this.s.env.HOME = this.s.cwd;
    this.events.push(`su:${name}`);
    return ok();
  }

  private runScript(path: string, args: string[], sudo: boolean): CmdResult {
    const p = this.abs(path);
    const n = this.vfs.get(p);
    if (!n) return fail(`bash: ${path}: No such file or directory`, 127);
    if (n.type === 'dir') return fail(`bash: ${path}: Is a directory`, 126);
    if (path.startsWith('./') && n.mode[2] !== 'x' && !sudo) return fail(`bash: ${path}: Permission denied\n[Route Runner hint] Make it executable first: chmod +x ${path.slice(2)}`, 126);
    return this.runScriptText(n.content ?? '', args);
  }

  runScriptText(text: string, args: string[] = []): CmdResult {
    args.forEach((a, k) => (this.s.env[String(k + 1)] = a));
    const lines = text.split('\n');
    let out = '';
    let err = '';
    for (let k = 0; k < lines.length; k++) {
      let l = lines[k].trim();
      if (!l || l.startsWith('#')) continue;
      if (/^for\s/.test(l) && !/\bdone\s*$/.test(l)) {
        const header = l.replace(/;?\s*do\s*$/, '');
        const body: string[] = [];
        while (++k < lines.length) {
          const t = lines[k].trim();
          if (/^done\b/.test(t)) break;
          if (t === 'do' || !t || t.startsWith('#')) continue;
          body.push(t);
        }
        l = `${header}; do ${body.join('; ')}; done`;
      }
      const r = this.runLine(l);
      out += r.out;
      if (r.err) err += r.err + '\n';
      if (r.code === 99) break;
    }
    this.events.push('script:run');
    return { out, err: err.replace(/\n$/, ''), code: 0 };
  }

  // ------------------------------------------------------------------ command table
  private _commands?: Record<string, Handler>;
  private commands(): Record<string, Handler> {
    if (this._commands) return this._commands;
    const self = this;
    const S = this.s;
    const need = (c: ShellCtx, what: string): CmdResult | undefined => (c.sudo || S.user === 'root' ? undefined : fail(`${what}: Permission denied (are you root? try sudo)`, 1));
    const cmds: Record<string, Handler> = {
      help: () =>
        ok(`${C.bold}Route Runner Linux simulator - commands you can use${C.reset}
 Files:     ls cd pwd mkdir rmdir touch cat less head tail cp mv rm ln tree find grep wc sort uniq echo nano vim chmod chown stat file du
 System:    whoami id who w uptime date uname hostname hostnamectl lsb_release df free lscpu lsblk nproc ps top htop kill history clear man which
 Users:     sudo su adduser useradd passwd usermod groups deluser groupadd
 Packages:  apt (update/upgrade/install/remove/list/search) dpkg -l snap
 Services:  systemctl (status/start/stop/restart/enable/disable) service journalctl
 Network:   ip (a/r/link/neigh) ping traceroute ss netstat ifconfig curl wget dig nslookup host nmap netplan ufw ssh ssh-keygen scp
 Scripts:   bash script.sh, ./script.sh, VAR=value, for x in ...; do ...; done, crontab
 Cloud:     docker kubectl aws terraform ansible ansible-playbook
 HPC:       sinfo squeue sbatch scancel sacct srun module mpirun nvidia-smi
 Learning:  man <cmd>  explain <cmd>
`),
      man: (_c, a) => (a[0] && MAN[a[0]] ? ok(`${a[0].toUpperCase()}(1)\n\nNAME\n       ${a[0]} - ${MAN[a[0]]}\n\n(Route Runner short man page. Real systems: press q to quit man.)\n`) : fail(a[0] ? `No manual entry for ${a[0]}` : 'What manual page do you want?\nFor example, try \'man man\'.')),
      explain: (_c, a) => ok(MAN[a[0] ?? ''] ? `${a[0]}: ${MAN[a[0]]}\n` : `I don't have a plain-English note for "${a[0]}" yet. Try "man ${a[0]}".\n`),
      pwd: () => ok(S.cwd + '\n'),
      whoami: () => ok(S.user + '\n'),
      id: (_c, a) => {
        const u = S.users.find((x) => x.name === (a[0] ?? S.user));
        if (!u) return fail(`id: '${a[0]}': no such user`);
        return ok(`uid=${u.uid}(${u.name}) gid=${u.uid}(${u.name}) groups=${u.groups.map((g) => `${g === u.name ? u.uid : g === 'sudo' ? 27 : g === 'adm' ? 4 : g === 'docker' ? 998 : 100}(${g})`).join(',')}\n`);
      },
      groups: (_c, a) => {
        const u = S.users.find((x) => x.name === (a[0] ?? S.user));
        return u ? ok(`${a[0] ? a[0] + ' : ' : ''}${u.groups.join(' ')}\n`) : fail(`groups: '${a[0]}': no such user`);
      },
      hostname: (_c, a) => ok((a[0] === '-I' ? S.net.ip ?? '' : S.hostname) + '\n'),
      uname: (_c, a) => ok((a.includes('-a') ? `Linux ${S.hostname} 6.8.0-48-generic #48-Ubuntu SMP PREEMPT_DYNAMIC Fri Sep 27 14:04:52 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux` : a.includes('-r') ? '6.8.0-48-generic' : 'Linux') + '\n'),
      lsb_release: () => ok('No LSB modules are available.\nDistributor ID:\tUbuntu\nDescription:\tUbuntu 24.04.3 LTS\nRelease:\t24.04\nCodename:\tnoble\n'),
      date: () => ok(new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'full', timeStyle: 'long' }) + '\n'),
      timedatectl: () => ok(`               Local time: ${new Date().toString()}\n                Time zone: Africa/Johannesburg (SAST, +0200)\nSystem clock synchronized: yes\n              NTP service: active\n`),
      uptime: () => ok(` ${new Date().toTimeString().slice(0, 8)} up 1:12,  1 user,  load average: 0.08, 0.03, 0.01\n`),
      who: () => ok(`${S.user}    pts/0        ${new Date().toISOString().slice(0, 16).replace('T', ' ')} (192.168.56.1)\n`),
      w: () => ok(` ${new Date().toTimeString().slice(0, 8)} up 1:12,  1 user,  load average: 0.08, 0.03, 0.01\nUSER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\n${S.user.padEnd(9)}pts/0    192.168.56.1     08:01    0.00s  0.04s  0.00s w\n`),
      echo: (_c, a) => (a[0] === '-e' ? ok(a.slice(1).join(' ').replace(/\\n/g, '\n').replace(/\\t/g, '\t') + '\n') : a[0] === '-n' ? ok(a.slice(1).join(' ')) : ok(a.join(' ') + '\n')),
      printf: (_c, a) => ok((a[0] ?? '').replace(/\\n/g, '\n').replace(/%s/g, () => a.splice(1, 1)[0] ?? '')),
      true: () => ok(),
      false: () => ({ out: '', code: 1 }),
      sleep: () => ok(),
      export: (_c, a) => {
        for (const kv of a) {
          const [k, ...v] = kv.split('=');
          if (v.length) S.env[k] = v.join('=');
        }
        return ok();
      },
      env: () => ok(Object.entries(S.env).filter(([k]) => !k.startsWith('__') && !/^\d+$/.test(k)).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'),
      alias: (_c, a) => {
        if (!a.length) return ok(Object.entries(self.aliases).map(([k, v]) => `alias ${k}='${v}'`).join('\n') + '\n');
        const [k, ...v] = a.join(' ').split('=');
        self.aliases[k] = v.join('=');
        return ok();
      },
      history: () => ok(S.history.map((h, k) => `${String(k + 1).padStart(5)}  ${h}`).join('\n') + '\n'),
      which: (_c, a) => (a[0] && (self.commands()[a[0]] && (!COMMAND_PKG[a[0]] || S.packages.includes(COMMAND_PKG[a[0]]))) ? ok(`/usr/bin/${a[0]}\n`) : { out: '', code: 1 }),
      type: (_c, a) => ok(self.aliases[a[0]] ? `${a[0]} is aliased to \`${self.aliases[a[0]]}'\n` : `${a[0]} is /usr/bin/${a[0]}\n`),
      exit: () => {
        if (S.env.__PREV_USER) {
          S.user = S.env.__PREV_USER;
          S.cwd = S.env.__PREV_CWD ?? `/home/${S.user}`;
          S.env.USER = S.user;
          S.env.HOME = `/home/${S.user}`;
          delete S.env.__PREV_USER;
          return ok('logout\n');
        }
        return { out: 'logout\n', code: 99 };
      },
      logout: (c, a) => self.commands().exit(c, a, ''),
      su: (c, a) => {
        const target = a.filter((x) => x !== '-')[0] ?? 'root';
        if (!S.users.some((u) => u.name === target)) return fail(`su: user ${target} does not exist or the user entry does not contain all the required fields`);
        if (target === 'root' && !c.sudo && S.user !== 'root') return fail('Password: \nsu: Authentication failure\n[Route Runner hint] On Ubuntu the root account has no password. Use "sudo -i" or "sudo su -" instead.');
        return self.switchUser(target);
      },

      // ---------------------------------------------------------------- files
      cd: (_c, a) => {
        const target = a[0] === '-' ? S.env.OLDPWD ?? S.cwd : self.abs(a[0] ?? '~');
        const n = self.vfs.get(target);
        if (!n) return fail(`bash: cd: ${a[0]}: No such file or directory`);
        if (n.type !== 'dir') return fail(`bash: cd: ${a[0]}: Not a directory`);
        if (!self.canRead(target, false) || (n.mode[8] !== 'x' && n.owner !== S.user && S.user !== 'root')) return fail(`bash: cd: ${a[0]}: Permission denied`);
        S.env.OLDPWD = S.cwd;
        S.cwd = target;
        self.events.push(`cd:${target}`);
        return ok();
      },
      ls: (c, a) => {
        const opts = a.filter((x) => x.startsWith('-')).join('');
        const paths = a.filter((x) => !x.startsWith('-'));
        const long = opts.includes('l');
        const all = opts.includes('a') || opts.includes('A');
        const human = opts.includes('h');
        const outs: string[] = [];
        for (const p of paths.length ? paths : ['.']) {
          const path = self.abs(p);
          const n = self.vfs.get(path);
          if (!n) {
            outs.push(`ls: cannot access '${p}': No such file or directory`);
            continue;
          }
          if (!self.canRead(path, c.sudo)) {
            outs.push(`ls: cannot open directory '${p}': Permission denied`);
            continue;
          }
          const entries: [string, FsNode][] = n.type === 'dir' ? Object.entries(n.children ?? {}) : [[p, n]];
          if (n.type === 'dir' && all && opts.includes('a')) entries.unshift(['.', n], ['..', n]);
          const shown = entries.filter(([name]) => all || !name.startsWith('.')).sort(([x], [y]) => x.replace(/^\./, '').localeCompare(y.replace(/^\./, '')));
          if (paths.length > 1) outs.push(`${p}:`);
          const color = (name: string, f: FsNode) => (f.type === 'dir' ? `${C.blue}${name}${C.reset}` : f.mode[2] === 'x' ? `${C.green}${name}${C.reset}` : name);
          if (long) {
            outs.push(`total ${shown.length * 4}`);
            for (const [name, f] of shown) {
              const size = f.type === 'dir' ? 4096 : (f.content ?? '').length;
              const sz = human ? (size >= 1024 ? `${(size / 1024).toFixed(1)}K` : String(size)) : String(size);
              const d = new Date(f.mtime);
              outs.push(`${f.type === 'dir' ? 'd' : '-'}${f.mode} ${f.type === 'dir' ? 2 : 1} ${f.owner.padEnd(8)} ${f.group.padEnd(8)} ${sz.padStart(5)} ${d.toLocaleString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2)} ${d.toTimeString().slice(0, 5)} ${color(name, f)}`);
            }
          } else outs.push(shown.map(([name, f]) => color(name, f)).join('  '));
        }
        return ok(outs.filter((x) => x !== '').join('\n') + '\n');
      },
      tree: (_c, a) => {
        const root = self.abs(a[0] ?? '.');
        const lines = [a[0] ?? '.'];
        let dirs = 0;
        let files = 0;
        const walk = (n: FsNode, prefix: string, depth: number) => {
          const kids = Object.entries(n.children ?? {}).filter(([k]) => !k.startsWith('.'));
          kids.forEach(([k, f], idx) => {
            const last = idx === kids.length - 1;
            lines.push(`${prefix}${last ? '└── ' : '├── '}${f.type === 'dir' ? C.blue + k + C.reset : k}`);
            if (f.type === 'dir') {
              dirs++;
              if (depth < 4) walk(f, prefix + (last ? '    ' : '│   '), depth + 1);
            } else files++;
          });
        };
        const n = self.vfs.get(root);
        if (!n) return fail(`${a[0]} [error opening dir]`);
        walk(n, '', 0);
        return ok(`${lines.join('\n')}\n\n${dirs} directories, ${files} files\n`);
      },
      mkdir: (c, a) => {
        const parents = a.includes('-p');
        for (const p of a.filter((x) => !x.startsWith('-'))) {
          const path = self.abs(p);
          if (!self.canWrite(path, c.sudo)) return fail(`mkdir: cannot create directory '${p}': Permission denied`);
          const e = self.vfs.mkdir(path, c.sudo ? 'root' : S.user, parents);
          if (e) return fail(e);
        }
        self.events.push('mkdir');
        return ok();
      },
      rmdir: (c, a) => {
        const path = self.abs(a[0] ?? '');
        const n = self.vfs.get(path);
        if (!n) return fail(`rmdir: failed to remove '${a[0]}': No such file or directory`);
        if (Object.keys(n.children ?? {}).length) return fail(`rmdir: failed to remove '${a[0]}': Directory not empty`);
        self.vfs.remove(path);
        return ok();
      },
      touch: (c, a) => {
        for (const p of a.filter((x) => !x.startsWith('-'))) {
          const path = self.abs(p);
          const n = self.vfs.get(path);
          if (n) n.mtime = Date.now();
          else {
            if (!self.canWrite(path, c.sudo)) return fail(`touch: cannot touch '${p}': Permission denied`);
            const e = self.vfs.write(path, '', c.sudo ? 'root' : S.user);
            if (e) return fail(`touch: cannot touch '${p}': No such file or directory`);
          }
        }
        return ok();
      },
      cat: (c, a, stdin) => {
        const files = a.filter((x) => !x.startsWith('-'));
        if (!files.length) return ok(stdin);
        let out = '';
        for (const p of files) {
          const path = self.abs(p);
          if (path === '/proc/cpuinfo') {
            out += Array.from({ length: S.hw.cpus }, (_, k) => `processor\t: ${k}\nmodel name\t: ${S.hw.cpuModel}\ncpu cores\t: ${S.hw.cpus}\n`).join('\n');
            continue;
          }
          if (path === '/proc/meminfo') {
            out += `MemTotal:       ${S.hw.ramMb * 1024} kB\nMemFree:        ${S.hw.ramMb * 700} kB\nMemAvailable:   ${S.hw.ramMb * 800} kB\n`;
            continue;
          }
          const n = self.vfs.get(path);
          if (!n) return { out, err: `cat: ${p}: No such file or directory`, code: 1 };
          if (n.type === 'dir') return { out, err: `cat: ${p}: Is a directory`, code: 1 };
          if (!self.canRead(path, c.sudo)) return { out, err: `cat: ${p}: Permission denied`, code: 1 };
          out += n.content ?? '';
        }
        return ok(out);
      },
      less: (c, a, s) => self.commands().cat(c, a, s),
      more: (c, a, s) => self.commands().cat(c, a, s),
      head: (c, a, stdin) => {
        const n = Number(a[a.indexOf('-n') + 1] ?? 10) || (a.find((x) => /^-\d+$/.test(x)) ? Number(a.find((x) => /^-\d+$/.test(x))!.slice(1)) : 10);
        const f = a.find((x, k) => !x.startsWith('-') && a[k - 1] !== '-n');
        const text = f ? self.vfs.read(self.abs(f)) : stdin;
        if (text === undefined) return fail(`head: cannot open '${f}' for reading: No such file or directory`);
        return ok(text.split('\n').slice(0, n).join('\n') + '\n');
      },
      tail: (c, a, stdin) => {
        const n = Number(a[a.indexOf('-n') + 1] ?? 10) || 10;
        const f = a.find((x, k) => !x.startsWith('-') && a[k - 1] !== '-n');
        if (f && !self.canRead(self.abs(f), c.sudo)) return fail(`tail: cannot open '${f}' for reading: Permission denied`);
        const text = f ? self.vfs.read(self.abs(f)) : stdin;
        if (text === undefined) return fail(`tail: cannot open '${f}' for reading: No such file or directory`);
        const lines = text.replace(/\n$/, '').split('\n');
        return ok(lines.slice(-n).join('\n') + '\n' + (a.includes('-f') ? '[Route Runner] (tail -f keeps following new lines on a real system - Ctrl+C to stop)\n' : ''));
      },
      wc: (_c, a, stdin) => {
        const f = a.find((x) => !x.startsWith('-'));
        const text = f ? self.vfs.read(self.abs(f)) ?? '' : stdin;
        const lines = text ? text.replace(/\n$/, '').split('\n').length : 0;
        if (a.includes('-l')) return ok(`${lines}${f ? ' ' + f : ''}\n`);
        if (a.includes('-w')) return ok(`${text.split(/\s+/).filter(Boolean).length}${f ? ' ' + f : ''}\n`);
        return ok(` ${lines} ${text.split(/\s+/).filter(Boolean).length} ${text.length}${f ? ' ' + f : ''}\n`);
      },
      grep: (c, a, stdin) => {
        const flags = a.filter((x) => /^-[a-zA-Z]+$/.test(x)).join('');
        const rest = a.filter((x) => !/^-[a-zA-Z]+$/.test(x));
        const pattern = rest[0];
        if (pattern === undefined) return fail('Usage: grep [OPTION]... PATTERNS [FILE]...');
        let re: RegExp;
        try {
          re = new RegExp(pattern, flags.includes('i') ? 'i' : '');
        } catch {
          re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.includes('i') ? 'i' : '');
        }
        const files = rest.slice(1);
        const sources: [string, string][] = files.length ? files.map((f) => [f, self.canRead(self.abs(f), c.sudo) ? self.vfs.read(self.abs(f)) ?? '' : '']) : [['', stdin]];
        const out: string[] = [];
        for (const [name, text] of sources)
          text.split('\n').forEach((line, k) => {
            if (line === '' && k === text.split('\n').length - 1) return;
            const hit = re.test(line) !== flags.includes('v');
            if (hit) out.push(`${files.length > 1 ? name + ':' : ''}${flags.includes('n') ? k + 1 + ':' : ''}${flags.includes('v') ? line : line.replace(re, (m) => `${C.red}${m}${C.reset}`)}`);
          });
        if (flags.includes('c')) return ok(`${out.length}\n`);
        return out.length ? ok(out.join('\n') + '\n') : { out: '', code: 1 };
      },
      sort: (_c, a, stdin) => {
        const f = a.find((x) => !x.startsWith('-'));
        const lines = (f ? self.vfs.read(self.abs(f)) ?? '' : stdin).replace(/\n$/, '').split('\n');
        lines.sort((x, y) => (a.includes('-n') ? Number(x) - Number(y) : x.localeCompare(y)));
        if (a.includes('-r')) lines.reverse();
        return ok(lines.join('\n') + '\n');
      },
      uniq: (_c, a, stdin) => {
        const lines = stdin.replace(/\n$/, '').split('\n');
        const out: string[] = [];
        let count = 0;
        lines.forEach((l, k) => {
          count++;
          if (lines[k + 1] !== l) {
            out.push(a.includes('-c') ? `${String(count).padStart(7)} ${l}` : l);
            count = 0;
          }
        });
        return ok(out.join('\n') + '\n');
      },
      cut: (_c, a, stdin) => {
        const d = a[a.indexOf('-d') + 1] ?? '\t';
        const f = Number((a[a.indexOf('-f') + 1] ?? '1').split(',')[0]);
        return ok(stdin.replace(/\n$/, '').split('\n').map((l) => l.split(d)[f - 1] ?? '').join('\n') + '\n');
      },
      cp: (c, a) => {
        const rec = a.some((x) => /^-[a-zA-Z]*r/i.test(x));
        const [src, dst] = a.filter((x) => !x.startsWith('-'));
        if (!src || !dst) return fail("cp: missing destination file operand after '" + (src ?? '') + "'");
        const sp = self.abs(src);
        const n = self.vfs.get(sp);
        if (!n) return fail(`cp: cannot stat '${src}': No such file or directory`);
        if (n.type === 'dir' && !rec) return fail(`cp: -r not specified; omitting directory '${src}'`);
        let dp = self.abs(dst);
        if (self.vfs.get(dp)?.type === 'dir') dp = `${dp}/${sp.split('/').pop()}`;
        if (!self.canWrite(dp, c.sudo)) return fail(`cp: cannot create regular file '${dst}': Permission denied`);
        const { parent, name } = self.vfs.parentOf(dp);
        if (!parent) return fail(`cp: cannot create regular file '${dst}': No such file or directory`);
        parent.children![name] = { ...self.vfs.clone(n), owner: c.sudo ? 'root' : S.user, mtime: Date.now() };
        return ok();
      },
      mv: (c, a) => {
        const [src, dst] = a.filter((x) => !x.startsWith('-'));
        if (!src || !dst) return fail('mv: missing destination file operand');
        const sp = self.abs(src);
        const n = self.vfs.get(sp);
        if (!n) return fail(`mv: cannot stat '${src}': No such file or directory`);
        let dp = self.abs(dst);
        if (self.vfs.get(dp)?.type === 'dir') dp = `${dp}/${sp.split('/').pop()}`;
        if (!self.canWrite(dp, c.sudo) || !self.canWrite(sp, c.sudo)) return fail(`mv: cannot move '${src}' to '${dst}': Permission denied`);
        const { parent, name } = self.vfs.parentOf(dp);
        if (!parent) return fail(`mv: cannot move '${src}' to '${dst}': No such file or directory`);
        parent.children![name] = n;
        self.vfs.remove(sp);
        return ok();
      },
      rm: (c, a) => {
        const opts = a.filter((x) => x.startsWith('-')).join('');
        for (const p of a.filter((x) => !x.startsWith('-'))) {
          const path = self.abs(p);
          const n = self.vfs.get(path);
          if (!n) {
            if (opts.includes('f')) continue;
            return fail(`rm: cannot remove '${p}': No such file or directory`);
          }
          if (n.type === 'dir' && !/r/i.test(opts)) return fail(`rm: cannot remove '${p}': Is a directory`);
          if (path === '/' || ['/etc', '/bin', '/usr', '/home', '/boot'].includes(path)) return fail(`rm: it is dangerous to operate recursively on '${path}'\nrm: use --no-preserve-root to override this failsafe\n[Route Runner] Nice try. Never run rm -rf on system folders!`);
          if (!self.canWrite(path, c.sudo)) return fail(`rm: cannot remove '${p}': Permission denied`);
          self.vfs.remove(path);
        }
        return ok();
      },
      ln: (_c, a) => {
        const [src, dst] = a.filter((x) => !x.startsWith('-'));
        const n = self.vfs.get(self.abs(src ?? ''));
        if (!n || !dst) return fail(`ln: failed to create symbolic link: No such file or directory`);
        self.vfs.write(self.abs(dst), n.content ?? '', S.user);
        return ok();
      },
      find: (_c, a) => {
        const start = self.abs(a[0] && !a[0].startsWith('-') ? a[0] : '.');
        const nameIdx = a.indexOf('-name');
        const pat = nameIdx >= 0 ? a[nameIdx + 1] : '*';
        const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        const out: string[] = [];
        const walk = (n: FsNode, p: string) => {
          if (re.test(p.split('/').pop() ?? '')) out.push(p);
          if (n.type === 'dir') for (const [k, v] of Object.entries(n.children ?? {})) walk(v, p === '/' ? `/${k}` : `${p}/${k}`);
        };
        const n = self.vfs.get(start);
        if (!n) return fail(`find: '${a[0]}': No such file or directory`);
        walk(n, start);
        return ok(out.join('\n') + '\n');
      },
      stat: (_c, a) => {
        const n = self.vfs.get(self.abs(a[0] ?? ''));
        if (!n) return fail(`stat: cannot statx '${a[0]}': No such file or directory`);
        return ok(`  File: ${a[0]}\n  Size: ${(n.content ?? '').length}\t\tBlocks: 8\tIO Block: 4096   ${n.type === 'dir' ? 'directory' : 'regular file'}\nAccess: (0${modeToOctal(n.mode)}/${n.type === 'dir' ? 'd' : '-'}${n.mode})  Uid: ( 1000/ ${n.owner})   Gid: ( 1000/ ${n.group})\n`);
      },
      file: (_c, a) => {
        const n = self.vfs.get(self.abs(a[0] ?? ''));
        if (!n) return fail(`${a[0]}: cannot open (No such file or directory)`);
        const c = n.content ?? '';
        return ok(`${a[0]}: ${n.type === 'dir' ? 'directory' : c.startsWith('#!') ? 'Bourne-Again shell script, ASCII text executable' : c.trim().startsWith('<') ? 'HTML document, ASCII text' : 'ASCII text'}\n`);
      },
      du: (_c, a) => ok(`${(JSON.stringify(self.vfs.get(self.abs(a.find((x) => !x.startsWith('-')) ?? '.')) ?? {}).length / 1024).toFixed(0)}K\t${a.find((x) => !x.startsWith('-')) ?? '.'}\n`),
      chmod: (c, a) => {
        const [spec, ...paths] = a.filter((x) => !x.startsWith('-R'));
        if (!spec || !paths.length) return fail("chmod: missing operand");
        for (const p of paths) {
          const n = self.vfs.get(self.abs(p));
          if (!n) return fail(`chmod: cannot access '${p}': No such file or directory`);
          if (!c.sudo && S.user !== 'root' && n.owner !== S.user) return fail(`chmod: changing permissions of '${p}': Operation not permitted`);
          if (/^[0-7]{3,4}$/.test(spec)) n.mode = octalToMode(spec.slice(-3));
          else {
            const m = applySymbolic(n.mode, spec);
            if (!m) return fail(`chmod: invalid mode: '${spec}'`);
            n.mode = m;
          }
        }
        self.events.push(`chmod:${spec}`);
        return ok();
      },
      chown: (c, a) => {
        const [spec, ...paths] = a.filter((x) => !x.startsWith('-'));
        const denied = need(c, 'chown');
        if (denied) return fail(`chown: changing ownership of '${paths[0]}': Operation not permitted`);
        const [owner, group] = spec.split(':');
        if (!S.users.some((u) => u.name === owner) && owner !== 'www-data') return fail(`chown: invalid user: '${spec}'`);
        for (const p of paths) {
          const n = self.vfs.get(self.abs(p));
          if (!n) return fail(`chown: cannot access '${p}': No such file or directory`);
          n.owner = owner;
          if (group) n.group = group;
        }
        return ok();
      },
      nano: (c, a) => self.openEditor(c, a),
      vim: (c, a) => self.openEditor(c, a),
      vi: (c, a) => self.openEditor(c, a),
      tar: (_c, a) => {
        const f = a[a.findIndex((x) => x.includes('f')) + 1];
        if (a[0]?.includes('c')) {
          self.vfs.write(self.abs(f ?? 'archive.tar.gz'), '(compressed archive)', S.user);
          return ok();
        }
        return ok(a[0]?.includes('t') ? 'file1\nfile2\n' : '');
      },

      // ---------------------------------------------------------------- system info
      df: () => ok(`Filesystem                         Size  Used Avail Use% Mounted on\ntmpfs                              197M  1.1M  196M   1% /run\n/dev/mapper/ubuntu--vg-ubuntu--lv   ${S.hw.diskGb - 1}G  5.1G   ${S.hw.diskGb - 7}G  23% /\ntmpfs                              982M     0  982M   0% /dev/shm\n/dev/sda2                          2.0G   96M  1.7G   6% /boot\n`),
      free: () => {
        const total = S.hw.ramMb;
        return ok(`               total        used        free      shared  buff/cache   available\nMem:           ${(total / 1024).toFixed(1)}Gi       ${(total * 0.11 / 1024).toFixed(1)}Gi       ${(total * 0.62 / 1024).toFixed(1)}Gi       1.1Mi       ${(total * 0.27 / 1024).toFixed(1)}Gi       ${(total * 0.85 / 1024).toFixed(1)}Gi\nSwap:          2.0Gi          0B       2.0Gi\n`);
      },
      lscpu: () => ok(`Architecture:             x86_64\n  CPU op-mode(s):         32-bit, 64-bit\n  Byte Order:             Little Endian\nCPU(s):                   ${S.hw.cpus}\n  On-line CPU(s) list:    0-${S.hw.cpus - 1}\nVendor ID:                GenuineIntel\n  Model name:             ${S.hw.cpuModel}\n    Thread(s) per core:   1\n    Core(s) per socket:   ${S.hw.cpus}\n    Socket(s):            1\nVirtualization features:\n  Hypervisor vendor:      ${S.profile === 'vm' ? 'Oracle (VirtualBox)' : 'KVM'}\n  Virtualization type:    full\nCaches (sum of all):\n  L1d:                    ${48 * S.hw.cpus} KiB\n  L2:                     ${1.25 * S.hw.cpus} MiB\n  L3:                     8 MiB\n`),
      nproc: () => ok(`${S.hw.cpus}\n`),
      lsblk: () => ok(`NAME                      MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS\nsda                         8:0    0   ${S.hw.diskGb}G  0 disk\n├─sda1                      8:1    0    1M  0 part\n├─sda2                      8:2    0    2G  0 part /boot\n└─sda3                      8:3    0   ${S.hw.diskGb - 2}G  0 part\n  └─ubuntu--vg-ubuntu--lv 252:0    0   ${S.hw.diskGb - 2}G  0 lvm  /\nsr0                        11:0    1 1024M  0 rom\n`),
      ps: (_c, a) => {
        const procs = self.processes();
        if (a.some((x) => x.includes('aux') || x === '-ef'))
          return ok('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' + procs.map((p) => `${p.user.padEnd(12)} ${String(p.pid).padStart(4)}  ${p.cpu.toFixed(1)}  ${p.mem.toFixed(1)} ${String(p.pid * 37).padStart(6)} ${String(p.pid * 5).padStart(5)} ?        Ss   08:00   0:00 ${p.cmd}`).join('\n') + '\n');
        return ok('    PID TTY          TIME CMD\n   1501 pts/0    00:00:00 bash\n   1777 pts/0    00:00:00 ps\n');
      },
      top: () => {
        const procs = self.processes();
        return ok(`top - ${new Date().toTimeString().slice(0, 8)} up  1:12,  1 user,  load average: 0.08, 0.03, 0.01\nTasks: ${procs.length + 100} total,   1 running, ${procs.length + 99} sleeping,   0 stopped,   0 zombie\n%Cpu(s):  1.3 us,  0.7 sy,  0.0 ni, 97.9 id,  0.0 wa,  0.0 hi,  0.1 si,  0.0 st\nMiB Mem :  ${S.hw.ramMb}.0 total,  ${Math.round(S.hw.ramMb * 0.62)}.0 free,   ${Math.round(S.hw.ramMb * 0.11)}.0 used,   ${Math.round(S.hw.ramMb * 0.27)}.0 buff/cache\n\n    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n${procs.slice(0, 12).map((p) => `${String(p.pid).padStart(7)} ${p.user.padEnd(9)} 20   0  ${String(p.pid * 37).padStart(6)}  ${String(p.pid * 5).padStart(5)}   ${String(p.pid * 3).padStart(4)} S  ${p.cpu.toFixed(1).padStart(4)}  ${p.mem.toFixed(1).padStart(4)}   0:00.12 ${p.cmd.split(' ')[0].split('/').pop()}`).join('\n')}\n[Route Runner] (one snapshot - real top refreshes every 3s, q to quit)\n`);
      },
      htop: (c, a, s) => self.commands().top(c, a, s),
      kill: (_c, a) => {
        const pid = Number(a.find((x) => /^\d+$/.test(x)));
        return self.processes().some((p) => p.pid === pid) ? ok() : fail(`bash: kill: (${pid}) - No such process`);
      },
      reboot: (c) => need(c, 'reboot') ?? ok('[Route Runner] System is rebooting... (services set to "enabled" come back, others stay stopped)\n'),
      shutdown: (c) => need(c, 'shutdown') ?? ok('Shutdown scheduled for ' + new Date(Date.now() + 60000).toTimeString().slice(0, 5) + ', use \'shutdown -c\' to cancel.\n'),
      neofetch: () => ok(`${C.red}            .-/+oossssoo+/-.${C.reset}               ${S.user}@${S.hostname}\n${C.red}        \`:+ssssssssssssssssss+:\`${C.reset}           OS: Ubuntu 24.04.3 LTS x86_64\n${C.red}      -+ssssssssssssssssssyyssss+-${C.reset}         Kernel: 6.8.0-48-generic\n${C.red}    .ossssssssssssssssssdMMMNysssso.${C.reset}       Shell: bash 5.2.21\n${C.red}   /ssssssssssshdmmNNmmyNMMMMhssssss/${C.reset}      CPU: ${S.hw.cpuModel} (${S.hw.cpus})\n${C.red}  +ssssssssshmydMMMMMMMNddddyssssssss+${C.reset}     Memory: ${Math.round(S.hw.ramMb * 0.11)}MiB / ${S.hw.ramMb}MiB\n`),

      // ---------------------------------------------------------------- users
      adduser: (c, a) => {
        const name = a.filter((x) => !x.startsWith('-')).pop();
        const d = need(c, 'adduser');
        if (d) return fail('fatal: Only root may add a user or group to the system.');
        if (!name) return fail('fatal: No options given');
        if (a.length === 2 && S.users.some((u) => u.name === a[0]) && S.groups.includes(a[1])) return self.commands().usermod(c, ['-aG', a[1], a[0]], '');
        if (S.users.some((u) => u.name === name)) return fail(`fatal: The user \`${name}' already exists.`);
        if (!/^[a-z_][a-z0-9_-]*$/.test(name)) return fail(`fatal: Please enter a username matching the regular expression configured via the NAME_REGEX configuration variable.`);
        self.addUser(name, true);
        self.pending = { kind: 'adduser', user: name, step: 1 };
        return ok(`info: Adding user \`${name}' ...\ninfo: Selecting UID/GID from range 1000 to 59999 ...\ninfo: Adding new group \`${name}' (${1000 + S.users.length - 1}) ...\ninfo: Adding new user \`${name}' (${1000 + S.users.length - 1}) with group \`${name} (${1000 + S.users.length - 1})' ...\ninfo: Creating home directory \`/home/${name}' ...\ninfo: Copying files from \`/etc/skel' ...\n`);
      },
      useradd: (c, a) => {
        if (need(c, 'useradd')) return fail('useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.');
        const name = a.filter((x) => !x.startsWith('-') && !['/bin/bash'].includes(x)).pop();
        if (!name) return fail('Usage: useradd [options] LOGIN');
        if (S.users.some((u) => u.name === name)) return fail(`useradd: user '${name}' already exists`);
        self.addUser(name, a.includes('-m'));
        self.events.push(`user:add:${name}`);
        return ok(a.includes('-m') ? '' : '[Route Runner hint] Without -m no home folder was created. On Ubuntu, "adduser" is friendlier.\n');
      },
      deluser: (c, a) => {
        if (need(c, 'deluser')) return fail('fatal: Only root may remove a user or group from the system.');
        const name = a.filter((x) => !x.startsWith('-'))[0];
        if (!S.users.some((u) => u.name === name)) return fail(`fatal: The user \`${name}' does not exist.`);
        S.users = S.users.filter((u) => u.name !== name);
        if (a.includes('--remove-home')) self.vfs.remove(`/home/${name}`);
        syncAccountFiles(S);
        return ok(`info: Removing user \`${name}' ...\n`);
      },
      userdel: (c, a) => self.commands().deluser(c, a.map((x) => (x === '-r' ? '--remove-home' : x)), ''),
      groupadd: (c, a) => {
        if (need(c, 'groupadd')) return fail('groupadd: Permission denied.');
        if (S.groups.includes(a[0])) return fail(`groupadd: group '${a[0]}' already exists`);
        S.groups.push(a[0]);
        syncAccountFiles(S);
        return ok();
      },
      usermod: (c, a) => {
        if (need(c, 'usermod')) return fail('usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.');
        const user = a[a.length - 1];
        const u = S.users.find((x) => x.name === user);
        if (!u) return fail(`usermod: user '${user}' does not exist`);
        const gIdx = a.findIndex((x) => /^-a?G$|^-aG$/.test(x));
        if (gIdx >= 0) {
          const groups = a[gIdx + 1].split(',');
          for (const g of groups) if (!S.groups.includes(g)) return fail(`usermod: group '${g}' does not exist`);
          const append = a[gIdx].includes('a');
          u.groups = append ? [...new Set([...u.groups, ...groups])] : [u.name, ...groups];
          if (!append) self.events.push('usermod:no-append');
          syncAccountFiles(S);
          self.events.push(`usermod:${user}:${groups.join(',')}`);
          return ok(append ? '' : '[Route Runner hint] You used -G without -a: the user was REMOVED from every other group (including sudo?). Always use -aG.\n');
        }
        return ok();
      },
      passwd: (c, a) => {
        const target = a[0] ?? S.user;
        if (target !== S.user && !c.sudo && S.user !== 'root') return fail(`passwd: You may not view or modify password information for ${target}.`);
        if (!S.users.some((u) => u.name === target)) return fail(`passwd: user '${target}' does not exist`);
        self.pending = { kind: 'passwd', user: target, step: 1 };
        return ok(target === S.user && !c.sudo ? `Changing password for ${target}.\n` : '');
      },

      // ---------------------------------------------------------------- packages & services
      apt: (c, a) => self.apt(c, a),
      'apt-get': (c, a) => self.apt(c, a),
      dpkg: (_c, a) => (a[0] === '-l' ? ok('Desired=Unknown/Install/Remove/Purge/Hold\n||/ Name           Version      Architecture Description\n+++-==============-============-============-=================\n' + S.packages.map((p) => `ii  ${p.padEnd(15)}${(PACKAGES[p]?.version ?? '1.0').slice(0, 12).padEnd(13)}amd64        ${PACKAGES[p]?.desc ?? 'base system package'}`).join('\n') + '\n') : fail('dpkg: error: need an action option')),
      snap: (c, a) => {
        if (a[0] === 'install' && a[1]) {
          if (need(c, 'snap')) return fail('error: access denied (try with sudo)');
          if (!hasInternet(S.net)) return fail('error: unable to contact snap store');
          if (a[1] === 'kubectl') self.installed('kubectl');
          else S.packages.push(a[1]);
          return ok(`${a[1]} 1.31.2 from Canonical✓ installed\n`);
        }
        if (a[0] === 'list') return ok('Name    Version   Rev    Tracking       Publisher   Notes\ncore22  20240904  1621   latest/stable  canonical✓  base\nlxd     5.21.2    30131  5.21/stable    canonical✓  -\n');
        return fail('error: unknown command, see \'snap help\'.');
      },
      systemctl: (c, a) => self.systemctl(c, a),
      service: (c, a) => self.systemctl(c, [a[1], a[0]]),
      journalctl: (c, a) => {
        const unit = a[a.indexOf('-u') + 1];
        const svc = unit?.replace('.service', '');
        if (svc && S.services[svc])
          return ok(`Nov 19 08:00:01 ${S.hostname} systemd[1]: Starting ${svc}.service - ${SERVICE_INFO[svc]?.desc ?? svc}...\nNov 19 08:00:01 ${S.hostname} systemd[1]: ${S.services[svc].active ? 'Started' : 'Stopped'} ${svc}.service - ${SERVICE_INFO[svc]?.desc ?? svc}.\n`);
        if (svc) return ok('-- No entries --\n');
        return ok(self.vfs.read('/var/log/syslog') ?? '');
      },

      // ---------------------------------------------------------------- networking
      ip: (c, a) => self.ipCmd(c, a),
      ifconfig: () => {
        const n = S.net;
        return ok(`${n.iface}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet ${n.ip ?? '0.0.0.0'}  netmask ${n.prefix ? prefixToMask(n.prefix) : '0.0.0.0'}  broadcast ${n.ip && n.prefix ? broadcastOf(n.ip, prefixToMask(n.prefix)) : '0.0.0.0'}\n        inet6 fe80::a00:27ff:fe4e:66a1  prefixlen 64  scopeid 0x20<link>\n        ether ${n.mac}  txqueuelen 1000  (Ethernet)\n        RX packets 1823  bytes 1966041 (1.9 MB)\n        TX packets 931  bytes 79210 (79.2 KB)\n\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0\n        inet6 ::1  prefixlen 128  scopeid 0x10<host>\n        loop  txqueuelen 1000  (Local Loopback)\n`);
      },
      route: () => ok(`Kernel IP routing table\nDestination     Gateway         Genmask         Flags Metric Ref    Use Iface\n${S.net.gateway ? `0.0.0.0         ${S.net.gateway.padEnd(16)}0.0.0.0         UG    100    0        0 ${S.net.iface}\n` : ''}${S.net.ip ? `${self.netAddr().padEnd(16)}0.0.0.0         ${prefixToMask(S.net.prefix!).padEnd(16)}U     100    0        0 ${S.net.iface}\n` : ''}`),
      ping: (_c, a) => self.ping(a),
      traceroute: (_c, a) => self.traceroute(a),
      tracepath: (_c, a) => self.traceroute(a),
      mtr: (_c, a) => self.traceroute(a),
      ss: (_c, a) => self.sockets(a),
      netstat: (_c, a) => self.sockets(a),
      curl: (_c, a) => self.curl(a),
      wget: (_c, a) => {
        const r = self.curl(a.filter((x) => !x.startsWith('-')));
        if (r.code) return r;
        const name = (a.find((x) => !x.startsWith('-')) ?? 'index.html').split('/').pop() || 'index.html';
        self.vfs.write(self.abs(name.includes('.') ? name : 'index.html'), r.out, S.user);
        return ok(`--${new Date().toISOString().slice(0, 19).replace('T', ' ')}--  ${a[0]}\nHTTP request sent, awaiting response... 200 OK\nLength: ${r.out.length} [text/html]\nSaving to: '${name.includes('.') ? name : 'index.html'}'\n\n'${name}' saved [${r.out.length}/${r.out.length}]\n`);
      },
      dig: (_c, a) => self.dns(a, 'dig'),
      nslookup: (_c, a) => self.dns(a, 'nslookup'),
      host: (_c, a) => self.dns(a, 'host'),
      resolvectl: () => ok(`Global\n       Protocols: -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported\nresolv.conf mode: stub\n\nLink 2 (${S.net.iface})\n    Current Scopes: DNS\n         Protocols: +DefaultRoute -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported\nCurrent DNS Server: ${S.net.dns[0] ?? '(none)'}\n       DNS Servers: ${S.net.dns.join(' ') || '(none)'}\n`),
      nmap: (_c, a) => self.nmap(a),
      netplan: (c, a) => self.netplan(c, a),
      ufw: (c, a) => self.ufw(c, a),
      hostnamectl: (c, a) => {
        if (a[0] === 'set-hostname' && a[1]) {
          if (need(c, 'hostnamectl')) return fail('Could not set static hostname: Access denied');
          S.hostname = a[1];
          self.vfs.write('/etc/hostname', a[1] + '\n', 'root');
          self.events.push(`hostname:${a[1]}`);
          return ok();
        }
        return ok(` Static hostname: ${S.hostname}\n       Icon name: computer-vm\n         Chassis: vm 🖴\n  Virtualization: ${S.profile === 'vm' ? 'oracle' : 'kvm'}\nOperating System: Ubuntu 24.04.3 LTS\n          Kernel: Linux 6.8.0-48-generic\n    Architecture: x86-64\n`);
      },
      ssh: (_c, a) => self.ssh(a),
      'ssh-keygen': () => {
        const dirp = `${self.home}/.ssh`;
        if (!self.vfs.get(dirp)) self.vfs.mkdir(dirp, S.user);
        self.vfs.get(dirp)!.mode = 'rwx------';
        self.vfs.write(`${dirp}/id_ed25519`, '-----BEGIN OPENSSH PRIVATE KEY-----\n(private - never share this!)\n-----END OPENSSH PRIVATE KEY-----\n', S.user);
        self.vfs.get(`${dirp}/id_ed25519`)!.mode = 'rw-------';
        self.vfs.write(`${dirp}/id_ed25519.pub`, `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIRouteRunnerDemoKey ${S.user}@${S.hostname}\n`, S.user);
        self.events.push('ssh-keygen');
        return ok(`Generating public/private ed25519 key pair.\nEnter file in which to save the key (${dirp}/id_ed25519): \nEnter passphrase (empty for no passphrase): \nYour identification has been saved in ${dirp}/id_ed25519\nYour public key has been saved in ${dirp}/id_ed25519.pub\nThe key fingerprint is:\nSHA256:k7Q3m0Jx2Y9vR1sT8uW4pZ6aB5cD3eF2gH1iJ0kL9mN ${S.user}@${S.hostname}\nThe key's randomart image is:\n+--[ED25519 256]--+\n|        .o+=*B=o.|\n|         .=+o*=+ |\n|        .  =o=o. |\n|       . ...+..  |\n|        S .o .   |\n+----[SHA256]-----+\n`);
      },
      'ssh-copy-id': (_c, a) => ok(`/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: "${self.home}/.ssh/id_ed25519.pub"\nNumber of key(s) added: 1\n\nNow try logging into the machine, with:   "ssh '${a[a.length - 1]}'"\n`),
      scp: (_c, a) => ok(`${(a[0] ?? 'file').split('/').pop()}                                  100%  220   180.2KB/s   00:00\n`),
      tcpdump: (c, a) => (need(c, 'tcpdump') ? fail('tcpdump: enp0s3: You don\'t have permission to capture on that device') : ok(`tcpdump: verbose output suppressed, use -v[v]... for full protocol decode\nlistening on ${a[a.indexOf('-i') + 1] ?? S.net.iface}, link-type EN10MB (Ethernet), snapshot length 262144 bytes\n08:00:01.100 IP ${S.net.ip}.22 > 192.168.56.1.53122: Flags [P.], seq 1:53, ack 1, win 501, length 52\n08:00:01.300 ARP, Request who-has ${S.net.gateway ?? '192.168.56.1'} tell ${S.net.ip}, length 28\n08:00:01.301 ARP, Reply ${S.net.gateway ?? '192.168.56.1'} is-at 52:54:00:12:35:02, length 46\n08:00:02.000 IP ${S.net.ip}.41234 > ${S.net.dns[0] ?? '8.8.8.8'}.53: 4521+ A? ubuntu.com. (28)\n4 packets captured\n`)),
      iperf3: (_c, a) => (a.includes('-s') ? ok('-----------------------------------------------------------\nServer listening on 5201 (test #1)\n-----------------------------------------------------------\n') : ok(`Connecting to host ${a[a.indexOf('-c') + 1]}, port 5201\n[ ID] Interval           Transfer     Bitrate\n[  5]   0.00-10.00  sec  1.09 GBytes   938 Mbits/sec                  sender\n[  5]   0.00-10.00  sec  1.09 GBytes   936 Mbits/sec                  receiver\n`)),
      whois: (_c, a) => ok(`Domain Name: ${(a[0] ?? '').toUpperCase()}\nRegistrar: Example Registrar\nName Server: NS1.EXAMPLE.NET\n`),
      crontab: (_c, a) => {
        const path = `/var/spool/cron/crontabs/${S.user}`;
        if (a[0] === '-l') return self.vfs.read(path) ? ok(self.vfs.read(path)!) : fail(`no crontab for ${S.user}`);
        if (a[0] === '-e') {
          if (!self.vfs.get('/var/spool/cron/crontabs')) self.vfs.mkdir('/var/spool/cron/crontabs', 'root', true);
          if (!self.vfs.get(path)) self.vfs.write(path, '# m h  dom mon dow   command\n# 0 2 * * * /home/' + S.user + '/scripts/backup.sh\n', S.user);
          self.editSudo = true;
          self.events.push(`edit:${path}`);
          return ok();
        }
        return fail('usage: crontab [-l | -e]');
      },
      bash: (_c, a) => (a[0] ? self.runScript(a[0], a.slice(1), true) : ok()),
      sh: (_c, a) => (a[0] ? self.runScript(a[0], a.slice(1), true) : ok()),
      source: () => ok(),
      python3: (_c, a) => (a[0] === '--version' || a[0] === '-V' ? ok('Python 3.12.3\n') : a[0] === '-c' ? ok(`${(a[1] ?? '').match(/print\(["'](.*)["']\)/)?.[1] ?? ''}\n`) : ok('Python 3.12.3 (main, Nov  6 2024) [GCC 13.2.0] on linux\n[Route Runner] Interactive Python is not simulated - try: python3 -c "print(\'hi\')"\n')),
      python: () => fail("Command 'python' not found, did you mean:\n  command 'python3' from deb python3\n  command 'python' from deb python-is-python3"),

      // ---------------------------------------------------------------- cloud & HPC
      docker,
      kubectl,
      k: kubectl,
      aws,
      terraform,
      ansible,
      'ansible-playbook': ansiblePlaybook,
      minikube: (_c, a) => (a[0] === 'status' ? ok('minikube\ntype: Control Plane\nhost: Running\nkubelet: Running\napiserver: Running\nkubeconfig: Configured\n') : ok('😄  minikube v1.34.0 on Ubuntu 24.04\n✨  Using the docker driver\n🏄  Done! kubectl is now configured to use "minikube" cluster\n')),
      helm: (_c, a) => (a[0] === 'version' ? ok('version.BuildInfo{Version:"v3.16.2"}\n') : ok(`NAME: ${a[1] ?? 'release'}\nSTATUS: deployed\nREVISION: 1\n`)),
      git: (_c, a) => self.git(a),
      sbatch,
      squeue,
      sinfo,
      scancel,
      sacct,
      srun,
      mpirun,
      module: moduleCmd,
      ml: (c, a) => moduleCmd(c, a.length ? ['load', ...a] : ['list'], ''),
      'nvidia-smi': nvidiaSmi,
    };
    this._commands = cmds;
    return cmds;
  }

  // ------------------------------------------------------------------ helpers
  private addUser(name: string, home: boolean) {
    const uid = 1000 + this.s.users.filter((u) => u.uid >= 1000).length;
    this.s.users.push({ name, uid, groups: [name, 'users'], password: '!', shell: '/bin/bash' });
    if (!this.s.groups.includes(name)) this.s.groups.push(name);
    if (home) {
      this.vfs.get('/home')!.children![name] = dir(name, 'rwxr-x---', { '.bashrc': file('# ~/.bashrc\n', name), '.profile': file('# ~/.profile\n', name) });
    }
    syncAccountFiles(this.s);
  }

  private openEditor(c: ShellCtx, a: string[]): CmdResult {
    const p = a.find((x) => !x.startsWith('-'));
    if (!p) return fail('Usage: nano FILE  (Route Runner opens an editor window)');
    const path = this.abs(p);
    this.editSudo = c.sudo || this.s.user === 'root';
    if (!this.canRead(path, this.editSudo)) return fail(`[ Error reading ${p}: Permission denied ]`);
    this.events.push(`edit:${path}${this.canWrite(path, this.editSudo) ? '' : ':ro'}`);
    return ok();
  }

  private processes() {
    const list = [
      { pid: 1, user: 'root', cmd: '/sbin/init splash', cpu: 0, mem: 0.6 },
      { pid: 412, user: 'root', cmd: '/usr/lib/systemd/systemd-journald', cpu: 0, mem: 0.8 },
      { pid: 612, user: 'systemd+', cmd: '/usr/lib/systemd/systemd-networkd', cpu: 0, mem: 0.4 },
      { pid: 615, user: 'systemd+', cmd: '/usr/lib/systemd/systemd-resolved', cpu: 0, mem: 0.6 },
      { pid: 801, user: 'root', cmd: '/usr/sbin/cron -f -P', cpu: 0, mem: 0.1 },
    ];
    let pid = 900;
    for (const [svc, st] of Object.entries(this.s.services)) {
      if (!st.active || list.some((p) => p.cmd.includes(svc))) continue;
      const info = SERVICE_INFO[svc];
      list.push({ pid: pid++ * 2, user: svc === 'mysql' ? 'mysql' : svc === 'postgresql' ? 'postgres' : 'root', cmd: `/usr/sbin/${info?.proc ?? svc}`, cpu: 0.1, mem: svc === 'mysql' ? 18.2 : 1.1 });
    }
    list.push({ pid: 1501, user: this.s.user, cmd: '-bash', cpu: 0, mem: 0.2 });
    return list;
  }

  private installed(pkg: string) {
    if (!this.s.packages.includes(pkg)) this.s.packages.push(pkg);
    const info = PACKAGES[pkg];
    info?.setup?.(this.s);
    if (info?.service) this.s.services[info.service] = { active: true, enabled: true };
    if (info?.group && !this.s.groups.includes(info.group)) {
      this.s.groups.push(info.group);
      syncAccountFiles(this.s);
    }
    this.events.push(`apt:install:${pkg}`);
  }

  private apt(c: ShellCtx, a: string[]): CmdResult {
    const [sub, ...rest] = a.filter((x) => !x.startsWith('-'));
    const yes = a.includes('-y') || a.includes('--yes');
    const root = c.sudo || this.s.user === 'root';
    const lockErr = 'E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?';
    const online = hasInternet(this.s.net);
    const noNet = `Ign:1 http://archive.ubuntu.com/ubuntu noble InRelease\nErr:1 http://archive.ubuntu.com/ubuntu noble InRelease\n  Temporary failure resolving 'archive.ubuntu.com'\nW: Failed to fetch http://archive.ubuntu.com/ubuntu/dists/noble/InRelease  Temporary failure resolving 'archive.ubuntu.com'\nW: Some index files failed to download. They have been ignored, or old ones used instead.\n[Route Runner hint] This VM has no internet. Check the VM network mode (NAT/Bridged have internet; Host-only/Internal do not), the default gateway (ip r) and DNS.`;
    switch (sub) {
      case 'update':
        if (!root) return fail('Reading package lists... Done\n' + lockErr.replace('lock-frontend', 'lists/lock'), 100);
        if (!online) return { out: '', err: noNet, code: 100 };
        this.s.aptUpdated = true;
        this.events.push('apt:update');
        return ok('Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nGet:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]\nGet:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]\nGet:4 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages [693 kB]\nFetched 945 kB in 2s (472 kB/s)\nReading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n3 packages can be upgraded. Run \'apt list --upgradable\' to see them.\n');
      case 'upgrade':
      case 'full-upgrade':
        if (!root) return fail(lockErr, 100);
        if (!online) return { out: '', err: noNet, code: 100 };
        return ok('Reading package lists... Done\nCalculating upgrade... Done\nThe following packages will be upgraded:\n  libssl3t64 openssl tzdata\n3 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\nSetting up openssl (3.0.13-0ubuntu3.4) ...\n');
      case 'install': {
        if (!rest.length) return fail('E: No packages specified for installation (try: sudo apt install nginx)');
        if (!root) return fail(lockErr, 100);
        const unknown = rest.find((p) => !PACKAGES[p] && !['curl', 'vim', 'nano', 'python3', 'kubectl'].includes(p));
        if (unknown) return fail(`Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nE: Unable to locate package ${unknown}`, 100);
        const fresh = rest.filter((p) => !this.s.packages.includes(p));
        if (!fresh.length) return ok(`Reading package lists... Done\n${rest.map((p) => `${p} is already the newest version (${PACKAGES[p]?.version ?? '1.0'}).`).join('\n')}\n0 upgraded, 0 newly installed, 0 to remove and 3 not upgraded.\n`);
        if (!online) return { out: 'Reading package lists... Done\n', err: `E: Failed to fetch http://archive.ubuntu.com/ubuntu/pool/main/${fresh[0][0]}/${fresh[0]}  Temporary failure resolving 'archive.ubuntu.com'\nE: Unable to fetch some archives, maybe run apt-get update or try with --fix-missing?\n[Route Runner hint] No internet in this VM network mode.`, code: 100 };
        const total = fresh.reduce((s, p) => s + (PACKAGES[p]?.sizeKb ?? 500), 0);
        const head = `Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nThe following NEW packages will be installed:\n  ${fresh.join(' ')}\n0 upgraded, ${fresh.length} newly installed, 0 to remove and 3 not upgraded.\nNeed to get ${(total / 3).toFixed(0)} kB of archives.\nAfter this operation, ${total.toLocaleString('en-US')} kB of additional disk space will be used.\n`;
        if (!yes) {
          this.pending = { kind: 'apt', line: `${c.sudo ? 'sudo ' : ''}apt install ${rest.join(' ')}` };
          return ok(head);
        }
        for (const p of fresh) this.installed(p);
        return ok(head + fresh.map((p, k) => `Get:${k + 1} http://archive.ubuntu.com/ubuntu noble-updates/main amd64 ${p} amd64 ${PACKAGES[p]?.version ?? '1.0'}`).join('\n') + '\n' + fresh.map((p) => `Setting up ${p} (${PACKAGES[p]?.version ?? '1.0'}) ...${PACKAGES[p]?.service ? `\nCreated symlink /etc/systemd/system/multi-user.target.wants/${PACKAGES[p]!.service}.service → /usr/lib/systemd/system/${PACKAGES[p]!.service}.service.` : ''}`).join('\n') + '\nProcessing triggers for man-db (2.12.0-4build2) ...\n');
      }
      case 'remove':
      case 'purge':
        if (!root) return fail(lockErr, 100);
        for (const p of rest) {
          this.s.packages = this.s.packages.filter((x) => x !== p);
          const svc = PACKAGES[p]?.service;
          if (svc) delete this.s.services[svc];
        }
        return ok(`Reading package lists... Done\nThe following packages will be REMOVED:\n  ${rest.join(' ')}\n0 upgraded, 0 newly installed, ${rest.length} to remove and 3 not upgraded.\nRemoving ${rest[0]} ...\n`);
      case 'list':
        if (a.includes('--installed')) return ok('Listing... Done\n' + this.s.packages.map((p) => `${p}/noble,now ${PACKAGES[p]?.version ?? '1.0'} amd64 [installed]`).join('\n') + '\n');
        if (a.includes('--upgradable')) return ok('Listing... Done\nlibssl3t64/noble-updates 3.0.13-0ubuntu3.4 amd64 [upgradable from: 3.0.13-0ubuntu3.1]\nopenssl/noble-updates 3.0.13-0ubuntu3.4 amd64 [upgradable from: 3.0.13-0ubuntu3.1]\ntzdata/noble-updates 2024b-0ubuntu0.24.04 all [upgradable from: 2024a-3ubuntu1.1]\n');
        return fail('Usage: apt list --installed | --upgradable');
      case 'search':
        return ok(Object.entries(PACKAGES).filter(([k, v]) => k.includes(rest[0] ?? '') || v.desc.includes(rest[0] ?? '')).map(([k, v]) => `${k}/noble ${v.version} amd64\n  ${v.desc}\n`).join('\n'));
      case 'show':
        return PACKAGES[rest[0]] ? ok(`Package: ${rest[0]}\nVersion: ${PACKAGES[rest[0]].version}\nInstalled-Size: ${PACKAGES[rest[0]].sizeKb} kB\nDescription: ${PACKAGES[rest[0]].desc}\n`) : fail(`N: Unable to locate package ${rest[0]}`);
      case 'autoremove':
        return ok('Reading package lists... Done\n0 upgraded, 0 newly installed, 0 to remove and 3 not upgraded.\n');
      default:
        return ok('apt 2.7.14 (amd64)\nUsage: apt [options] command\n\nMost used commands:\n  list - list packages based on package names\n  search - search in package descriptions\n  show - show package details\n  install - install packages\n  remove - remove packages\n  update - update list of available packages\n  upgrade - upgrade the system by installing/upgrading packages\n');
    }
  }

  private systemctl(c: ShellCtx, a: string[]): CmdResult {
    const [verb, unitRaw] = a.filter((x) => !x.startsWith('-'));
    const unit = (unitRaw ?? '').replace('.service', '').replace(/^sshd$/, 'ssh');
    const st = this.s.services[unit];
    const info = SERVICE_INFO[unit];
    const root = c.sudo || this.s.user === 'root';
    if (!verb || verb === 'list-units') return ok('  UNIT                         LOAD   ACTIVE SUB     DESCRIPTION\n' + Object.entries(this.s.services).map(([k, v]) => `  ${(k + '.service').padEnd(29)}loaded ${v.active ? 'active   running' : 'inactive dead   '} ${SERVICE_INFO[k]?.desc ?? k}`).join('\n') + '\n');
    if (!unit) return fail(`Too few arguments.`);
    if (!st) return fail(verb === 'status' ? `Unit ${unit}.service could not be found.` : `Failed to ${verb} ${unit}.service: Unit ${unit}.service not found.`, verb === 'status' ? 4 : 5);
    if (verb === 'status') {
      const since = new Date(Date.now() - 120000).toString().slice(0, 24);
      return { out: `${st.active ? C.green + '●' + C.reset : '○'} ${unit}.service - ${info?.desc ?? unit}\n     Loaded: loaded (/usr/lib/systemd/system/${unit}.service; ${st.enabled ? 'enabled' : 'disabled'}; preset: enabled)\n     Active: ${st.active ? `${C.green}active (running)${C.reset} since ${since} SAST; 2min ago` : 'inactive (dead)'}\n${st.active ? `   Main PID: ${2000 + unit.length * 13} (${info?.proc ?? unit})\n      Tasks: 3 (limit: 4558)\n     Memory: 2.4M (peak: 2.6M)\n        CPU: 21ms\n     CGroup: /system.slice/${unit}.service\n             └─${2000 + unit.length * 13} "${info?.proc ?? unit}"\n` : ''}`, code: st.active ? 0 : 3 };
    }
    if (verb === 'is-active') return { out: (st.active ? 'active' : 'inactive') + '\n', code: st.active ? 0 : 3 };
    if (verb === 'is-enabled') return ok((st.enabled ? 'enabled' : 'disabled') + '\n');
    if (!root) return fail(`==== AUTHENTICATING FOR org.freedesktop.systemd1.manage-units ====\nAuthentication is required to ${verb} '${unit}.service'.\nFailed to ${verb} ${unit}.service: Access denied\n[Route Runner hint] Managing services needs root: sudo systemctl ${verb} ${unit}`);
    switch (verb) {
      case 'start':
      case 'restart':
      case 'reload':
        if (unit === 'nginx' && this.s.services.apache2?.active) return fail(`Job for nginx.service failed because the control process exited with error code.\nSee "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.\n[Route Runner hint] Port 80 is already used by apache2. Two web servers cannot listen on the same port: stop one of them.`);
        if (unit === 'apache2' && this.s.services.nginx?.active) return fail(`Job for apache2.service failed because the control process exited with error code.\n[Route Runner hint] (98)Address already in use: AH00072: make_sock: could not bind to address 0.0.0.0:80 - nginx is using it.`);
        st.active = true;
        this.events.push(`service:start:${unit}`);
        return ok();
      case 'stop':
        st.active = false;
        this.events.push(`service:stop:${unit}`);
        return ok();
      case 'enable':
        st.enabled = true;
        if (a.includes('--now')) st.active = true;
        this.events.push(`service:enable:${unit}`);
        return ok(`Synchronizing state of ${unit}.service with SysV service script with /usr/lib/systemd/systemd-sysv-install.\nCreated symlink /etc/systemd/system/multi-user.target.wants/${unit}.service → /usr/lib/systemd/system/${unit}.service.\n`);
      case 'disable':
        st.enabled = false;
        return ok(`Removed "/etc/systemd/system/multi-user.target.wants/${unit}.service".\n`);
      default:
        return fail(`Unknown command verb '${verb}'.`);
    }
  }

  private netAddr(): string {
    const n = this.s.net;
    return n.ip && n.prefix !== undefined ? networkOf(n.ip, n.prefix) : '';
  }

  private ipCmd(_c: ShellCtx, a: string[]): CmdResult {
    const n = this.s.net;
    const sub = a[0] ?? '';
    const net = n.ip && n.prefix !== undefined ? `${networkOf(n.ip, n.prefix)}/${n.prefix}` : '';
    const docker0 = this.s.packages.includes('docker.io') && this.s.services.docker?.active;
    if ('address'.startsWith(sub) && sub || sub === 'addr' || sub === 'a') {
      if (a[1] === 'add' && !_c.sudo && this.s.user !== 'root') return fail('RTNETLINK answers: Operation not permitted');
      const L = [
        '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000',
        '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00',
        '    inet 127.0.0.1/8 scope host lo',
        '       valid_lft forever preferred_lft forever',
        '    inet6 ::1/128 scope host noprefixroute',
        '       valid_lft forever preferred_lft forever',
        `2: ${n.iface}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000`,
        `    link/ether ${n.mac} brd ff:ff:ff:ff:ff:ff`,
      ];
      if (n.ip) L.push(`    inet ${n.ip}/${n.prefix} metric 100 brd ${broadcastOf(n.ip, prefixToMask(n.prefix!))} scope global ${n.dhcp ? 'dynamic ' : ''}${n.iface}`, `       valid_lft ${n.dhcp ? '86094sec' : 'forever'} preferred_lft ${n.dhcp ? '86094sec' : 'forever'}`);
      L.push('    inet6 fe80::a00:27ff:fe4e:66a1/64 scope link', '       valid_lft forever preferred_lft forever');
      if (docker0) L.push('3: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN group default', '    link/ether 02:42:5f:1c:9a:01 brd ff:ff:ff:ff:ff:ff', '    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0', '       valid_lft forever preferred_lft forever');
      this.events.push('ip:a');
      return ok(L.join('\n') + '\n');
    }
    if (sub === 'r' || 'route'.startsWith(sub) && sub) {
      const L: string[] = [];
      if (n.gateway && n.ip) L.push(`default via ${n.gateway} dev ${n.iface} proto ${n.dhcp ? 'dhcp' : 'static'} src ${n.ip} metric 100`);
      if (net) L.push(`${net} dev ${n.iface} proto kernel scope link src ${n.ip} metric 100`);
      if (docker0) L.push('172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown');
      this.events.push('ip:r');
      return ok(L.join('\n') + (L.length ? '\n' : ''));
    }
    if (sub === 'l' || 'link'.startsWith(sub) && sub) return ok(`1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n2: ${n.iface}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000\n    link/ether ${n.mac} brd ff:ff:ff:ff:ff:ff\n`);
    if (!sub) return fail('Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\nwhere  OBJECT := { address | link | route | neigh }\nTry: ip a, ip r, ip link, ip neigh');
    if (sub === 'n' || 'neighbour'.startsWith(sub) || sub === 'neigh') return ok(n.gateway ? `${n.gateway} dev ${n.iface} lladdr 52:54:00:12:35:02 REACHABLE\n` : '');
    return fail(`Object "${sub}" is unknown, try "ip help".`);
  }

  private resolve(host: string): { ip?: string; err?: string } {
    if (isIPv4(host)) return { ip: host };
    if (host === 'localhost' || host === this.s.hostname) return { ip: host === 'localhost' ? '127.0.0.1' : '127.0.1.1' };
    const hosts = this.vfs.read('/etc/hosts') ?? '';
    for (const l of hosts.split('\n')) {
      const [ip, ...names] = l.trim().split(/\s+/);
      if (names.includes(host)) return { ip };
    }
    if (!hasInternet(this.s.net) || !this.s.net.dns.length) return { err: `${host}: Temporary failure in name resolution` };
    if (PUBLIC_HOSTS[host]) return { ip: PUBLIC_HOSTS[host] };
    return { err: `${host}: Name or service not known` };
  }

  private reach(ip: string): 'ok' | 'unreachable' | 'timeout' | 'nonet' {
    const n = this.s.net;
    if (ip.startsWith('127.')) return 'ok';
    if (!n.ip) return 'nonet';
    if (ip === n.ip) return 'ok';
    const mask = prefixToMask(n.prefix!);
    if (inNetwork(ip, n.ip, mask)) {
      const known = [n.gateway, n.mode === 'host-only' ? '192.168.56.1' : undefined, n.mode === 'nat' ? '10.0.2.3' : undefined, n.mode === 'bridged' ? '192.168.1.10' : undefined].filter(Boolean);
      return known.includes(ip) ? 'ok' : 'unreachable';
    }
    if (!n.gateway) return 'nonet';
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return 'timeout';
    return hasInternet(n) ? 'ok' : 'timeout';
  }

  private ping(a: string[]): CmdResult {
    const cIdx = a.indexOf('-c');
    const count = cIdx >= 0 ? Math.min(20, Number(a[cIdx + 1]) || 4) : 4;
    const host = a.filter((x, k) => !x.startsWith('-') && a[k - 1] !== '-c')[0];
    if (!host) return fail('ping: usage error: Destination address required');
    const r = this.resolve(host);
    if (!r.ip) return fail(`ping: ${r.err}`, 2);
    const state = this.reach(r.ip);
    if (state === 'nonet') return fail('ping: connect: Network is unreachable', 2);
    const head = `PING ${host} (${r.ip}) 56(84) bytes of data.\n`;
    const local = r.ip.startsWith('127.') || r.ip === this.s.net.ip;
    if (state === 'ok') {
      const ms = local ? 0.04 : r.ip === this.s.net.gateway ? 0.4 : 14;
      const lines = Array.from({ length: count }, (_, k) => `64 bytes from ${r.ip}: icmp_seq=${k + 1} ttl=${local ? 64 : r.ip === this.s.net.gateway ? 64 : 117} time=${(ms + (k % 3) * ms * 0.1).toFixed(ms < 1 ? 3 : 1)} ms`);
      this.events.push(`linux:ping:ok:${r.ip}`);
      return ok(head + lines.join('\n') + `\n\n--- ${host} ping statistics ---\n${count} packets transmitted, ${count} received, 0% packet loss, time ${count * 1001 - 1000}ms\nrtt min/avg/max/mdev = ${ms.toFixed(3)}/${(ms * 1.05).toFixed(3)}/${(ms * 1.2).toFixed(3)}/${(ms * 0.05).toFixed(3)} ms\n` + (cIdx < 0 ? '[Route Runner] Linux ping runs forever without -c. We stopped after 4 (Ctrl+C on a real box).\n' : ''));
    }
    if (state === 'unreachable') return { out: head + Array.from({ length: count }, (_, k) => `From ${this.s.net.ip} icmp_seq=${k + 1} Destination Host Unreachable`).join('\n') + `\n\n--- ${host} ping statistics ---\n${count} packets transmitted, 0 received, +${count} errors, 100% packet loss\n`, code: 1 };
    return { out: head + `\n--- ${host} ping statistics ---\n${count} packets transmitted, 0 received, 100% packet loss, time ${count * 1000}ms\n`, code: 1 };
  }

  private traceroute(a: string[]): CmdResult {
    const host = a.find((x) => !x.startsWith('-'));
    if (!host) return fail('Usage: traceroute host');
    const r = this.resolve(host);
    if (!r.ip) return fail(`${host}: ${r.err}\nCannot handle "host" cmdline arg \`${host}' on position 1 (argc 1)`);
    const n = this.s.net;
    const hops = [n.gateway ?? '*'];
    if (this.reach(r.ip) === 'ok' && !r.ip.startsWith('127.')) hops.push('196.25.1.1', '105.233.0.10', '72.14.215.85', r.ip);
    else hops.push('*', '*');
    return ok(`traceroute to ${host} (${r.ip}), 30 hops max, 60 byte packets\n` + hops.map((h, k) => ` ${k + 1}  ${h === '*' ? '* * *' : `${h} (${h})  ${(1 + k * 3.1).toFixed(3)} ms  ${(1.2 + k * 3).toFixed(3)} ms  ${(1.1 + k * 3.2).toFixed(3)} ms`}`).join('\n') + '\n');
  }

  private sockets(a: string[]): CmdResult {
    const rows: string[] = [];
    for (const [svc, st] of Object.entries(this.s.services)) {
      if (!st.active) continue;
      for (const p of SERVICE_INFO[svc]?.ports ?? []) {
        const [proto, addr] = p.split(' ');
        if (a.some((x) => x.includes('t')) && proto !== 'tcp' && !a.some((x) => x.includes('u'))) continue;
        rows.push(`${proto.padEnd(6)}${proto === 'tcp' ? 'LISTEN' : 'UNCONN'} 0      ${proto === 'tcp' ? '4096' : '0   '}   ${addr.padEnd(22)}0.0.0.0:*     ${a.some((x) => x.includes('p')) ? (this.s.user === 'root' ? `users:(("${SERVICE_INFO[svc].proc}",pid=${1000 + svc.length * 13},fd=6))` : '') : ''}`);
      }
    }
    return ok(`Netid State  Recv-Q Send-Q Local Address:Port    Peer Address:Port Process\n${rows.join('\n')}\n`);
  }

  private curl(a: string[]): CmdResult {
    const url = a.find((x) => !x.startsWith('-')) ?? '';
    if (!url) return fail("curl: try 'curl --help' or 'curl --manual' for more information");
    const m = url.match(/^(?:(https?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/);
    if (!m) return fail(`curl: (3) URL rejected: Bad hostname`, 3);
    const host = m[2];
    const port = Number(m[3] ?? (m[1] === 'https' ? 443 : 80));
    const headOnly = a.includes('-I');
    const r = this.resolve(host);
    if (!r.ip) return fail(`curl: (6) Could not resolve host: ${host}`, 6);
    const local = r.ip.startsWith('127.') || r.ip === this.s.net.ip;
    if (local) {
      const web = this.s.services.nginx?.active ? 'nginx' : this.s.services.apache2?.active ? 'apache2' : undefined;
      const k8sNode = this.s.k8s?.services.find((s) => s.nodePort === port);
      const dockerPub = this.s.docker?.containers.find((c) => c.status === 'running' && c.ports.startsWith(`0.0.0.0:${port}->`));
      if (dockerPub) {
        this.events.push('curl:docker:ok');
        return ok(headOnly ? 'HTTP/1.1 200 OK\nServer: nginx/1.27.3\n' : `<!DOCTYPE html>\n<html><head><title>Welcome to nginx!</title></head>\n<body><h1>Welcome to nginx!</h1><p>Served from container ${dockerPub.name}</p></body></html>\n`);
      }
      if (k8sNode) return ok(`<h1>Hello from Kubernetes service ${k8sNode.name}!</h1>\n`);
      if (!web || port !== 80) return fail(`curl: (7) Failed to connect to ${host} port ${port} after 0 ms: Couldn't connect to server`, 7);
      const page = this.vfs.read('/var/www/html/index.html') ?? this.vfs.read('/var/www/html/index.nginx-debian.html') ?? '';
      this.events.push('curl:local:ok');
      if (headOnly) return ok(`HTTP/1.1 200 OK\nServer: ${web === 'nginx' ? 'nginx/1.24.0 (Ubuntu)' : 'Apache/2.4.58 (Ubuntu)'}\nContent-Type: text/html\nContent-Length: ${page.length}\n`);
      return ok(page);
    }
    if (this.reach(r.ip) !== 'ok') return fail(`curl: (28) Failed to connect to ${host} port ${port} after 10001 ms: Timeout was reached`, 28);
    if (host === 'ifconfig.me') return ok('102.66.143.27\n');
    if (headOnly) return ok('HTTP/2 200\ncontent-type: text/html; charset=UTF-8\nserver: cloudflare\n');
    return ok(`<!doctype html><html><head><title>${host}</title></head><body>(page from ${host} - ${r.ip})</body></html>\n`);
  }

  private dns(a: string[], tool: 'dig' | 'nslookup' | 'host'): CmdResult {
    const name = a.find((x) => !x.startsWith('-') && !x.startsWith('@') && x !== '+short');
    if (!name) return fail(`${tool}: missing name`);
    const r = this.resolve(name);
    const server = this.s.net.dns[0] ?? '127.0.0.53';
    if (!r.ip) {
      if (tool === 'dig') return ok(`;; communications error to 127.0.0.53#53: timed out\n;; no servers could be reached\n`);
      return fail(tool === 'host' ? `Host ${name} not found: 2(SERVFAIL)` : `;; connection timed out; no servers could be reached`);
    }
    if (tool === 'host') return ok(`${name} has address ${r.ip}\n`);
    if (tool === 'nslookup') return ok(`Server:\t\t127.0.0.53\nAddress:\t127.0.0.53#53\n\nNon-authoritative answer:\nName:\t${name}\nAddress: ${r.ip}\n`);
    if (a.includes('+short')) return ok(`${r.ip}\n`);
    return ok(`; <<>> DiG 9.18.28-0ubuntu0.24.04.1-Ubuntu <<>> ${name}\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 4242\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1\n\n;; QUESTION SECTION:\n;${name}.\t\t\tIN\tA\n\n;; ANSWER SECTION:\n${name}.\t\t300\tIN\tA\t${r.ip}\n\n;; Query time: 12 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP) (upstream ${server})\n;; MSG SIZE  rcvd: 55\n`);
  }

  private nmap(a: string[]): CmdResult {
    const target = a.find((x) => !x.startsWith('-')) ?? 'localhost';
    const r = this.resolve(target);
    if (!r.ip) return fail(`Failed to resolve "${target}".`);
    const local = r.ip.startsWith('127.') || r.ip === this.s.net.ip;
    const ports: [number, string, string][] = [];
    if (local) {
      for (const [svc, st] of Object.entries(this.s.services)) {
        if (!st.active) continue;
        for (const p of SERVICE_INFO[svc]?.ports ?? []) {
          const [proto, addr] = p.split(' ');
          if (proto !== 'tcp' || (addr.startsWith('127.') && !r.ip.startsWith('127.'))) continue;
          const port = Number(addr.split(':').pop());
          ports.push([port, 'open', { 22: 'ssh', 80: 'http', 21: 'ftp', 445: 'microsoft-ds', 3306: 'mysql', 5432: 'postgresql', 53: 'domain', 9100: 'jetdirect' }[port] ?? 'unknown']);
        }
      }
    } else if (r.ip === this.s.net.gateway) ports.push([53, 'open', 'domain']);
    else if (this.reach(r.ip) === 'ok') ports.push([80, 'open', 'http'], [443, 'open', 'https']);
    else return ok(`Starting Nmap 7.94SVN ( https://nmap.org )\nNote: Host seems down. If it is really up, but blocking our ping probes, try -Pn\nNmap done: 1 IP address (0 hosts up) scanned in 3.04 seconds\n`);
    this.events.push('nmap');
    return ok(`Starting Nmap 7.94SVN ( https://nmap.org ) at ${new Date().toISOString().slice(0, 16)}\nNmap scan report for ${target} (${r.ip})\nHost is up (0.00010s latency).\nNot shown: ${1000 - ports.length} closed tcp ports (conn-refused)\nPORT     STATE SERVICE\n${ports.sort((x, y) => x[0] - y[0]).map(([p, s, n]) => `${(p + '/tcp').padEnd(9)}${s.padEnd(6)}${n}`).join('\n')}\n\nNmap done: 1 IP address (1 host up) scanned in 0.08 seconds\n[Route Runner] Only scan machines you own or have written permission to test.\n`);
  }

  private netplan(c: ShellCtx, a: string[]): CmdResult {
    const sub = a[0];
    if (sub === 'get' || sub === 'status') return ok(this.vfs.read('/etc/netplan/50-cloud-init.yaml') ?? '');
    if (sub !== 'apply' && sub !== 'try' && sub !== 'generate') return fail('usage: netplan [-h] [--debug]  ...\n\nAvailable commands:\n    apply      Apply current netplan config to running system\n    generate   Generate backend specific configuration files\n    get        Get a setting by specifying a nested key\n    try        Try to apply a new netplan config with automatic rollback');
    if (!c.sudo && this.s.user !== 'root') return fail('Permission denied (try sudo)');
    const dirNode = this.vfs.get('/etc/netplan');
    const files = Object.entries(dirNode?.children ?? {}).filter(([k]) => k.endsWith('.yaml'));
    if (!files.length) return fail('netplan: no configuration files found in /etc/netplan');
    const [fname, f] = files[0];
    let y;
    try {
      if ((f.content ?? '').includes('\t')) throw new YamlError('found a tab character. YAML needs SPACES');
      y = parseYaml(f.content ?? '');
    } catch (e) {
      return fail(`/etc/netplan/${fname}: Invalid YAML: ${(e as Error).message}`);
    }
    const eths = yget(y, 'network.ethernets');
    if (!eths || typeof eths !== 'object' || Array.isArray(eths)) return fail(`/etc/netplan/${fname}: Error in network definition: expected "network: ethernets:"`);
    const name = Object.keys(eths)[0];
    if (name !== this.s.net.iface) return fail(`[Route Runner hint] Your file configures "${name}" but this machine's NIC is "${this.s.net.iface}" (see ip a). Netplan applied nothing to ${this.s.net.iface}.`);
    const cfg = (eths as Record<string, unknown>)[name] as Record<string, unknown>;
    const warnings: string[] = [];
    if (f.mode !== 'rw-------') warnings.push(`** (generate:2201): WARNING **: Permissions for /etc/netplan/${fname} are too open. Netplan configuration should NOT be accessible by others.`);
    const dhcp = cfg.dhcp4 === true;
    const n = this.s.net;
    if (dhcp) {
      Object.assign(n, { dhcp: true, ...dhcpLeaseFor(n.mode) });
    } else {
      const addrs = cfg.addresses as unknown[] | undefined;
      const first = Array.isArray(addrs) ? String(addrs[0]) : undefined;
      const m = first?.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
      if (!m) return fail(`/etc/netplan/${fname}: Error in network definition: ${name}: dhcp4 is false so you need "addresses: [x.x.x.x/yy]"`);
      let gw: string | undefined;
      if (typeof cfg.gateway4 === 'string') {
        gw = cfg.gateway4;
        warnings.push('`gateway4` has been deprecated, use default routes instead.\nSee the \'Default routes\' section of the documentation for more details.');
      }
      const routes = cfg.routes as Record<string, unknown>[] | undefined;
      const def = Array.isArray(routes) ? routes.find((r) => r.to === 'default' || r.to === '0.0.0.0/0') : undefined;
      if (def) gw = String(def.via);
      const dns = (yget(cfg as never, 'nameservers.addresses') as string[] | undefined) ?? [];
      Object.assign(n, { dhcp: false, ip: m[1], prefix: Number(m[2]), gateway: gw, dns: Array.isArray(dns) ? dns.map(String) : [] });
      if (gw && !inNetwork(gw, m[1], prefixToMask(Number(m[2])))) warnings.push(`[Route Runner hint] Gateway ${gw} is NOT inside ${m[1]}/${m[2]} - you will have no route out.`);
      this.events.push('netplan:static');
    }
    this.events.push('netplan:apply');
    return ok((warnings.length ? warnings.join('\n') + '\n' : '') + (sub === 'try' ? 'Do you want to keep these settings?\n\nPress ENTER before the timeout to accept the new configuration\n\nConfiguration accepted.\n' : ''));
  }

  private ufw(c: ShellCtx, a: string[]): CmdResult {
    if (!c.sudo && this.s.user !== 'root') return fail('ERROR: You need to be root to run this script');
    const u = this.s.ufw;
    const sub = a[0];
    const norm = (r: string) => ({ ssh: '22/tcp', http: '80/tcp', https: '443/tcp', 'Nginx Full': '80,443/tcp', 'Nginx HTTP': '80/tcp', OpenSSH: '22/tcp', 'Apache Full': '80,443/tcp' })[r] ?? r;
    switch (sub) {
      case 'status': {
        if (!u.enabled) return ok('Status: inactive\n');
        const rules = u.rules.map((r, k) => {
          const [action, ...what] = r.split(' ');
          const target = what.join(' ');
          const from = target.match(/(?:^|\s)from\s+(\S+)/)?.[1] ?? 'Anywhere';
          const to = target.match(/port\s+(\S+)/)?.[1] ?? target.split(/\s*from\s/)[0];
          return `${a[1] === 'numbered' ? `[${String(k + 1).padStart(2)}] ` : ''}${to.padEnd(27)}${action.toUpperCase().padEnd(12)}${from}`;
        });
        return ok(`Status: active\n${a[1] === 'verbose' ? `Logging: on (low)\nDefault: ${u.defaultIncoming} (incoming), allow (outgoing), disabled (routed)\nNew profiles: skip\n` : ''}\nTo                         Action      From\n--                         ------      ----\n${rules.join('\n')}\n`);
      }
      case 'enable': {
        u.enabled = true;
        this.events.push('ufw:enable');
        const sshOk = u.rules.some((r) => r.startsWith('allow') && (r.includes('22') || r.includes('ssh')));
        return ok(`Command may disrupt existing ssh connections. Proceed with operation (y|n)? y\nFirewall is active and enabled on system startup\n${sshOk ? '' : '[Route Runner hint] You enabled the firewall WITHOUT allowing SSH (22/tcp). On a remote server that would lock you out!\n'}`);
      }
      case 'disable':
        u.enabled = false;
        return ok('Firewall stopped and disabled on system startup\n');
      case 'allow':
      case 'deny':
      case 'reject':
      case 'limit': {
        const rest = a.slice(1).join(' ');
        if (!rest) return fail('ERROR: Wrong number of arguments');
        const rule = `${sub} ${norm(rest)}`;
        if (!u.rules.includes(rule)) u.rules.push(rule);
        this.events.push(`ufw:${rule}`);
        return ok('Rules updated\nRules updated (v6)\n');
      }
      case 'delete': {
        const target = /^\d+$/.test(a[1]) ? u.rules[Number(a[1]) - 1] : `${a[1]} ${norm(a.slice(2).join(' '))}`;
        if (!target || !u.rules.includes(target)) return fail('Could not delete non-existent rule');
        u.rules = u.rules.filter((r) => r !== target);
        return ok('Rule deleted\nRule deleted (v6)\n');
      }
      case 'default':
        if (a[2] === 'incoming') u.defaultIncoming = a[1] === 'allow' ? 'allow' : 'deny';
        return ok(`Default incoming policy changed to '${a[1]}'\n(be sure to update your rules accordingly)\n`);
      case 'reset':
        u.rules = [];
        u.enabled = false;
        return ok('Resetting all rules to installed defaults. Proceed with operation (y|n)? y\n');
      case 'app':
        return ok('Available applications:\n  Nginx Full\n  Nginx HTTP\n  Nginx HTTPS\n  OpenSSH\n');
      default:
        return fail('ERROR: Invalid syntax\n\nUsage: ufw COMMAND\n\nCommands:\n enable | disable | status [verbose|numbered] | allow ARGS | deny ARGS | delete RULE|NUM | default ARG | reset');
    }
  }

  private ssh(a: string[]): CmdResult {
    const target = a.find((x) => !x.startsWith('-'));
    if (!target) return fail('usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] destination [command [argument ...]]', 255);
    const [user, hostRaw] = target.includes('@') ? target.split('@') : [this.s.user, target];
    const r = this.resolve(hostRaw);
    if (!r.ip) return fail(`ssh: Could not resolve hostname ${hostRaw}: ${r.err?.split(': ')[1] ?? 'Name or service not known'}`, 255);
    const local = r.ip.startsWith('127.') || r.ip === this.s.net.ip;
    if (local) {
      if (!this.s.services.ssh?.active) return fail(`ssh: connect to host ${hostRaw} port 22: Connection refused\n[Route Runner hint] No SSH server is listening. Install and start it: sudo apt install openssh-server`, 255);
      if (this.s.ufw.enabled && !local) return fail(`ssh: connect to host ${hostRaw} port 22: Connection timed out`, 255);
      this.events.push('ssh:local:ok');
      return ok(`The authenticity of host '${hostRaw} (${r.ip})' can't be established.\nED25519 key fingerprint is SHA256:k7Q3m0Jx2Y9vR1sT8uW4pZ6aB5cD3eF2gH1iJ0kL9mN.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? yes\nWarning: Permanently added '${hostRaw}' (ED25519) to the list of known hosts.\n${user}@${hostRaw}'s password: \nWelcome to Ubuntu 24.04.3 LTS (GNU/Linux 6.8.0-48-generic x86_64)\n[Route Runner] SSH works! You are logged in to the same machine over the network. Type commands as normal.\n`);
    }
    if (this.reach(r.ip) !== 'ok') return fail(`ssh: connect to host ${hostRaw} port 22: Connection timed out`, 255);
    return fail(`${user}@${hostRaw}: Permission denied (publickey).`, 255);
  }

  private git(a: string[]): CmdResult {
    const [sub] = a;
    const repo = `${this.s.cwd}/.git`;
    if (sub === '--version') return ok('git version 2.43.0\n');
    if (sub === 'init') {
      this.vfs.mkdir(repo, this.s.user, true);
      return ok(`Initialized empty Git repository in ${repo}/\n`);
    }
    if (!this.vfs.get(repo) && sub !== 'clone' && sub !== 'config') return fail('fatal: not a git repository (or any of the parent directories): .git', 128);
    switch (sub) {
      case 'status':
        return ok(`On branch main\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n${Object.keys(this.vfs.get(this.s.cwd)?.children ?? {}).filter((k) => k !== '.git').map((k) => `\t${C.red}${k}${C.reset}`).join('\n')}\n`);
      case 'add':
        return ok();
      case 'commit':
        this.events.push('git:commit');
        return ok(`[main (root-commit) 4f2a9c1] ${a[a.indexOf('-m') + 1] ?? 'commit'}\n 3 files changed, 42 insertions(+)\n`);
      case 'log':
        return ok('commit 4f2a9c1e0b7d8f6a5c4b3a291807f6e5d4c3b2a1 (HEAD -> main)\nAuthor: Phemelo <phemelo@routerunner.lab>\nDate:   Wed Nov 19 10:00:00 2026 +0200\n\n    Initial commit\n');
      case 'config':
        return ok();
      case 'clone':
        this.vfs.mkdir(this.abs((a[1] ?? 'repo').split('/').pop()!.replace('.git', '')), this.s.user, true);
        return ok(`Cloning into '${(a[1] ?? 'repo').split('/').pop()!.replace('.git', '')}'...\nremote: Enumerating objects: 42, done.\nReceiving objects: 100% (42/42), done.\n`);
      case 'push':
        return ok('Enumerating objects: 5, done.\nTo github.com:phemelo/route-runner.git\n   4f2a9c1..8b3d2e7  main -> main\n');
      default:
        return ok();
    }
  }
}

function networkOf(ip: string, prefix: number): string {
  return ipNetworkOf(ip, prefixToMask(prefix));
}

// ------------------------------------------------------------------ profile seeds

function seedCloud(sh: ShellSession) {
  const s = sh.s;
  for (const p of ['docker.io', 'git', 'terraform', 'ansible', 'awscli', 'kubectl', 'tree', 'net-tools', 'wget']) if (!s.packages.includes(p)) s.packages.push(p);
  s.services.docker = { active: true, enabled: true };
  if (!s.groups.includes('docker')) s.groups.push('docker');
  s.users.find((u) => u.name === s.user)!.groups.push('docker');
  syncAccountFiles(s);
  s.k8s = createCluster();
  const h = `/home/${s.user}`;
  const w = (p: string, c: string) => {
    sh.vfs.mkdir(p.slice(0, p.lastIndexOf('/')), s.user, true);
    sh.vfs.write(p, c, s.user);
  };
  w(`${h}/docker-demo/Dockerfile`, '# A tiny web server image\nFROM nginx:1.27\nCOPY index.html /usr/share/nginx/html/index.html\nEXPOSE 80\n');
  w(`${h}/docker-demo/index.html`, '<h1>Phemelo\'s first container</h1>\n');
  w(`${h}/docker-demo/docker-compose.yml`, 'services:\n  web:\n    image: nginx\n    ports:\n      - "8080:80"\n  cache:\n    image: redis\n');
  w(`${h}/k8s/web-deployment.yaml`, 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n      - name: web\n        image: nginx:1.27\n        ports:\n        - containerPort: 80\n');
  w(`${h}/k8s/web-service.yaml`, 'apiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  type: NodePort\n  selector:\n    app: web\n  ports:\n  - port: 80\n    targetPort: 80\n');
  w(`${h}/terraform-demo/main.tf`, 'terraform {\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> 5.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "af-south-1"\n}\n\nresource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n}\n\nresource "aws_subnet" "public" {\n  cidr_block              = "10.0.1.0/24"\n  availability_zone       = "af-south-1a"\n  map_public_ip_on_launch = "true"\n}\n\nresource "aws_instance" "web" {\n  ami           = "ami-0ubuntu2404"\n  instance_type = "t3.micro"\n}\n');
  w(`${h}/ansible/inventory.ini`, '[routers]\nR1 ansible_host=192.168.1.1\nR2 ansible_host=192.168.1.2\n\n[switches]\nS1 ansible_host=192.168.1.11\n\n[network:children]\nrouters\nswitches\n');
  w(`${h}/ansible/backup-configs.yml`, '- name: Back up running configs\n  hosts: routers\n  gather_facts: false\n  tasks:\n    - name: Show version\n      ios_command:\n        commands: show version\n    - name: Save running-config to a file\n      ios_config:\n        backup: yes\n');
}

function seedHpc(sh: ShellSession) {
  const s = sh.s;
  s.hostname = 'login01';
  s.slurm = createSlurm();
  s.packages.push('openmpi-bin');
  s.services.slurmctld = { active: true, enabled: true };
  s.hw = { cpus: 64, ramMb: 262144, diskGb: 500, cpuModel: 'AMD EPYC 7713 64-Core Processor' };
  const h = `/home/${s.user}`;
  sh.vfs.mkdir(`${h}/jobs`, s.user, true);
  sh.vfs.write(`${h}/jobs/hello_mpi.sh`, '#!/bin/bash\n#SBATCH --job-name=hello_mpi\n#SBATCH --partition=normal\n#SBATCH --nodes=2\n#SBATCH --ntasks=8\n#SBATCH --time=00:05:00\n#SBATCH --output=hello-%j.out\n\nmodule load openmpi/4.1.6\nmpirun -np 8 ./hello_mpi\n', s.user);
  sh.vfs.write(`${h}/jobs/gpu_job.sh`, '#!/bin/bash\n#SBATCH --job-name=train\n#SBATCH --partition=gpu\n#SBATCH --gres=gpu:2\n#SBATCH --time=01:00:00\n\nmodule load cuda/12.4 python/3.12\npython train.py\n', s.user);
}
