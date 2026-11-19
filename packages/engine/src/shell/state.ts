import { dir, file, type FsNode } from './vfs.js';
import type { DevState } from '../dev/devtools.js';
import type { DockerState, K8sState, AwsState, TfState, SlurmState } from '../cloud/types.js';

export type VmNetworkMode = 'nat' | 'bridged' | 'host-only' | 'internal' | 'cloud';

export interface ShellNet {
  iface: string;
  mac: string;
  dhcp: boolean;
  ip?: string;
  prefix?: number;
  gateway?: string;
  dns: string[];
  mode: VmNetworkMode;
}

export interface ShellUser {
  name: string;
  uid: number;
  groups: string[];
  password: string;
  shell: string;
}

export interface ShellState {
  hostname: string;
  user: string;
  cwd: string;
  fs: FsNode;
  env: Record<string, string>;
  users: ShellUser[];
  groups: string[];
  packages: string[];
  services: Record<string, { active: boolean; enabled: boolean }>;
  net: ShellNet;
  ufw: { enabled: boolean; rules: string[]; defaultIncoming: 'deny' | 'allow' };
  history: string[];
  sudoCached: boolean;
  aptUpdated: boolean;
  hw: { cpus: number; ramMb: number; diskGb: number; cpuModel: string };
  profile: 'vm' | 'cloud' | 'hpc' | 'dev';
  docker?: DockerState;
  k8s?: K8sState;
  aws?: AwsState;
  tf?: TfState;
  slurm?: SlurmState;
  dev?: DevState;
}

export interface MachineOptions {
  hostname?: string;
  user?: string;
  password?: string;
  mode?: VmNetworkMode;
  profile?: 'vm' | 'cloud' | 'hpc' | 'dev';
  cpus?: number;
  ramMb?: number;
  diskGb?: number;
}

/** What DHCP gives you in each hypervisor network mode (VirtualBox defaults). */
export function dhcpLeaseFor(mode: VmNetworkMode): { ip?: string; prefix?: number; gateway?: string; dns: string[] } {
  switch (mode) {
    case 'nat':
      return { ip: '10.0.2.15', prefix: 24, gateway: '10.0.2.2', dns: ['10.0.2.3'] };
    case 'bridged':
      return { ip: '192.168.1.57', prefix: 24, gateway: '192.168.1.1', dns: ['192.168.1.1'] };
    case 'host-only':
      return { ip: '192.168.56.101', prefix: 24, gateway: undefined, dns: [] };
    case 'cloud':
      return { ip: '172.31.18.44', prefix: 20, gateway: '172.31.16.1', dns: ['172.31.0.2'] };
    case 'internal':
      return { dns: [] };
  }
}

export function hasInternet(net: ShellNet): boolean {
  return !!net.ip && !!net.gateway && (net.mode === 'nat' || net.mode === 'bridged' || net.mode === 'cloud');
}

const OS_RELEASE = `PRETTY_NAME="Ubuntu 24.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.3 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
UBUNTU_CODENAME=noble
LOGO=ubuntu-logo
`;

export function netplanYaml(net: ShellNet): string {
  return `# This file is generated from information provided by the datasource.
# To change the network configuration, edit this file then run: sudo netplan apply
network:
  version: 2
  ethernets:
    ${net.iface}:
      dhcp4: true
`;
}

