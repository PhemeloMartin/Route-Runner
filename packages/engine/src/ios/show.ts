import { maskToPrefix, compressIPv6, linkLocalFromMac } from '../net/ip.js';
import { type Device, type Topology, abbrIfaceName, getDevice, isSwitch, peerOf, shortIfaceName } from '../net/model.js';
import {
  effectiveMode,
  hsrpStates,
  ifaceStatus,
  macTable,
  ospfNeighbors,
  ospfRouterId,
  routingTable,
  runtimeOf,
  spanningTree,
  trunkAllows,
} from '../net/sim.js';

// ------------------------------------------------------------ password helpers

const XLAT = [0x64, 0x73, 0x66, 0x64, 0x3b, 0x6b, 0x66, 0x6f, 0x41, 0x2c, 0x2e, 0x69, 0x79, 0x65, 0x77, 0x72, 0x6b, 0x6c, 0x64, 0x4a, 0x4b, 0x44, 0x48, 0x53, 0x55, 0x42];

/** Real Cisco "type 7" - it is a reversible scramble, NOT encryption. That is the lesson! */
export function type7Encode(pw: string, seed = 8): string {
  let out = seed.toString().padStart(2, '0');
  for (let i = 0; i < pw.length; i++) out += (pw.charCodeAt(i) ^ XLAT[(seed + i) % XLAT.length]).toString(16).toUpperCase().padStart(2, '0');
  return out;
}

export function type7Decode(enc: string): string {
  const seed = Number(enc.slice(0, 2));
  let out = '';
  for (let i = 2, k = 0; i < enc.length; i += 2, k++) out += String.fromCharCode(parseInt(enc.slice(i, i + 2), 16) ^ XLAT[(seed + k) % XLAT.length]);
  return out;
}

/** Looks like an MD5-crypt "type 5" hash. One-way: you cannot get the password back. */
export function type5Hash(pw: string): string {
  let h = 2166136261;
  for (const c of pw) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const alphabet = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let s = '';
  let x = h;
  for (let i = 0; i < 22; i++) {
    s += alphabet[x % 64];
    x = Math.imul(x ^ (x >>> 13), 2654435761) >>> 0;
  }
  return `$1$mERr$${s}`;
}

// ------------------------------------------------------------ show running-config

