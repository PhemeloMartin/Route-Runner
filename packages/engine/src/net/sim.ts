/**
 * The packet simulator.
 *
 * Analogy: think of the network as a city.
 *  - Switches are the streets inside one suburb (a VLAN / broadcast domain).
 *  - Routers are the highway interchanges between suburbs.
 *  - ARP is shouting down the street "who lives at 192.168.1.20?".
 *  - The routing table is the road-sign board at every interchange.
 *
 * We do not simulate electricity - we simulate the DECISIONS every device makes,
 * which is exactly what the CCNA tests.
 */
import {
  broadcastOf,
  inNetwork,
  intToIp,
  ipToInt,
  isIPv4,
  maskToPrefix,
  networkOf,
  prefixToMask,
  wildcardMatch,
} from './ip.js';
import {
  type Acl,
  type Device,
  type Iface,
  type Topology,
  cableProblem,
  getDevice,
  isEndHost,
  isSwitch,
  linkAt,
  peerOf,
} from './model.js';

// ------------------------------------------------------------ interface status

export interface IfaceStatus {
  status: 'up' | 'down' | 'administratively down';
  protocol: 'up' | 'down';
  reason?: string;
}

export function ifaceStatus(t: Topology, d: Device, i: Iface): IfaceStatus {
  if (i.shutdown) return { status: 'administratively down', protocol: 'down', reason: 'shutdown' };
  if (i.errDisabled) return { status: 'down', protocol: 'down', reason: 'err-disabled (port security)' };
  if (i.name.startsWith('Loopback')) return { status: 'up', protocol: 'up' };
  if (i.parent) {
    const p = d.interfaces.find((x) => x.name === i.parent);
    return p ? ifaceStatus(t, d, p) : { status: 'down', protocol: 'down' };
  }
  if (i.name.startsWith('Vlan')) {
    const vid = Number(i.name.slice(4));
    if (!d.vlans.some((v) => v.id === vid)) return { status: 'down', protocol: 'down', reason: `VLAN ${vid} does not exist` };
    const active = d.interfaces.some((p) => {
      if (!p.switchport || p.media === 'virtual') return false;
      const st = ifaceStatus(t, d, p);
      if (st.protocol !== 'up') return false;
      const mode = effectiveMode(t, d, p);
      return mode === 'trunk' ? trunkAllows(p, vid) : (p.accessVlan ?? 1) === vid;
    });
    return active ? { status: 'up', protocol: 'up' } : { status: 'up', protocol: 'down', reason: `no active ports in VLAN ${vid}` };
  }
  if (i.media === 'console' || i.media === 'virtual') return { status: 'up', protocol: 'up' };
  const link = linkAt(t, d.id, i.name);
  if (!link) return { status: 'down', protocol: 'down', reason: 'no cable connected' };
  const peer = peerOf(t, d.id, i.name)!;
  const pd = getDevice(t, peer.device);
  const pi = pd.interfaces.find((x) => x.name === peer.iface);
  if (!pi) return { status: 'down', protocol: 'down' };
  const problem = cableProblem(link.cable, i.media, pi.media, d.kind, pd.kind);
  if (problem) return { status: 'down', protocol: 'down', reason: problem };
  if (pi.shutdown || pi.errDisabled) return { status: 'down', protocol: 'down', reason: 'the other end is shut down' };
  return { status: 'up', protocol: 'up' };
}

export function isUp(t: Topology, d: Device, i: Iface): boolean {
  return ifaceStatus(t, d, i).protocol === 'up';
}

/** DTP in one line: "dynamic" ports become trunks if the other side is hard-set to trunk, else access. */
export function effectiveMode(t: Topology, d: Device, p: Iface): 'access' | 'trunk' {
  if (p.mode === 'trunk') return 'trunk';
  if (p.mode === 'access') return 'access';
  const peer = peerOf(t, d.id, p.name);
  if (peer) {
    const pd = t.devices.find((x) => x.id === peer.device);
    const pi = pd?.interfaces.find((x) => x.name === peer.iface);
    if (pd && isSwitch(pd) && pi?.switchport && pi.mode === 'trunk') return 'trunk';
  }
  return 'access';
}

export function trunkAllows(p: Iface, vlan: number): boolean {
  return !p.trunkAllowed || p.trunkAllowed === 'all' || p.trunkAllowed.includes(vlan);
}

// ------------------------------------------------------------ layer 2: who shares my broadcast domain?

export interface Endpoint {
  device: string;
  iface: string;
  ip: string;
  mask: string;
  mac: string;
}

function l3Ready(t: Topology, d: Device, i: Iface): boolean {
  if (!i.ip || !i.mask) return false;
  if (isSwitch(d) && i.switchport) return false;
  return isUp(t, d, i);
}

/**
 * Starting at an L3 interface, walk every cable and switch the frame could flood through
 * (respecting VLANs, trunks, native VLANs and shutdown ports) and collect every L3
 * interface that would hear an ARP broadcast. Spanning-tree means real networks have no
 * loops; here a "visited" set does the same job.
 */
