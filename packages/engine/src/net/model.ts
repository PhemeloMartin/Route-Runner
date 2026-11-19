/**
 * Network data model. Everything here is plain JSON-serialisable data so a
 * whole lab (devices + cables + configs) can be saved to the database and
 * restored exactly where Phemelo left off.
 */

export type DeviceKind = 'router' | 'switch' | 'l3switch' | 'pc' | 'laptop' | 'server' | 'isp';
export type CableType = 'straight' | 'crossover' | 'console' | 'fiber' | 'serial';
export type PortMedia = 'copper' | 'fiber' | 'serial' | 'console' | 'virtual';

export interface AclEntry {
  action: 'permit' | 'deny';
  protocol: 'ip' | 'icmp' | 'tcp' | 'udp';
  src: string; // network or "any"
  srcWildcard: string;
  dst: string;
  dstWildcard: string;
  port?: number; // eq <port>
  remark?: string;
}
export interface Acl {
  id: string; // "10", "100" or a name
  type: 'standard' | 'extended';
  entries: AclEntry[];
}

export interface PortSecurity {
  enabled: boolean;
  maximum: number;
  violation: 'shutdown' | 'restrict' | 'protect';
  sticky: boolean;
  learned: string[];
}

export interface Iface {
  name: string; // GigabitEthernet0/0
  media: PortMedia;
  mac: string;
  ip?: string;
  mask?: string;
  ipv6?: string[]; // "2001:db8:1::1/64"
  dhcpClient?: boolean;
  helperAddress?: string;
  shutdown: boolean;
  errDisabled?: boolean;
  description?: string;
  // switchport (layer 2)
  switchport?: boolean;
  mode?: 'access' | 'trunk' | 'dynamic';
  accessVlan?: number;
  voiceVlan?: number;
  trunkAllowed?: number[] | 'all';
  nativeVlan?: number;
  portfast?: boolean;
  bpduguard?: boolean;
  portSecurity?: PortSecurity;
  channelGroup?: { id: number; mode: 'active' | 'passive' | 'on' | 'desirable' | 'auto' };
  // layer 3 extras
  parent?: string; // for sub-interfaces
  dot1qVlan?: number;
  aclIn?: string;
  aclOut?: string;
  natRole?: 'inside' | 'outside';
  ospfCost?: number;
  hsrp?: { group: number; ip: string; priority: number; preempt: boolean };
  bandwidthKbps?: number;
  speed?: string;
  duplex?: string;
}

export interface StaticRoute {
  network: string;
  mask: string;
  nextHop?: string;
  exitIface?: string;
  ad: number;
}

export interface OspfConfig {
  processId: number;
  routerId?: string;
  networks: { network: string; wildcard: string; area: number }[];
  passive: string[];
  passiveDefault?: boolean;
  defaultOriginate?: boolean;
}

export interface DhcpPool {
  name: string;
  network?: string;
  mask?: string;
  defaultRouter?: string;
  dns?: string;
  domain?: string;
  leaseDays?: number;
}

export interface DhcpBinding {
  ip: string;
  mac: string;
  pool: string;
}

export interface LineConfig {
  password?: string;
  login: boolean;
  loginLocal: boolean;
  transportInput?: 'ssh' | 'telnet' | 'all' | 'none';
  execTimeout?: string;
}

export interface Device {
  id: string;
  kind: DeviceKind;
  model: string;
  hostname: string;
  interfaces: Iface[];
  // management plane
  enableSecret?: string;
  enablePassword?: string;
  users: { name: string; secret: string; privilege: number }[];
  domainName?: string;
  rsaBits?: number;
  sshVersion?: number;
  bannerMotd?: string;
  servicePasswordEncryption: boolean;
  noIpDomainLookup?: boolean;
  lineCon: LineConfig;
  lineVty: LineConfig;
  // layer 2
  vlans: { id: number; name: string }[];
  stpPriority?: number;
  stpMode?: 'pvst' | 'rapid-pvst';
  // layer 3
  ipRouting: boolean;
  ipv6Routing?: boolean;
  defaultGateway?: string;
  staticRoutes: StaticRoute[];
  ospf?: OspfConfig;
  dhcpPools: DhcpPool[];
  dhcpExcluded: { low: string; high: string }[];
  dhcpBindings: DhcpBinding[];
  acls: Acl[];
  nat: { listAcl: string; overloadIface?: string; statics: { inside: string; outside: string }[] }[];
  dns?: string;
  ntpServer?: string;
  loggingHost?: string;
  snmpCommunity?: { name: string; mode: 'ro' | 'rw' }[];
  cdpEnabled: boolean;
  lldpEnabled?: boolean;
  startupConfig?: string;
  // servers
  dnsRecords?: { name: string; ip: string }[];
  httpTitle?: string;
  // 3D placement for the lab scene
  position?: [number, number, number];
}