export function runningConfig(t: Topology, d: Device): string {
  const L: string[] = [];
  const pw = (p: string) => (d.servicePasswordEncryption ? `7 ${type7Encode(p)}` : p);
  L.push('Building configuration...', '', `Current configuration : ${1024 + d.interfaces.length * 40} bytes`, '!');
  L.push('version 15.4', 'no service timestamps log datetime msec', 'no service timestamps debug datetime msec');
  L.push(d.servicePasswordEncryption ? 'service password-encryption' : 'no service password-encryption', '!');
  L.push(`hostname ${d.hostname}`, '!');
  if (d.enableSecret) L.push(`enable secret 5 ${type5Hash(d.enableSecret)}`);
  if (d.enablePassword) L.push(`enable password ${pw(d.enablePassword)}`);
  if (d.enableSecret || d.enablePassword) L.push('!');
  for (const p of d.dhcpExcluded) L.push(`ip dhcp excluded-address ${p.low}${p.high !== p.low ? ' ' + p.high : ''}`);
  for (const p of d.dhcpPools) {
    L.push('!', `ip dhcp pool ${p.name}`);
    if (p.network) L.push(` network ${p.network} ${p.mask}`);
    if (p.defaultRouter) L.push(` default-router ${p.defaultRouter}`);
    if (p.dns) L.push(` dns-server ${p.dns}`);
    if (p.domain) L.push(` domain-name ${p.domain}`);
  }
  if (d.dhcpPools.length) L.push('!');
  if (d.ipRouting && isSwitch(d)) L.push('ip routing', '!');
  if (d.ipv6Routing) L.push('ipv6 unicast-routing', '!');
  if (d.noIpDomainLookup) L.push('no ip domain-lookup');
  if (d.domainName) L.push(`ip domain-name ${d.domainName}`);
  if (d.sshVersion) L.push(`ip ssh version ${d.sshVersion}`);
  L.push('!');
  for (const u of d.users) L.push(`username ${u.name}${u.privilege !== 1 ? ` privilege ${u.privilege}` : ''} secret 5 ${type5Hash(u.secret)}`);
  if (d.users.length) L.push('!');
  if (isSwitch(d)) {
    L.push(`spanning-tree mode ${d.stpMode ?? 'pvst'}`);
    if (d.stpPriority !== undefined) L.push(`spanning-tree vlan 1 priority ${d.stpPriority}`);
    L.push('!');
  }
  for (const i of d.interfaces) {
    if (i.media === 'console') continue;
    L.push(`interface ${i.name}`);
    if (i.description) L.push(` description ${i.description}`);
    if (i.dot1qVlan) L.push(` encapsulation dot1Q ${i.dot1qVlan}`);
    if (isSwitch(d) && i.switchport) {
      if (i.mode === 'access') L.push(' switchport mode access');
      if (i.accessVlan && i.accessVlan !== 1) L.push(` switchport access vlan ${i.accessVlan}`);
      if (i.voiceVlan) L.push(` switchport voice vlan ${i.voiceVlan}`);
      if (i.nativeVlan && i.nativeVlan !== 1) L.push(` switchport trunk native vlan ${i.nativeVlan}`);
      if (Array.isArray(i.trunkAllowed)) L.push(` switchport trunk allowed vlan ${i.trunkAllowed.join(',')}`);
      if (i.mode === 'trunk') L.push(' switchport mode trunk');
      if (i.portSecurity?.enabled) {
        L.push(' switchport port-security');
        if (i.portSecurity.maximum !== 1) L.push(` switchport port-security maximum ${i.portSecurity.maximum}`);
        if (i.portSecurity.violation !== 'shutdown') L.push(` switchport port-security violation ${i.portSecurity.violation}`);
        if (i.portSecurity.sticky) L.push(' switchport port-security mac-address sticky');
      }
      if (i.channelGroup) L.push(` channel-group ${i.channelGroup.id} mode ${i.channelGroup.mode}`);
      if (i.portfast) L.push(' spanning-tree portfast');
      if (i.bpduguard) L.push(' spanning-tree bpduguard enable');
    } else if (isSwitch(d) && !i.name.startsWith('Vlan') && !i.name.startsWith('Loopback')) {
      L.push(' no switchport');
    }
    if (i.dhcpClient && !isEndHostKind(d)) L.push(' ip address dhcp');
    else if (i.ip && i.mask) L.push(` ip address ${i.ip} ${i.mask}`);
    else if (!i.switchport) L.push(' no ip address');
    if (i.helperAddress) L.push(` ip helper-address ${i.helperAddress}`);
    if (i.aclIn) L.push(` ip access-group ${i.aclIn} in`);
    if (i.aclOut) L.push(` ip access-group ${i.aclOut} out`);
    if (i.natRole) L.push(` ip nat ${i.natRole}`);
    if (i.ospfCost) L.push(` ip ospf cost ${i.ospfCost}`);
    if (i.hsrp) {
      L.push(` standby ${i.hsrp.group} ip ${i.hsrp.ip}`);
      if (i.hsrp.priority !== 100) L.push(` standby ${i.hsrp.group} priority ${i.hsrp.priority}`);
      if (i.hsrp.preempt) L.push(` standby ${i.hsrp.group} preempt`);
    }
    for (const a of i.ipv6 ?? []) L.push(` ipv6 address ${a}`);
    if (i.bandwidthKbps && !i.name.startsWith('Serial')) L.push(` bandwidth ${i.bandwidthKbps}`);
    if (!i.name.startsWith('Vlan') && !i.name.startsWith('Loopback') && !i.parent && i.media === 'copper') L.push(' duplex auto', ' speed auto');
    if (i.shutdown) L.push(' shutdown');
    L.push('!');
  }
  if (d.ospf) {
    L.push(`router ospf ${d.ospf.processId}`);
    if (d.ospf.routerId) L.push(` router-id ${d.ospf.routerId}`);
    L.push(' log-adjacency-changes');
    if (d.ospf.passiveDefault) L.push(' passive-interface default');
    for (const p of d.ospf.passive) L.push(p.startsWith('!') ? ` no passive-interface ${p.slice(1)}` : ` passive-interface ${p}`);
    for (const n of d.ospf.networks) L.push(` network ${n.network} ${n.wildcard} area ${n.area}`);
    if (d.ospf.defaultOriginate) L.push(' default-information originate');
    L.push('!');
  }
  for (const n of d.nat) {
    if (n.overloadIface) L.push(`ip nat inside source list ${n.listAcl} interface ${n.overloadIface} overload`);
    for (const s of n.statics) L.push(`ip nat inside source static ${s.inside} ${s.outside}`);
  }
  if (d.defaultGateway && isSwitch(d)) L.push(`ip default-gateway ${d.defaultGateway}`);
  L.push('ip classless');
  for (const r of d.staticRoutes) L.push(`ip route ${r.network} ${r.mask} ${r.exitIface ?? ''}${r.exitIface && r.nextHop ? ' ' : ''}${r.nextHop ?? ''}${r.ad !== 1 ? ' ' + r.ad : ''}`);
  L.push('!', 'ip flow-export version 9', '!');
  for (const a of d.acls) {
    if (/^\d+$/.test(a.id)) {
      for (const e of a.entries) L.push(e.remark ? `access-list ${a.id} remark ${e.remark}` : `access-list ${a.id} ${aclEntryText(a.type, e)}`);
    } else {
      L.push(`ip access-list ${a.type} ${a.id}`);
      for (const e of a.entries) L.push(e.remark ? ` remark ${e.remark}` : ` ${aclEntryText(a.type, e)}`);
    }
  }
  if (d.acls.length) L.push('!');
  for (const c of d.snmpCommunity ?? []) L.push(`snmp-server community ${c.name} ${c.mode.toUpperCase()}`);
  if (d.loggingHost) L.push(`logging ${d.loggingHost}`);
  if (d.ntpServer) L.push(`ntp server ${d.ntpServer}`);
  if (!d.cdpEnabled) L.push('no cdp run');
  if (d.bannerMotd) L.push(`banner motd ^C${d.bannerMotd}^C`);
  L.push('!', 'line con 0');
  if (d.lineCon.password) L.push(` password ${pw(d.lineCon.password)}`);
  if (d.lineCon.loginLocal) L.push(' login local');
  else if (d.lineCon.login) L.push(' login');
  L.push('!', 'line aux 0', '!', 'line vty 0 4');
  if (d.lineVty.password) L.push(` password ${pw(d.lineVty.password)}`);
  if (d.lineVty.loginLocal) L.push(' login local');
  else if (d.lineVty.login) L.push(' login');
  if (d.lineVty.transportInput && d.lineVty.transportInput !== 'all') L.push(` transport input ${d.lineVty.transportInput}`);
  L.push('!', 'end', '');
  return L.join('\n');
}