export function broadcastDomain(t: Topology, deviceId: string, ifaceName: string): Endpoint[] {
  const found = new Map<string, Endpoint>();
  const seenPort = new Set<string>();
  const seenVlan = new Set<string>();

  const addEndpoint = (d: Device, i: Iface) => {
    if (i.ip && i.mask && l3Ready(t, d, i))
      found.set(`${d.id}|${i.name}`, { device: d.id, iface: i.name, ip: i.ip, mask: i.mask, mac: i.mac });
  };

  const emit = (d: Device, port: Iface, tag: number | undefined) => {
    if (!isUp(t, d, port)) return;
    const peer = peerOf(t, d.id, port.name);
    if (!peer) return;
    const pd = getDevice(t, peer.device);
    const pp = pd.interfaces.find((x) => x.name === peer.iface);
    if (pp) arrive(pd, pp, tag);
  };

  const flood = (d: Device, vlan: number, except?: string) => {
    const key = `${d.id}#${vlan}`;
    if (seenVlan.has(key)) return;
    seenVlan.add(key);
    if (!d.vlans.some((v) => v.id === vlan)) return;
    const svi = d.interfaces.find((x) => x.name === `Vlan${vlan}`);
    if (svi) addEndpoint(d, svi);
    for (const p of d.interfaces) {
      if (!p.switchport || p.name === except || p.media === 'virtual' || p.media === 'console') continue;
      if (!isUp(t, d, p)) continue;
      const mode = effectiveMode(t, d, p);
      if (mode === 'access' && (p.accessVlan ?? 1) === vlan) emit(d, p, undefined);
      if (mode === 'trunk' && trunkAllows(p, vlan)) emit(d, p, vlan === (p.nativeVlan ?? 1) ? undefined : vlan);
    }
  };

  const arrive = (d: Device, port: Iface, tag: number | undefined) => {
    const key = `${d.id}|${port.name}|${tag ?? 'u'}`;
    if (seenPort.has(key)) return;
    seenPort.add(key);
    if (isSwitch(d) && port.switchport) {
      const mode = effectiveMode(t, d, port);
      let vlan: number;
      if (mode === 'access') {
        if (tag !== undefined) return; // access ports drop tagged frames
        vlan = port.accessVlan ?? 1;
      } else {
        vlan = tag ?? port.nativeVlan ?? 1;
        if (!trunkAllows(port, vlan)) return;
      }
      flood(d, vlan, port.name);
      return;
    }
    if (tag === undefined) {
      addEndpoint(d, port);
    } else {
      const sub = d.interfaces.find((x) => x.parent === port.name && x.dot1qVlan === tag);
      if (sub) addEndpoint(d, sub);
    }
  };

  const d = getDevice(t, deviceId);
  const start = d.interfaces.find((x) => x.name === ifaceName);
  if (!start || !isUp(t, d, start)) return [];
  if (start.name.startsWith('Vlan')) {
    flood(d, Number(start.name.slice(4)));
  } else if (start.parent && start.dot1qVlan) {
    const parent = d.interfaces.find((x) => x.name === start.parent)!;
    emit(d, parent, start.dot1qVlan);
  } else {
    emit(d, start, undefined);
  }
  found.delete(`${d.id}|${start.name}`);
  return [...found.values()];
}

// ------------------------------------------------------------ HSRP

export interface HsrpState {
  device: string;
  iface: string;
  group: number;
  vip: string;
  priority: number;
  preempt: boolean;
  state: 'Active' | 'Standby' | 'Listen' | 'Init';
  active?: string;
  standby?: string;
}

export function hsrpStates(t: Topology): HsrpState[] {
  const members: { d: Device; i: Iface }[] = [];
  for (const d of t.devices)
    for (const i of d.interfaces) if (i.hsrp && i.ip && isUp(t, d, i)) members.push({ d, i });
  const out: HsrpState[] = [];
  const done = new Set<string>();
  for (const m of members) {
    const key = `${m.d.id}|${m.i.name}`;
    if (done.has(key)) continue;
    const domain = broadcastDomain(t, m.d.id, m.i.name);
    const group = [m, ...members.filter((o) => domain.some((e) => e.device === o.d.id && e.iface === o.i.name))].filter(
      (o) => o.i.hsrp!.group === m.i.hsrp!.group,
    );
    group.sort((a, b) => b.i.hsrp!.priority - a.i.hsrp!.priority || ipToInt(b.i.ip!) - ipToInt(a.i.ip!));
    const active = group[0];
    const standby = group[1];
    for (const g of group) {
      done.add(`${g.d.id}|${g.i.name}`);
      out.push({
        device: g.d.id,
        iface: g.i.name,
        group: g.i.hsrp!.group,
        vip: g.i.hsrp!.ip,
        priority: g.i.hsrp!.priority,
        preempt: g.i.hsrp!.preempt,
        state: g === active ? 'Active' : g === standby ? 'Standby' : 'Listen',
        active: active.i.ip,
        standby: standby?.i.ip,
      });
    }
  }
  return out;
}

