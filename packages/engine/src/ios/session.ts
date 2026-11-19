import { type CliResult, type CliSession, caretError } from '../cli/types.js';
import { broadcastOf, isIPv4, isIPv6, isValidMask, maskToPrefix, networkOf, parseCidr, prefixToMask, wildcardOf } from '../net/ip.js';
import {
  type AclEntry,
  type Device,
  type Iface,
  type Topology,
  getDevice,
  isSwitch,
  normalizeIfaceName,
} from '../net/model.js';
import { learnArp, ping, forward, tcpReach, runtimeOf, isUp } from '../net/sim.js';
import { CommandTable, type ArgMap } from './parser.js';
import * as show from './show.js';

export type IosMode =
  | 'user'
  | 'priv'
  | 'config'
  | 'config-if'
  | 'config-subif'
  | 'config-if-range'
  | 'config-line'
  | 'config-router'
  | 'config-vlan'
  | 'dhcp-config'
  | 'config-std-nacl'
  | 'config-ext-nacl';

type Pending =
  | { kind: 'login'; tries: number }
  | { kind: 'enable'; tries: number }
  | { kind: 'rsa-bits' }
  | { kind: 'copy-confirm' }
  | { kind: 'reload-confirm' }
  | { kind: 'erase-confirm' }
  | { kind: 'ssh-password'; target: string; user: string };

const MODE_SUFFIX: Record<IosMode, string> = {
  user: '>',
  priv: '#',
  config: '(config)#',
  'config-if': '(config-if)#',
  'config-subif': '(config-subif)#',
  'config-if-range': '(config-if-range)#',
  'config-line': '(config-line)#',
  'config-router': '(config-router)#',
  'config-vlan': '(config-vlan)#',
  'dhcp-config': '(dhcp-config)#',
  'config-std-nacl': '(config-std-nacl)#',
  'config-ext-nacl': '(config-ext-nacl)#',
};

export interface IosOptions {
  /** Show friendly "[Route Runner hint]" explanations after failures. */
  hints?: boolean;
  /** Session arrived over SSH/Telnet (vty) rather than the console cable. */
  via?: 'console' | 'vty';
  startPrivileged?: boolean;
}

class Out {
  lines: string[] = [];
  events: string[] = [];
  push(s: string) {
    this.lines.push(s.endsWith('\n') ? s.slice(0, -1) : s);
  }
}

export class IosSession implements CliSession {
  readonly kind = 'ios' as const;
  mode: IosMode = 'user';
  ifaces: string[] = [];
  line: 'con' | 'vty' = 'con';
  vlan = 1;
  pool = '';
  acl = '';
  pending?: Pending;
  history: string[] = [];
  private out = new Out();
  tables: Partial<Record<IosMode, CommandTable<IosSession>>> = {};
  exitRequested = false;
  pushSession?: CliSession;

  constructor(
    public topo: Topology,
    public deviceId: string,
    public opts: IosOptions = { hints: true, via: 'console' },
  ) {
    const d = this.dev;
    const lineCfg = opts.via === 'vty' ? d.lineVty : d.lineCon;
    if (opts.startPrivileged) this.mode = 'priv';
    else if (lineCfg.login && lineCfg.password && !lineCfg.loginLocal) this.pending = { kind: 'login', tries: 0 };
    buildTables(this);
  }

  get dev(): Device {
    return getDevice(this.topo, this.deviceId);
  }

  title(): string {
    return `${this.dev.hostname} (${this.opts.via === 'vty' ? 'SSH' : 'console'})`;
  }

  banner(): string {
    const d = this.dev;
    const parts: string[] = [];
    if (d.bannerMotd) parts.push(d.bannerMotd, '');
    if (this.pending?.kind === 'login') parts.push('User Access Verification', '');
    else parts.push('Press RETURN to get started.', '');
    return parts.join('\n');
  }

  prompt(): string {
    if (this.pending) {
      switch (this.pending.kind) {
        case 'login':
        case 'enable':
        case 'ssh-password':
          return 'Password: ';
        case 'rsa-bits':
          return 'How many bits in the modulus [512]: ';
        case 'copy-confirm':
          return 'Destination filename [startup-config]? ';
        case 'reload-confirm':
          return 'Proceed with reload? [confirm]';
        case 'erase-confirm':
          return 'Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]';
      }
    }
    return this.dev.hostname + MODE_SUFFIX[this.mode];
  }

  hint(msg: string) {
    if (this.opts.hints !== false) this.out.push(`[Route Runner hint] ${msg}`);
  }

  print(s: string) {
    this.out.push(s);
  }

  emit(ev: string) {
    this.out.events.push(ev);
  }

  exec(raw: string): CliResult {
    this.out = new Out();
    const result: CliResult = { output: '' };
    const line = raw.replace(/\t/g, ' ');
    if (this.pending) {
      this.handlePending(line, result);
    } else if (line.trim() === '' ) {
      // nothing
    } else {
      this.history.push(line.trim());
      if (line.trim() === '\x1a' || line.trim().toLowerCase() === '^z') this.toPriv();
      else this.run(line, this.mode, result);
    }
    result.output = this.out.lines.length ? this.out.lines.join('\n') + '\n' : '';
    result.events = this.out.events;
    if (this.pending && ['login', 'enable', 'ssh-password'].includes(this.pending.kind)) result.secret = true;
    return result;
  }

  complete(partial: string): string[] {
    const table = this.tables[this.mode];
    return table ? table.complete(partial) : [];
  }

  toPriv() {
    this.mode = 'priv';
    this.ifaces = [];
  }

  private run(line: string, mode: IosMode, result: CliResult) {
    const trimmed = line.trim();
    if (trimmed.endsWith('?')) return this.help(trimmed.slice(0, -1), mode);
    // "do" lets you run exec commands from config modes
    const doMatch = trimmed.match(/^do\s+(.+)$/i);
    if (doMatch && mode !== 'user' && mode !== 'priv') {
      const saved = this.mode;
      this.mode = 'priv';
      this.run(doMatch[1], 'priv', result);
      if (this.mode === 'priv') this.mode = saved;
      return;
    }
    const table = this.tables[mode]!;
    const m = table.match(trimmed);
    if (m.kind === 'ok') {
      const r = m.spec.run(this, m.args, m.tokens);
      if (typeof r === 'string' && r) this.print(r);
      if (this.exitRequested) {
        result.exit = true;
        this.exitRequested = false;
      }
      if (this.pushSession) {
        result.push = this.pushSession;
        this.pushSession = undefined;
      }
      return;
    }
    // In sub-modes IOS falls back to global config commands (e.g. typing "interface g0/1" while in config-if).
    if (mode !== 'config' && mode !== 'user' && mode !== 'priv') {
      const g = this.tables.config!.match(trimmed);
      if (g.kind === 'ok') {
        this.mode = 'config';
        const r = g.spec.run(this, g.args, g.tokens);
        if (typeof r === 'string' && r) this.print(r);
        return;
      }
    }
    if (m.kind === 'incomplete') return this.print('% Incomplete command.\n');
    if (m.kind === 'ambiguous') return this.print(`% Ambiguous command: "${trimmed}"\n`);
    if ((mode === 'user' || mode === 'priv') && trimmed.split(/\s+/).length === 1 && !this.dev.noIpDomainLookup) {
      this.print(`Translating "${trimmed}"...domain server (255.255.255.255)\n% Unknown command or computer name, or unable to find computer address\n`);
      this.hint('IOS thought that word was a hostname and tried DNS. Type "no ip domain-lookup" in global config to stop this delay.');
      return;
    }
    this.print(caretError(this.prompt(), trimmed, m.at));
  }

  private help(prefix: string, mode: IosMode) {
    const table = this.tables[mode]!;
    const endsWithSpace = prefix === '' || /\s$/.test(prefix);
    const toks = prefix.trim().split(/\s+/).filter(Boolean);
    if (endsWithSpace) {
      const words = table.nextWords(toks);
      if (!words.length) return this.print('% Unrecognized command\n');
      this.print(words.map((w) => `  ${w.word.padEnd(20)} ${w.help}`).join('\n') + '\n');
    } else {
      const last = toks.pop() ?? '';
      const words = table.nextWords(toks, last).filter((w) => !w.word.match(/^[A-Z]/));
      this.print(words.map((w) => w.word).join('  ') + '\n');
    }
  }