export interface LinkEnd {
  device: string;
  iface: string;
}
export interface Link {
  id: string;
  a: LinkEnd;
  b: LinkEnd;
  cable: CableType;
}

export interface Topology {
  devices: Device[];
  links: Link[];
}

// ------------------------------------------------------------ factories

let macCounter = 0x1a2b00;
function nextMac(prefix: string): string {
  macCounter = (macCounter + 1) & 0xffffff;
  const h = macCounter.toString(16).padStart(6, '0');
  return `${prefix}.${h.slice(0, 2)}${h.slice(2, 4)}.${h.slice(4, 6)}01`;
}

function baseDevice(id: string, kind: DeviceKind, model: string, hostname: string): Device {
  return {
    id,
    kind,
    model,
    hostname,
    interfaces: [],
    users: [],
    servicePasswordEncryption: false,
    lineCon: { login: false, loginLocal: false },
    lineVty: { login: false, loginLocal: false, transportInput: 'all' },
    vlans: [{ id: 1, name: 'default' }],
    ipRouting: kind === 'router' || kind === 'isp',
    staticRoutes: [],
    dhcpPools: [],
    dhcpExcluded: [],
    dhcpBindings: [],
    acls: [],
    nat: [],
    cdpEnabled: true,
  };
}

function iface(name: string, media: PortMedia, shutdown: boolean, extra: Partial<Iface> = {}): Iface {
  return { name, media, mac: nextMac('00d0'), shutdown, ...extra };
}

/** Cisco ISR 4331 style router: 3x GigabitEthernet + 2 serial + console. Router ports start SHUTDOWN (a classic exam trap). */
export function createRouter(id: string, hostname = 'Router'): Device {
  const d = baseDevice(id, 'router', 'ISR4331', hostname);
  d.interfaces = [
    iface('GigabitEthernet0/0/0', 'copper', true),
    iface('GigabitEthernet0/0/1', 'copper', true),
    iface('GigabitEthernet0/0/2', 'copper', true),
    iface('Serial0/1/0', 'serial', true, { bandwidthKbps: 1544 }),
    iface('Serial0/1/1', 'serial', true, { bandwidthKbps: 1544 }),
    iface('Console0', 'console', false),
  ];
  return d;
}

/** Catalyst 2960 style switch: 24 FastEthernet + 2 Gig uplinks, all in VLAN 1, all ports UP by default. */
export function createSwitch(id: string, hostname = 'Switch'): Device {
  const d = baseDevice(id, 'switch', 'WS-C2960-24TT', hostname);
  for (let i = 1; i <= 24; i++)
    d.interfaces.push(
      iface(`FastEthernet0/${i}`, 'copper', false, { switchport: true, mode: 'dynamic', accessVlan: 1, nativeVlan: 1 }),
    );
  for (let i = 1; i <= 2; i++)
    d.interfaces.push(
      iface(`GigabitEthernet0/${i}`, 'copper', false, {
        switchport: true,
        mode: 'dynamic',
        accessVlan: 1,
        nativeVlan: 1,
      }),
    );
  d.interfaces.push(iface('Vlan1', 'virtual', true));
  d.interfaces.push(iface('Console0', 'console', false));
  return d;
}

/** Catalyst 3650 style multilayer switch: can route between VLANs with "ip routing" + SVIs. */
export function createL3Switch(id: string, hostname = 'MLS'): Device {
  const d = createSwitch(id, hostname);
  d.kind = 'l3switch';
  d.model = 'WS-C3650-24PS';
  return d;
}

export function createPC(id: string, hostname = 'PC', kind: 'pc' | 'laptop' | 'server' = 'pc'): Device {
  const d = baseDevice(id, kind, kind === 'server' ? 'Server-PT' : kind === 'laptop' ? 'Laptop-PT' : 'PC-PT', hostname);
  d.interfaces = [iface('FastEthernet0', 'copper', false), iface('RS232', 'console', false)];
  d.cdpEnabled = false;
  return d;
}

/** The "internet": an ISP router that already has a public address and a route to the world. */
export function createIsp(id: string, hostname = 'ISP'): Device {
  const d = createRouter(id, hostname);
  d.kind = 'isp';
  d.interfaces.push(iface('Loopback0', 'virtual', false, { ip: '8.8.8.8', mask: '255.255.255.255' }));
  return d;
}

export function emptyTopology(): Topology {
  return { devices: [], links: [] };
}

// ------------------------------------------------------------ helpers

const ABBREV: [RegExp, string][] = [
  [/^(gigabitethernet|gig|gi|g)\s*/i, 'GigabitEthernet'],
  [/^(fastethernet|fas|fa|f)\s*/i, 'FastEthernet'],
  [/^(serial|ser|se|s)\s*/i, 'Serial'],
  [/^(loopback|loop|lo)\s*/i, 'Loopback'],
  [/^(vlan|vl)\s*/i, 'Vlan'],
  [/^(port-channel|po)\s*/i, 'Port-channel'],
];