/** ARP: who on this segment owns `ip`? Includes HSRP virtual IPs (answered by the Active router). */
function resolveOnSegment(t: Topology, deviceId: string, ifaceName: string, ip: string): Endpoint | undefined {
  const domain = broadcastDomain(t, deviceId, ifaceName);
  const direct = domain.find((e) => e.ip === ip);
  if (direct) return direct;
  const active = hsrpStates(t).find((h) => h.vip === ip && h.state === 'Active');
  if (active) return domain.find((e) => e.device === active.device && e.iface === active.iface);
  return undefined;
}

// ------------------------------------------------------------ routing

export type RouteCode = 'C' | 'L' | 'S' | 'S*' | 'O' | 'O*E2';
export interface Route {
  code: RouteCode;
  network: string;
  mask: string;
  prefix: number;
  ad: number;
  metric: number;
  nextHop?: string;
  exitIface?: string;
}

export function l3Interfaces(t: Topology, d: Device): Iface[] {
  return d.interfaces.filter((i) => l3Ready(t, d, i));
}

function connectedRoutes(t: Topology, d: Device): Route[] {
  const out: Route[] = [];
  for (const i of l3Interfaces(t, d)) {
    const prefix = maskToPrefix(i.mask!);
    out.push({ code: 'C', network: networkOf(i.ip!, i.mask!), mask: i.mask!, prefix, ad: 0, metric: 0, exitIface: i.name });
    out.push({ code: 'L', network: i.ip!, mask: '255.255.255.255', prefix: 32, ad: 0, metric: 0, exitIface: i.name });
  }
  return out;
}

function lpm(routes: Route[], ip: string): Route | undefined {
  let best: Route | undefined;
  for (const r of routes) {
    if (!inNetwork(ip, r.network, r.mask)) continue;
    if (!best || r.prefix > best.prefix || (r.prefix === best.prefix && r.ad < best.ad)) best = r;
  }
  return best;
}

function ifaceCost(i: Iface): number {
  if (i.ospfCost) return i.ospfCost;
  if (i.name.startsWith('Loopback')) return 1;
  const bw = i.bandwidthKbps ?? (i.name.startsWith('Serial') ? 1544 : i.name.startsWith('FastEthernet') ? 100000 : 1000000);
  return Math.max(1, Math.floor(100000 / bw));
}

function ospfArea(d: Device, i: Iface): number | undefined {
  if (!d.ospf || !i.ip) return undefined;
  for (const n of d.ospf.networks) if (wildcardMatch(i.ip, n.network, n.wildcard)) return n.area;
  return undefined;
}

function isPassive(d: Device, i: Iface): boolean {
  if (!d.ospf) return true;
  if (i.name.startsWith('Loopback')) return true;
  return d.ospf.passiveDefault ? !d.ospf.passive.includes(`!${i.name}`) : d.ospf.passive.includes(i.name);
}

export function ospfRouterId(t: Topology, d: Device): string | undefined {
  if (!d.ospf) return undefined;
  if (d.ospf.routerId) return d.ospf.routerId;
  const loops = d.interfaces.filter((i) => i.name.startsWith('Loopback') && i.ip && !i.shutdown);
  const pool = loops.length ? loops : l3Interfaces(t, d);
  if (!pool.length) return undefined;
  return pool.map((i) => i.ip!).sort((a, b) => ipToInt(b) - ipToInt(a))[0];
}

export interface OspfNeighbor {
  device: string;
  neighborId: string;
  address: string;
  localIface: string;
  remoteIface: string;
  state: 'FULL';
  role: 'DR' | 'BDR' | 'DROTHER';
  cost: number;
}

export function ospfNeighbors(t: Topology, d: Device): OspfNeighbor[] {
  if (!d.ospf) return [];
  const out: OspfNeighbor[] = [];
  for (const i of l3Interfaces(t, d)) {
    const area = ospfArea(d, i);
    if (area === undefined || isPassive(d, i)) continue;
    for (const e of broadcastDomain(t, d.id, i.name)) {
      const nd = getDevice(t, e.device);
      if (!nd.ospf || nd.id === d.id) continue;
      const ni = nd.interfaces.find((x) => x.name === e.iface)!;
      if (ospfArea(nd, ni) !== area || isPassive(nd, ni)) continue;
      if (networkOf(i.ip!, i.mask!) !== networkOf(ni.ip!, ni.mask!) || i.mask !== ni.mask) continue;
      const rid = ospfRouterId(t, nd) ?? ni.ip!;
      out.push({
        device: nd.id,
        neighborId: rid,
        address: ni.ip!,
        localIface: i.name,
        remoteIface: ni.name,
        state: 'FULL',
        role: i.name.startsWith('Serial') ? 'DROTHER' : ipToInt(rid) > ipToInt(ospfRouterId(t, d) ?? '0.0.0.0') ? 'DR' : 'BDR',
        cost: ifaceCost(i),
      });
    }
  }
  return out;
}