  private handlePending(line: string, result: CliResult) {
    const p = this.pending!;
    const d = this.dev;
    const v = line.trim();
    switch (p.kind) {
      case 'login': {
        const lineCfg = this.opts.via === 'vty' ? d.lineVty : d.lineCon;
        if (v === lineCfg.password) this.pending = undefined;
        else if (++p.tries >= 3) {
          this.pending = undefined;
          this.print('% Bad passwords\n');
          result.exit = true;
        }
        return;
      }
      case 'enable': {
        const ok = d.enableSecret ? v === d.enableSecret : v === d.enablePassword;
        if (ok) {
          this.pending = undefined;
          this.mode = 'priv';
          this.emit('enable:ok');
        } else if (++p.tries >= 3) {
          this.pending = undefined;
          this.print('% Bad secrets\n');
        }
        return;
      }
      case 'rsa-bits': {
        const bits = Number(v || 512);
        this.pending = undefined;
        this.generateRsa(bits);
        return;
      }
      case 'copy-confirm':
        this.pending = undefined;
        this.saveConfig();
        return;
      case 'reload-confirm':
        this.pending = undefined;
        this.reload();
        return;
      case 'erase-confirm':
        this.pending = undefined;
        d.startupConfig = undefined;
        this.print('[OK]\nErase of nvram: complete\n');
        return;
      case 'ssh-password': {
        this.pending = undefined;
        const target = getDevice(this.topo, p.target);
        const u = target.users.find((x) => x.name === p.user);
        if (!u || u.secret !== v) {
          this.print('% Authentication failed.\n');
          return;
        }
        this.emit('ssh:ok');
        result.push = new IosSession(this.topo, target.id, {
          hints: this.opts.hints,
          via: 'vty',
          startPrivileged: u.privilege >= 15,
        });
        return;
      }
    }
  }

  generateRsa(bits: number) {
    const d = this.dev;
    if (/^(router|switch)$/i.test(d.hostname)) return this.print(`% Please define a hostname other than ${d.hostname}.\n`);
    if (!d.domainName) return this.print('% Please define a domain-name first.\n');
    d.rsaBits = bits;
    this.print(
      `The name for the keys will be: ${d.hostname}.${d.domainName}\nChoose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n\n% Generating ${bits} bit RSA keys, keys will be non-exportable...[OK]\n*Mar 1 00:12:41.123: %SSH-5-ENABLED: SSH 1.99 has been enabled`,
    );
    if (bits < 768) this.hint('SSH version 2 needs a key of at least 768 bits. Use 1024 or 2048.');
    this.emit('rsa:generated');
  }

  saveConfig() {
    const d = this.dev;
    const snap: Partial<Device> = JSON.parse(JSON.stringify(d));
    delete snap.startupConfig;
    d.startupConfig = JSON.stringify(snap);
    this.print('Building configuration...\n[OK]\n');
    this.emit('config:saved');
  }

  reload() {
    const d = this.dev;
    const keepPos = d.position;
    if (d.startupConfig) {
      const snap = JSON.parse(d.startupConfig) as Device;
      Object.assign(d, snap, { startupConfig: d.startupConfig, position: keepPos });
      this.print('\nSystem Bootstrap, Version 15.1(4)M4\n...\nLoading startup-config... [OK]\n');
    } else {
      const startup = d.startupConfig;
      d.hostname = isSwitch(d) ? 'Switch' : 'Router';
      d.enableSecret = d.enablePassword = undefined;
      d.users = [];
      d.domainName = undefined;
      d.rsaBits = undefined;
      d.bannerMotd = undefined;
      d.staticRoutes = [];
      d.ospf = undefined;
      d.dhcpPools = [];
      d.dhcpExcluded = [];
      d.acls = [];
      d.nat = [];
      d.lineCon = { login: false, loginLocal: false };
      d.lineVty = { login: false, loginLocal: false, transportInput: 'all' };
      d.vlans = isSwitch(d) ? d.vlans : [{ id: 1, name: 'default' }]; // VLANs live in vlan.dat, so they survive!
      d.interfaces = d.interfaces.filter((i) => !i.parent && !i.name.startsWith('Loopback'));
      for (const i of d.interfaces) {
        i.ip = i.mask = i.description = i.aclIn = i.aclOut = i.natRole = i.helperAddress = undefined;
        i.hsrp = undefined;
        if (!isSwitch(d)) i.shutdown = i.media !== 'console';
      }
      d.startupConfig = startup;
      this.print('\nSystem Bootstrap, Version 15.1(4)M4\n...\n--- System Configuration Dialog ---\n\nWould you like to enter the initial configuration dialog? [yes/no]: no\n');
      this.hint('There was no saved startup-config, so the device came back EMPTY. Always "copy running-config startup-config" (or "wr") before a reload.');
    }
    this.mode = 'user';
    this.emit('reload');
  }

  doPing(target: string, srcIface?: string) {
    const ip = this.resolveName(target);
    if (!ip) return;
    this.print(`Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${ip}, timeout is 2 seconds:`);
    const src = srcIface ? this.dev.interfaces.find((i) => i.name.toLowerCase() === normalizeIfaceName(srcIface).toLowerCase()) : undefined;
    const res = ping(this.topo, this.deviceId, ip, src?.ip);
    if (res.success) {
      const cold = learnArp(this.topo, res);
      this.print(cold ? '.!!!!\nSuccess rate is 80 percent (4/5), round-trip min/avg/max = 0/0/1 ms\n' : '!!!!!\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = 0/0/1 ms\n');
      if (cold) this.hint('The first "." is normal: the router had to ARP for the next hop before it could send.');
      this.emit(`ping:ok:${this.deviceId}:${ip}`);
    } else {
      this.print('.....\nSuccess rate is 0 percent (0/5)\n');
      if (res.reason) this.hint(res.reason);
      this.emit(`ping:fail:${this.deviceId}:${ip}`);
    }
  }

  doTraceroute(target: string) {
    const ip = this.resolveName(target);
    if (!ip) return;
    this.print(`Type escape sequence to abort.\nTracing the route to ${ip}\nVRF info: (vrf in name/address)`);
    const res = forward(this.topo, this.deviceId, { src: '', dst: ip, proto: 'icmp' });
    const hops = res.hops.slice(1);
    hops.forEach((h, n) => {
      const dv = getDevice(this.topo, h.device);
      const ipIn = h.note === 'delivered' ? ip : dv.interfaces.find((x) => x.name === h.ingress)?.ip ?? '*';
      this.print(`  ${n + 1} ${ipIn} 0 msec 1 msec 0 msec`);
    });
    if (!res.ok) {
      this.print(`  ${hops.length + 1}  *    *    *`);
      if (res.reason) this.hint(res.reason);
    }
    this.print('');
  }

  resolveName(target: string): string | undefined {
    if (isIPv4(target)) return target;
    if (this.dev.noIpDomainLookup) {
      this.print(`% Unrecognized host or address, or protocol not running.\n`);
      return undefined;
    }
    this.print(`Translating "${target}"...domain server (255.255.255.255)\n% Unrecognized host or address, or protocol not running.\n`);
    return undefined;
  }

  sshTo(user: string, ip: string) {
    const r = tcpReach(this.topo, this.deviceId, ip, 22);
    if (!r.ok) {
      this.print(`% Connection timed out; remote host not responding\n`);
      if (r.reason) this.hint(r.reason);
      return;
    }
    const target = getDevice(this.topo, r.device!);
    const problem = sshProblem(target);
    if (problem) {
      this.print('% Connection refused by remote host\n');
      this.hint(problem);
      return;
    }
    this.pending = { kind: 'ssh-password', target: target.id, user };
  }

  ifaceList(): Iface[] {
    const d = this.dev;
    return this.ifaces.map((n) => d.interfaces.find((i) => i.name === n)!).filter(Boolean);
  }
}

export function sshProblem(target: Device): string | undefined {
  if (target.lineVty.transportInput === 'none' || target.lineVty.transportInput === 'telnet')
    return `${target.hostname}'s VTY lines do not allow SSH ("transport input ssh").`;
  if (!target.rsaBits) return `${target.hostname} has no RSA keys. Needs: hostname, ip domain-name, crypto key generate rsa.`;
  if (!target.lineVty.loginLocal) return `${target.hostname}'s VTY lines need "login local" so SSH can check usernames.`;
  if (!target.users.length) return `${target.hostname} has no local usernames ("username admin secret ...").`;
  return undefined;
}