function isEndHostKind(d: Device) {
  return d.kind === 'pc' || d.kind === 'laptop' || d.kind === 'server';
}

function addrText(a: string, w: string): string {
  if (a === '0.0.0.0' && w === '255.255.255.255') return 'any';
  if (w === '0.0.0.0') return `host ${a}`;
  return `${a} ${w}`;
}

function aclEntryText(type: 'standard' | 'extended', e: import('../net/model.js').AclEntry): string {
  if (type === 'standard') return `${e.action} ${addrText(e.src, e.srcWildcard)}`;
  return `${e.action} ${e.protocol} ${addrText(e.src, e.srcWildcard)} ${addrText(e.dst, e.dstWildcard)}${e.port !== undefined ? ` eq ${e.port}` : ''}`;
}

// ------------------------------------------------------------ show ip interface brief

const pad = (s: string, n: number) => (s.length >= n ? s + ' ' : s.padEnd(n));

export function ipIntBrief(t: Topology, d: Device): string {
  const L = [pad('Interface', 23) + pad('IP-Address', 16) + pad('OK?', 4) + pad('Method', 7) + pad('Status', 22) + 'Protocol'];
  for (const i of d.interfaces) {
    if (i.media === 'console') continue;
    const st = ifaceStatus(t, d, i);
    const method = i.dhcpClient ? 'DHCP' : i.ip ? 'manual' : 'unset';
    L.push(pad(i.name, 23) + pad(i.ip ?? 'unassigned', 16) + pad('YES', 4) + pad(method, 7) + pad(st.status, 22) + st.protocol);
  }
  return L.join('\n') + '\n';
}

