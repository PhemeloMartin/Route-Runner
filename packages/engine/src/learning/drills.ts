/**
 * Endless practice generators. Subnetting is THE skill CCNA candidates must do fast and
 * in their head - so the game lets you drill it forever, with worked explanations.
 */
import { compressIPv6, expandIPv6, intToIp, ipToInt, prefixToMask, subnetInfo, wildcardOf } from '../net/ip.js';
import { pipValue, positionSize } from '../forex/math.js';

export interface Drill {
  id: string;
  kind: DrillKind;
  prompt: string;
  answer: string;
  accept?: string[];
  choices?: string[];
  explanation: string;
}

export type DrillKind =
  | 'subnet-network'
  | 'subnet-broadcast'
  | 'subnet-hosts'
  | 'subnet-range'
  | 'mask-from-prefix'
  | 'prefix-for-hosts'
  | 'binary-to-decimal'
  | 'decimal-to-binary'
  | 'wildcard'
  | 'ipv6-compress'
  | 'ipv6-expand'
  | 'port-number'
  | 'osi-layer'
  | 'pip-value'
  | 'position-size';

let seed = Date.now() % 2147483647;
export function setDrillSeed(s: number) {
  seed = s % 2147483647 || 1;
}
function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

function randomHost(prefix: number): string {
  const base = pick([
    [192, 168, int(0, 255), int(1, 254)],
    [10, int(0, 255), int(0, 255), int(1, 254)],
    [172, int(16, 31), int(0, 255), int(1, 254)],
    [int(1, 223), int(0, 255), int(0, 255), int(1, 254)],
  ]);
  const ip = base.join('.');
  const info = subnetInfo(ip, prefix);
  // avoid giving the network/broadcast address itself as the host
  return ip === info.network || ip === info.broadcast ? info.firstHost : ip;
}

function magic(prefix: number): string {
  const octet = Math.floor((prefix - 1) / 8);
  const bitsInOctet = prefix - octet * 8;
  const block = 256 - (256 - 2 ** (8 - bitsInOctet));
  return `The "interesting" octet is octet ${octet + 1} (mask value ${256 - block}). Block size = 256 - ${256 - block} = ${block}. Subnets go up in steps of ${block} in that octet.`;
}

const PORTS: [string, string, string][] = [
  ['FTP (data)', '20', 'TCP'], ['FTP (control)', '21', 'TCP'], ['SSH', '22', 'TCP'], ['Telnet', '23', 'TCP'], ['SMTP', '25', 'TCP'],
  ['DNS', '53', 'UDP and TCP'], ['DHCP server', '67', 'UDP'], ['DHCP client', '68', 'UDP'], ['TFTP', '69', 'UDP'], ['HTTP', '80', 'TCP'],
  ['POP3', '110', 'TCP'], ['NTP', '123', 'UDP'], ['IMAP', '143', 'TCP'], ['SNMP', '161', 'UDP'], ['SNMP trap', '162', 'UDP'],
  ['LDAP', '389', 'TCP'], ['HTTPS', '443', 'TCP'], ['Syslog', '514', 'UDP'], ['RDP', '3389', 'TCP'], ['MySQL', '3306', 'TCP'],
];

const OSI: [string, string][] = [
  ['Router', '3 - Network'], ['Switch (Layer 2)', '2 - Data Link'], ['Hub', '1 - Physical'], ['IP address', '3 - Network'],
  ['MAC address', '2 - Data Link'], ['TCP / UDP port', '4 - Transport'], ['Ethernet frame', '2 - Data Link'], ['Packet', '3 - Network'],
  ['Segment', '4 - Transport'], ['Bits on the cable', '1 - Physical'], ['HTTP', '7 - Application'], ['TLS encryption', '6 - Presentation'],
  ['Session establishment / checkpoints', '5 - Session'], ['ARP (bridges L2 and L3)', '2 - Data Link'], ['Fiber optic cable', '1 - Physical'], ['ICMP (ping)', '3 - Network'],
];

