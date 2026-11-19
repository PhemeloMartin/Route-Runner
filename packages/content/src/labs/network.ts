/**
 * Network lab missions. Each one builds a topology (devices placed on the 3D lab table)
 * and lists objectives that are checked live against the simulator.
 */
import {
  type Device,
  type Topology,
  cloneTopology,
  createIsp,
  createL3Switch,
  createPC,
  createRouter,
  createSwitch,
  hsrpStates,
  ospfNeighbors,
  ping,
  recommendedCopperCable,
  spanningTree,
  tcpReach,
} from '@route-runner/engine';

export interface Objective {
  id: string;
  text: string;
  check: (t: Topology, events: string[]) => boolean;
}

export interface NetworkLab {
  id: string;
  title: string;
  brief: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  minutes: number;
  troubleshooting?: boolean;
  /** Player must place cables themselves. */
  cabling?: boolean;
  build: () => Topology;
  objectives: Objective[];
  hints: string[];
  solution: string[];
}

const at = (d: Device, x: number, z: number, hostname?: string): Device => {
  d.position = [x, 0, z];
  if (hostname) d.hostname = hostname;
  return d;
};

function link(t: Topology, a: string, ai: string, b: string, bi: string, cable: 'straight' | 'crossover' | 'serial' | 'console' | 'fiber' = 'straight') {
  t.links.push({ id: `${a}:${ai}-${b}:${bi}`, a: { device: a, iface: ai }, b: { device: b, iface: bi }, cable });
}

function pcIp(t: Topology, id: string, ip: string, mask = '255.255.255.0', gw?: string) {
  const d = t.devices.find((x) => x.id === id)!;
  d.interfaces[0].ip = ip;
  d.interfaces[0].mask = mask;
  d.defaultGateway = gw;
}

const dev = (t: Topology, id: string) => t.devices.find((d) => d.id === id)!;
const canPing = (t: Topology, from: string, ip: string) => ping(cloneTopology(t), from, ip).success;
const ipOf = (t: Topology, id: string) => dev(t, id).interfaces.find((i) => i.ip && !i.name.startsWith('Loopback'))?.ip ?? '0.0.0.0';