export function ipv6IntBrief(t: Topology, d: Device): string {
  const L: string[] = [];
  for (const i of d.interfaces) {
    if (i.media === 'console') continue;
    const st = ifaceStatus(t, d, i);
    L.push(`${pad(i.name, 26)}[${st.status === 'up' ? 'up' : st.status === 'down' ? 'down' : 'administratively down'}/${st.protocol}]`);
    if (i.ipv6?.length) {
      L.push(`    ${linkLocalFromMac(i.mac).toUpperCase()}`);
      for (const a of i.ipv6) L.push(`    ${compressIPv6(a.split('/')[0]).toUpperCase()}`);
    } else L.push('    unassigned');
  }
  return L.join('\n') + '\n';
}

export function showInterface(t: Topology, d: Device, name?: string): string {
  const list = name ? d.interfaces.filter((i) => i.name.toLowerCase() === name.toLowerCase()) : d.interfaces.filter((i) => i.media !== 'console');
  if (!list.length) return '% Invalid interface\n';
  return list
    .map((i) => {
      const st = ifaceStatus(t, d, i);
      const bw = i.bandwidthKbps ?? (i.name.startsWith('Serial') ? 1544 : i.name.startsWith('Fast') ? 100000 : 1000000);
      const lines = [
        `${i.name} is ${st.status}, line protocol is ${st.protocol}${i.errDisabled ? ' (err-disabled)' : ''}`,
        `  Hardware is ${i.name.startsWith('Serial') ? 'WIC MBRD Serial' : i.name.startsWith('Vlan') ? 'CPU Interface' : 'Lance'}, address is ${i.mac} (bia ${i.mac})`,
      ];
      if (i.description) lines.push(`  Description: ${i.description}`);
      if (i.ip) lines.push(`  Internet address is ${i.ip}/${maskToPrefix(i.mask!)}`);
      lines.push(`  MTU 1500 bytes, BW ${bw} Kbit, DLY 100 usec,`, '     reliability 255/255, txload 1/255, rxload 1/255');
      lines.push(`  Encapsulation ${i.name.startsWith('Serial') ? 'HDLC' : i.dot1qVlan ? `802.1Q Virtual LAN, Vlan ID ${i.dot1qVlan}` : 'ARPA'}, loopback not set`);
      if (i.media === 'copper') lines.push('  Full-duplex, 100Mb/s, media type is 10/100BaseTX');
      if (st.reason && st.protocol === 'down') lines.push(`  ! Route Runner hint: ${st.reason}`);
      lines.push('     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored', '     0 output errors, 0 collisions, 0 interface resets');
      return lines.join('\n');
    })
    .join('\n') + '\n';
}

export function showVlanBrief(t: Topology, d: Device): string {
  const L = [pad('VLAN', 5) + pad('Name', 33) + pad('Status', 10) + 'Ports', '---- -------------------------------- --------- -------------------------------'];
  for (const v of [...d.vlans].sort((a, b) => a.id - b.id)) {
    const ports = d.interfaces
      .filter((i) => i.switchport && i.media !== 'virtual' && i.media !== 'console' && effectiveMode(t, d, i) === 'access' && (i.accessVlan ?? 1) === v.id)
      .map((i) => abbrIfaceName(i.name).replace('F', 'Fa').replace('G', 'Gig'));
    const chunks: string[] = [];
    for (let k = 0; k < ports.length; k += 4) chunks.push(ports.slice(k, k + 4).join(', '));
    L.push(pad(String(v.id), 5) + pad(v.name, 33) + pad('active', 10) + (chunks[0] ?? ''));
    for (const c of chunks.slice(1)) L.push(' '.repeat(48) + c);
  }
  L.push('1002 fddi-default                     act/unsup', '1003 token-ring-default               act/unsup', '1004 fddinet-default                  act/unsup', '1005 trnet-default                    act/unsup');
  return L.join('\n') + '\n';
}