function ospfRoutes(t: Topology, d: Device): Route[] {
  if (!d.ospf) return [];
  const routers = t.devices.filter((x) => x.ospf && (x.ipRouting || x.kind === 'router' || x.kind === 'isp'));
  // Dijkstra over routers
  const dist = new Map<string, number>([[d.id, 0]]);
  const firstHop = new Map<string, { ip: string; iface: string }>();
  const visited = new Set<string>();
  const nbrCache = new Map<string, OspfNeighbor[]>();
  const nbrs = (id: string) => {
    if (!nbrCache.has(id)) nbrCache.set(id, ospfNeighbors(t, getDevice(t, id)));
    return nbrCache.get(id)!;
  };
  while (true) {
    let cur: string | undefined;
    let best = Infinity;
    for (const [id, dv] of dist) if (!visited.has(id) && dv < best) ((best = dv), (cur = id));
    if (!cur) break;
    visited.add(cur);
    for (const n of nbrs(cur)) {
      const nd = best + n.cost;
      if (nd < (dist.get(n.device) ?? Infinity)) {
        dist.set(n.device, nd);
        firstHop.set(n.device, cur === d.id ? { ip: n.address, iface: n.localIface } : firstHop.get(cur)!);
      }
    }
  }
  const mine = new Set(connectedRoutes(t, d).filter((r) => r.code === 'C').map((r) => `${r.network}/${r.prefix}`));
  const best = new Map<string, Route>();
  for (const r of routers) {
    if (r.id === d.id || !dist.has(r.id)) continue;
    const hop = firstHop.get(r.id)!;
    for (const i of l3Interfaces(t, r)) {
      if (ospfArea(r, i) === undefined) continue;
      const loop = i.name.startsWith('Loopback');
      const mask = loop ? '255.255.255.255' : i.mask!;
      const network = loop ? i.ip! : networkOf(i.ip!, i.mask!);
      const prefix = maskToPrefix(mask);
      const key = `${network}/${prefix}`;
      if (mine.has(key)) continue;
      const metric = dist.get(r.id)! + ifaceCost(i);
      const prev = best.get(key);
      if (!prev || metric < prev.metric)
        best.set(key, { code: 'O', network, mask, prefix, ad: 110, metric, nextHop: hop.ip, exitIface: hop.iface });
    }
    if (r.ospf?.defaultOriginate && r.staticRoutes.some((s) => s.network === '0.0.0.0' && s.mask === '0.0.0.0')) {
      const prev = best.get('0.0.0.0/0');
      const metric = dist.get(r.id)!;
      if (!prev || metric < prev.metric)
        best.set('0.0.0.0/0', {
          code: 'O*E2',
          network: '0.0.0.0',
          mask: '0.0.0.0',
          prefix: 0,
          ad: 110,
          metric: 1,
          nextHop: hop.ip,
          exitIface: hop.iface,
        });
    }
  }
  return [...best.values()];
}

/** The full routing table, exactly what "show ip route" prints. Lower Administrative Distance wins. */
export function routingTable(t: Topology, d: Device): Route[] {
  if (!d.ipRouting) return connectedRoutes(t, d);
  const connected = connectedRoutes(t, d);
  const candidates: Route[] = [...connected];
  for (const s of d.staticRoutes) {
    const prefix = maskToPrefix(s.mask);
    const isDefault = prefix === 0;
    if (s.exitIface) {
      const i = d.interfaces.find((x) => x.name === s.exitIface);
      if (!i || !isUp(t, d, i)) continue;
      candidates.push({ code: isDefault ? 'S*' : 'S', network: s.network, mask: s.mask, prefix, ad: s.ad, metric: 0, nextHop: s.nextHop, exitIface: s.exitIface });
    } else if (s.nextHop) {
      const via = lpm(connected, s.nextHop);
      if (!via) continue; // next hop not reachable -> route not installed
      candidates.push({ code: isDefault ? 'S*' : 'S', network: s.network, mask: s.mask, prefix, ad: s.ad, metric: 0, nextHop: s.nextHop, exitIface: via.exitIface });
    }
  }
  candidates.push(...ospfRoutes(t, d));
  const best = new Map<string, Route>();
  for (const r of candidates) {
    const key = `${r.code === 'L' ? 'L' : ''}${r.network}/${r.prefix}`;
    const prev = best.get(key);
    if (!prev || r.ad < prev.ad) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => ipToInt(a.network) - ipToInt(b.network) || a.prefix - b.prefix);
}

// ------------------------------------------------------------ ACL

export function resolveAcl(d: Device, id: string | undefined): Acl | undefined {
  if (!id) return undefined;
  return d.acls.find((a) => a.id.toLowerCase() === id.toLowerCase());
}

export interface Packet {
  src: string;
  dst: string;
  proto: 'icmp' | 'tcp' | 'udp';
  port?: number;
}

export function aclPermits(acl: Acl, p: Packet): { permit: boolean; line?: number } {
  for (let n = 0; n < acl.entries.length; n++) {
    const e = acl.entries[n];
    if (e.remark) continue;
    if (!wildcardMatch(p.src, e.src, e.srcWildcard)) continue;
    if (acl.type === 'extended') {
      if (e.protocol !== 'ip' && e.protocol !== p.proto) continue;
      if (!wildcardMatch(p.dst, e.dst, e.dstWildcard)) continue;
      if (e.port !== undefined && e.port !== p.port) continue;
    }
    return { permit: e.action === 'permit', line: n };
  }
  return { permit: false }; // the invisible "deny any" at the end of every ACL
}

