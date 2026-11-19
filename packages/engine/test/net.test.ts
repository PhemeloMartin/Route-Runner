import { describe, expect, it } from 'vitest';
import {
  compressIPv6,
  eui64InterfaceId,
  expandIPv6,
  subnetInfo,
  vlsm,
  wildcardMatch,
} from '../src/net/ip.js';
import { createIsp, createPC, createRouter, createSwitch, type Topology } from '../src/net/model.js';
import { dhcpRequest, ping, routingTable } from '../src/net/sim.js';
import { IosSession } from '../src/ios/session.js';
import { HostSession } from '../src/host/pc.js';

function cli(t: Topology, id: string, lines: string[]): string {
  const s = new IosSession(t, id, { hints: true, via: 'console' });
  let out = '';
  for (const l of lines) out += s.exec(l).output;
  return out;
}

function link(t: Topology, a: string, ai: string, b: string, bi: string, cable: 'straight' | 'crossover' | 'serial' | 'console' = 'straight') {
  t.links.push({ id: `${a}-${b}-${t.links.length}`, a: { device: a, iface: ai }, b: { device: b, iface: bi }, cable });
}

function setPc(t: Topology, id: string, ip: string, mask: string, gw?: string) {
  const d = t.devices.find((x) => x.id === id)!;
  d.interfaces[0].ip = ip;
  d.interfaces[0].mask = mask;
  d.defaultGateway = gw;
}

describe('IP maths', () => {
  it('calculates a /26', () => {
    const s = subnetInfo('192.168.10.77', 26);
    expect(s.network).toBe('192.168.10.64');
    expect(s.broadcast).toBe('192.168.10.127');
    expect(s.firstHost).toBe('192.168.10.65');
    expect(s.lastHost).toBe('192.168.10.126');
    expect(s.usableHosts).toBe(62);
    expect(s.wildcard).toBe('0.0.0.63');
  });
  it('does VLSM biggest-first', () => {
    const r = vlsm('10.0.0.0', 24, [
      { name: 'WAN', hosts: 2 },
      { name: 'Sales', hosts: 100 },
      { name: 'IT', hosts: 50 },
    ]);
    expect(r.map((x) => `${x.name}:${x.network}/${x.prefix}`)).toEqual(['Sales:10.0.0.0/25', 'IT:10.0.0.128/26', 'WAN:10.0.0.192/30']);
  });
  it('handles IPv6 compression and EUI-64', () => {
    expect(compressIPv6('2001:0db8:0000:0000:0000:ff00:0042:8329')).toBe('2001:db8::ff00:42:8329');
    expect(expandIPv6('2001:db8::1')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(eui64InterfaceId('00:1A:2B:3C:4D:5E')).toBe('021a:2bff:fe3c:4d5e');
  });
  it('matches wildcards like OSPF/ACLs do', () => {
    expect(wildcardMatch('10.1.5.9', '10.1.0.0', '0.0.255.255')).toBe(true);
    expect(wildcardMatch('10.2.5.9', '10.1.0.0', '0.0.255.255')).toBe(false);
  });
});

describe('Layer 2 switching', () => {
  it('lets two PCs in the same subnet ping through a switch', () => {
    const t: Topology = { devices: [createSwitch('S1'), createPC('PC1'), createPC('PC2')], links: [] };
    link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
    link(t, 'PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2');
    setPc(t, 'PC1', '192.168.1.10', '255.255.255.0');
    setPc(t, 'PC2', '192.168.1.11', '255.255.255.0');
    expect(ping(t, 'PC1', '192.168.1.11').success).toBe(true);
  });

  it('isolates VLANs', () => {
    const t: Topology = { devices: [createSwitch('S1'), createPC('PC1'), createPC('PC2')], links: [] };
    link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
    link(t, 'PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2');
    setPc(t, 'PC1', '192.168.1.10', '255.255.255.0');
    setPc(t, 'PC2', '192.168.1.11', '255.255.255.0');
    cli(t, 'S1', ['en', 'conf t', 'vlan 10', 'name SALES', 'int f0/1', 'switchport mode access', 'switchport access vlan 10', 'end']);
    const r = ping(t, 'PC1', '192.168.1.11');
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/ARP/);
  });
});