// ======================================================================= command tables

function vlanList(spec: string, existing: number[] | 'all' | undefined): number[] | 'all' {
  const s = spec.trim().toLowerCase();
  if (s === 'all') return 'all';
  const parse = (txt: string) =>
    txt.split(',').flatMap((p) => {
      const [a, b] = p.split('-').map(Number);
      return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a];
    });
  const base = existing === 'all' || !existing ? [] : existing;
  if (s.startsWith('add ')) return [...new Set([...base, ...parse(s.slice(4))])].sort((a, b) => a - b);
  if (s.startsWith('remove ')) {
    const rem = parse(s.slice(7));
    const from = existing === 'all' || !existing ? Array.from({ length: 1005 }, (_, k) => k + 1) : base;
    return from.filter((v) => !rem.includes(v));
  }
  if (s.startsWith('except ')) {
    const rem = parse(s.slice(7));
    return Array.from({ length: 1005 }, (_, k) => k + 1).filter((v) => !rem.includes(v));
  }
  return parse(s).sort((a, b) => a - b);
}

function parseAddr(tokens: string[], i: number): { addr: string; wild: string; next: number } | undefined {
  const t = tokens[i]?.toLowerCase();
  if (t === 'any') return { addr: '0.0.0.0', wild: '255.255.255.255', next: i + 1 };
  if (t === 'host' && isIPv4(tokens[i + 1] ?? '')) return { addr: tokens[i + 1], wild: '0.0.0.0', next: i + 2 };
  if (isIPv4(tokens[i] ?? '')) {
    if (isIPv4(tokens[i + 1] ?? '')) return { addr: tokens[i], wild: tokens[i + 1], next: i + 2 };
    return { addr: tokens[i], wild: '0.0.0.0', next: i + 1 };
  }
  return undefined;
}

const PORTS: Record<string, number> = { www: 80, http: 80, https: 443, ssh: 22, telnet: 23, ftp: 21, 'ftp-data': 20, domain: 53, smtp: 25, pop3: 110, tftp: 69, snmp: 161, ntp: 123, bootps: 67, bootpc: 68 };

export function parseAclEntry(type: 'standard' | 'extended', words: string[]): AclEntry | string {
  const action = words[0]?.toLowerCase();
  if (action === 'remark') return { action: 'permit', protocol: 'ip', src: '0.0.0.0', srcWildcard: '0.0.0.0', dst: '0.0.0.0', dstWildcard: '0.0.0.0', remark: words.slice(1).join(' ') };
  if (action !== 'permit' && action !== 'deny') return '% Invalid input: expected permit, deny or remark';
  if (type === 'standard') {
    const a = parseAddr(words, 1);
    if (!a) return '% Invalid source address';
    return { action, protocol: 'ip', src: a.addr, srcWildcard: a.wild, dst: '0.0.0.0', dstWildcard: '255.255.255.255' };
  }
  const proto = words[1]?.toLowerCase();
  if (!['ip', 'icmp', 'tcp', 'udp'].includes(proto)) return '% Invalid protocol (use ip, icmp, tcp or udp)';
  const s = parseAddr(words, 2);
  if (!s) return '% Invalid source';
  const dd = parseAddr(words, s.next);
  if (!dd) return '% Invalid destination';
  let port: number | undefined;
  if (words[dd.next]?.toLowerCase() === 'eq') {
    const p = words[dd.next + 1]?.toLowerCase();
    port = PORTS[p] ?? Number(p);
    if (Number.isNaN(port)) return '% Invalid port';
  }
  return { action, protocol: proto as AclEntry['protocol'], src: s.addr, srcWildcard: s.wild, dst: dd.addr, dstWildcard: dd.wild, port };
}