// ------------------------------------------------------------ forwarding

export interface Hop {
  device: string;
  hostname: string;
  ingress?: string;
  egress?: string;
  ip?: string;
  note: string;
}

export interface ForwardResult {
  ok: boolean;
  hops: Hop[];
  reason?: string;
  failedAt?: string;
  finalSrc: string;
  deliveredTo?: string;
}

interface NatCtx {
  translations: { device: string; insideLocal: string; insideGlobal: string }[];
}

function ownsIp(t: Topology, d: Device, ip: string): boolean {
  if (l3Interfaces(t, d).some((i) => i.ip === ip)) return true;
  return hsrpStates(t).some((h) => h.device === d.id && h.vip === ip && h.state === 'Active');
}

function hostIface(t: Topology, d: Device): Iface | undefined {
  return l3Interfaces(t, d).find((i) => !i.name.startsWith('Loopback'));
}

export function forward(
  t: Topology,
  srcDeviceId: string,
  pkt: Packet,
  nat: NatCtx = { translations: [] },
  srcIfaceHint?: string,
): ForwardResult {
  const hops: Hop[] = [];
  let cur = getDevice(t, srcDeviceId);
  let ingress: string | undefined;
  const p: Packet = { ...pkt };
  for (let ttl = 30; ttl > 0; ttl--) {
    const fail = (reason: string): ForwardResult => ({ ok: false, hops, reason, failedAt: cur.id, finalSrc: p.src });

    // 1. inbound NAT (outside -> inside) and inbound ACL
    if (ingress) {
      const inI = cur.interfaces.find((x) => x.name === ingress)!;
      if (inI.natRole === 'outside') {
        const tr = nat.translations.find((x) => x.device === cur.id && x.insideGlobal === p.dst);
        const st = cur.nat.flatMap((n) => n.statics).find((s) => s.outside === p.dst);
        if (tr) p.dst = tr.insideLocal;
        else if (st) p.dst = st.inside;
      }
      const acl = resolveAcl(cur, inI.aclIn);
      if (acl && !aclPermits(acl, p).permit)
        return fail(`Blocked by ACL ${acl.id} inbound on ${cur.hostname} ${inI.name} (remember the implicit "deny any" at the end)`);
    }

    // 2. arrived?
    if (ownsIp(t, cur, p.dst)) {
      hops.push({ device: cur.id, hostname: cur.hostname, ingress, ip: p.dst, note: 'delivered' });
      return { ok: true, hops, finalSrc: p.src, deliveredTo: cur.id };
    }
    if (hops.length > 0 && isEndHost(cur)) return fail(`${cur.hostname} received a packet that is not for it and is not a router - dropped`);

    // 3. pick the next hop
    let exit: Iface | undefined;
    let nextHop: string;
    if (isEndHost(cur) || (isSwitch(cur) && !cur.ipRouting)) {
      exit = srcIfaceHint ? cur.interfaces.find((x) => x.name === srcIfaceHint) : hostIface(t, cur);
      if (!exit || !exit.ip || !exit.mask) return fail(`${cur.hostname} has no IP address configured (or its port is down)`);
      if (!isUp(t, cur, exit)) return fail(`${cur.hostname} ${exit.name} is down`);
      if (inNetwork(p.dst, exit.ip, exit.mask)) nextHop = p.dst;
      else {
        if (!cur.defaultGateway) return fail(`${cur.hostname} has no default gateway, so it cannot reach other networks`);
        if (!inNetwork(cur.defaultGateway, exit.ip, exit.mask))
          return fail(`${cur.hostname}'s default gateway ${cur.defaultGateway} is not in its own subnet`);
        nextHop = cur.defaultGateway;
      }
    } else {
      const r = lpm(routingTable(t, cur), p.dst);
      if (!r) return fail(`${cur.hostname} has no route to ${p.dst} (check "show ip route")`);
      exit = cur.interfaces.find((x) => x.name === r.exitIface)!;
      nextHop = r.code === 'C' || r.code === 'L' || !r.nextHop ? p.dst : r.nextHop;
    }
    if (!p.src) p.src = exit.ip!;

    // 4. outbound NAT (inside -> outside) and outbound ACL
    if (exit.natRole === 'outside' && ingress) {
      const inI = cur.interfaces.find((x) => x.name === ingress);
      if (inI?.natRole === 'inside') {
        for (const rule of cur.nat) {
          const st = rule.statics.find((s) => s.inside === p.src);
          if (st) {
            nat.translations.push({ device: cur.id, insideLocal: p.src, insideGlobal: st.outside });
            p.src = st.outside;
            break;
          }
          const acl = resolveAcl(cur, rule.listAcl);
          if (acl && aclPermits(acl, p).permit && rule.overloadIface) {
            const out = cur.interfaces.find((x) => x.name === rule.overloadIface);
            if (out?.ip) {
              nat.translations.push({ device: cur.id, insideLocal: p.src, insideGlobal: out.ip });
              p.src = out.ip;
              break;
            }
          }
        }
      }
    }
    const aclOut = resolveAcl(cur, exit.aclOut);
    if (aclOut && !aclPermits(aclOut, p).permit) return fail(`Blocked by ACL ${aclOut.id} outbound on ${cur.hostname} ${exit.name}`);

    // 5. ARP for the next hop on the exit segment (serial point-to-point links have exactly one neighbour)
    let target = resolveOnSegment(t, cur.id, exit.name, nextHop);
    if (!target && exit.name.startsWith('Serial')) target = broadcastDomain(t, cur.id, exit.name)[0];
    hops.push({ device: cur.id, hostname: cur.hostname, ingress, egress: exit.name, ip: exit.ip, note: `next hop ${nextHop}` });
    if (!target) return fail(`${cur.hostname} sent an ARP request for ${nextHop} out ${exit.name} but nobody answered (wrong IP, wrong VLAN, port down or missing cable)`);
    cur = getDevice(t, target.device);
    ingress = target.iface;
  }
  return { ok: false, hops, reason: 'TTL expired - a routing loop!', finalSrc: p.src };
}