export const NETWORK_LABS: NetworkLab[] = [
  {
    id: 'first-lan',
    title: 'Mission 1: Your First LAN',
    brief: 'Phemelo has been hired by a small spaza-shop owner, Mma Dikeledi, who wants her two computers to share files. Everything is cabled to a switch already. Give each PC an IP address in the 192.168.1.0/24 network and prove they can talk.',
    difficulty: 1,
    minutes: 15,
    build: () => {
      const t: Topology = { devices: [at(createSwitch('S1'), 0, 0), at(createPC('PC1'), -3, 2, 'Till-PC'), at(createPC('PC2'), 3, 2, 'Office-PC')], links: [] };
      link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
      link(t, 'PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2');
      return t;
    },
    objectives: [
      { id: 'ip1', text: 'Till-PC has an address in 192.168.1.0/24', check: (t) => /^192\.168\.1\.(\d+)$/.test(ipOf(t, 'PC1')) && dev(t, 'PC1').interfaces[0].mask === '255.255.255.0' },
      { id: 'ip2', text: 'Office-PC has a DIFFERENT address in 192.168.1.0/24', check: (t) => /^192\.168\.1\.(\d+)$/.test(ipOf(t, 'PC2')) && ipOf(t, 'PC1') !== ipOf(t, 'PC2') },
      { id: 'ping', text: 'Till-PC can ping Office-PC', check: (t) => canPing(t, 'PC1', ipOf(t, 'PC2')) },
    ],
    hints: [
      'Click a PC and open its Command Prompt (or the IP Configuration tab).',
      'Command: netsh interface ip set address "Ethernet" static 192.168.1.10 255.255.255.0',
      'Valid hosts in 192.168.1.0/24 are .1 to .254. Don\'t use .0 (network) or .255 (broadcast).',
      'Then: ping 192.168.1.11',
    ],
    solution: ['Till-PC: netsh interface ip set address "Ethernet" static 192.168.1.10 255.255.255.0', 'Office-PC: netsh interface ip set address "Ethernet" static 192.168.1.11 255.255.255.0', 'Till-PC: ping 192.168.1.11'],
  },
  {
    id: 'cable-it',
    title: 'Mission 2: Cable the Office',
    brief: 'A new office arrived in boxes. Use the right cable for each connection: PCs to the switch, the switch to the router, the router to the second router (WAN), and a console cable from the Admin laptop to the router so you can configure it.',
    difficulty: 1,
    minutes: 15,
    cabling: true,
    build: () => ({
      devices: [at(createRouter('R1'), 0, -2, 'R1'), at(createRouter('R2'), 5, -2, 'R2'), at(createSwitch('S1'), 0, 1, 'S1'), at(createPC('PC1'), -3, 4, 'PC1'), at(createPC('PC2'), 3, 4, 'PC2'), at(createPC('ADMIN', 'Admin-Laptop', 'laptop'), -4, -2)],
      links: [],
    }),
    objectives: [
      { id: 'pcs', text: 'PC1 and PC2 are connected to S1 with STRAIGHT-THROUGH cables', check: (t) => ['PC1', 'PC2'].every((p) => t.links.some((l) => [l.a.device, l.b.device].includes(p) && [l.a.device, l.b.device].includes('S1') && l.cable === 'straight')) },
      { id: 'uplink', text: 'S1 is connected to R1 (straight-through: switch to router)', check: (t) => t.links.some((l) => [l.a.device, l.b.device].sort().join() === 'R1,S1' && l.cable === recommendedCopperCable('switch', 'router')) },
      { id: 'wan', text: 'R1 is connected to R2 with a SERIAL cable or a CROSSOVER copper cable', check: (t) => t.links.some((l) => [l.a.device, l.b.device].sort().join() === 'R1,R2' && (l.cable === 'serial' || l.cable === 'crossover')) },
      { id: 'console', text: 'Admin-Laptop RS232 is connected to R1 Console with the CONSOLE cable', check: (t) => t.links.some((l) => [l.a.device, l.b.device].sort().join() === 'ADMIN,R1' && l.cable === 'console') },
    ],
    hints: ['Unlike devices (PC-switch, switch-router) = straight-through.', 'Like devices (router-router, switch-switch, PC-PC, PC-router) = crossover.', 'The light-blue console (rollover) cable goes from the laptop\'s RS232/USB port into the router\'s CONSOLE port.'],
    solution: ['PC1 Fa0 -> S1 Fa0/1 (straight)', 'PC2 Fa0 -> S1 Fa0/2 (straight)', 'S1 G0/1 -> R1 G0/0/0 (straight)', 'R1 S0/1/0 -> R2 S0/1/0 (serial)', 'Admin RS232 -> R1 Console (console)'],
  },
  {
    id: 'basic-config',
    title: 'Mission 3: Secure the Router',
    brief: 'You are consoled into a brand-new router for "Kuruman Marketplace". Give it an identity and lock it down before anyone else touches it. Then SAVE - the power in Kuruman is not reliable!',
    difficulty: 2,
    minutes: 20,
    build: () => {
      const t: Topology = { devices: [at(createRouter('R1'), 0, 0), at(createPC('ADMIN', 'Admin-Laptop', 'laptop'), -3, 0)], links: [] };
      link(t, 'ADMIN', 'RS232', 'R1', 'Console0', 'console');
      return t;
    },
    objectives: [
      { id: 'host', text: 'Hostname is KMP-R1', check: (t) => dev(t, 'R1').hostname === 'KMP-R1' },
      { id: 'secret', text: 'Privileged EXEC is protected with "enable secret"', check: (t) => !!dev(t, 'R1').enableSecret },
      { id: 'con', text: 'Console line asks for a password ("password" + "login")', check: (t) => !!dev(t, 'R1').lineCon.password && dev(t, 'R1').lineCon.login },
      { id: 'vty', text: 'VTY lines 0 4 have a password and "login"', check: (t) => !!dev(t, 'R1').lineVty.password && dev(t, 'R1').lineVty.login },
      { id: 'enc', text: 'Plain-text passwords are scrambled (service password-encryption)', check: (t) => dev(t, 'R1').servicePasswordEncryption },
      { id: 'banner', text: 'A legal warning banner (banner motd) is set', check: (t) => !!dev(t, 'R1').bannerMotd },
      { id: 'lookup', text: 'Typos no longer trigger DNS lookups (no ip domain-lookup)', check: (t) => !!dev(t, 'R1').noIpDomainLookup },
      { id: 'save', text: 'Configuration is saved to NVRAM (startup-config)', check: (t) => !!dev(t, 'R1').startupConfig && JSON.parse(dev(t, 'R1').startupConfig!).hostname === 'KMP-R1' },
    ],
    hints: ['Open the laptop and run: putty -serial COM1', 'enable -> configure terminal -> hostname KMP-R1', 'enable secret class  |  line console 0 / password cisco / login', 'line vty 0 4 / password cisco / login', 'service password-encryption  |  banner motd #Authorised access only#', 'end -> copy running-config startup-config'],
    solution: ['enable', 'configure terminal', 'hostname KMP-R1', 'no ip domain-lookup', 'enable secret class', 'line console 0', 'password cisco', 'login', 'exit', 'line vty 0 4', 'password cisco', 'login', 'exit', 'service password-encryption', 'banner motd #Authorised access only#', 'end', 'copy running-config startup-config'],
  },
  {
    id: 'ssh-mgmt',
    title: 'Mission 4: Remote Management with SSH',
    brief: 'The switch lives in a locked cabinet. Configure a management IP on VLAN 1 and SSH so you can manage it from your desk. Telnet must NOT work - it sends passwords in clear text.',
    difficulty: 2,
    minutes: 25,
    build: () => {
      const t: Topology = { devices: [at(createSwitch('S1'), 0, 0, 'S1'), at(createPC('PC1', 'Admin-PC'), -3, 2)], links: [] };
      link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
      pcIp(t, 'PC1', '192.168.99.10', '255.255.255.0', '192.168.99.1');
      return t;
    },
    objectives: [
      { id: 'svi', text: 'Interface Vlan1 has 192.168.99.2/24 and is up', check: (t) => dev(t, 'S1').interfaces.find((i) => i.name === 'Vlan1')?.ip === '192.168.99.2' && canPing(t, 'PC1', '192.168.99.2') },
      { id: 'gw', text: 'The switch has a default gateway (192.168.99.1)', check: (t) => dev(t, 'S1').defaultGateway === '192.168.99.1' },
      { id: 'keys', text: 'RSA keys of 1024+ bits exist (needs hostname + ip domain-name first)', check: (t) => (dev(t, 'S1').rsaBits ?? 0) >= 1024 },
      { id: 'user', text: 'A local admin user exists and VTY uses "login local"', check: (t) => dev(t, 'S1').users.length > 0 && dev(t, 'S1').lineVty.loginLocal },
      { id: 'sshonly', text: 'VTY lines accept SSH only (transport input ssh)', check: (t) => dev(t, 'S1').lineVty.transportInput === 'ssh' },
      { id: 'login', text: 'You logged in from Admin-PC with ssh -l', check: (_t, ev) => ev.includes('ssh:ok') },
    ],
    hints: ['interface vlan 1 / ip address 192.168.99.2 255.255.255.0 / no shutdown', 'ip default-gateway 192.168.99.1', 'ip domain-name routerunner.lab / crypto key generate rsa general-keys modulus 1024', 'username admin secret Str0ng!', 'line vty 0 15 / transport input ssh / login local', 'From the PC: ssh -l admin 192.168.99.2'],
    solution: ['enable', 'conf t', 'interface vlan 1', 'ip address 192.168.99.2 255.255.255.0', 'no shutdown', 'exit', 'ip default-gateway 192.168.99.1', 'ip domain-name routerunner.lab', 'crypto key generate rsa general-keys modulus 1024', 'username admin secret Str0ng!', 'ip ssh version 2', 'line vty 0 15', 'transport input ssh', 'login local', 'end', 'wr', 'PC: ssh -l admin 192.168.99.2'],
  },
  {
    id: 'dhcp-dns',
    title: 'Mission 5: Automatic Addresses (DHCP) and Names (DNS)',
    brief: 'Typing IPs on 40 PCs by hand is how mistakes happen. Make the router a DHCP server for 192.168.10.0/24, keep .1-.10 for printers and servers, and hand out the DNS server 192.168.10.5 so staff can browse to www.kmp.lab.',
    difficulty: 2,
    minutes: 25,
    build: () => {
      const t: Topology = { devices: [at(createRouter('R1'), 0, -2, 'R1'), at(createSwitch('S1'), 0, 1, 'S1'), at(createPC('PC1'), -3, 4), at(createPC('PC2'), 0, 4.5), at(createPC('DNS', 'DNS-Server', 'server'), 3, 4)], links: [] };
      link(t, 'R1', 'GigabitEthernet0/0/0', 'S1', 'GigabitEthernet0/1');
      link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
      link(t, 'PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2');
      link(t, 'DNS', 'FastEthernet0', 'S1', 'FastEthernet0/3');
      pcIp(t, 'DNS', '192.168.10.5', '255.255.255.0', '192.168.10.1');
      dev(t, 'DNS').dnsRecords = [{ name: 'www.kmp.lab', ip: '192.168.10.5' }, { name: 'intranet.kmp.lab', ip: '192.168.10.5' }];
      return t;
    },
    objectives: [
      { id: 'gw', text: 'R1 G0/0/0 is 192.168.10.1/24 and up', check: (t) => dev(t, 'R1').interfaces[0].ip === '192.168.10.1' && !dev(t, 'R1').interfaces[0].shutdown },
      { id: 'excl', text: '192.168.10.1 - 192.168.10.10 are excluded from DHCP', check: (t) => dev(t, 'R1').dhcpExcluded.some((x) => x.low === '192.168.10.1' && x.high === '192.168.10.10') },
      { id: 'pool', text: 'A DHCP pool gives gateway 192.168.10.1 and DNS 192.168.10.5', check: (t) => dev(t, 'R1').dhcpPools.some((p) => p.network === '192.168.10.0' && p.defaultRouter === '192.168.10.1' && p.dns === '192.168.10.5') },
      { id: 'lease', text: 'PC1 and PC2 received addresses via DHCP (ipconfig /renew)', check: (t) => ['PC1', 'PC2'].every((p) => dev(t, p).interfaces[0].dhcpClient && /^192\.168\.10\.(1[1-9]|[2-9]\d|1\d\d|2[0-4]\d|25[0-4])$/.test(ipOf(t, p))) },
      { id: 'dns', text: 'PC1 can ping www.kmp.lab BY NAME', check: (_t, ev) => ev.some((e) => e.startsWith('ping:ok:PC1:192.168.10.5')) },
    ],
    hints: ['ip dhcp excluded-address 192.168.10.1 192.168.10.10', 'ip dhcp pool LAN / network 192.168.10.0 255.255.255.0 / default-router 192.168.10.1 / dns-server 192.168.10.5', 'Do not forget "no shutdown" on G0/0/0', 'PC: ipconfig /renew, then ping www.kmp.lab'],
    solution: ['R1: en / conf t / int g0/0/0 / ip add 192.168.10.1 255.255.255.0 / no shut / exit', 'ip dhcp excluded-address 192.168.10.1 192.168.10.10', 'ip dhcp pool LAN', 'network 192.168.10.0 255.255.255.0', 'default-router 192.168.10.1', 'dns-server 192.168.10.5', 'PCs: ipconfig /renew', 'PC1: ping www.kmp.lab'],
  },
  {
    id: 'vlans',
    title: 'Mission 6: Separate Departments with VLANs',
    brief: 'Sales and Finance share one switch, but Finance data must stay private. Create VLAN 10 (SALES) and VLAN 20 (FINANCE). PC1/PC2 are Sales, PC3/PC4 are Finance. Same-department PCs must talk; different departments must not.',
    difficulty: 2,
    minutes: 20,
    build: () => {
      const t: Topology = { devices: [at(createSwitch('S1'), 0, 0, 'S1'), at(createPC('PC1', 'Sales-1'), -4, 3), at(createPC('PC2', 'Sales-2'), -1.5, 3.5), at(createPC('PC3', 'Fin-1'), 1.5, 3.5), at(createPC('PC4', 'Fin-2'), 4, 3)], links: [] };
      ['PC1', 'PC2', 'PC3', 'PC4'].forEach((p, i) => link(t, p, 'FastEthernet0', 'S1', `FastEthernet0/${i + 1}`));
      ['PC1', 'PC2', 'PC3', 'PC4'].forEach((p, i) => pcIp(t, p, `192.168.50.${11 + i}`));
      return t;
    },
    objectives: [
      { id: 'v', text: 'VLAN 10 named SALES and VLAN 20 named FINANCE exist', check: (t) => dev(t, 'S1').vlans.some((v) => v.id === 10 && v.name.toUpperCase() === 'SALES') && dev(t, 'S1').vlans.some((v) => v.id === 20 && v.name.toUpperCase() === 'FINANCE') },
      { id: 'acc', text: 'Fa0/1-2 are access ports in VLAN 10, Fa0/3-4 in VLAN 20', check: (t) => { const i = dev(t, 'S1').interfaces; return [0, 1].every((k) => i[k].mode === 'access' && i[k].accessVlan === 10) && [2, 3].every((k) => i[k].mode === 'access' && i[k].accessVlan === 20); } },
      { id: 'same', text: 'Sales-1 can still ping Sales-2', check: (t) => canPing(t, 'PC1', '192.168.50.12') },
      { id: 'iso', text: 'Sales-1 can NOT reach Fin-1 (isolation works)', check: (t) => dev(t, 'S1').vlans.length > 1 && !canPing(t, 'PC1', '192.168.50.13') },
    ],
    hints: ['vlan 10 / name SALES / vlan 20 / name FINANCE', 'interface range fa0/1 - 2 / switchport mode access / switchport access vlan 10', 'show vlan brief to verify'],
    solution: ['en', 'conf t', 'vlan 10', 'name SALES', 'vlan 20', 'name FINANCE', 'exit', 'interface range fa0/1 - 2', 'switchport mode access', 'switchport access vlan 10', 'interface range fa0/3 - 4', 'switchport mode access', 'switchport access vlan 20', 'end', 'show vlan brief'],
  },
  {
    id: 'router-on-a-stick',
    title: 'Mission 7: Router-on-a-Stick',
    brief: 'Management changed their mind: Sales (VLAN 10, 192.168.10.0/24) and Finance (VLAN 20, 192.168.20.0/24) must talk - but only THROUGH the router, so we can control it later with ACLs. VLANs and access ports are done. Build the trunk and the sub-interfaces.',
    difficulty: 3,
    minutes: 30,
    build: () => {
      const t: Topology = { devices: [at(createRouter('R1'), 0, -2.5, 'R1'), at(createSwitch('S1'), 0, 0.5, 'S1'), at(createPC('PC1', 'Sales-1'), -3, 3.5), at(createPC('PC2', 'Fin-1'), 3, 3.5)], links: [] };
      link(t, 'R1', 'GigabitEthernet0/0/0', 'S1', 'GigabitEthernet0/1');
      link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
      link(t, 'PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2');
      const s = dev(t, 'S1');
      s.vlans.push({ id: 10, name: 'SALES' }, { id: 20, name: 'FINANCE' });
      Object.assign(s.interfaces[0], { mode: 'access', accessVlan: 10 });
      Object.assign(s.interfaces[1], { mode: 'access', accessVlan: 20 });
      pcIp(t, 'PC1', '192.168.10.10', '255.255.255.0', '192.168.10.1');
      pcIp(t, 'PC2', '192.168.20.10', '255.255.255.0', '192.168.20.1');
      return t;
    },
    objectives: [
      { id: 'trunk', text: 'S1 G0/1 is a trunk (switchport mode trunk)', check: (t) => dev(t, 'S1').interfaces.find((i) => i.name === 'GigabitEthernet0/1')?.mode === 'trunk' },
      { id: 'sub10', text: 'R1 G0/0/0.10 uses 802.1Q VLAN 10 with 192.168.10.1', check: (t) => dev(t, 'R1').interfaces.some((i) => i.parent && i.dot1qVlan === 10 && i.ip === '192.168.10.1') },
      { id: 'sub20', text: 'R1 G0/0/0.20 uses 802.1Q VLAN 20 with 192.168.20.1', check: (t) => dev(t, 'R1').interfaces.some((i) => i.parent && i.dot1qVlan === 20 && i.ip === '192.168.20.1') },
      { id: 'up', text: 'The physical port G0/0/0 is no shutdown', check: (t) => !dev(t, 'R1').interfaces[0].shutdown },
      { id: 'ping', text: 'Sales-1 can ping Fin-1 across VLANs', check: (t) => canPing(t, 'PC1', '192.168.20.10') },
    ],
    hints: ['S1: interface g0/1 / switchport mode trunk', 'R1: interface g0/0/0.10 / encapsulation dot1q 10 / ip address 192.168.10.1 255.255.255.0', 'Sub-interfaces depend on the PHYSICAL interface being up: interface g0/0/0 / no shutdown'],
    solution: ['S1: en / conf t / int g0/1 / switchport mode trunk / end', 'R1: en / conf t / int g0/0/0 / no shut', 'int g0/0/0.10 / encapsulation dot1q 10 / ip add 192.168.10.1 255.255.255.0', 'int g0/0/0.20 / encapsulation dot1q 20 / ip add 192.168.20.1 255.255.255.0 / end'],
  },
  {
    id: 'static-routing',
    title: 'Mission 8: Static and Default Routes',
    brief: 'Three branches are connected in a line: Kimberley - Kuruman - ISP. Every router knows only its directly connected networks. Teach them the way with static routes, and give Kuruman (the edge) a default route to the ISP.',
    difficulty: 3,
    minutes: 30,
    build: () => {
      const t: Topology = { devices: [at(createRouter('KIM'), -5, 0, 'KIM'), at(createRouter('KUR'), 0, 0, 'KUR'), at(createIsp('ISP'), 5, 0), at(createPC('PC1', 'KIM-PC'), -5, 3.5)], links: [] };
      link(t, 'PC1', 'FastEthernet0', 'KIM', 'GigabitEthernet0/0/0', 'crossover');
      link(t, 'KIM', 'Serial0/1/0', 'KUR', 'Serial0/1/0', 'serial');
      link(t, 'KUR', 'GigabitEthernet0/0/1', 'ISP', 'GigabitEthernet0/0/1', 'crossover');
      pcIp(t, 'PC1', '10.1.1.10', '255.255.255.0', '10.1.1.1');
      const set = (id: string, ifn: string, ip: string, mask: string) => Object.assign(dev(t, id).interfaces.find((i) => i.name === ifn)!, { ip, mask, shutdown: false });
      set('KIM', 'GigabitEthernet0/0/0', '10.1.1.1', '255.255.255.0');
      set('KIM', 'Serial0/1/0', '172.16.0.1', '255.255.255.252');
      set('KUR', 'Serial0/1/0', '172.16.0.2', '255.255.255.252');
      set('KUR', 'GigabitEthernet0/0/1', '203.0.113.2', '255.255.255.252');
      set('ISP', 'GigabitEthernet0/0/1', '203.0.113.1', '255.255.255.252');
      dev(t, 'ISP').staticRoutes.push({ network: '10.1.1.0', mask: '255.255.255.0', nextHop: '203.0.113.2', ad: 1 }, { network: '172.16.0.0', mask: '255.255.255.252', nextHop: '203.0.113.2', ad: 1 });
      return t;
    },
    objectives: [
      { id: 'kimdef', text: 'KIM has a default route (0.0.0.0/0) towards KUR', check: (t) => dev(t, 'KIM').staticRoutes.some((r) => r.network === '0.0.0.0' && r.mask === '0.0.0.0') },
      { id: 'kurlan', text: 'KUR has a static route back to 10.1.1.0/24', check: (t) => dev(t, 'KUR').staticRoutes.some((r) => r.network === '10.1.1.0' && r.mask === '255.255.255.0') },
      { id: 'kurdef', text: 'KUR has a default route to the ISP (203.0.113.1)', check: (t) => dev(t, 'KUR').staticRoutes.some((r) => r.network === '0.0.0.0' && r.nextHop === '203.0.113.1') },
      { id: 'ping', text: 'KIM-PC can ping the internet server 8.8.8.8', check: (t) => canPing(t, 'PC1', '8.8.8.8') },
    ],
    hints: ['KIM: ip route 0.0.0.0 0.0.0.0 172.16.0.2', 'KUR: ip route 10.1.1.0 255.255.255.0 172.16.0.1', 'KUR: ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'A ping needs a route THERE and a route BACK.'],
    solution: ['KIM: ip route 0.0.0.0 0.0.0.0 172.16.0.2', 'KUR: ip route 10.1.1.0 255.255.255.0 172.16.0.1', 'KUR: ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'KIM-PC: ping 8.8.8.8'],
  },
  {
    id: 'ospf',
    title: 'Mission 9: OSPF - Let the Routers Talk',
    brief: 'Static routes don\'t scale and don\'t heal. Three routers are connected in a triangle. Run single-area OSPF (area 0) so every LAN is reachable, make the LAN ports passive, then cut a link and watch OSPF route around the failure.',
    difficulty: 4,
    minutes: 35,
    build: () => {
      const t: Topology = { devices: [at(createRouter('R1'), -4, 0, 'R1'), at(createRouter('R2'), 4, 0, 'R2'), at(createRouter('R3'), 0, -5, 'R3'), at(createPC('PC1'), -6, 3.5), at(createPC('PC2'), 6, 3.5)], links: [] };
      link(t, 'R1', 'GigabitEthernet0/0/1', 'R2', 'GigabitEthernet0/0/1', 'crossover');
      link(t, 'R1', 'GigabitEthernet0/0/2', 'R3', 'GigabitEthernet0/0/1', 'crossover');
      link(t, 'R2', 'GigabitEthernet0/0/2', 'R3', 'GigabitEthernet0/0/2', 'crossover');
      link(t, 'PC1', 'FastEthernet0', 'R1', 'GigabitEthernet0/0/0', 'crossover');
      link(t, 'PC2', 'FastEthernet0', 'R2', 'GigabitEthernet0/0/0', 'crossover');
      pcIp(t, 'PC1', '192.168.1.10', '255.255.255.0', '192.168.1.1');
      pcIp(t, 'PC2', '192.168.2.10', '255.255.255.0', '192.168.2.1');
      const set = (id: string, ifn: string, ip: string, mask = '255.255.255.252') => Object.assign(dev(t, id).interfaces.find((i) => i.name === ifn)!, { ip, mask, shutdown: false });
      set('R1', 'GigabitEthernet0/0/0', '192.168.1.1', '255.255.255.0');
      set('R2', 'GigabitEthernet0/0/0', '192.168.2.1', '255.255.255.0');
      set('R1', 'GigabitEthernet0/0/1', '10.0.12.1');
      set('R2', 'GigabitEthernet0/0/1', '10.0.12.2');
      set('R1', 'GigabitEthernet0/0/2', '10.0.13.1');
      set('R3', 'GigabitEthernet0/0/1', '10.0.13.2');
      set('R2', 'GigabitEthernet0/0/2', '10.0.23.1');
      set('R3', 'GigabitEthernet0/0/2', '10.0.23.2');
      return t;
    },
    objectives: [
      { id: 'adj', text: 'All three routers have OSPF neighbours in state FULL', check: (t) => ['R1', 'R2', 'R3'].every((r) => ospfNeighbors(t, dev(t, r)).length >= 2) },
      { id: 'passive', text: 'R1 and R2 LAN ports are passive-interfaces', check: (t) => ['R1', 'R2'].every((r) => dev(t, r).ospf?.passive.includes('GigabitEthernet0/0/0')) },
      { id: 'ping', text: 'PC1 can ping PC2', check: (t) => canPing(t, 'PC1', '192.168.2.10') },
      { id: 'heal', text: 'Shut R1 G0/0/1 - PC1 can STILL reach PC2 via R3', check: (t) => dev(t, 'R1').interfaces.find((i) => i.name === 'GigabitEthernet0/0/1')!.shutdown && canPing(t, 'PC1', '192.168.2.10') },
    ],
    hints: ['router ospf 1 / network 192.168.1.0 0.0.0.255 area 0 / network 10.0.12.0 0.0.0.3 area 0 / network 10.0.13.0 0.0.0.3 area 0', 'Wildcard = inverse of the mask: /30 -> 0.0.0.3', 'passive-interface g0/0/0 stops hellos on the LAN but still advertises it', 'show ip ospf neighbor, show ip route ospf'],
    solution: ['R1: router ospf 1 / network 192.168.1.0 0.0.0.255 area 0 / network 10.0.0.0 0.255.255.255 area 0 / passive-interface g0/0/0', 'R2: router ospf 1 / network 192.168.2.0 0.0.0.255 area 0 / network 10.0.0.0 0.255.255.255 area 0 / passive-interface g0/0/0', 'R3: router ospf 1 / network 10.0.0.0 0.255.255.255 area 0', 'R1: int g0/0/1 / shutdown'],
  },
  {
    id: 'nat-internet',
    title: 'Mission 10: Get the Office Online with PAT',
    brief: 'The office uses private addresses (192.168.1.0/24) but the ISP gave us ONE public IP: 203.0.113.2. Private addresses are not routable on the internet, so replies can\'t come back. Configure PAT (NAT overload) so everyone shares the public IP.',
    difficulty: 3,
    minutes: 30,
    build: () => {
      const t: Topology = { devices: [at(createRouter('R1'), 0, 0, 'EDGE'), at(createSwitch('S1'), -4, 0, 'S1'), at(createPC('PC1'), -7, 2.5), at(createPC('PC2'), -7, -2.5), at(createIsp('ISP'), 5, 0)], links: [] };
      link(t, 'R1', 'GigabitEthernet0/0/0', 'S1', 'GigabitEthernet0/1');
      link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
      link(t, 'PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2');
      link(t, 'R1', 'GigabitEthernet0/0/1', 'ISP', 'GigabitEthernet0/0/0', 'crossover');
      pcIp(t, 'PC1', '192.168.1.10', '255.255.255.0', '192.168.1.1');
      pcIp(t, 'PC2', '192.168.1.11', '255.255.255.0', '192.168.1.1');
      Object.assign(dev(t, 'R1').interfaces[0], { ip: '192.168.1.1', mask: '255.255.255.0', shutdown: false });
      Object.assign(dev(t, 'R1').interfaces[1], { ip: '203.0.113.2', mask: '255.255.255.252', shutdown: false });
      Object.assign(dev(t, 'ISP').interfaces[0], { ip: '203.0.113.1', mask: '255.255.255.252', shutdown: false });
      dev(t, 'R1').staticRoutes.push({ network: '0.0.0.0', mask: '0.0.0.0', nextHop: '203.0.113.1', ad: 1 });
      return t;
    },
    objectives: [
      { id: 'roles', text: 'G0/0/0 is "ip nat inside", G0/0/1 is "ip nat outside"', check: (t) => dev(t, 'R1').interfaces[0].natRole === 'inside' && dev(t, 'R1').interfaces[1].natRole === 'outside' },
      { id: 'acl', text: 'Standard ACL 1 permits 192.168.1.0 0.0.0.255', check: (t) => dev(t, 'R1').acls.some((a) => a.id === '1' && a.entries.some((e) => e.action === 'permit' && e.src === '192.168.1.0' && e.srcWildcard === '0.0.0.255')) },
      { id: 'pat', text: 'PAT is configured: ip nat inside source list 1 interface g0/0/1 overload', check: (t) => dev(t, 'R1').nat.some((n) => n.listAcl === '1' && n.overloadIface === 'GigabitEthernet0/0/1') },
      { id: 'ping', text: 'PC1 and PC2 can both ping 8.8.8.8', check: (t) => canPing(t, 'PC1', '8.8.8.8') && canPing(t, 'PC2', '8.8.8.8') },
    ],
    hints: ['Try pinging 8.8.8.8 first - read the hint: the REPLY cannot get back.', 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat inside source list 1 interface g0/0/1 overload', 'int g0/0/0 / ip nat inside  |  int g0/0/1 / ip nat outside', 'show ip nat translations'],
    solution: ['en / conf t', 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat inside source list 1 interface g0/0/1 overload', 'int g0/0/0 / ip nat inside', 'int g0/0/1 / ip nat outside / end'],
  },
  {
    id: 'acl-secure',
    title: 'Mission 11: Guest Wi-Fi Must Not See the Server',
    brief: 'Guests (192.168.30.0/24) may browse the web server 192.168.10.100 on port 80 only - no pings, no SSH, nothing else. Staff (192.168.10.0/24) must be unaffected. Write an EXTENDED ACL and place it as close to the guests as possible.',
    difficulty: 4,
    minutes: 30,
    build: () => {
      const t: Topology = { devices: [at(createRouter('R1'), 0, 0, 'R1'), at(createPC('GUEST', 'Guest-Laptop', 'laptop'), -4, 3), at(createPC('SRV', 'Web-Server', 'server'), 4, 3)], links: [] };
      link(t, 'GUEST', 'FastEthernet0', 'R1', 'GigabitEthernet0/0/1', 'crossover');
      link(t, 'SRV', 'FastEthernet0', 'R1', 'GigabitEthernet0/0/0', 'crossover');
      pcIp(t, 'GUEST', '192.168.30.20', '255.255.255.0', '192.168.30.1');
      pcIp(t, 'SRV', '192.168.10.100', '255.255.255.0', '192.168.10.1');
      Object.assign(dev(t, 'R1').interfaces[0], { ip: '192.168.10.1', mask: '255.255.255.0', shutdown: false });
      Object.assign(dev(t, 'R1').interfaces[1], { ip: '192.168.30.1', mask: '255.255.255.0', shutdown: false });
      return t;
    },
    objectives: [
      { id: 'acl', text: 'An extended ACL permits tcp from 192.168.30.0/24 to host 192.168.10.100 eq 80', check: (t) => dev(t, 'R1').acls.some((a) => a.type === 'extended' && a.entries.some((e) => e.action === 'permit' && e.protocol === 'tcp' && e.port === 80 && e.dst === '192.168.10.100')) },
      { id: 'applied', text: 'It is applied INBOUND on the guest interface G0/0/1', check: (t) => !!dev(t, 'R1').interfaces[1].aclIn },
      { id: 'noping', text: 'Guest can NOT ping the server', check: (t) => !!dev(t, 'R1').interfaces[1].aclIn && !canPing(t, 'GUEST', '192.168.10.100') },
      { id: 'web', text: 'Guest CAN still reach the server on TCP 80', check: (t) => !!dev(t, 'R1').interfaces[1].aclIn && tcpReach(cloneTopology(t), 'GUEST', '192.168.10.100', 80).ok },
    ],
    hints: ['access-list 110 permit tcp 192.168.30.0 0.0.0.255 host 192.168.10.100 eq 80', 'Everything else is blocked by the invisible "deny any any" at the end.', 'int g0/0/1 / ip access-group 110 in', 'Extended ACLs go close to the SOURCE; standard ACLs close to the DESTINATION.'],
    solution: ['access-list 110 permit tcp 192.168.30.0 0.0.0.255 host 192.168.10.100 eq 80', 'interface g0/0/1', 'ip access-group 110 in'],
  },
  {
    id: 'stp-etherchannel',
    title: 'Mission 12: Redundancy Without Loops',
    brief: 'Two core switches are joined by TWO cables for redundancy. Spanning Tree blocked one of them - you are paying for a cable that carries nothing! Make CORE-1 the root bridge, then bundle both links into one LACP EtherChannel so both carry traffic.',
    difficulty: 4,
    minutes: 30,
    build: () => {
      const t: Topology = { devices: [at(createSwitch('S1'), -3, 0, 'CORE-1'), at(createSwitch('S2'), 3, 0, 'CORE-2')], links: [] };
      link(t, 'S1', 'GigabitEthernet0/1', 'S2', 'GigabitEthernet0/1', 'crossover');
      link(t, 'S1', 'GigabitEthernet0/2', 'S2', 'GigabitEthernet0/2', 'crossover');
      dev(t, 'S1').interfaces[0].mac = '00d0.ffff.0001';
      dev(t, 'S2').interfaces[0].mac = '00d0.0000.0001';
      return t;
    },
    objectives: [
      { id: 'root', text: 'CORE-1 is the root bridge for VLAN 1', check: (t) => spanningTree(t, dev(t, 'S1'), 1)?.isRoot === true },
      { id: 'lacp', text: 'Both Gig ports on BOTH switches are in channel-group 1 using LACP (active/passive)', check: (t) => ['S1', 'S2'].every((s) => dev(t, s).interfaces.filter((i) => i.name.startsWith('Gigabit')).every((i) => i.channelGroup?.id === 1 && ['active', 'passive'].includes(i.channelGroup.mode))) && ['S1', 'S2'].some((s) => dev(t, s).interfaces.some((i) => i.channelGroup?.mode === 'active')) },
    ],
    hints: ['show spanning-tree on both switches - who is root, and why? (lowest priority, then lowest MAC)', 'CORE-1: spanning-tree vlan 1 root primary (or priority 4096)', 'interface range g0/1 - 2 / channel-group 1 mode active', 'At least one side must be "active" for LACP. passive+passive = no channel.'],
    solution: ['CORE-1: spanning-tree vlan 1 root primary', 'Both: interface range g0/1 - 2 / channel-group 1 mode active', 'show etherchannel summary'],
  },
  {
    id: 'hsrp',
    title: 'Mission 13: A Gateway That Never Dies (HSRP)',
    brief: 'The hospital LAN has two routers. If the default gateway fails, nurses lose the patient system. Configure HSRP group 1 with virtual IP 10.10.10.1 so PCs keep working even if a router goes down. GW-A should be Active.',
    difficulty: 4,
    minutes: 30,
    build: () => {
      const t: Topology = { devices: [at(createRouter('A'), -3, -2, 'GW-A'), at(createRouter('B'), 3, -2, 'GW-B'), at(createSwitch('S1'), 0, 1, 'S1'), at(createPC('PC1', 'Nurse-PC'), 0, 4)], links: [] };
      link(t, 'A', 'GigabitEthernet0/0/0', 'S1', 'GigabitEthernet0/1');
      link(t, 'B', 'GigabitEthernet0/0/0', 'S1', 'GigabitEthernet0/2');
      link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
      Object.assign(dev(t, 'A').interfaces[0], { ip: '10.10.10.2', mask: '255.255.255.0', shutdown: false });
      Object.assign(dev(t, 'B').interfaces[0], { ip: '10.10.10.3', mask: '255.255.255.0', shutdown: false });
      pcIp(t, 'PC1', '10.10.10.50', '255.255.255.0', '10.10.10.1');
      return t;
    },
    objectives: [
      { id: 'vip', text: 'Both routers run HSRP group 1 with virtual IP 10.10.10.1', check: (t) => ['A', 'B'].every((r) => dev(t, r).interfaces[0].hsrp?.group === 1 && dev(t, r).interfaces[0].hsrp?.ip === '10.10.10.1') },
      { id: 'active', text: 'GW-A is Active (higher priority + preempt)', check: (t) => hsrpStates(t).some((h) => h.device === 'A' && h.state === 'Active') && !!dev(t, 'A').interfaces[0].hsrp?.preempt },
      { id: 'ping', text: 'Nurse-PC can ping its gateway 10.10.10.1', check: (t) => canPing(t, 'PC1', '10.10.10.1') },
      { id: 'fail', text: 'Shut GW-A G0/0/0 - Nurse-PC can STILL ping 10.10.10.1', check: (t) => dev(t, 'A').interfaces[0].shutdown && canPing(t, 'PC1', '10.10.10.1') },
    ],
    hints: ['GW-A: int g0/0/0 / standby 1 ip 10.10.10.1 / standby 1 priority 110 / standby 1 preempt', 'GW-B: int g0/0/0 / standby 1 ip 10.10.10.1', 'show standby brief'],
    solution: ['GW-A: interface g0/0/0 / standby 1 ip 10.10.10.1 / standby 1 priority 110 / standby 1 preempt', 'GW-B: interface g0/0/0 / standby 1 ip 10.10.10.1', 'GW-A: interface g0/0/0 / shutdown'],
  },
  {
    id: 'ticket-1',
    title: 'Ticket #1042: "The internet is down on PC2"',
    brief: 'Helpdesk ticket: "PC1 works but PC2 cannot reach the server." Same switch, same subnet, cables look fine. Use ipconfig, ping, show ip interface brief and show vlan brief to find the fault(s). Do not rebuild - FIX.',
    difficulty: 3,
    minutes: 20,
    troubleshooting: true,
    build: () => {
      const t: Topology = { devices: [at(createRouter('R1'), 0, -2.5, 'R1'), at(createSwitch('S1'), 0, 0.5, 'S1'), at(createPC('PC1'), -3, 3.5), at(createPC('PC2'), 3, 3.5), at(createPC('SRV', 'Server', 'server'), 6, -2.5)], links: [] };
      link(t, 'R1', 'GigabitEthernet0/0/0', 'S1', 'GigabitEthernet0/1');
      link(t, 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1');
      link(t, 'PC2', 'FastEthernet0', 'S1', 'FastEthernet0/2');
      link(t, 'SRV', 'FastEthernet0', 'R1', 'GigabitEthernet0/0/1', 'crossover');
      Object.assign(dev(t, 'R1').interfaces[0], { ip: '192.168.5.1', mask: '255.255.255.0', shutdown: false });
      Object.assign(dev(t, 'R1').interfaces[1], { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false });
      pcIp(t, 'SRV', '10.0.0.10', '255.255.255.0', '10.0.0.1');
      pcIp(t, 'PC1', '192.168.5.10', '255.255.255.0', '192.168.5.1');
      pcIp(t, 'PC2', '192.168.5.11', '255.255.255.0', '192.168.5.254'); // fault 1: wrong gateway
      dev(t, 'S1').vlans.push({ id: 99, name: 'PARKING' });
      Object.assign(dev(t, 'S1').interfaces[1], { mode: 'access', accessVlan: 99 }); // fault 2: wrong VLAN
      return t;
    },
    objectives: [
      { id: 'fix', text: 'PC2 can ping the server 10.0.0.10', check: (t) => canPing(t, 'PC2', '10.0.0.10') },
      { id: 'pc1', text: 'PC1 still works', check: (t) => canPing(t, 'PC1', '10.0.0.10') },
    ],
    hints: ['Start at Layer 1-2: is PC2\'s port in the same VLAN as PC1\'s? (show vlan brief)', 'Then Layer 3: compare ipconfig on PC1 and PC2. Spot the difference?', 'There are TWO faults.'],
    solution: ['S1: interface fa0/2 / switchport access vlan 1', 'PC2: netsh interface ip set address "Ethernet" static 192.168.5.11 255.255.255.0 192.168.5.1'],
  },
  {
    id: 'ticket-2',
    title: 'Ticket #1077: "Branch can\'t reach Head Office"',
    brief: 'After a maintenance window the branch lost access to head office. The night-shift engineer says "I only changed one thing." Find out what - using show commands, not guessing.',
    difficulty: 4,
    minutes: 25,
    troubleshooting: true,
    build: () => {
      const t: Topology = { devices: [at(createRouter('BR'), -4, 0, 'BRANCH'), at(createRouter('HQ'), 4, 0, 'HQ'), at(createPC('PC1', 'Branch-PC'), -6, 3.5), at(createPC('PC2', 'HQ-Server', 'server'), 6, 3.5)], links: [] };
      link(t, 'BR', 'GigabitEthernet0/0/1', 'HQ', 'GigabitEthernet0/0/1', 'crossover');
      link(t, 'PC1', 'FastEthernet0', 'BR', 'GigabitEthernet0/0/0', 'crossover');
      link(t, 'PC2', 'FastEthernet0', 'HQ', 'GigabitEthernet0/0/0', 'crossover');
      pcIp(t, 'PC1', '172.20.1.10', '255.255.255.0', '172.20.1.1');
      pcIp(t, 'PC2', '172.30.1.10', '255.255.255.0', '172.30.1.1');
      Object.assign(dev(t, 'BR').interfaces[0], { ip: '172.20.1.1', mask: '255.255.255.0', shutdown: false });
      Object.assign(dev(t, 'BR').interfaces[1], { ip: '10.9.9.1', mask: '255.255.255.252', shutdown: false });
      Object.assign(dev(t, 'HQ').interfaces[0], { ip: '172.30.1.1', mask: '255.255.255.0', shutdown: false });
      Object.assign(dev(t, 'HQ').interfaces[1], { ip: '10.9.9.2', mask: '255.255.255.252', shutdown: false });
      dev(t, 'BR').ospf = { processId: 1, networks: [{ network: '172.20.1.0', wildcard: '0.0.0.255', area: 0 }, { network: '10.9.9.0', wildcard: '0.0.0.3', area: 0 }], passive: ['GigabitEthernet0/0/0'] };
      dev(t, 'HQ').ospf = { processId: 1, networks: [{ network: '172.30.1.0', wildcard: '0.0.0.255', area: 0 }, { network: '10.9.9.0', wildcard: '0.0.0.3', area: 1 }], passive: ['GigabitEthernet0/0/0'] }; // fault: area mismatch
      return t;
    },
    objectives: [
      { id: 'adj', text: 'BRANCH and HQ are OSPF neighbours again', check: (t) => ospfNeighbors(t, dev(t, 'BR')).length === 1 },
      { id: 'ping', text: 'Branch-PC can ping HQ-Server', check: (t) => canPing(t, 'PC1', '172.30.1.10') },
    ],
    hints: ['show ip ospf neighbor on both routers - is there a neighbour?', 'show ip protocols on both. Compare the network statements carefully.', 'OSPF neighbours must agree on: area, subnet, hello/dead timers, authentication.'],
    solution: ['HQ: router ospf 1 / no network 10.9.9.0 0.0.0.3 area 1 / network 10.9.9.0 0.0.0.3 area 0'],
  },
  {
    id: 'capstone',
    title: 'CAPSTONE: Build Phemelo Corp From Scratch',
    brief: 'Your final network-engineering exam in the game. Nothing is cabled or configured. Requirements: (1) Staff VLAN 10 192.168.10.0/24 and Guest VLAN 20 192.168.20.0/24 on S1; (2) inter-VLAN routing on R1 (router-on-a-stick); (3) DHCP for both VLANs from R1 (exclude .1-.10); (4) R1 G0/0/1 to the ISP 203.0.113.2/30 with PAT; (5) SSH-only management on R1 with a local user; (6) everything saved. Proof: both PCs get DHCP addresses and ping 8.8.8.8.',
    difficulty: 5,
    minutes: 90,
    cabling: true,
    build: () => {
      const isp = createIsp('ISP');
      Object.assign(isp.interfaces[0], { ip: '203.0.113.1', mask: '255.255.255.252', shutdown: false });
      return { devices: [at(createRouter('R1'), 0, -2.5, 'R1'), at(createSwitch('S1'), 0, 1, 'S1'), at(createPC('PC1', 'Staff-PC'), -3.5, 4), at(createPC('PC2', 'Guest-Laptop', 'laptop'), 3.5, 4), at(isp, 6, -2.5), at(createPC('ADMIN', 'Admin-Laptop', 'laptop'), -5, -2.5)], links: [] };
    },
    objectives: [
      { id: 'cabled', text: 'Everything is cabled (PCs-S1, S1-R1, R1-ISP)', check: (t) => t.links.length >= 4 },
      { id: 'vlans', text: 'VLAN 10 and VLAN 20 exist on S1 with access ports for the PCs', check: (t) => [10, 20].every((v) => dev(t, 'S1').vlans.some((x) => x.id === v)) },
      { id: 'dhcp', text: 'Staff-PC and Guest-Laptop have DHCP addresses in their own VLAN subnets', check: (t) => /^192\.168\.10\./.test(ipOf(t, 'PC1')) && /^192\.168\.20\./.test(ipOf(t, 'PC2')) && dev(t, 'PC1').interfaces[0].dhcpClient === true },
      { id: 'inet', text: 'Both can ping 8.8.8.8 (PAT works)', check: (t) => canPing(t, 'PC1', '8.8.8.8') && canPing(t, 'PC2', '8.8.8.8') },
      { id: 'ssh', text: 'R1 accepts SSH only, with login local', check: (t) => dev(t, 'R1').lineVty.transportInput === 'ssh' && dev(t, 'R1').lineVty.loginLocal && (dev(t, 'R1').rsaBits ?? 0) >= 1024 },
      { id: 'saved', text: 'R1 and S1 configurations are saved', check: (t) => !!dev(t, 'R1').startupConfig && !!dev(t, 'S1').startupConfig },
    ],
    hints: ['Plan first on paper: addressing table, VLAN table, which port goes where.', 'Order that avoids pain: cable -> VLANs/trunk -> sub-interfaces -> DHCP -> default route -> NAT -> SSH -> save.', 'Default route on R1: ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'Both sub-interfaces are "ip nat inside"; ACL 1 must permit BOTH 192.168.10.0/24 and 192.168.20.0/24.'],
    solution: ['See the Mission 7, 5, 10 and 4 solutions combined - you have done every piece already!'],
  },
];

export function networkLab(id: string): NetworkLab | undefined {
  return NETWORK_LABS.find((l) => l.id === id);
}

export { createL3Switch };