export function createMachine(opts: MachineOptions = {}): ShellState {
  const user = opts.user ?? 'phemelo';
  const hostname = opts.hostname ?? 'ubuntu-srv';
  const mode = opts.mode ?? 'nat';
  const profile = opts.profile ?? 'vm';
  const lease = dhcpLeaseFor(mode);
  const net: ShellNet = { iface: mode === 'cloud' ? 'eth0' : 'enp0s3', mac: '08:00:27:4e:66:a1', dhcp: true, ...lease, mode };
  const home = `/home/${user}`;
  const bashrc = `# ~/.bashrc: executed by bash(1) for non-login shells.\nHISTSIZE=1000\nalias ll='ls -alF'\nalias la='ls -A'\n`;
  const readme = `Welcome to your Route Runner Linux lab, ${user}!

Try these first:
  pwd            where am I?
  ls -la         what is here (including hidden files)?
  cat /etc/os-release
  ip a           what is my IP address?
  sudo apt update
  help           list everything this simulator understands
`;
  const fs = dir('root', 'rwxr-xr-x', {
    bin: dir(),
    boot: dir(),
    dev: dir('root', 'rwxr-xr-x', { null: file('', 'root', 'rw-rw-rw-') }),
    etc: dir('root', 'rwxr-xr-x', {
      'os-release': file(OS_RELEASE),
      hostname: file(hostname + '\n'),
      hosts: file(`127.0.0.1 localhost\n127.0.1.1 ${hostname}\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback\n`),
      passwd: file(''),
      group: file(''),
      shadow: file('', 'root', 'rw-r-----'),
      'resolv.conf': file(`# This is /run/systemd/resolve/stub-resolv.conf managed by man:systemd-resolved(8).\nnameserver 127.0.0.53\noptions edns0 trust-ad\nsearch .\n`),
      fstab: file(`# <file system> <mount point> <type> <options> <dump> <pass>\n/dev/disk/by-uuid/3f1c-ab12 / ext4 defaults 0 1\n/swap.img none swap sw 0 0\n`),
      netplan: dir('root', 'rwxr-xr-x', { '50-cloud-init.yaml': file(netplanYaml(net), 'root', 'rw-------') }),
      apt: dir('root', 'rwxr-xr-x', { 'sources.list': file('# Ubuntu sources have moved to /etc/apt/sources.list.d/ubuntu.sources\n') }),
      ssh: dir(),
      crontab: file('# m h dom mon dow user  command\n17 *    * * *   root    cd / && run-parts --report /etc/cron.hourly\n'),
    }),
    home: dir('root', 'rwxr-xr-x', {
      [user]: dir(user, 'rwxr-x---', {
        '.bashrc': file(bashrc, user),
        '.profile': file('# ~/.profile\nif [ -n "$BASH_VERSION" ]; then . "$HOME/.bashrc"; fi\n', user),
        'README.txt': file(readme, user),
        Documents: dir(user),
        scripts: dir(user),
      }),
    }),
    opt: dir(),
    proc: dir('root', 'r-xr-xr-x', {
      cpuinfo: file(''),
      meminfo: file(''),
    }),
    root: dir('root', 'rwx------'),
    srv: dir(),
    tmp: dir('root', 'rwxrwxrwx'),
    usr: dir('root', 'rwxr-xr-x', { bin: dir(), local: dir(), share: dir() }),
    var: dir('root', 'rwxr-xr-x', {
      log: dir('root', 'rwxrwxr-x', {
        syslog: file(`Nov 19 08:00:01 ${hostname} systemd[1]: Started Daily apt download activities.\nNov 19 08:00:02 ${hostname} systemd-networkd[612]: ${net.iface}: DHCPv4 address ${net.ip ?? 'none'}\n`, 'syslog', 'rw-r-----'),
        'auth.log': file(`Nov 19 08:01:10 ${hostname} sshd[901]: Server listening on 0.0.0.0 port 22.\n`, 'syslog', 'rw-r-----'),
      }),
      www: dir(),
      lib: dir(),
    }),
  });
  const state: ShellState = {
    hostname,
    user,
    cwd: home,
    fs,
    env: { HOME: home, USER: user, SHELL: '/bin/bash', PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'en_ZA.UTF-8', TERM: 'xterm-256color' },
    users: [
      { name: 'root', uid: 0, groups: ['root'], password: opts.password ?? 'routerunner', shell: '/bin/bash' },
      { name: user, uid: 1000, groups: [user, 'adm', 'sudo'], password: opts.password ?? 'routerunner', shell: '/bin/bash' },
    ],
    groups: ['root', 'adm', 'sudo', 'users', user],
    packages: ['bash', 'coreutils', 'curl', 'iproute2', 'iputils-ping', 'nano', 'vim', 'openssh-client', 'python3', 'ufw', 'systemd', 'netplan.io', 'dnsutils'],
    services: { 'systemd-networkd': { active: true, enabled: true }, 'systemd-resolved': { active: true, enabled: true }, cron: { active: true, enabled: true }, ufw: { active: true, enabled: true } },
    net,
    ufw: { enabled: false, rules: [], defaultIncoming: 'deny' },
    history: [],
    sudoCached: false,
    aptUpdated: false,
    hw: { cpus: opts.cpus ?? 2, ramMb: opts.ramMb ?? 2048, diskGb: opts.diskGb ?? 25, cpuModel: 'Intel(R) Core(TM) i5-1135G7 @ 2.40GHz' },
    profile,
  };
  syncAccountFiles(state);
  return state;
}

/** Keep /etc/passwd, /etc/group and /etc/shadow in sync with the users list. */
export function syncAccountFiles(s: ShellState) {
  const etc = s.fs.children!.etc.children!;
  etc.passwd.content =
    'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\nsshd:x:110:65534::/run/sshd:/usr/sbin/nologin\n' +
    s.users
      .filter((u) => u.name !== 'root')
      .map((u) => `${u.name}:x:${u.uid}:${u.uid}:${u.name}:/home/${u.name}:${u.shell}`)
      .join('\n') +
    '\n';
  etc.group.content = s.groups
    .map((g, i) => {
      const members = s.users.filter((u) => u.groups.includes(g) && u.name !== g).map((u) => u.name);
      const gid = g === 'root' ? 0 : g === 'adm' ? 4 : g === 'sudo' ? 27 : g === 'users' ? 100 : g === 'docker' ? 998 : 1000 + i;
      return `${g}:x:${gid}:${members.join(',')}`;
    })
    .join('\n') + '\n';
  etc.shadow.content = s.users.map((u) => `${u.name}:$y$j9T$${btoaSafe(u.password).slice(0, 22)}:20046:0:99999:7:::`).join('\n') + '\n';
}

function btoaSafe(s: string): string {
  let h = 5381;
  for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return (h.toString(36) + 'Qx7Lm2Np9Rt4Vw8Yz1Ab3Cd5Ef6Gh0').repeat(2);
}