export function showTrunks(t: Topology, d: Device): string {
  const trunks = d.interfaces.filter((i) => i.switchport && i.media !== 'virtual' && effectiveMode(t, d, i) === 'trunk' && ifaceStatus(t, d, i).protocol === 'up');
  if (!trunks.length) return '';
  const L = [pad('Port', 12) + pad('Mode', 13) + pad('Encapsulation', 15) + pad('Status', 14) + 'Native vlan'];
  for (const i of trunks) L.push(pad(shortIfaceName(i.name), 12) + pad(i.mode === 'trunk' ? 'on' : 'auto', 13) + pad('802.1q', 15) + pad('trunking', 14) + (i.nativeVlan ?? 1));
  L.push('', pad('Port', 12) + 'Vlans allowed on trunk');
  for (const i of trunks) L.push(pad(shortIfaceName(i.name), 12) + (Array.isArray(i.trunkAllowed) ? i.trunkAllowed.join(',') : '1-1005'));
  L.push('', pad('Port', 12) + 'Vlans allowed and active in management domain');
  for (const i of trunks)
    L.push(pad(shortIfaceName(i.name), 12) + d.vlans.map((v) => v.id).filter((v) => trunkAllows(i, v)).join(','));
  return L.join('\n') + '\n';
}

export function showIpRoute(t: Topology, d: Device): string {
  const L = [
    'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
    '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
    '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
    '       E1 - OSPF external type 1, E2 - OSPF external type 2, E - EGP',
    '       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2, ia - IS-IS inter area',
    '       * - candidate default, U - per-user static route, o - ODR',
    '       P - periodic downloaded static route',
    '',
  ];
  const routes = routingTable(t, d);
  const def = routes.find((r) => r.prefix === 0);
  L.push(def ? `Gateway of last resort is ${def.nextHop ?? '0.0.0.0'} to network 0.0.0.0` : 'Gateway of last resort is not set', '');
  for (const r of routes) {
    const net = `${r.network}/${r.prefix}`;
    const code = pad(r.code, 5);
    if (r.code === 'C') L.push(`${code}${net} is directly connected, ${r.exitIface}`);
    else if (r.code === 'L') L.push(`${code}${net} is directly connected, ${r.exitIface}`);
    else if (r.nextHop) L.push(`${code}${net} [${r.ad}/${r.metric}] via ${r.nextHop}${r.code.startsWith('O') ? `, 00:01:12, ${r.exitIface}` : ''}`);
    else L.push(`${code}${net} is directly connected, ${r.exitIface}`);
  }
  return L.join('\n') + '\n';
}

export function showOspfNeighbor(t: Topology, d: Device): string {
  const L = [pad('Neighbor ID', 16) + pad('Pri', 5) + pad('State', 16) + pad('Dead Time', 11) + pad('Address', 16) + 'Interface'];
  for (const n of ospfNeighbors(t, d)) L.push(pad(n.neighborId, 16) + pad('1', 5) + pad(`FULL/${n.role === 'DROTHER' ? '  -' : n.role}`, 16) + pad('00:00:33', 11) + pad(n.address, 16) + n.localIface);
  return L.join('\n') + '\n';
}