export interface PingResult {
  success: boolean;
  sent: number;
  received: number;
  forward: ForwardResult;
  reply?: ForwardResult;
  reason?: string;
  translations: NatCtx['translations'];
}

export function ping(t: Topology, srcDeviceId: string, dstIp: string, srcIp?: string, srcIface?: string): PingResult {
  if (!isIPv4(dstIp)) {
    return { success: false, sent: 0, received: 0, forward: { ok: false, hops: [], finalSrc: '' }, reason: 'Invalid IP address', translations: [] };
  }
  const nat: NatCtx = { translations: [] };
  const fwd = forward(t, srcDeviceId, { src: srcIp ?? '', dst: dstIp, proto: 'icmp' }, nat, srcIface);
  if (!fwd.ok) return { success: false, sent: 5, received: 0, forward: fwd, reason: fwd.reason, translations: nat.translations };
  const replier = fwd.deliveredTo!;
  const rep = forward(t, replier, { src: dstIp, dst: fwd.finalSrc, proto: 'icmp' }, nat);
  if (!rep.ok)
    return { success: false, sent: 5, received: 0, forward: fwd, reply: rep, reason: `The ping arrived but the REPLY could not get back: ${rep.reason}`, translations: nat.translations };
  recordNat(t, nat);
  return { success: true, sent: 5, received: 5, forward: fwd, reply: rep, translations: nat.translations };
}

/** Can `srcDevice` open a TCP session to dstIp:port (used for SSH/Telnet/HTTP checks)? */
export function tcpReach(
  t: Topology,
  srcDeviceId: string,
  dstIp: string,
  port: number,
  proto: 'tcp' | 'udp' = 'tcp',
): { ok: boolean; reason?: string; device?: string } {
  const nat: NatCtx = { translations: [] };
  const fwd = forward(t, srcDeviceId, { src: '', dst: dstIp, proto, port }, nat);
  if (!fwd.ok) return { ok: false, reason: fwd.reason };
  const rep = forward(t, fwd.deliveredTo!, { src: dstIp, dst: fwd.finalSrc, proto }, nat);
  if (!rep.ok) return { ok: false, reason: rep.reason };
  return { ok: true, device: fwd.deliveredTo };
}

// ------------------------------------------------------------ runtime tables (ARP / NAT / MAC)

export interface Runtime {
  arp: Record<string, { ip: string; mac: string; iface: string }[]>;
  nat: Record<string, { insideLocal: string; insideGlobal: string }[]>;
}

export function runtimeOf(t: Topology): Runtime {
  const anyT = t as Topology & { runtime?: Runtime };
  if (!anyT.runtime) anyT.runtime = { arp: {}, nat: {} };
  return anyT.runtime;
}

function recordNat(t: Topology, nat: NatCtx) {
  const rt = runtimeOf(t);
  for (const tr of nat.translations) {
    const list = (rt.nat[tr.device] ??= []);
    if (!list.some((x) => x.insideLocal === tr.insideLocal)) list.push({ insideLocal: tr.insideLocal, insideGlobal: tr.insideGlobal });
  }
}

/** Learn ARP entries along a successful path (so "show arp" / "arp -a" look alive). Returns true if the cache was cold. */
export function learnArp(t: Topology, res: PingResult): boolean {
  const rt = runtimeOf(t);
  let cold = false;
  for (const path of [res.forward, res.reply]) {
    if (!path) continue;
    for (let i = 0; i < path.hops.length - 1; i++) {
      const h = path.hops[i];
      const next = path.hops[i + 1];
      const nd = getDevice(t, next.device);
      const ni = nd.interfaces.find((x) => x.name === next.ingress);
      const hopIp = h.note.replace('next hop ', '');
      if (!ni) continue;
      const list = (rt.arp[h.device] ??= []);
      if (!list.some((e) => e.ip === hopIp)) {
        list.push({ ip: hopIp, mac: ni.mac, iface: h.egress ?? '' });
        if (path === res.forward && i === 0) cold = true;
      }
    }
  }
  return cold;
}

export interface MacEntry {
  vlan: number;
  mac: string;
  port: string;
}