/** "g0/0/0" -> "GigabitEthernet0/0/0", "fa0/1" -> "FastEthernet0/1". */
export function normalizeIfaceName(input: string): string {
  const s = input.trim().replace(/\s+/g, '');
  for (const [re, full] of ABBREV) {
    if (re.test(s)) {
      const rest = s.replace(re, '');
      if (/^[\d/.]+$/.test(rest)) return full + rest;
    }
  }
  return s;
}

export function shortIfaceName(name: string): string {
  return name
    .replace('GigabitEthernet', 'Gig')
    .replace('FastEthernet', 'Fa')
    .replace('Serial', 'Se')
    .replace('Loopback', 'Lo')
    .replace('Port-channel', 'Po');
}

export function abbrIfaceName(name: string): string {
  return name
    .replace('GigabitEthernet', 'G')
    .replace('FastEthernet', 'F')
    .replace('Serial', 'S')
    .replace('Loopback', 'Lo')
    .replace('Port-channel', 'Po');
}

export function getDevice(t: Topology, id: string): Device {
  const d = t.devices.find((x) => x.id === id);
  if (!d) throw new Error(`No device ${id}`);
  return d;
}

export function findDeviceByName(t: Topology, hostnameOrId: string): Device | undefined {
  const k = hostnameOrId.toLowerCase();
  return t.devices.find((d) => d.id.toLowerCase() === k || d.hostname.toLowerCase() === k);
}

export function getIface(d: Device, name: string): Iface | undefined {
  const n = normalizeIfaceName(name).toLowerCase();
  return d.interfaces.find((i) => i.name.toLowerCase() === n);
}

export function linkAt(t: Topology, device: string, iface: string): Link | undefined {
  return t.links.find(
    (l) => (l.a.device === device && l.a.iface === iface) || (l.b.device === device && l.b.iface === iface),
  );
}

export function peerOf(t: Topology, device: string, iface: string): LinkEnd | undefined {
  const l = linkAt(t, device, iface);
  if (!l) return undefined;
  return l.a.device === device && l.a.iface === iface ? l.b : l.a;
}

export function isEndHost(d: Device): boolean {
  return d.kind === 'pc' || d.kind === 'laptop' || d.kind === 'server';
}

export function isSwitch(d: Device): boolean {
  return d.kind === 'switch' || d.kind === 'l3switch';
}

/** Which cable is correct between two port media? Returns null if the combo is fine. */
export function cableProblem(
  cable: CableType,
  aMedia: PortMedia,
  bMedia: PortMedia,
  aKind: DeviceKind,
  bKind: DeviceKind,
): string | null {
  if (aMedia === 'virtual' || bMedia === 'virtual') return 'You cannot plug a cable into a virtual interface.';
  if (cable === 'console') {
    const ok =
      (aMedia === 'console' && bMedia === 'console' && (isHostKind(aKind) !== isHostKind(bKind)));
    return ok ? null : 'A console (rollover) cable goes from a PC RS232/USB port to the CONSOLE port of a router or switch.';
  }
  if (aMedia === 'console' || bMedia === 'console') return 'Console ports only take the light-blue console cable.';
  if (cable === 'serial') return aMedia === 'serial' && bMedia === 'serial' ? null : 'Serial cables join two Serial ports (WAN links).';
  if (aMedia === 'serial' || bMedia === 'serial') return 'Serial ports need a serial DCE/DTE cable.';
  if (cable === 'fiber') return aMedia === 'fiber' && bMedia === 'fiber' ? null : 'Fiber needs fiber (SFP) ports at both ends.';
  if (aMedia === 'fiber' || bMedia === 'fiber') return 'That port is fiber - use a fiber cable.';
  return null;
}

function isHostKind(k: DeviceKind): boolean {
  return k === 'pc' || k === 'laptop' || k === 'server';
}

/**
 * Classic rule: unlike devices (PC-switch, switch-router) use STRAIGHT-THROUGH;
 * like devices (switch-switch, PC-PC, router-router, PC-router) use CROSSOVER.
 * Modern ports have Auto-MDIX so both work, but the exam still asks!
 */
export function recommendedCopperCable(aKind: DeviceKind, bKind: DeviceKind): 'straight' | 'crossover' {
  const group = (k: DeviceKind) => (k === 'switch' || k === 'l3switch' ? 'sw' : 'host'); // routers behave like hosts (MDI)
  return group(aKind) === group(bKind) ? 'crossover' : 'straight';
}

export function cloneTopology(t: Topology): Topology {
  return JSON.parse(JSON.stringify(t));
}