describe('Router-on-a-stick (inter-VLAN routing)', () => {
  function build() {
    const t: Topology = { devices: [createRouter('R1'), createSwitch('S1'), createPC('PC1'), createPC('PC2')], links: [] };
    link(t, 'R1', 'GigabitEthernet0/0/0', 'S1', 'GigabitEthernet0/1');
    link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
    link(t, 'PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2');
    setPc(t, 'PC1', '192.168.10.10', '255.255.255.0', '192.168.10.1');
    setPc(t, 'PC2', '192.168.20.10', '255.255.255.0', '192.168.20.1');
    cli(t, 'S1', ['enable', 'configure terminal', 'vlan 10', 'vlan 20', 'interface f0/1', 'switchport mode access', 'switchport access vlan 10', 'int f0/2', 'sw mode acc', 'sw acc vlan 20', 'int g0/1', 'switchport mode trunk', 'end']);
    return t;
  }

  it('fails until the router port is brought up, then works', () => {
    const t = build();
    const out = cli(t, 'R1', ['en', 'conf t', 'int g0/0/0.10', 'encapsulation dot1Q 10', 'ip address 192.168.10.1 255.255.255.0', 'int g0/0/0.20', 'encapsulation dot1q 20', 'ip add 192.168.20.1 255.255.255.0', 'end']);
    expect(out).not.toMatch(/Invalid/);
    expect(ping(t, 'PC1', '192.168.20.10').success).toBe(false); // physical port still shutdown!
    const out2 = cli(t, 'R1', ['en', 'conf t', 'int g0/0/0', 'no shut', 'end']);
    expect(out2).toMatch(/changed state to up/);
    const r = ping(t, 'PC1', '192.168.20.10');
    expect(r.reason).toBeUndefined();
    expect(r.success).toBe(true);
  });

  it('shows correct IOS output', () => {
    const t = build();
    const out = cli(t, 'S1', ['en', 'sh vlan br', 'show interfaces trunk']);
    expect(out).toMatch(/10\s+VLAN0010/);
    const routerOut = cli(t, 'R1', ['enable', 'show ip interface brief']);
    expect(routerOut).toMatch(/GigabitEthernet0\/0\/0\s+unassigned\s+YES unset\s+administratively down down/);
  });
});

describe('OSPF between two routers', () => {
  it('learns remote LANs and pings end to end', () => {
    const t: Topology = { devices: [createRouter('R1'), createRouter('R2'), createPC('PC1'), createPC('PC2')], links: [] };
    link(t, 'R1', 'GigabitEthernet0/0/1', 'R2', 'GigabitEthernet0/0/1', 'crossover');
    link(t, 'PC1', 'FastEthernet0', 'R1', 'GigabitEthernet0/0/0', 'crossover');
    link(t, 'PC2', 'FastEthernet0', 'R2', 'GigabitEthernet0/0/0', 'crossover');
    setPc(t, 'PC1', '10.1.1.10', '255.255.255.0', '10.1.1.1');
    setPc(t, 'PC2', '10.2.2.10', '255.255.255.0', '10.2.2.1');
    cli(t, 'R1', ['en', 'conf t', 'int g0/0/0', 'ip add 10.1.1.1 255.255.255.0', 'no shut', 'int g0/0/1', 'ip add 10.0.12.1 255.255.255.252', 'no shut', 'router ospf 1', 'network 10.1.1.0 0.0.0.255 area 0', 'network 10.0.12.0 0.0.0.3 area 0', 'passive-interface g0/0/0', 'end']);
    expect(ping(t, 'PC1', '10.2.2.10').success).toBe(false);
    cli(t, 'R2', ['en', 'conf t', 'int g0/0/0', 'ip add 10.2.2.1 255.255.255.0', 'no shut', 'int g0/0/1', 'ip add 10.0.12.2 255.255.255.252', 'no shut', 'router ospf 1', 'network 10.0.0.0 0.255.255.255 area 0', 'end']);
    const rt = routingTable(t, t.devices[0]);
    expect(rt.some((r) => r.code === 'O' && r.network === '10.2.2.0')).toBe(true);
    expect(ping(t, 'PC1', '10.2.2.10').success).toBe(true);
    const nb = cli(t, 'R1', ['en', 'show ip ospf neighbor']);
    expect(nb).toMatch(/FULL/);
    const routes = cli(t, 'R1', ['en', 'show ip route']);
    expect(routes).toMatch(/O\s+10\.2\.2\.0\/24 \[110\/2\] via 10\.0\.12\.2/);
  });
});