/** What a switch would have learned after everyone has talked once. */
export function macTable(t: Topology, d: Device): MacEntry[] {
  if (!isSwitch(d)) return [];
  const out: MacEntry[] = [];
  for (const p of d.interfaces) {
    if (!p.switchport || p.media === 'virtual' || p.media === 'console' || !isUp(t, d, p)) continue;
    const peer = peerOf(t, d.id, p.name);
    if (!peer) continue;
    const pd = getDevice(t, peer.device);
    const mode = effectiveMode(t, d, p);
    const vlans = mode === 'access' ? [p.accessVlan ?? 1] : d.vlans.map((v) => v.id).filter((v) => trunkAllows(p, v));
    // walk away from this switch through the port and collect end MACs (with the VLAN they live in)
    const ends = new Set<string>();
    const firstHint = mode === 'access' ? p.accessVlan ?? 1 : undefined;
    const stack: { dev: Device; from: string; hint?: number }[] = [{ dev: pd, from: peer.iface, hint: firstHint }];
    const seen = new Set<string>([d.id]);
    while (stack.length) {
      const { dev, from, hint } = stack.pop()!;
      if (!isSwitch(dev)) {
        const i = dev.interfaces.find((x) => x.name === from);
        if (i && (i.ip || isEndHost(dev))) ends.add(`${i.mac}|${hint ?? (mode === 'trunk' ? p.nativeVlan ?? 1 : '')}`);
        for (const sub of dev.interfaces.filter((x) => x.parent === from)) ends.add(`${sub.mac}|${sub.dot1qVlan}`);
        continue;
      }
      if (seen.has(dev.id)) continue;
      seen.add(dev.id);
      for (const q of dev.interfaces) {
        if (!q.switchport || q.name === from || q.media === 'virtual' || !isUp(t, dev, q)) continue;
        const nx = peerOf(t, dev.id, q.name);
        const qHint = effectiveMode(t, dev, q) === 'access' ? q.accessVlan ?? 1 : hint;
        if (nx) stack.push({ dev: getDevice(t, nx.device), from: nx.iface, hint: qHint });
      }
    }
    for (const e of ends) {
      const [mac, v] = e.split('|');
      const vlan = v ? Number(v) : vlans[0];
      if (vlans.includes(vlan)) out.push({ vlan, mac, port: p.name });
    }
  }
  return out.sort((a, b) => a.vlan - b.vlan);
}

// ------------------------------------------------------------ DHCP

export interface DhcpLease {
  ip: string;
  mask: string;
  gateway?: string;
  dns?: string;
  server?: string;
  apipa?: boolean;
}

function ipInUse(t: Topology, ip: string, exceptMac?: string): boolean {
  for (const d of t.devices) {
    for (const i of d.interfaces) if (i.ip === ip && i.mac !== exceptMac && !i.dhcpClient) return true;
    if (d.dhcpBindings.some((b) => b.ip === ip && b.mac !== exceptMac)) return true;
  }
  return false;
}

function allocate(t: Topology, server: Device, poolNetFor: string, client: Iface): DhcpLease | undefined {
  const pool = server.dhcpPools.find((p) => p.network && p.mask && inNetwork(poolNetFor, p.network, p.mask));
  if (!pool || !pool.network || !pool.mask) return undefined;
  const existing = server.dhcpBindings.find((b) => b.mac === client.mac);
  if (existing) return { ip: existing.ip, mask: pool.mask, gateway: pool.defaultRouter, dns: pool.dns, server: server.hostname };
  const start = ipToInt(pool.network) + 1;
  const end = ipToInt(broadcastOf(pool.network, pool.mask)) - 1;
  for (let n = start; n <= end; n++) {
    const ip = intToIp(n);
    if (server.dhcpExcluded.some((x) => n >= ipToInt(x.low) && n <= ipToInt(x.high))) continue;
    if (ipInUse(t, ip, client.mac)) continue;
    server.dhcpBindings.push({ ip, mac: client.mac, pool: pool.name });
    return { ip, mask: pool.mask, gateway: pool.defaultRouter, dns: pool.dns, server: server.hostname };
  }
  return undefined;
}