export function makeDrill(kind?: DrillKind): Drill {
  const k: DrillKind = kind ?? pick(['subnet-network', 'subnet-broadcast', 'subnet-hosts', 'subnet-range', 'mask-from-prefix', 'prefix-for-hosts', 'binary-to-decimal', 'decimal-to-binary', 'wildcard', 'ipv6-compress', 'port-number', 'osi-layer']);
  const id = `${k}-${Math.floor(rnd() * 1e9)}`;
  switch (k) {
    case 'subnet-network': {
      const p = int(17, 30);
      const ip = randomHost(p);
      const s = subnetInfo(ip, p);
      return { id, kind: k, prompt: `What is the NETWORK address of ${ip}/${p}?`, answer: s.network, explanation: `${magic(p)} ${ip} falls in the block that starts at ${s.network}. Network = first address of the block.` };
    }
    case 'subnet-broadcast': {
      const p = int(17, 30);
      const ip = randomHost(p);
      const s = subnetInfo(ip, p);
      return { id, kind: k, prompt: `What is the BROADCAST address of ${ip}/${p}?`, answer: s.broadcast, explanation: `${magic(p)} The block is ${s.network} - ${s.broadcast}. Broadcast = last address of the block (next network minus 1).` };
    }
    case 'subnet-hosts': {
      const p = int(16, 30);
      const s = subnetInfo('10.0.0.1', p);
      return { id, kind: k, prompt: `How many USABLE host addresses does a /${p} give you?`, answer: String(s.usableHosts), explanation: `Host bits = 32 - ${p} = ${32 - p}. Usable = 2^${32 - p} - 2 = ${s.usableHosts} (minus the network and broadcast addresses).` };
    }
    case 'subnet-range': {
      const p = int(20, 29);
      const ip = randomHost(p);
      const s = subnetInfo(ip, p);
      return { id, kind: k, prompt: `${ip}/${p}: what is the LAST usable host address?`, answer: s.lastHost, explanation: `Network ${s.network}, broadcast ${s.broadcast}. Usable range is ${s.firstHost} to ${s.lastHost} (broadcast minus one).` };
    }
    case 'mask-from-prefix': {
      const p = int(8, 30);
      return { id, kind: k, prompt: `Write /${p} as a dotted-decimal subnet mask.`, answer: prefixToMask(p), explanation: `/${p} means ${p} ones then ${32 - p} zeros. Octet values: 128,192,224,240,248,252,254,255. Result: ${prefixToMask(p)}.` };
    }
    case 'prefix-for-hosts': {
      const hosts = int(2, 1000);
      let p = 30;
      while (2 ** (32 - p) - 2 < hosts) p--;
      return { id, kind: k, prompt: `A LAN needs ${hosts} hosts. What is the SMALLEST subnet (as /prefix) that fits?`, answer: `/${p}`, accept: [String(p)], explanation: `Find the smallest power of 2 where 2^h - 2 >= ${hosts}: h = ${32 - p} gives ${2 ** (32 - p) - 2} hosts. Prefix = 32 - ${32 - p} = /${p}.` };
    }
    case 'binary-to-decimal': {
      const n = int(0, 255);
      const b = n.toString(2).padStart(8, '0');
      return { id, kind: k, prompt: `Convert binary ${b} to decimal.`, answer: String(n), explanation: `Place values 128 64 32 16 8 4 2 1. Add the ones: ${b.split('').map((bit, i) => (bit === '1' ? 2 ** (7 - i) : 0)).filter(Boolean).join(' + ') || '0'} = ${n}.` };
    }
    case 'decimal-to-binary': {
      const n = int(0, 255);
      return { id, kind: k, prompt: `Convert ${n} to an 8-bit binary number.`, answer: n.toString(2).padStart(8, '0'), explanation: `Subtract place values from the left (128,64,32,16,8,4,2,1): write 1 when it fits, 0 when it doesn't. ${n} = ${n.toString(2).padStart(8, '0')}.` };
    }
    case 'wildcard': {
      const p = int(8, 30);
      return { id, kind: k, prompt: `What is the WILDCARD mask for /${p} (${prefixToMask(p)})? (used in ACLs and OSPF)`, answer: wildcardOf(prefixToMask(p)), explanation: `Wildcard = 255.255.255.255 minus the subnet mask, octet by octet. 255.255.255.255 - ${prefixToMask(p)} = ${wildcardOf(prefixToMask(p))}.` };
    }
    case 'ipv6-compress': {
      const groups = Array.from({ length: 8 }, () => (rnd() < 0.4 ? '0000' : int(0, 0xffff).toString(16).padStart(4, '0')));
      groups[0] = '2001';
      groups[1] = '0db8';
      const z = int(2, 5);
      for (let i = z; i < Math.min(8, z + int(2, 3)); i++) groups[i] = '0000';
      const full = groups.join(':');
      return { id, kind: k, prompt: `Compress this IPv6 address as much as possible: ${full}`, answer: compressIPv6(full), explanation: `Rule 1: drop leading zeros in each group. Rule 2: replace ONE longest run of all-zero groups with "::" (only once!). Result: ${compressIPv6(full)}.` };
    }
    case 'ipv6-expand': {
      const short = pick(['2001:db8::1', 'fe80::a1:2', '2001:db8:acad:1::10', 'ff02::1', '2001:db8:0:a::b:c']);
      return { id, kind: k, prompt: `Expand fully to 8 groups of 4 hex digits: ${short}`, answer: expandIPv6(short), explanation: `"::" stands for as many 0000 groups as needed to make 8 groups; pad every group to 4 digits. ${expandIPv6(short)}` };
    }
    case 'port-number': {
      const [name, port, proto] = pick(PORTS);
      return { id, kind: k, prompt: `Which well-known port number does ${name} use?`, answer: port, explanation: `${name} = ${proto} ${port}. Ports 0-1023 are "well-known" ports.` };
    }
    case 'osi-layer': {
      const [thing, layer] = pick(OSI);
      const choices = ['1 - Physical', '2 - Data Link', '3 - Network', '4 - Transport', '5 - Session', '6 - Presentation', '7 - Application'];
      return { id, kind: k, prompt: `At which OSI layer does this live: "${thing}"?`, answer: layer, choices, explanation: `Memory trick (top-down): "All People Seem To Need Data Processing". ${thing} -> Layer ${layer}.` };
    }
    case 'pip-value': {
      const lots = pick([0.01, 0.05, 0.1, 0.5, 1]);
      const v = pipValue('EURUSD', lots, 'USD', { USD: 1, EUR: 1.08 });
      return { id, kind: k, prompt: `EUR/USD, account in USD. What is one pip worth on ${lots} lots? (in $)`, answer: v.toFixed(2), accept: [String(+v.toFixed(2)), v.toFixed(1)], explanation: `Pip value = pip size x units = 0.0001 x ${lots * 100000} = $${v.toFixed(2)} (USD is the quote currency, so no conversion).` };
    }
    case 'position-size': {
      const balance = pick([1000, 2000, 5000, 10000]);
      const risk = pick([1, 2]);
      const stop = pick([20, 25, 30, 40, 50]);
      const r = positionSize({ balance, riskPercent: risk, stopPips: stop, symbol: 'EURUSD', accountCcy: 'USD', usd: { USD: 1, EUR: 1.08 } });
      return { id, kind: k, prompt: `Balance $${balance}, risk ${risk}%, stop-loss ${stop} pips on EUR/USD. Position size in lots?`, answer: r.lots.toFixed(2), accept: [String(r.lots)], explanation: `Risk money = ${balance} x ${risk}% = $${r.riskAmount}. One lot = $10 per pip, so ${stop} pips x $10 = $${stop * 10} per lot. Lots = ${r.riskAmount} / ${stop * 10} = ${r.lots.toFixed(2)} (round DOWN).` };
    }
  }
}

export function checkDrill(d: Drill, input: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '').replace(/^\//, '');
  const given = norm(input);
  if (d.kind === 'ipv6-compress' || d.kind === 'ipv6-expand') {
    try {
      return expandIPv6(input.trim()) === expandIPv6(d.answer) && (d.kind === 'ipv6-expand' ? given === norm(d.answer) : given === norm(d.answer));
    } catch {
      return false;
    }
  }
  if (d.kind === 'pip-value' || d.kind === 'position-size') {
    const n = Number(given.replace(/[$r]/g, ''));
    return Math.abs(n - Number(d.answer)) < 0.011;
  }
  return [d.answer, ...(d.accept ?? [])].some((a) => norm(a) === given);
}

export { intToIp, ipToInt };