export function showIpProtocols(t: Topology, d: Device): string {
  if (!d.ospf) return '';
  const o = d.ospf;
  return [
    `Routing Protocol is "ospf ${o.processId}"`,
    '  Outgoing update filter list for all interfaces is not set',
    `  Router ID ${ospfRouterId(t, d) ?? '0.0.0.0'}`,
    '  Number of areas in this router is 1. 1 normal 0 stub 0 nssa',
    '  Maximum path: 4',
    '  Routing for Networks:',
    ...o.networks.map((n) => `    ${n.network} ${n.wildcard} area ${n.area}`),
    ...(o.passive.length ? ['  Passive Interface(s):', ...o.passive.map((p) => `    ${p}`)] : []),
    '  Routing Information Sources:',
    '    Gateway         Distance      Last Update',
    ...ospfNeighbors(t, d).map((n) => `    ${pad(n.neighborId, 16)}110           00:01:02`),
    '  Distance: (default is 110)',
    '',
  ].join('\n');
}

export function showArp(t: Topology, d: Device): string {
  const L = [pad('Protocol', 10) + pad('Address', 17) + pad('Age (min)', 11) + pad('Hardware Addr', 16) + pad('Type', 6) + 'Interface'];
  for (const i of d.interfaces) if (i.ip && ifaceStatus(t, d, i).protocol === 'up') L.push(pad('Internet', 10) + pad(i.ip, 17) + pad('-', 11) + pad(i.mac, 16) + pad('ARPA', 6) + i.name);
  for (const e of runtimeOf(t).arp[d.id] ?? []) L.push(pad('Internet', 10) + pad(e.ip, 17) + pad('0', 11) + pad(e.mac, 16) + pad('ARPA', 6) + e.iface);
  return L.join('\n') + '\n';
}

export function showMacTable(t: Topology, d: Device): string {
  const L = ['          Mac Address Table', '-------------------------------------------', '', 'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----'];
  for (const e of macTable(t, d)) L.push(`${pad(String(e.vlan).padStart(4), 8)}${pad(e.mac, 18)}${pad('DYNAMIC', 12)}${shortIfaceName(e.port)}`);
  return L.join('\n') + '\n';
}

export function showCdp(t: Topology, d: Device, detail = false): string {
  if (!d.cdpEnabled) return '% CDP is not enabled\n';
  const rows: string[] = [];
  const details: string[] = [];
  for (const i of d.interfaces) {
    if (ifaceStatus(t, d, i).protocol !== 'up' || i.media === 'virtual' || i.media === 'console') continue;
    const peer = peerOf(t, d.id, i.name);
    if (!peer) continue;
    const pd = getDevice(t, peer.device);
    if (!pd.cdpEnabled) continue;
    const cap = pd.kind === 'router' || pd.kind === 'isp' ? 'R' : pd.kind === 'l3switch' ? 'R S' : 'S';
    rows.push(pad(pd.hostname, 17) + pad(shortIfaceName(i.name), 18) + pad('160', 12) + pad(cap, 12) + pad(pd.model, 10) + shortIfaceName(peer.iface));
    const pi = pd.interfaces.find((x) => x.name === peer.iface);
    const mgmt = pd.interfaces.find((x) => x.ip);
    details.push(
      ['-------------------------', `Device ID: ${pd.hostname}`, 'Entry address(es):', `  IP address: ${pi?.ip ?? mgmt?.ip ?? 'none'}`, `Platform: cisco ${pd.model}, Capabilities: ${cap === 'R' ? 'Router' : 'Switch'}`, `Interface: ${i.name},  Port ID (outgoing port): ${peer.iface}`, 'Holdtime: 160', '', 'Version :', 'Cisco IOS Software, Version 15.4', ''].join('\n'),
    );
  }
  if (detail) return details.join('\n') + '\n';
  return [
    'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge',
    '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone',
    pad('Device ID', 17) + pad('Local Intrfce', 18) + pad('Holdtme', 12) + pad('Capability', 12) + pad('Platform', 10) + 'Port ID',
    ...rows,
    '',
  ].join('\n');
}

