/**
 * IPv4 / IPv6 address maths.
 *
 * Plain-English: an IPv4 address is just a 32-bit number written as four
 * 8-bit "octets" (0-255) so humans can read it. A subnet mask is another
 * 32-bit number whose 1-bits say "this part is the street (network)" and whose
 * 0-bits say "this part is the house number (host)".
 */

export type IPv4 = string;

export function isIPv4(s: string): boolean {
  const parts = s.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && String(Number(p)) === p.replace(/^0+(?=\d)/, ''));
}

export function ipToInt(ip: IPv4): number {
  const p = ip.trim().split('.').map(Number);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

export function intToIp(n: number): IPv4 {
  n = n >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function prefixToMask(prefix: number): IPv4 {
  if (prefix <= 0) return '0.0.0.0';
  return intToIp((0xffffffff << (32 - prefix)) >>> 0);
}

export function maskToPrefix(mask: IPv4): number {
  let n = ipToInt(mask);
  let count = 0;
  while (n & 0x80000000) {
    count++;
    n = (n << 1) >>> 0;
  }
  return count;
}

/** A valid mask is a run of 1s followed by a run of 0s (no gaps). */
export function isValidMask(mask: IPv4): boolean {
  if (!isIPv4(mask)) return false;
  const n = ipToInt(mask);
  const inv = ~n >>> 0;
  return ((inv + 1) & inv) === 0;
}

export function wildcardOf(mask: IPv4): IPv4 {
  return intToIp(~ipToInt(mask) >>> 0);
}

export function networkOf(ip: IPv4, mask: IPv4): IPv4 {
  return intToIp((ipToInt(ip) & ipToInt(mask)) >>> 0);
}

export function broadcastOf(ip: IPv4, mask: IPv4): IPv4 {
  return intToIp((ipToInt(ip) | (~ipToInt(mask) >>> 0)) >>> 0);
}

export function sameSubnet(a: IPv4, b: IPv4, mask: IPv4): boolean {
  return networkOf(a, mask) === networkOf(b, mask);
}

export function inNetwork(ip: IPv4, network: IPv4, mask: IPv4): boolean {
  return networkOf(ip, mask) === networkOf(network, mask);
}

/** Wildcard match used by ACLs and OSPF network statements: 0-bits must match, 1-bits are "don't care". */
export function wildcardMatch(ip: IPv4, base: IPv4, wildcard: IPv4): boolean {
  const care = ~ipToInt(wildcard) >>> 0;
  return ((ipToInt(ip) & care) >>> 0) === ((ipToInt(base) & care) >>> 0);
}

export function hostCount(prefix: number): number {
  if (prefix >= 31) return prefix === 31 ? 2 : 1;
  return 2 ** (32 - prefix) - 2;
}

export function ipClass(ip: IPv4): 'A' | 'B' | 'C' | 'D' | 'E' {
  const first = Number(ip.split('.')[0]);
  if (first < 128) return 'A';
  if (first < 192) return 'B';
  if (first < 224) return 'C';
  if (first < 240) return 'D';
  return 'E';
}

export function isPrivate(ip: IPv4): boolean {
  return (
    inNetwork(ip, '10.0.0.0', '255.0.0.0') ||
    inNetwork(ip, '172.16.0.0', '255.240.0.0') ||
    inNetwork(ip, '192.168.0.0', '255.255.0.0')
  );
}

export function describeAddress(ip: IPv4): string {
  if (inNetwork(ip, '127.0.0.0', '255.0.0.0')) return 'Loopback (the device talking to itself)';
  if (inNetwork(ip, '169.254.0.0', '255.255.0.0'))
    return 'APIPA / link-local - the PC could NOT reach a DHCP server and gave itself this address';
  if (isPrivate(ip)) return 'Private (RFC 1918) - only works inside a LAN, needs NAT to reach the internet';
  if (ipClass(ip) === 'D') return 'Multicast (one-to-many)';
  if (ipClass(ip) === 'E') return 'Experimental / reserved';
  return 'Public - routable on the internet';
}

export interface SubnetInfo {
  ip: IPv4;
  prefix: number;
  mask: IPv4;
  wildcard: IPv4;
  network: IPv4;
  broadcast: IPv4;
  firstHost: IPv4;
  lastHost: IPv4;
  usableHosts: number;
  totalAddresses: number;
  ipClass: string;
  type: string;
  binaryIp: string;
  binaryMask: string;
}

export function toBinary(ip: IPv4): string {
  return ip
    .split('.')
    .map((o) => Number(o).toString(2).padStart(8, '0'))
    .join('.');
}

export function subnetInfo(ip: IPv4, prefix: number): SubnetInfo {
  const mask = prefixToMask(prefix);
  const network = networkOf(ip, mask);
  const broadcast = broadcastOf(ip, mask);
  const n = ipToInt(network);
  const b = ipToInt(broadcast);
  const p31 = prefix >= 31;
  return {
    ip,
    prefix,
    mask,
    wildcard: wildcardOf(mask),
    network,
    broadcast,
    firstHost: p31 ? network : intToIp(n + 1),
    lastHost: p31 ? broadcast : intToIp(b - 1),
    usableHosts: hostCount(prefix),
    totalAddresses: 2 ** (32 - prefix),
    ipClass: ipClass(ip),
    type: describeAddress(ip),
    binaryIp: toBinary(ip),
    binaryMask: toBinary(mask),
  };
}

/** Parse "192.168.1.10/24" or "192.168.1.10 255.255.255.0". */
export function parseCidr(s: string): { ip: IPv4; prefix: number } | null {
  const m = s.trim().match(/^(\d+\.\d+\.\d+\.\d+)\s*(?:\/(\d{1,2})|\s+(\d+\.\d+\.\d+\.\d+))$/);
  if (!m || !isIPv4(m[1])) return null;
  if (m[2] !== undefined) {
    const p = Number(m[2]);
    return p >= 0 && p <= 32 ? { ip: m[1], prefix: p } : null;
  }
  if (m[3] && isValidMask(m[3])) return { ip: m[1], prefix: maskToPrefix(m[3]) };
  return null;
}

/** Smallest prefix that fits `hosts` usable hosts. */
export function prefixForHosts(hosts: number): number {
  for (let p = 30; p >= 0; p--) if (hostCount(p) >= hosts) return p;
  return 0;
}

export interface VlsmRequest {
  name: string;
  hosts: number;
}
export interface VlsmAllocation extends VlsmRequest {
  network: IPv4;
  prefix: number;
  mask: IPv4;
  firstHost: IPv4;
  lastHost: IPv4;
  broadcast: IPv4;
  wasted: number;
}

/** Variable Length Subnet Masking: biggest subnet first, packed back-to-back. */
export function vlsm(base: IPv4, basePrefix: number, reqs: VlsmRequest[]): VlsmAllocation[] {
  const sorted = [...reqs].sort((a, b) => b.hosts - a.hosts);
  let cursor = ipToInt(networkOf(base, prefixToMask(basePrefix)));
  const end = cursor + 2 ** (32 - basePrefix);
  const out: VlsmAllocation[] = [];
  for (const r of sorted) {
    const prefix = prefixForHosts(r.hosts);
    const size = 2 ** (32 - prefix);
    if (cursor % size !== 0) cursor = Math.ceil(cursor / size) * size;
    if (cursor + size > end) throw new Error(`Not enough address space for ${r.name} (${r.hosts} hosts)`);
    const info = subnetInfo(intToIp(cursor), prefix);
    out.push({
      ...r,
      network: info.network,
      prefix,
      mask: info.mask,
      firstHost: info.firstHost,
      lastHost: info.lastHost,
      broadcast: info.broadcast,
      wasted: info.usableHosts - r.hosts,
    });
    cursor += size;
  }
  return out;
}

// ---------------------------------------------------------------- IPv6

/** Expand "2001:db8::1" -> "2001:0db8:0000:0000:0000:0000:0000:0001". */
export function expandIPv6(addr: string): string {
  let a = addr.toLowerCase().split('/')[0];
  if (a.includes('::')) {
    const [l, r] = a.split('::');
    const left = l ? l.split(':') : [];
    const right = r ? r.split(':') : [];
    const missing = 8 - left.length - right.length;
    a = [...left, ...Array(missing).fill('0'), ...right].join(':');
  }
  return a
    .split(':')
    .map((h) => h.padStart(4, '0'))
    .join(':');
}

/** Compress following RFC 5952: drop leading zeros, replace the longest run (>=2) of zero groups with "::". */
export function compressIPv6(addr: string): string {
  const groups = expandIPv6(addr)
    .split(':')
    .map((g) => g.replace(/^0+(?=.)/, ''));
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] === '0') {
      let j = i;
      while (j < 8 && groups[j] === '0') j++;
      if (j - i > bestLen && j - i >= 2) {
        bestStart = i;
        bestLen = j - i;
      }
      i = j;
    } else i++;
  }
  if (bestStart === -1) return groups.join(':');
  const left = groups.slice(0, bestStart).join(':');
  const right = groups.slice(bestStart + bestLen).join(':');
  return `${left}::${right}`;
}