function expandRange(d: Device, spec: string): string[] | undefined {
  // "f0/1 - 10, f0/20" or "g0/1-2"
  const out: string[] = [];
  for (const chunk of spec.split(',')) {
    const m = chunk.trim().match(/^([a-zA-Z-]+)\s*(\d+(?:\/\d+)*?)\/(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) return undefined;
    const base = normalizeIfaceName(`${m[1]}${m[2]}/${m[3]}`).replace(/\/\d+$/, '');
    const from = Number(m[3]);
    const to = m[4] ? Number(m[4]) : from;
    for (let n = from; n <= to; n++) {
      const name = `${base}/${n}`;
      if (!d.interfaces.some((i) => i.name === name)) return undefined;
      out.push(name);
    }
  }
  return out;
}

function exitTo(s: IosSession, mode: IosMode) {
  s.mode = mode;
  if (mode === 'config' || mode === 'priv') s.ifaces = [];
}

function buildTables(s: IosSession) {
  const t = s.tables;

  // ---------------------------------------------------------------- show (shared by user/priv)
  const addShows = (tb: CommandTable<IosSession>, privileged: boolean) => {
    tb.add('show ip interface brief', 'Brief summary of IP status and configuration', (x) => show.ipIntBrief(x.topo, x.dev))
      .add('show ipv6 interface brief', 'Brief summary of IPv6 status', (x) => show.ipv6IntBrief(x.topo, x.dev))
      .add('show interfaces', 'Interface status and configuration', (x) => show.showInterface(x.topo, x.dev))
      .add('show interfaces <iface>', 'One interface in detail', (x, a) => show.showInterface(x.topo, x.dev, normalizeIfaceName(a.iface)))
      .add('show interfaces trunk', 'Show trunk ports (switches)', (x) => show.showTrunks(x.topo, x.dev))
      .add('show ip route', 'IP routing table', (x) => show.showIpRoute(x.topo, x.dev))
      .add('show vlan brief', 'VLAN summary', (x) => (isSwitch(x.dev) ? show.showVlanBrief(x.topo, x.dev) : '% Invalid input detected\n'))
      .add('show vlan', 'VLAN information', (x) => (isSwitch(x.dev) ? show.showVlanBrief(x.topo, x.dev) : '% Invalid input detected\n'))
      .add('show version', 'System hardware and software status', (x) => show.showVersion(x.dev))
      .add('show cdp neighbors', 'CDP neighbor entries', (x) => show.showCdp(x.topo, x.dev))
      .add('show cdp neighbors detail', 'Detailed CDP neighbor info (shows IPs!)', (x) => show.showCdp(x.topo, x.dev, true))
      .add('show lldp neighbors', 'LLDP neighbor entries', (x) => show.showCdp(x.topo, x.dev).replace('Capability Codes', 'LLDP Capability Codes'))
      .add('show ip ospf neighbor', 'OSPF neighbor list', (x) => show.showOspfNeighbor(x.topo, x.dev))
      .add('show ip protocols', 'Active routing protocols', (x) => show.showIpProtocols(x.topo, x.dev))
      .add('show arp', 'ARP table', (x) => show.showArp(x.topo, x.dev))
      .add('show ip arp', 'ARP table', (x) => show.showArp(x.topo, x.dev))
      .add('show mac address-table', 'MAC address table', (x) => show.showMacTable(x.topo, x.dev))
      .add('show spanning-tree', 'Spanning tree topology', (x) => show.showSpanningTree(x.topo, x.dev))
      .add('show standby brief', 'HSRP summary', (x) => show.showStandbyBrief(x.topo, x.dev))
      .add('show etherchannel summary', 'EtherChannel summary', (x) => show.showEtherchannel(x.topo, x.dev))
      .add('show history', 'Command history', (x) => x.history.join('\n') + '\n')
      .add('show clock', 'System clock', () => `*${new Date().toUTCString()}\n`);
    if (privileged) {
      tb.add('show running-config', 'Current operating configuration', (x) => show.runningConfig(x.topo, x.dev))
        .add('show startup-config', 'Saved configuration in NVRAM', (x) => {
          if (!x.dev.startupConfig) return 'startup-config is not present\n';
          return show.runningConfig(x.topo, JSON.parse(x.dev.startupConfig)).replace('Current configuration', 'Using 1234 out of 262136 bytes\nCurrent configuration');
        })
        .add('show ip dhcp binding', 'DHCP address bindings', (x) => show.showDhcpBinding(x.dev))
        .add('show ip dhcp pool', 'DHCP pools', (x) => x.dev.dhcpPools.map((p) => `Pool ${p.name} :\n Network ${p.network} ${p.mask}\n Default router ${p.defaultRouter ?? '-'}\n`).join('\n') + '\n')
        .add('show access-lists', 'List access lists', (x) => show.showAccessLists(x.dev))
        .add('show ip nat translations', 'NAT translation table', (x) => show.showNat(x.topo, x.dev))
        .add('show port-security', 'Port security summary', (x) => show.showPortSecurity(x.topo, x.dev))
        .add('show port-security interface <iface>', 'Port security on one port', (x, a) => show.showPortSecurity(x.topo, x.dev, normalizeIfaceName(a.iface)))
        .add('show ip ssh', 'SSH status', (x) => (x.dev.rsaBits ? `SSH Enabled - version ${x.dev.sshVersion === 2 ? '2.0' : '1.99'}\nAuthentication timeout: 120 secs; Authentication retries: 3\nRSA key size: ${x.dev.rsaBits} bits\n` : '%SSH has not been enabled\n'))
        .add('show users', 'Display information about terminal lines', (x) => `    Line       User       Host(s)              Idle       Location\n*  0 con 0                idle                 00:00:00\n`);
    }
  };

  const execCommon = (tb: CommandTable<IosSession>) => {
    tb.add('ping <ip>', 'Send echo messages', (x, a) => x.doPing(a.ip))
      .add('ping <word>', 'Send echo messages to a name', (x, a) => x.doPing(a.word))
      .add('ping <ip> source <iface>', 'Ping using a specific source interface', (x, a) => x.doPing(a.ip, a.iface))
      .add('traceroute <ip>', 'Trace route to destination', (x, a) => x.doTraceroute(a.ip))
      .add('ssh -l <word> <ip>', 'Open a secure shell client connection', (x, a) => x.sshTo(a.word, a.ip))
      .add('telnet <ip>', 'Open a telnet connection', (x, a) => {
        const r = tcpReach(x.topo, x.deviceId, a.ip, 23);
        const target = r.device ? getDevice(x.topo, r.device) : undefined;
        if (!r.ok || !target) return `Trying ${a.ip} ...\n% Connection timed out; remote host not responding\n`;
        if (target.lineVty.transportInput === 'ssh' || target.lineVty.transportInput === 'none') return `Trying ${a.ip} ... \n% Connection refused by remote host\n`;
        if (!target.lineVty.password && !target.lineVty.loginLocal) return `Trying ${a.ip} ... Open\n\n[Connection to ${a.ip} closed by foreign host]\n% Password required, but none set\n`;
        x.pushSession = new IosSession(x.topo, target.id, { hints: x.opts.hints, via: 'vty' });
        x.emit('telnet:ok');
        return `Trying ${a.ip} ... Open\n`;
      })
      .add('exit', 'Exit from the EXEC', (x) => {
        x.exitRequested = true;
        return `\n${x.dev.hostname} con0 is now available\n`;
      })
      .add('logout', 'Exit from the EXEC', (x) => {
        x.exitRequested = true;
      });
  };

  // ---------------------------------------------------------------- user EXEC
  const user = new CommandTable<IosSession>();
  user.add('enable', 'Turn on privileged commands', (x) => {
    const d = x.dev;
    if (d.enableSecret || d.enablePassword) x.pending = { kind: 'enable', tries: 0 };
    else if (x.opts.via === 'vty') return '% No password set\n';
    else {
      x.mode = 'priv';
      x.emit('enable:ok');
    }
  });
  addShows(user, false);
  execCommon(user);
  t.user = user;

  // ---------------------------------------------------------------- privileged EXEC
  const priv = new CommandTable<IosSession>();
  priv
    .add('configure terminal', 'Configure from the terminal', (x) => {
      x.mode = 'config';
      return 'Enter configuration commands, one per line.  End with CNTL/Z.\n';
    })
    .add('disable', 'Turn off privileged commands', (x) => void (x.mode = 'user'))
    .add('enable', 'Already privileged', () => undefined)
    .add('copy running-config startup-config', 'Save the configuration to NVRAM', (x) => void (x.pending = { kind: 'copy-confirm' }))
    .add('write memory', 'Save the configuration (old-school shortcut)', (x) => x.saveConfig())
    .add('write', 'Save the configuration', (x) => x.saveConfig())
    .add('erase startup-config', 'Erase the saved configuration', (x) => void (x.pending = { kind: 'erase-confirm' }))
    .add('write erase', 'Erase the saved configuration', (x) => void (x.pending = { kind: 'erase-confirm' }))
    .add('reload', 'Restart the device', (x) => {
      if (!x.dev.startupConfig) x.print('System configuration has been modified. Save? [yes/no]: no');
      x.pending = { kind: 'reload-confirm' };
    })
    .add('clear ip nat translation *', 'Clear NAT table', (x) => void (runtimeOf(x.topo).nat[x.deviceId] = []))
    .add('clear arp-cache', 'Clear the ARP cache', (x) => void (runtimeOf(x.topo).arp[x.deviceId] = []))
    .add('clear mac address-table dynamic', 'Clear dynamic MAC entries', () => undefined)
    .add('clock set <rest>', 'Set the clock', () => undefined)
    .add('terminal length <num>', 'Set number of lines on a screen', () => undefined)
    .add('debug ip ospf adj', 'OSPF adjacency events', () => 'OSPF adjacency debugging is on\n')
    .add('undebug all', 'Disable all debugging', () => 'All possible debugging has been turned off\n');
  addShows(priv, true);
  execCommon(priv);
  t.priv = priv;

  // ---------------------------------------------------------------- global config
  const cfg = new CommandTable<IosSession>();
  const endExit = (tb: CommandTable<IosSession>, parent: IosMode) => {
    tb.add('end', 'Exit to privileged EXEC', (x) => exitTo(x, 'priv')).add('exit', 'Exit from this mode', (x) => exitTo(x, parent));
  };
  cfg
    .add('hostname <word>', 'Set system name', (x, a) => {
      x.dev.hostname = a.word;
      x.emit('hostname:set');
    })
    .add('enable secret <word>', 'Set an encrypted (hashed) enable password', (x, a) => void (x.dev.enableSecret = a.word))
    .add('enable secret 0 <word>', 'Set an enable secret (clear text input)', (x, a) => void (x.dev.enableSecret = a.word))
    .add('enable password <word>', 'Set a WEAK enable password', (x, a) => {
      x.dev.enablePassword = a.word;
      x.hint('"enable password" is stored weakly. Prefer "enable secret".');
    })
    .add('no enable secret', 'Remove enable secret', (x) => void (x.dev.enableSecret = undefined))
    .add('no enable password', 'Remove enable password', (x) => void (x.dev.enablePassword = undefined))
    .add('service password-encryption', 'Scramble all plain-text passwords (type 7)', (x) => void (x.dev.servicePasswordEncryption = true))
    .add('no service password-encryption', 'Stop scrambling passwords', (x) => void (x.dev.servicePasswordEncryption = false))
    .add('no ip domain-lookup', 'Stop DNS lookups for mistyped commands', (x) => void (x.dev.noIpDomainLookup = true))
    .add('ip domain-lookup', 'Enable DNS lookups', (x) => void (x.dev.noIpDomainLookup = false))
    .add('ip domain-name <word>', 'Set the domain name (needed for SSH keys)', (x, a) => void (x.dev.domainName = a.word))
    .add('ip domain name <word>', 'Set the domain name (needed for SSH keys)', (x, a) => void (x.dev.domainName = a.word))
    .add('ip name-server <ip>', 'DNS server', (x, a) => void (x.dev.dns = a.ip))
    .add('ip ssh version <num>', 'SSH version', (x, a) => {
      if (!x.dev.rsaBits) return 'Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).\n';
      x.dev.sshVersion = Number(a.num);
    })
    .add('crypto key generate rsa', 'Generate RSA keys (enables SSH)', (x) => {
      const d = x.dev;
      if (/^(router|switch)$/i.test(d.hostname)) return `% Please define a hostname other than ${d.hostname}.\n`;
      if (!d.domainName) return '% Please define a domain-name first.\n';
      x.print(`The name for the keys will be: ${d.hostname}.${d.domainName}`);
      x.pending = { kind: 'rsa-bits' };
    })
    .add('crypto key generate rsa general-keys modulus <num>', 'Generate RSA keys with a size', (x, a) => x.generateRsa(Number(a.num)))
    .add('crypto key generate rsa modulus <num>', 'Generate RSA keys with a size', (x, a) => x.generateRsa(Number(a.num)))
    .add('username <word> secret <word>', 'Create a local user (hashed password)', (x, a) => {
      x.dev.users = x.dev.users.filter((u) => u.name !== a.word);
      x.dev.users.push({ name: a.word, secret: a.word2, privilege: 1 });
    })
    .add('username <word> privilege <num> secret <word>', 'Create a local admin user', (x, a) => {
      x.dev.users = x.dev.users.filter((u) => u.name !== a.word);
      x.dev.users.push({ name: a.word, secret: a.word2, privilege: Number(a.num) });
    })
    .add('username <word> password <word>', 'Create a local user (weak password)', (x, a) => {
      x.dev.users = x.dev.users.filter((u) => u.name !== a.word);
      x.dev.users.push({ name: a.word, secret: a.word2, privilege: 1 });
    })
    .add('no username <word>', 'Delete a local user', (x, a) => void (x.dev.users = x.dev.users.filter((u) => u.name !== a.word)))
    .add('banner motd <rest>', 'Message of the day', (x, a) => {
      const raw = a.rest.trim();
      const delim = raw[0];
      x.dev.bannerMotd = raw.slice(1, raw.lastIndexOf(delim) > 0 ? raw.lastIndexOf(delim) : undefined);
    })
    .add('no banner motd', 'Remove banner', (x) => void (x.dev.bannerMotd = undefined))
    .add('line console <num>', 'Configure the console line', (x) => {
      x.line = 'con';
      x.mode = 'config-line';
    })
    .add('line vty <num> <num>', 'Configure virtual terminal (SSH/Telnet) lines', (x) => {
      x.line = 'vty';
      x.mode = 'config-line';
    })
    .add('interface <iface>', 'Select an interface to configure', (x, a) => {
      const d = x.dev;
      const name = normalizeIfaceName(a.iface);
      let i = d.interfaces.find((k) => k.name.toLowerCase() === name.toLowerCase());
      const sub = name.match(/^(.+)\.(\d+)$/);
      if (!i && sub) {
        const parent = d.interfaces.find((k) => k.name.toLowerCase() === sub[1].toLowerCase());
        if (!parent || isSwitch(d)) return caretError(x.prompt(), `interface ${a.iface}`, 1);
        i = { name: `${parent.name}.${sub[2]}`, media: parent.media, mac: parent.mac, shutdown: false, parent: parent.name };
        d.interfaces.push(i);
      }
      if (!i && /^Loopback\d+$/.test(name)) {
        i = { name, media: 'virtual', mac: '0000.0000.0000', shutdown: false };
        d.interfaces.push(i);
      }
      if (!i && /^Vlan\d+$/.test(name) && isSwitch(d)) {
        i = { name, media: 'virtual', mac: d.interfaces[0].mac, shutdown: false };
        d.interfaces.push(i);
      }
      if (!i) return caretError(x.prompt(), `interface ${a.iface}`, 1);
      x.ifaces = [i.name];
      x.mode = i.parent ? 'config-subif' : 'config-if';
    })
    .add('interface range <rest>', 'Configure many ports at once', (x, a) => {
      const list = expandRange(x.dev, a.rest);
      if (!list) return '% Invalid interface range\n';
      x.ifaces = list;
      x.mode = 'config-if-range';
    })
    .add('no interface <iface>', 'Delete a sub/loopback/SVI interface', (x, a) => {
      const name = normalizeIfaceName(a.iface);
      x.dev.interfaces = x.dev.interfaces.filter((i) => !(i.name.toLowerCase() === name.toLowerCase() && (i.parent || i.media === 'virtual')));
    })
    .add('vlan <num>', 'Create a VLAN and enter VLAN config', (x, a) => {
      if (!isSwitch(x.dev)) return caretError(x.prompt(), `vlan ${a.num}`, 0);
      const id = Number(a.num);
      if (id < 1 || id > 4094) return '% Bad VLAN list\n';
      if (!x.dev.vlans.some((v) => v.id === id)) x.dev.vlans.push({ id, name: `VLAN${String(id).padStart(4, '0')}` });
      x.vlan = id;
      x.mode = 'config-vlan';
      x.emit(`vlan:create:${id}`);
    })
    .add('no vlan <num>', 'Delete a VLAN', (x, a) => {
      const id = Number(a.num);
      if (id === 1) return '%Default VLAN 1 may not be deleted.\n';
      x.dev.vlans = x.dev.vlans.filter((v) => v.id !== id);
      x.hint('Ports that were in this VLAN are now INACTIVE until you move them to a VLAN that exists.');
    })
    .add('ip routing', 'Turn on IP routing (multilayer switches)', (x) => {
      if (x.dev.kind === 'switch') return caretError(x.prompt(), 'ip routing', 1);
      x.dev.ipRouting = true;
    })
    .add('no ip routing', 'Turn off IP routing', (x) => void (x.dev.ipRouting = false))
    .add('ipv6 unicast-routing', 'Allow this router to forward IPv6', (x) => void (x.dev.ipv6Routing = true))
    .add('ip default-gateway <ip>', 'Default gateway for a Layer 2 switch', (x, a) => void (x.dev.defaultGateway = a.ip))
    .add('no ip default-gateway', 'Remove default gateway', (x) => void (x.dev.defaultGateway = undefined))
    .add('ip route <ip> <mask> <ip>', 'Static route via a next-hop IP', (x, a) => addRoute(x, a.ip, a.mask, a.ip2))
    .add('ip route <ip> <mask> <ip> <num>', 'Floating static route (custom AD)', (x, a) => addRoute(x, a.ip, a.mask, a.ip2, undefined, Number(a.num)))
    .add('ip route <ip> <mask> <iface>', 'Static route out an interface', (x, a) => addRoute(x, a.ip, a.mask, undefined, a.iface))
    .add('ip route <ip> <mask> <iface> <ip>', 'Fully specified static route', (x, a) => addRoute(x, a.ip, a.mask, a.ip2, a.iface))
    .add('no ip route <ip> <mask> <rest>', 'Remove a static route', (x, a) => {
      x.dev.staticRoutes = x.dev.staticRoutes.filter((r) => !(r.network === a.ip && r.mask === a.mask));
    })
    .add('router ospf <num>', 'Start OSPF', (x, a) => {
      if (!x.dev.ospf) x.dev.ospf = { processId: Number(a.num), networks: [], passive: [] };
      x.mode = 'config-router';
    })
    .add('no router ospf <num>', 'Remove OSPF', (x) => void (x.dev.ospf = undefined))
    .add('ip dhcp pool <word>', 'Create a DHCP pool', (x, a) => {
      if (!x.dev.dhcpPools.some((p) => p.name === a.word)) x.dev.dhcpPools.push({ name: a.word });
      x.pool = a.word;
      x.mode = 'dhcp-config';
    })
    .add('no ip dhcp pool <word>', 'Delete a DHCP pool', (x, a) => void (x.dev.dhcpPools = x.dev.dhcpPools.filter((p) => p.name !== a.word)))
    .add('ip dhcp excluded-address <ip>', 'Do not hand out this address', (x, a) => void x.dev.dhcpExcluded.push({ low: a.ip, high: a.ip }))
    .add('ip dhcp excluded-address <ip> <ip>', 'Do not hand out this range', (x, a) => void x.dev.dhcpExcluded.push({ low: a.ip, high: a.ip2 }))
    .add('access-list <num> <rest>', 'Numbered access list (1-99 standard, 100-199 extended)', (x, a) => {
      const n = Number(a.num);
      const type = n >= 100 && n <= 199 ? 'extended' : n >= 1 && n <= 99 ? 'standard' : undefined;
      if (!type) return '% Invalid access list number\n';
      const e = parseAclEntry(type, a.rest.split(/\s+/));
      if (typeof e === 'string') return e + '\n';
      let acl = x.dev.acls.find((k) => k.id === a.num);
      if (!acl) x.dev.acls.push((acl = { id: a.num, type, entries: [] }));
      acl.entries.push(e);
    })
    .add('no access-list <word>', 'Delete an access list', (x, a) => void (x.dev.acls = x.dev.acls.filter((k) => k.id !== a.word)))
    .add('ip access-list standard <word>', 'Named standard ACL', (x, a) => {
      if (!x.dev.acls.some((k) => k.id === a.word)) x.dev.acls.push({ id: a.word, type: 'standard', entries: [] });
      x.acl = a.word;
      x.mode = 'config-std-nacl';
    })
    .add('ip access-list extended <word>', 'Named extended ACL', (x, a) => {
      if (!x.dev.acls.some((k) => k.id === a.word)) x.dev.acls.push({ id: a.word, type: 'extended', entries: [] });
      x.acl = a.word;
      x.mode = 'config-ext-nacl';
    })
    .add('ip nat inside source list <word> interface <iface> overload', 'PAT: many private hosts share one public IP', (x, a) => {
      const iface = x.dev.interfaces.find((i) => i.name.toLowerCase() === normalizeIfaceName(a.iface).toLowerCase());
      if (!iface) return '% Invalid interface\n';
      x.dev.nat = x.dev.nat.filter((n) => n.listAcl !== a.word);
      x.dev.nat.push({ listAcl: a.word, overloadIface: iface.name, statics: [] });
    })
    .add('ip nat inside source static <ip> <ip>', 'Static NAT: one private IP <-> one public IP', (x, a) => {
      let rule = x.dev.nat.find((n) => n.listAcl === '__static');
      if (!rule) x.dev.nat.push((rule = { listAcl: '__static', statics: [] }));
      rule.statics.push({ inside: a.ip, outside: a.ip2 });
    })
    .add('no ip nat inside source list <word> interface <iface> overload', 'Remove PAT', (x, a) => void (x.dev.nat = x.dev.nat.filter((n) => n.listAcl !== a.word)))
    .add('spanning-tree mode rapid-pvst', 'Use Rapid PVST+ (fast convergence)', (x) => void (x.dev.stpMode = 'rapid-pvst'))
    .add('spanning-tree mode pvst', 'Use classic PVST+', (x) => void (x.dev.stpMode = 'pvst'))
    .add('spanning-tree vlan <num> priority <num>', 'Bridge priority (lower wins root)', (x, a) => {
      const p = Number(a.num2);
      if (p % 4096 !== 0) return '% Bridge Priority must be in increments of 4096.\n';
      x.dev.stpPriority = p;
    })
    .add('spanning-tree vlan <num> root primary', 'Make this switch the root bridge', (x) => void (x.dev.stpPriority = 24576))
    .add('spanning-tree vlan <num> root secondary', 'Make this switch the backup root', (x) => void (x.dev.stpPriority = 28672))
    .add('cdp run', 'Enable CDP', (x) => void (x.dev.cdpEnabled = true))
    .add('no cdp run', 'Disable CDP (security hardening)', (x) => void (x.dev.cdpEnabled = false))
    .add('lldp run', 'Enable LLDP (vendor-neutral CDP)', (x) => void (x.dev.lldpEnabled = true))
    .add('ntp server <ip>', 'Sync time from an NTP server', (x, a) => void (x.dev.ntpServer = a.ip))
    .add('logging host <ip>', 'Send syslog to a server', (x, a) => void (x.dev.loggingHost = a.ip))
    .add('logging <ip>', 'Send syslog to a server', (x, a) => void (x.dev.loggingHost = a.ip))
    .add('snmp-server community <word> <word>', 'SNMP community string (RO/RW)', (x, a) => {
      (x.dev.snmpCommunity ??= []).push({ name: a.word, mode: a.word2.toLowerCase() === 'rw' ? 'rw' : 'ro' });
    })
    .add('end', 'Exit to privileged EXEC', (x) => exitTo(x, 'priv'))
    .add('exit', 'Exit to privileged EXEC', (x) => exitTo(x, 'priv'));
  t.config = cfg;

  // ---------------------------------------------------------------- interface config
  const ifc = new CommandTable<IosSession>();
  const each = (x: IosSession, fn: (i: Iface) => string | void): string | void => {
    const msgs: string[] = [];
    for (const i of x.ifaceList()) {
      const r = fn(i);
      if (r) msgs.push(r);
    }
    return msgs.length ? [...new Set(msgs)].join('') : undefined;
  };
  const needSwitchport = (x: IosSession, i: Iface) => !isSwitch(x.dev) || !i.switchport || i.media === 'virtual';
  ifc
    .add('ip address <ip> <mask>', 'Set an IPv4 address and subnet mask', (x, a) =>
      each(x, (i) => {
        if (isSwitch(x.dev) && i.switchport) return '% IP addresses may not be configured on L2 links.\n';
        if (!isValidMask(a.mask)) return '% Bad mask /' + a.mask + ' for address ' + a.ip + '\n';
        const pfx = maskToPrefix(a.mask);
        if (pfx < 31 && (networkOf(a.ip, a.mask) === a.ip || broadcastOf(a.ip, a.mask) === a.ip)) {
          x.hint(`${a.ip} is the ${networkOf(a.ip, a.mask) === a.ip ? 'NETWORK' : 'BROADCAST'} address of that subnet - interfaces cannot use it.`);
          return `% Bad mask /${pfx} for address ${a.ip}\n`;
        }
        const clash = x.dev.interfaces.find((o) => o !== i && o.ip && o.mask && sameNet(o.ip, o.mask, a.ip, a.mask));
        if (clash) return `% ${netOf(a.ip, a.mask)} overlaps with ${clash.name}\n`;
        i.ip = a.ip;
        i.mask = a.mask;
        i.dhcpClient = false;
        x.emit(`ip:set:${i.name}`);
      }),
    )
    .add('ip address dhcp', 'Get an address from a DHCP server', (x) =>
      each(x, (i) => {
        i.dhcpClient = true;
      }),
    )
    .add('no ip address', 'Remove the IP address', (x) => each(x, (i) => void (i.ip = i.mask = undefined)))
    .add('ipv6 address <cidr>', 'Set an IPv6 address', (x, a) =>
      each(x, (i) => {
        if (!isIPv6(a.cidr)) return '% Invalid IPv6 address\n';
        (i.ipv6 ??= []).push(a.cidr);
      }),
    )
    .add('ipv6 address <cidr> eui-64', 'IPv6 address built from the MAC (EUI-64)', (x, a) => each(x, (i) => void (i.ipv6 ??= []).push(a.cidr)))
    .add('ipv6 address <word> link-local', 'Set a manual link-local address', () => undefined)
    .add('shutdown', 'Turn the interface OFF', (x) => each(x, (i) => void (i.shutdown = true)))
    .add('no shutdown', 'Turn the interface ON', (x) =>
      each(x, (i) => {
        const wasDown = i.shutdown || i.errDisabled;
        i.shutdown = false;
        i.errDisabled = false;
        if (wasDown) {
          const st = ifaceStatusLine(x, i);
          if (st) x.print(st);
        }
        x.emit(`noshut:${i.name}`);
      }),
    )
    .add('description <rest>', 'Describe the interface (good practice!)', (x, a) => each(x, (i) => void (i.description = a.rest)))
    .add('no description', 'Remove description', (x) => each(x, (i) => void (i.description = undefined)))
    .add('bandwidth <num>', 'Bandwidth in kbps (affects OSPF cost)', (x, a) => each(x, (i) => void (i.bandwidthKbps = Number(a.num))))
    .add('speed <word>', 'Port speed (10/100/1000/auto)', (x, a) => each(x, (i) => void (i.speed = a.word)))
    .add('duplex <word>', 'Duplex (full/half/auto)', (x, a) => each(x, (i) => void (i.duplex = a.word)))
    .add('clock rate <num>', 'DCE clock rate for serial links', () => undefined)
    .add('encapsulation dot1q <num>', 'Tag this sub-interface with a VLAN (router-on-a-stick)', (x, a) =>
      each(x, (i) => {
        if (!i.parent) return '% Configuring IEEE 802.1Q encapsulation on the main interface is not supported\n';
        i.dot1qVlan = Number(a.num);
      }),
    )
    .add('encapsulation dot1q <num> native', 'Native VLAN sub-interface', (x, a) => each(x, (i) => void (i.dot1qVlan = Number(a.num))))
    .add('ip helper-address <ip>', 'Relay DHCP broadcasts to a server on another network', (x, a) => each(x, (i) => void (i.helperAddress = a.ip)))
    .add('no ip helper-address', 'Remove DHCP relay', (x) => each(x, (i) => void (i.helperAddress = undefined)))
    .add('ip access-group <word> <word>', 'Apply an ACL in or out', (x, a) =>
      each(x, (i) => {
        const dir = a.word2.toLowerCase();
        if (dir !== 'in' && dir !== 'out') return '% Use "in" or "out"\n';
        if (dir === 'in') i.aclIn = a.word;
        else i.aclOut = a.word;
      }),
    )
    .add('no ip access-group <word> <word>', 'Remove an ACL', (x, a) => each(x, (i) => void (a.word2.toLowerCase() === 'in' ? (i.aclIn = undefined) : (i.aclOut = undefined))))
    .add('ip nat inside', 'Mark as the PRIVATE side for NAT', (x) => each(x, (i) => void (i.natRole = 'inside')))
    .add('ip nat outside', 'Mark as the PUBLIC side for NAT', (x) => each(x, (i) => void (i.natRole = 'outside')))
    .add('ip ospf cost <num>', 'Manually set OSPF cost', (x, a) => each(x, (i) => void (i.ospfCost = Number(a.num))))
    .add('ip ospf <num> area <num>', 'Enable OSPF directly on the interface', (x, a) =>
      each(x, (i) => {
        if (!i.ip || !i.mask) return '% Configure an IP address first\n';
        const d = x.dev;
        if (!d.ospf) d.ospf = { processId: Number(a.num), networks: [], passive: [] };
        d.ospf.networks.push({ network: i.ip, wildcard: '0.0.0.0', area: Number(a.num2) });
      }),
    )
    .add('standby <num> ip <ip>', 'HSRP virtual gateway IP', (x, a) => each(x, (i) => void (i.hsrp = { group: Number(a.num), ip: a.ip, priority: i.hsrp?.priority ?? 100, preempt: i.hsrp?.preempt ?? false })))
    .add('standby <num> priority <num>', 'HSRP priority (higher = Active)', (x, a) =>
      each(x, (i) => {
        if (!i.hsrp) i.hsrp = { group: Number(a.num), ip: '', priority: 100, preempt: false };
        i.hsrp.priority = Number(a.num2);
      }),
    )
    .add('standby <num> preempt', 'Take back the Active role when recovered', (x) => each(x, (i) => void (i.hsrp && (i.hsrp.preempt = true))))
    .add('standby version 2', 'HSRP version 2', () => undefined)
    .add('switchport mode access', 'Port for one end device in one VLAN', (x) =>
      each(x, (i) => {
        if (needSwitchport(x, i)) return caretError(x.prompt(), 'switchport mode access', 0);
        i.mode = 'access';
      }),
    )
    .add('switchport mode trunk', 'Port that carries many VLANs (802.1Q tags)', (x) =>
      each(x, (i) => {
        if (needSwitchport(x, i)) return caretError(x.prompt(), 'switchport mode trunk', 0);
        i.mode = 'trunk';
        x.emit(`trunk:${i.name}`);
      }),
    )
    .add('switchport mode dynamic auto', 'Let DTP negotiate (not recommended)', (x) => each(x, (i) => void (i.mode = 'dynamic')))
    .add('switchport mode dynamic desirable', 'Actively try to form a trunk', (x) => each(x, (i) => void (i.mode = 'dynamic')))
    .add('switchport nonegotiate', 'Turn off DTP (security best practice)', () => undefined)
    .add('switchport access vlan <num>', 'Put this port in a VLAN', (x, a) =>
      each(x, (i) => {
        if (needSwitchport(x, i)) return caretError(x.prompt(), 'switchport access vlan', 0);
        const id = Number(a.num);
        let msg: string | undefined;
        if (!x.dev.vlans.some((v) => v.id === id)) {
          x.dev.vlans.push({ id, name: `VLAN${String(id).padStart(4, '0')}` });
          msg = `% Access VLAN does not exist. Creating vlan ${id}\n`;
        }
        i.accessVlan = id;
        return msg;
      }),
    )
    .add('no switchport access vlan', 'Back to VLAN 1', (x) => each(x, (i) => void (i.accessVlan = 1)))
    .add('switchport voice vlan <num>', 'VLAN for an IP phone', (x, a) => each(x, (i) => void (i.voiceVlan = Number(a.num))))
    .add('switchport trunk native vlan <num>', 'Untagged VLAN on this trunk (change from 1 for security)', (x, a) => each(x, (i) => void (i.nativeVlan = Number(a.num))))
    .add('switchport trunk allowed vlan <rest>', 'Which VLANs may cross this trunk', (x, a) => each(x, (i) => void (i.trunkAllowed = vlanList(a.rest, i.trunkAllowed))))
    .add('switchport trunk encapsulation dot1q', 'Use 802.1Q tagging', () => undefined)
    .add('switchport port-security', 'Enable port security', (x) =>
      each(x, (i) => {
        if (needSwitchport(x, i)) return caretError(x.prompt(), 'switchport port-security', 0);
        if (i.mode !== 'access') return `Command rejected: ${i.name} is a dynamic port.\n`;
        i.portSecurity = { enabled: true, maximum: i.portSecurity?.maximum ?? 1, violation: i.portSecurity?.violation ?? 'shutdown', sticky: i.portSecurity?.sticky ?? false, learned: i.portSecurity?.learned ?? [] };
        x.emit('portsec:on');
      }),
    )
    .add('no switchport port-security', 'Disable port security', (x) => each(x, (i) => void (i.portSecurity = undefined)))
    .add('switchport port-security maximum <num>', 'Max MAC addresses on this port', (x, a) => each(x, (i) => void (i.portSecurity = { ...(i.portSecurity ?? { enabled: false, violation: 'shutdown', sticky: false, learned: [] }), maximum: Number(a.num) })))
    .add('switchport port-security violation <word>', 'shutdown | restrict | protect', (x, a) =>
      each(x, (i) => {
        const v = a.word.toLowerCase();
        if (!['shutdown', 'restrict', 'protect'].includes(v)) return '% Use shutdown, restrict or protect\n';
        i.portSecurity = { ...(i.portSecurity ?? { enabled: false, maximum: 1, sticky: false, learned: [] }), violation: v as 'shutdown' };
      }),
    )
    .add('switchport port-security mac-address sticky', 'Learn and remember the MAC', (x) => each(x, (i) => void (i.portSecurity = { ...(i.portSecurity ?? { enabled: false, maximum: 1, violation: 'shutdown', learned: [] }), sticky: true })))
    .add('no switchport', 'Make this a routed (Layer 3) port', (x) =>
      each(x, (i) => {
        if (x.dev.kind !== 'l3switch') return caretError(x.prompt(), 'no switchport', 1);
        i.switchport = false;
      }),
    )
    .add('switchport', 'Make this a Layer 2 port', (x) => each(x, (i) => void (isSwitch(x.dev) && (i.switchport = true))))
    .add('spanning-tree portfast', 'Skip listening/learning on edge ports', (x) => each(x, (i) => void (i.portfast = true)))
    .add('spanning-tree bpduguard enable', 'Shut the port if a switch is plugged in', (x) => each(x, (i) => void (i.bpduguard = true)))
    .add('channel-group <num> mode <word>', 'Bundle into an EtherChannel (active/passive=LACP, desirable/auto=PAgP, on)', (x, a) =>
      each(x, (i) => {
        const mode = a.word.toLowerCase();
        if (!['active', 'passive', 'on', 'desirable', 'auto'].includes(mode)) return '% Invalid mode\n';
        i.channelGroup = { id: Number(a.num), mode: mode as 'active' };
      }),
    )
    .add('end', 'Exit to privileged EXEC', (x) => exitTo(x, 'priv'))
    .add('exit', 'Back to global config', (x) => exitTo(x, 'config'));
  t['config-if'] = ifc;
  t['config-subif'] = ifc;
  t['config-if-range'] = ifc;

  // ---------------------------------------------------------------- line
  const ln = new CommandTable<IosSession>();
  const lc = (x: IosSession) => (x.line === 'con' ? x.dev.lineCon : x.dev.lineVty);
  ln.add('password <word>', 'Set the line password', (x, a) => void (lc(x).password = a.word))
    .add('login', 'Ask for the line password', (x) => {
      const l = lc(x);
      l.login = true;
      l.loginLocal = false;
      if (!l.password) return '% Login disabled on line, until \'password\' is set\n';
    })
    .add('login local', 'Ask for a username + password from the local database', (x) => {
      lc(x).loginLocal = true;
      lc(x).login = true;
    })
    .add('no login', 'Do not ask for a password', (x) => void ((lc(x).login = false), (lc(x).loginLocal = false)))
    .add('transport input <word>', 'Which protocols may connect (ssh/telnet/all/none)', (x, a) => {
      const v = a.word.toLowerCase();
      if (!['ssh', 'telnet', 'all', 'none'].includes(v)) return '% Use ssh, telnet, all or none\n';
      lc(x).transportInput = v as 'ssh';
    })
    .add('transport input ssh telnet', 'Allow SSH and Telnet', (x) => void (lc(x).transportInput = 'all'))
    .add('exec-timeout <num> <num>', 'Log idle users out after minutes seconds', (x, a) => void (lc(x).execTimeout = `${a.num} ${a.num2}`))
    .add('logging synchronous', 'Stop log messages interrupting your typing', () => undefined);
  endExit(ln, 'config');
  t['config-line'] = ln;

  // ---------------------------------------------------------------- router ospf
  const ro = new CommandTable<IosSession>();
  ro.add('network <ip> <wild> area <num>', 'Advertise matching interfaces into an area', (x, a) => {
    const o = x.dev.ospf!;
    if (!o.networks.some((n) => n.network === a.ip && n.wildcard === a.wild)) o.networks.push({ network: a.ip, wildcard: a.wild, area: Number(a.num) });
    x.emit('ospf:network');
    if (isValidMask(a.wild) && a.wild !== '0.0.0.0' && a.wild !== '255.255.255.255')
      x.hint(`That looks like a subnet MASK. OSPF network statements use a WILDCARD mask: ${wildcardOf(a.wild)}`);
  })
    .add('no network <ip> <wild> area <num>', 'Stop advertising', (x, a) => void (x.dev.ospf!.networks = x.dev.ospf!.networks.filter((n) => !(n.network === a.ip && n.wildcard === a.wild))))
    .add('router-id <ip>', 'Set the OSPF router ID', (x, a) => {
      x.dev.ospf!.routerId = a.ip;
      return '% OSPF: Reload or use "clear ip ospf process" command, for this to take effect\n';
    })
    .add('passive-interface <iface>', 'Do not send hellos out this interface (LAN side)', (x, a) => void x.dev.ospf!.passive.push(normalizeIfaceName(a.iface)))
    .add('passive-interface default', 'Make every interface passive', (x) => void (x.dev.ospf!.passiveDefault = true))
    .add('no passive-interface <iface>', 'Allow hellos on this interface', (x, a) => {
      const o = x.dev.ospf!;
      const n = normalizeIfaceName(a.iface);
      if (o.passiveDefault) o.passive.push(`!${n}`);
      else o.passive = o.passive.filter((p) => p !== n);
    })
    .add('default-information originate', 'Share my default route with OSPF neighbours', (x) => void (x.dev.ospf!.defaultOriginate = true))
    .add('auto-cost reference-bandwidth <num>', 'Reference bandwidth for cost', () => undefined)
    .add('clear ip ospf process', 'Restart OSPF', () => undefined);
  endExit(ro, 'config');
  t['config-router'] = ro;

  // ---------------------------------------------------------------- vlan
  const vl = new CommandTable<IosSession>();
  vl.add('name <word>', 'Give the VLAN a name', (x, a) => {
    const v = x.dev.vlans.find((k) => k.id === x.vlan);
    if (v) v.name = a.word;
  });
  endExit(vl, 'config');
  t['config-vlan'] = vl;

  // ---------------------------------------------------------------- dhcp pool
  const dh = new CommandTable<IosSession>();
  const pool = (x: IosSession) => x.dev.dhcpPools.find((p) => p.name === x.pool)!;
  dh.add('network <ip> <mask>', 'Subnet this pool hands out', (x, a) => void Object.assign(pool(x), { network: a.ip, mask: a.mask }))
    .add('network <cidr>', 'Subnet in /prefix form', (x, a) => {
      const c = parseCidr(a.cidr);
      if (!c) return '% Invalid network\n';
      Object.assign(pool(x), { network: c.ip, mask: prefixToMask(c.prefix) });
    })
    .add('network <ip> <word>', 'Subnet as "network 192.168.1.0 /24"', (x, a) => {
      const c = parseCidr(`${a.ip}${a.word}`);
      if (!c) return '% Invalid network\n';
      Object.assign(pool(x), { network: c.ip, mask: prefixToMask(c.prefix) });
    })
    .add('default-router <ip>', 'Default gateway given to clients', (x, a) => void (pool(x).defaultRouter = a.ip))
    .add('dns-server <ip>', 'DNS server given to clients', (x, a) => void (pool(x).dns = a.ip))
    .add('domain-name <word>', 'Domain name given to clients', (x, a) => void (pool(x).domain = a.word))
    .add('lease <num>', 'Lease time in days', (x, a) => void (pool(x).leaseDays = Number(a.num)));
  endExit(dh, 'config');
  t['dhcp-config'] = dh;

  // ---------------------------------------------------------------- named ACLs
  for (const kind of ['standard', 'extended'] as const) {
    const ac = new CommandTable<IosSession>();
    const addEntry = (x: IosSession, words: string[]) => {
      const acl = x.dev.acls.find((k) => k.id === x.acl)!;
      const e = parseAclEntry(kind, words);
      if (typeof e === 'string') return e + '\n';
      acl.entries.push(e);
    };
    ac.add('permit <rest>', 'Allow matching traffic', (x, a) => addEntry(x, ['permit', ...a.rest.split(/\s+/)]))
      .add('deny <rest>', 'Block matching traffic', (x, a) => addEntry(x, ['deny', ...a.rest.split(/\s+/)]))
      .add('remark <rest>', 'A comment for humans', (x, a) => addEntry(x, ['remark', ...a.rest.split(/\s+/)]));
    endExit(ac, 'config');
    t[kind === 'standard' ? 'config-std-nacl' : 'config-ext-nacl'] = ac;
  }
}

function addRoute(x: IosSession, network: string, mask: string, nextHop?: string, iface?: string, ad = 1): string | void {
  if (!isValidMask(mask)) return '% Inconsistent address and mask\n';
  if (netOf(network, mask) !== network) return '%Inconsistent address and mask\n';
  let exitIface: string | undefined;
  if (iface) {
    const i = x.dev.interfaces.find((k) => k.name.toLowerCase() === normalizeIfaceName(iface).toLowerCase());
    if (!i) return '% Invalid interface\n';
    exitIface = i.name;
  }
  x.dev.staticRoutes = x.dev.staticRoutes.filter((r) => !(r.network === network && r.mask === mask && r.nextHop === nextHop && r.exitIface === exitIface));
  x.dev.staticRoutes.push({ network, mask, nextHop, exitIface, ad });
  x.emit('route:static');
}

function ipNum(ip: string): number {
  return ip.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
}
function netOf(ip: string, mask: string): string {
  const n = (ipNum(ip) & ipNum(mask)) >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}
function sameNet(ip1: string, m1: string, ip2: string, m2: string): boolean {
  const m = maskToPrefix(m1) < maskToPrefix(m2) ? m1 : m2;
  return netOf(ip1, m) === netOf(ip2, m);
}

function ifaceStatusLine(x: IosSession, i: Iface): string | undefined {
  if (isUp(x.topo, x.dev, i))
    return `%LINK-5-CHANGED: Interface ${i.name}, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${i.name}, changed state to up`;
  return `%LINK-5-CHANGED: Interface ${i.name}, changed state to down`;
}