export function showVersion(d: Device): string {
  const sw = isSwitch(d);
  return [
    `Cisco IOS Software, ${sw ? 'C2960 Software (C2960-LANBASEK9-M)' : 'ISR Software (X86_64_LINUX_IOSD-UNIVERSALK9-M)'}, Version 15.4(3)M2, RELEASE SOFTWARE (fc2)`,
    'Technical Support: http://www.cisco.com/techsupport',
    'Copyright (c) 1986-2026 by Cisco Systems, Inc.',
    '',
    'ROM: System Bootstrap, Version 15.1(4)M4, RELEASE SOFTWARE (fc1)',
    `${d.hostname} uptime is 1 hours, 12 minutes`,
    'System returned to ROM by power-on',
    `System image file is "flash:${sw ? 'c2960-lanbasek9-mz.150-2.SE4.bin' : 'isr4300-universalk9.16.06.04.SPA.bin'}"`,
    '',
    `cisco ${d.model} (revision 1.0) with 491520K/32768K bytes of memory.`,
    `${d.interfaces.filter((i) => i.media === 'copper').length} Ethernet interfaces`,
    '255K bytes of non-volatile configuration memory.',
    '3207167K bytes of flash memory at bootflash:.',
    '',
    `Configuration register is ${sw ? '0xF' : '0x2102'}`,
    '',
  ].join('\n');
}

export function showDhcpBinding(d: Device): string {
  const L = ['IP address       Client-ID/              Lease expiration        Type', '                 Hardware address'];
  for (const b of d.dhcpBindings) L.push(pad(b.ip, 17) + pad(b.mac, 24) + pad('--', 24) + 'Automatic');
  return L.join('\n') + '\n';
}

export function showAccessLists(d: Device): string {
  const L: string[] = [];
  for (const a of d.acls) {
    L.push(`${a.type === 'standard' ? 'Standard' : 'Extended'} IP access list ${a.id}`);
    let seq = 10;
    for (const e of a.entries) {
      if (e.remark) continue;
      L.push(`    ${seq} ${aclEntryText(a.type, e)}`);
      seq += 10;
    }
  }
  return L.join('\n') + '\n';
}

export function showNat(t: Topology, d: Device): string {
  const L = ['Pro  Inside global     Inside local       Outside local      Outside global'];
  for (const s of d.nat.flatMap((n) => n.statics)) L.push(`---  ${pad(s.outside, 18)}${pad(s.inside, 19)}---                ---`);
  for (const e of runtimeOf(t).nat[d.id] ?? []) L.push(`icmp ${pad(e.insideGlobal + ':1', 18)}${pad(e.insideLocal + ':1', 19)}${pad('8.8.8.8:1', 19)}8.8.8.8:1`);
  return L.join('\n') + '\n';
}

export function showSpanningTree(t: Topology, d: Device): string {
  const vlans = d.vlans.map((v) => v.id).filter((v) => v < 1002);
  const out: string[] = [];
  for (const v of vlans) {
    const st = spanningTree(t, d, v);
    if (!st || !st.ports.length) continue;
    out.push(
      `VLAN${String(v).padStart(4, '0')}`,
      `  Spanning tree enabled protocol ${d.stpMode === 'rapid-pvst' ? 'rstp' : 'ieee'}`,
      `  Root ID    Priority    ${st.rootPriority}`,
      `             Address     ${st.rootMac}`,
      st.isRoot ? '             This bridge is the root' : `             Cost        ${st.rootCost}`,
      '             Hello Time  2 sec  Max Age 20 sec  Forward Delay 15 sec',
      '',
      `  Bridge ID  Priority    ${st.bridgePriority}  (priority ${st.bridgePriority - v} sys-id-ext ${v})`,
      `             Address     ${st.bridgeMac}`,
      '',
      'Interface        Role Sts Cost      Prio.Nbr Type',
      '---------------- ---- --- --------- -------- --------------------------------',
      ...st.ports.map((p) => `${pad(shortIfaceName(p.port), 17)}${pad(p.role, 5)}${pad(p.state, 4)}${pad(String(p.cost), 10)}${pad('128.' + (p.port.split('/').pop() ?? '1'), 9)}P2p`),
      '',
    );
  }
  return out.join('\n') + '\n';
}