export function isIPv6(addr: string): boolean {
  const a = addr.split('/')[0];
  if (!/^[0-9a-fA-F:]+$/.test(a)) return false;
  const dbl = a.split('::').length - 1;
  if (dbl > 1) return false;
  const groups = a.split(':').filter((g) => g !== '');
  if (groups.some((g) => g.length > 4)) return false;
  return dbl === 1 ? groups.length < 8 : groups.length === 8;
}

/** EUI-64: split MAC in half, insert FFFE, flip the 7th bit of the first byte. */
export function eui64InterfaceId(mac: string): string {
  const hex = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (hex.length !== 12) throw new Error('MAC must have 12 hex digits');
  const first = (parseInt(hex.slice(0, 2), 16) ^ 0x02).toString(16).padStart(2, '0');
  const full = first + hex.slice(2, 6) + 'fffe' + hex.slice(6);
  return full.match(/.{4}/g)!.join(':');
}

export function linkLocalFromMac(mac: string): string {
  return compressIPv6(`fe80:0:0:0:${eui64InterfaceId(mac)}`);
}

export function ipv6Type(addr: string): string {
  const first = parseInt(expandIPv6(addr).slice(0, 4), 16);
  if (expandIPv6(addr) === expandIPv6('::1')) return 'Loopback';
  if ((first & 0xffc0) === 0xfe80) return 'Link-local (fe80::/10) - only valid on this one link';
  if ((first & 0xfe00) === 0xfc00) return 'Unique local (fc00::/7) - like private IPv4';
  if ((first & 0xff00) === 0xff00) return 'Multicast (ff00::/8)';
  if ((first & 0xe000) === 0x2000) return 'Global unicast (2000::/3) - public, internet routable';
  return 'Other / reserved';
}