/** DORA: Discover (broadcast) -> Offer -> Request -> Acknowledge. Falls back to APIPA 169.254.x.x like Windows. */
export function dhcpRequest(t: Topology, clientDeviceId: string, ifaceName?: string): DhcpLease {
  const d = getDevice(t, clientDeviceId);
  const nic = ifaceName ? d.interfaces.find((x) => x.name === ifaceName)! : d.interfaces.find((x) => x.media === 'copper')!;
  nic.dhcpClient = true;
  const savedIp = nic.ip;
  const savedMask = nic.mask;
  // Temporarily give the NIC a placeholder so the L2 walk can start from it.
  nic.ip = '0.0.0.0';
  nic.mask = '0.0.0.0';
  const domain = isUp(t, d, nic) ? broadcastDomain(t, d.id, nic.name) : [];
  nic.ip = savedIp;
  nic.mask = savedMask;
  let lease: DhcpLease | undefined;
  for (const e of domain) {
    const server = getDevice(t, e.device);
    lease = allocate(t, server, e.ip, nic);
    if (lease) break;
    const relayIface = server.interfaces.find((x) => x.name === e.iface);
    if (relayIface?.helperAddress) {
      const target = t.devices.find((x) => x.interfaces.some((i) => i.ip === relayIface.helperAddress));
      if (target && tcpReach(t, server.id, relayIface.helperAddress, 67, 'udp').ok) {
        lease = allocate(t, target, e.ip, nic);
        if (lease) break;
      }
    }
  }
  if (!lease) {
    const tail = nic.mac.replace(/[^0-9a-f]/gi, '');
    lease = {
      ip: `169.254.${parseInt(tail.slice(-4, -2), 16) || 1}.${parseInt(tail.slice(-2), 16) || 1}`,
      mask: '255.255.0.0',
      apipa: true,
    };
  }
  nic.ip = lease.ip;
  nic.mask = lease.mask;
  d.defaultGateway = lease.gateway;
  d.dns = lease.dns;
  return lease;
}

export function dhcpRelease(t: Topology, clientDeviceId: string): void {
  const d = getDevice(t, clientDeviceId);
  const nic = d.interfaces.find((x) => x.media === 'copper')!;
  for (const s of t.devices) s.dhcpBindings = s.dhcpBindings.filter((b) => b.mac !== nic.mac);
  nic.ip = undefined;
  nic.mask = undefined;
  d.defaultGateway = undefined;
}

// ------------------------------------------------------------ spanning tree (display model)

export interface StpPort {
  port: string;
  role: 'Root' | 'Desg' | 'Altn';
  state: 'FWD' | 'BLK';
  cost: number;
}
export interface StpView {
  vlan: number;
  rootBridge: string;
  rootPriority: number;
  rootMac: string;
  isRoot: boolean;
  bridgePriority: number;
  bridgeMac: string;
  rootCost: number;
  ports: StpPort[];
}

function bridgeId(d: Device, vlan: number) {
  const pri = (d.stpPriority ?? 32768) + vlan;
  const mac = d.interfaces[0]?.mac ?? '0000.0000.0000';
  return { pri, mac, key: pri * 1e15 + parseInt(mac.replace(/\./g, ''), 16) };
}

export function spanningTree(t: Topology, d: Device, vlan = 1): StpView | undefined {
  if (!isSwitch(d)) return undefined;
  const switches = t.devices.filter(isSwitch);
  const root = switches.reduce((a, b) => (bridgeId(b, vlan).key < bridgeId(a, vlan).key ? b : a));
  // BFS cost from root
  const cost = new Map<string, number>([[root.id, 0]]);
  const queue = [root];
  const portCost = (p: Iface) => (p.name.startsWith('Gigabit') ? 4 : 19);
  while (queue.length) {
    const s = queue.shift()!;
    for (const p of s.interfaces) {
      if (!p.switchport || !isUp(t, s, p)) continue;
      const peer = peerOf(t, s.id, p.name);
      if (!peer) continue;
      const nd = getDevice(t, peer.device);
      if (!isSwitch(nd)) continue;
      const c = cost.get(s.id)! + portCost(p);
      if (c < (cost.get(nd.id) ?? Infinity)) {
        cost.set(nd.id, c);
        queue.push(nd);
      }
    }
  }
  const myCost = cost.get(d.id) ?? 0;
  const ports: StpPort[] = [];
  let rootPortChosen = false;
  const candidates = d.interfaces
    .filter((p) => p.switchport && p.media === 'copper' && isUp(t, d, p))
    .map((p) => {
      const peer = peerOf(t, d.id, p.name)!;
      const nd = getDevice(t, peer.device);
      return { p, nd, peerCost: isSwitch(nd) ? cost.get(nd.id) ?? Infinity : Infinity };
    })
    .sort((a, b) => a.peerCost + portCost(a.p) - (b.peerCost + portCost(b.p)) || bridgeId(a.nd, vlan).key - bridgeId(b.nd, vlan).key);
  for (const c of candidates) {
    let role: StpPort['role'] = 'Desg';
    if (d.id !== root.id && isSwitch(c.nd) && !rootPortChosen && c.peerCost + portCost(c.p) === myCost) {
      role = 'Root';
      rootPortChosen = true;
    } else if (isSwitch(c.nd)) {
      const theirs = c.peerCost;
      if (theirs < myCost || (theirs === myCost && bridgeId(c.nd, vlan).key < bridgeId(d, vlan).key)) role = 'Altn';
    }
    ports.push({ port: c.p.name, role, state: role === 'Altn' ? 'BLK' : 'FWD', cost: portCost(c.p) });
  }
  const rb = bridgeId(root, vlan);
  const me = bridgeId(d, vlan);
  return {
    vlan,
    rootBridge: root.hostname,
    rootPriority: rb.pri,
    rootMac: rb.mac,
    isRoot: root.id === d.id,
    bridgePriority: me.pri,
    bridgeMac: me.mac,
    rootCost: myCost,
    ports: ports.sort((a, b) => a.port.localeCompare(b.port, undefined, { numeric: true })),
  };
}

export { prefixToMask };