export function showStandbyBrief(t: Topology, d: Device): string {
  const L = ['                     P indicates configured to preempt.', '                     |', 'Interface   Grp  Pri P State    Active          Standby         Virtual IP'];
  for (const h of hsrpStates(t).filter((x) => x.device === d.id))
    L.push(`${pad(shortIfaceName(h.iface), 12)}${pad(String(h.group), 5)}${pad(String(h.priority), 4)}${h.preempt ? 'P ' : '  '}${pad(h.state, 9)}${pad(h.state === 'Active' ? 'local' : h.active ?? 'unknown', 16)}${pad(h.state === 'Standby' ? 'local' : h.standby ?? 'unknown', 16)}${h.vip}`);
  return L.join('\n') + '\n';
}

export function showPortSecurity(t: Topology, d: Device, name?: string): string {
  if (name) {
    const i = d.interfaces.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!i) return '% Invalid interface\n';
    const ps = i.portSecurity;
    return [
      `Port Security              : ${ps?.enabled ? 'Enabled' : 'Disabled'}`,
      `Port Status                : ${i.errDisabled ? 'Secure-shutdown' : ps?.enabled ? 'Secure-up' : 'Secure-down'}`,
      `Violation Mode             : ${ps ? ps.violation[0].toUpperCase() + ps.violation.slice(1) : 'Shutdown'}`,
      'Aging Time                 : 0 mins',
      `Maximum MAC Addresses      : ${ps?.maximum ?? 1}`,
      `Total MAC Addresses        : ${ps?.learned.length ?? 0}`,
      `Sticky MAC Addresses       : ${ps?.sticky ? ps.learned.length : 0}`,
      `Last Source Address:Vlan   : ${ps?.learned[0] ?? '0000.0000.0000'}:${i.accessVlan ?? 1}`,
      `Security Violation Count   : ${i.errDisabled ? 1 : 0}`,
      '',
    ].join('\n');
  }
  const L = ['Secure Port MaxSecureAddr CurrentAddr SecurityViolation Security Action', '               (Count)       (Count)          (Count)', '--------------------------------------------------------------------'];
  for (const i of d.interfaces.filter((x) => x.portSecurity?.enabled))
    L.push(`${pad(shortIfaceName(i.name), 12)}${pad(String(i.portSecurity!.maximum), 14)}${pad(String(i.portSecurity!.learned.length), 12)}${pad(i.errDisabled ? '1' : '0', 18)}${i.portSecurity!.violation[0].toUpperCase() + i.portSecurity!.violation.slice(1)}`);
  return L.join('\n') + '\n';
}

export function showEtherchannel(t: Topology, d: Device): string {
  const groups = new Map<number, { mode: string; ports: string[] }>();
  for (const i of d.interfaces)
    if (i.channelGroup) {
      const g = groups.get(i.channelGroup.id) ?? { mode: i.channelGroup.mode, ports: [] };
      g.ports.push(`${shortIfaceName(i.name)}(${ifaceStatus(t, d, i).protocol === 'up' ? 'P' : 'D'})`);
      groups.set(i.channelGroup.id, g);
    }
  const L = [
    'Flags:  D - down        P - bundled in port-channel',
    '        I - stand-alone s - suspended',
    '        S - Layer2      U - in use      f - failed to allocate aggregator',
    '',
    `Number of channel-groups in use: ${groups.size}`,
    `Number of aggregators:           ${groups.size}`,
    '',
    'Group  Port-channel  Protocol    Ports',
    '------+-------------+-----------+----------------------------------------------',
  ];
  for (const [id, g] of groups) {
    const proto = g.mode === 'active' || g.mode === 'passive' ? 'LACP' : g.mode === 'on' ? '-' : 'PAgP';
    const up = g.ports.some((p) => p.endsWith('(P)'));
    L.push(`${pad(String(id), 7)}${pad(`Po${id}(S${up ? 'U' : 'D'})`, 14)}${pad(proto, 12)}${g.ports.join(' ')}`);
  }
  return L.join('\n') + '\n';
}