describe('DHCP, NAT and ACLs', () => {
  function office() {
    const t: Topology = { devices: [createRouter('R1'), createSwitch('S1'), createPC('PC1'), createIsp('ISP')], links: [] };
    link(t, 'R1', 'GigabitEthernet0/0/0', 'S1', 'GigabitEthernet0/1');
    link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
    link(t, 'R1', 'GigabitEthernet0/0/1', 'ISP', 'GigabitEthernet0/0/0', 'crossover');
    cli(t, 'ISP', ['en', 'conf t', 'int g0/0/0', 'ip add 203.0.113.1 255.255.255.252', 'no shut', 'end']);
    cli(t, 'R1', [
      'en', 'conf t',
      'ip dhcp excluded-address 192.168.1.1 192.168.1.10',
      'ip dhcp pool LAN', 'network 192.168.1.0 255.255.255.0', 'default-router 192.168.1.1', 'dns-server 8.8.8.8', 'exit',
      'int g0/0/0', 'ip add 192.168.1.1 255.255.255.0', 'no shut', 'ip nat inside',
      'int g0/0/1', 'ip add 203.0.113.2 255.255.255.252', 'no shut', 'ip nat outside', 'exit',
      'ip route 0.0.0.0 0.0.0.0 203.0.113.1',
      'end',
    ]);
    return t;
  }

  it('hands out the first non-excluded address', () => {
    const t = office();
    const lease = dhcpRequest(t, 'PC1');
    expect(lease.ip).toBe('192.168.1.11');
    expect(lease.gateway).toBe('192.168.1.1');
  });

  it('cannot reach the internet without NAT, can with PAT', () => {
    const t = office();
    dhcpRequest(t, 'PC1');
    const before = ping(t, 'PC1', '8.8.8.8');
    expect(before.success).toBe(false);
    expect(before.reason).toMatch(/REPLY/);
    cli(t, 'R1', ['en', 'conf t', 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat inside source list 1 interface g0/0/1 overload', 'end']);
    const after = ping(t, 'PC1', '8.8.8.8');
    expect(after.success).toBe(true);
    expect(after.translations[0]).toMatchObject({ insideLocal: '192.168.1.11', insideGlobal: '203.0.113.2' });
  });

  it('blocks with an extended ACL', () => {
    const t = office();
    dhcpRequest(t, 'PC1');
    cli(t, 'R1', ['en', 'conf t', 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat inside source list 1 interface g0/0/1 overload', 'access-list 110 deny icmp any host 8.8.8.8', 'access-list 110 permit ip any any', 'int g0/0/0', 'ip access-group 110 in', 'end']);
    const r = ping(t, 'PC1', '8.8.8.8');
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/ACL 110/);
  });

  it('falls back to APIPA when no DHCP server answers', () => {
    const t: Topology = { devices: [createSwitch('S1'), createPC('PC1')], links: [] };
    link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
    expect(dhcpRequest(t, 'PC1').ip.startsWith('169.254.')).toBe(true);
  });

  it('relays DHCP across a router with ip helper-address', () => {
    const t: Topology = { devices: [createRouter('R1'), createPC('PC1'), createPC('SRV', 'Server', 'server')], links: [] };
    link(t, 'PC1', 'FastEthernet0', 'R1', 'GigabitEthernet0/0/0', 'crossover');
    link(t, 'SRV', 'FastEthernet0', 'R1', 'GigabitEthernet0/0/1', 'crossover');
    setPc(t, 'SRV', '10.0.0.5', '255.255.255.0', '10.0.0.1');
    t.devices[2].dhcpPools.push({ name: 'REMOTE', network: '172.16.5.0', mask: '255.255.255.0', defaultRouter: '172.16.5.1' });
    cli(t, 'R1', ['en', 'conf t', 'int g0/0/0', 'ip add 172.16.5.1 255.255.255.0', 'no shut', 'int g0/0/1', 'ip add 10.0.0.1 255.255.255.0', 'no shut', 'end']);
    expect(dhcpRequest(t, 'PC1').apipa).toBe(true);
    cli(t, 'R1', ['en', 'conf t', 'int g0/0/0', 'ip helper-address 10.0.0.5', 'end']);
    expect(dhcpRequest(t, 'PC1').ip).toBe('172.16.5.2');
  });
});

describe('IOS CLI behaviour', () => {
  it('abbreviations, errors and the DNS-lookup trap', () => {
    const t: Topology = { devices: [createRouter('R1')], links: [] };
    const s = new IosSession(t, 'R1');
    expect(s.prompt()).toBe('Router>');
    s.exec('en');
    expect(s.prompt()).toBe('Router#');
    expect(s.exec('shwo').output).toMatch(/Translating "shwo"/);
    s.exec('conf t');
    expect(s.prompt()).toBe('Router(config)#');
    expect(s.exec('ip adress 1.1.1.1').output).toMatch(/Invalid input detected/);
    s.exec('hostname HQ');
    expect(s.prompt()).toBe('HQ(config)#');
    s.exec('int g0/0/0');
    expect(s.prompt()).toBe('HQ(config-if)#');
    expect(s.exec('ip address 10.0.0.0 255.255.255.0').output).toMatch(/Bad mask/);
    s.exec('do show ip int brief');
    s.exec('end');
    expect(s.prompt()).toBe('HQ#');
    expect(s.exec('sh run').output).toMatch(/hostname HQ/);
  });

  it('loses config on reload unless saved', () => {
    const t: Topology = { devices: [createRouter('R1')], links: [] };
    cli(t, 'R1', ['en', 'conf t', 'hostname Edge', 'end']);
    const s = new IosSession(t, 'R1');
    s.exec('en');
    s.exec('reload');
    s.exec('');
    expect(t.devices[0].hostname).toBe('Router');
    cli(t, 'R1', ['en', 'conf t', 'hostname Edge', 'end', 'copy run start', '']);
    const s2 = new IosSession(t, 'R1');
    s2.exec('en');
    s2.exec('reload');
    s2.exec('');
    expect(t.devices[0].hostname).toBe('Edge');
  });

  it('supports the full SSH setup and login from a PC', () => {
    const t: Topology = { devices: [createRouter('R1'), createPC('PC1')], links: [] };
    link(t, 'PC1', 'FastEthernet0', 'R1', 'GigabitEthernet0/0/0', 'crossover');
    setPc(t, 'PC1', '192.168.1.10', '255.255.255.0', '192.168.1.1');
    const out = cli(t, 'R1', [
      'enable', 'configure terminal', 'hostname R1', 'ip domain-name routerunner.lab',
      'crypto key generate rsa general-keys modulus 1024', 'username phemelo privilege 15 secret Cisco123',
      'line vty 0 4', 'transport input ssh', 'login local', 'exit',
      'int g0/0/0', 'ip add 192.168.1.1 255.255.255.0', 'no shut', 'end',
    ]);
    expect(out).toMatch(/Generating 1024 bit RSA keys/);
    const pc = new HostSession(t, 'PC1');
    const r1 = pc.exec('ssh -l phemelo 192.168.1.1');
    expect(r1.secret).toBe(true);
    const r2 = pc.exec('Cisco123');
    expect(r2.push?.prompt()).toBe('R1#');
    expect(pc.exec('telnet 192.168.1.1').output).toMatch(/refused/);
  });

  it('PC ipconfig /renew via DHCP and ping by name through DNS', () => {
    const t: Topology = { devices: [createRouter('R1'), createSwitch('S1'), createPC('PC1'), createPC('DNS', 'DNS', 'server')], links: [] };
    link(t, 'R1', 'GigabitEthernet0/0/0', 'S1', 'GigabitEthernet0/1');
    link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
    link(t, 'DNS', 'FastEthernet0', 'S1', 'FastEthernet0/2');
    setPc(t, 'DNS', '192.168.1.5', '255.255.255.0', '192.168.1.1');
    t.devices[3].dnsRecords = [{ name: 'www.routerunner.lab', ip: '192.168.1.5' }];
    cli(t, 'R1', ['en', 'conf t', 'ip dhcp excluded-address 192.168.1.1 192.168.1.9', 'ip dhcp pool LAN', 'network 192.168.1.0 /24', 'default-router 192.168.1.1', 'dns-server 192.168.1.5', 'int g0/0/0', 'ip add 192.168.1.1 255.255.255.0', 'no shut', 'end']);
    const pc = new HostSession(t, 'PC1');
    expect(pc.exec('ipconfig /renew').output).toMatch(/192\.168\.1\.10/);
    expect(pc.exec('ping www.routerunner.lab').output).toMatch(/Reply from 192\.168\.1\.5/);
  });
});
