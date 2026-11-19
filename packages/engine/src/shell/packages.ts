import { dir, file } from './vfs.js';
import type { ShellState } from './state.js';

export interface PkgInfo {
  version: string;
  sizeKb: number;
  desc: string;
  service?: string;
  group?: string;
  setup?: (s: ShellState) => void;
}

const NGINX_HTML = `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>
<p><em>Thank you for using nginx.</em></p>
</body>
</html>
`;

const APACHE_HTML = `<!DOCTYPE html>
<html>
  <head><title>Apache2 Ubuntu Default Page: It works</title></head>
  <body><h1>It works!</h1><p>This is the default welcome page used to test the correct operation of the Apache2 server after installation on Ubuntu systems.</p></body>
</html>
`;

function ensure(s: ShellState, path: string) {
  let node = s.fs;
  for (const seg of path.split('/').filter(Boolean)) {
    node.children![seg] ??= dir();
    node = node.children![seg];
  }
  return node;
}

export const PACKAGES: Record<string, PkgInfo> = {
  nginx: {
    version: '1.24.0-2ubuntu7.1',
    sizeKb: 1596,
    desc: 'small, powerful, scalable web/proxy server',
    service: 'nginx',
    setup: (s) => {
      const etc = ensure(s, '/etc/nginx');
      etc.children!['nginx.conf'] = file('user www-data;\nworker_processes auto;\npid /run/nginx.pid;\nevents { worker_connections 768; }\nhttp {\n    sendfile on;\n    include /etc/nginx/sites-enabled/*;\n}\n');
      ensure(s, '/etc/nginx/sites-available').children!.default = file('server {\n    listen 80 default_server;\n    root /var/www/html;\n    index index.html index.nginx-debian.html;\n    server_name _;\n    location / {\n        try_files $uri $uri/ =404;\n    }\n}\n');
      ensure(s, '/var/www/html').children!['index.nginx-debian.html'] = file(NGINX_HTML);
    },
  },
  apache2: {
    version: '2.4.58-1ubuntu8.5',
    sizeKb: 8124,
    desc: 'Apache HTTP Server',
    service: 'apache2',
    setup: (s) => {
      ensure(s, '/etc/apache2').children!['apache2.conf'] = file('# This is the main Apache server configuration file.\nServerRoot "/etc/apache2"\nTimeout 300\nKeepAlive On\n');
      ensure(s, '/var/www/html').children!['index.html'] = file(APACHE_HTML);
    },
  },
  'openssh-server': {
    version: '1:9.6p1-3ubuntu13.5',
    sizeKb: 2010,
    desc: 'secure shell (SSH) server, for secure access from remote machines',
    service: 'ssh',
    setup: (s) => {
      ensure(s, '/etc/ssh').children!.sshd_config = file('# See sshd_config(5)\nInclude /etc/ssh/sshd_config.d/*.conf\n#Port 22\n#PermitRootLogin prohibit-password\n#PasswordAuthentication yes\nKbdInteractiveAuthentication no\nUsePAM yes\nX11Forwarding yes\n');
    },
  },
  'net-tools': { version: '2.10-0.1ubuntu4', sizeKb: 820, desc: 'NET-3 networking toolkit (ifconfig, netstat, route)' },
  traceroute: { version: '1:2.1.5-1', sizeKb: 154, desc: 'Traces the route taken by packets over an IPv4/IPv6 network' },
  nmap: { version: '7.94+git20230807.3be01efb1+dfsg-3build2', sizeKb: 4540, desc: 'The Network Mapper - port scanner' },
  htop: { version: '3.3.0-4build1', sizeKb: 434, desc: 'interactive processes viewer' },
  tree: { version: '2.1.1-2ubuntu3', sizeKb: 112, desc: 'displays an indented directory tree' },
  git: { version: '1:2.43.0-1ubuntu7.1', sizeKb: 21000, desc: 'fast, scalable, distributed revision control system' },
  wget: { version: '1.21.4-1ubuntu4.1', sizeKb: 960, desc: 'retrieves files from the web' },
  tcpdump: { version: '4.99.4-3ubuntu4', sizeKb: 1350, desc: 'command-line network traffic analyzer' },
  iperf3: { version: '3.16-1build2', sizeKb: 220, desc: 'Internet Protocol bandwidth measuring tool' },
  mtr: { version: '0.95-1.1build2', sizeKb: 210, desc: 'traceroute + ping in one' },
  whois: { version: '5.5.22', sizeKb: 400, desc: 'intelligent WHOIS client' },
  'docker.io': {
    version: '27.3.1-0ubuntu1~24.04.1',
    sizeKb: 112000,
    desc: 'Linux container runtime',
    service: 'docker',
    group: 'docker',
  },
  'mysql-server': { version: '8.0.40-0ubuntu0.24.04.1', sizeKb: 240000, desc: 'MySQL database server', service: 'mysql' },
  postgresql: { version: '16+257build1.1', sizeKb: 55000, desc: 'object-relational SQL database', service: 'postgresql' },
  'isc-dhcp-server': {
    version: '4.4.3-P1-4ubuntu2',
    sizeKb: 1500,
    desc: 'ISC DHCP server for automatic IP address assignment',
    service: 'isc-dhcp-server',
    setup: (s) => {
      ensure(s, '/etc/dhcp').children!['dhcpd.conf'] = file('# dhcpd.conf\noption domain-name "routerunner.lab";\noption domain-name-servers 8.8.8.8;\ndefault-lease-time 600;\nmax-lease-time 7200;\n\n# subnet 192.168.56.0 netmask 255.255.255.0 {\n#   range 192.168.56.100 192.168.56.200;\n#   option routers 192.168.56.1;\n# }\n');
    },
  },
  bind9: { version: '1:9.18.28-0ubuntu0.24.04.1', sizeKb: 3800, desc: 'Internet Domain Name Server', service: 'named' },
  vsftpd: { version: '3.0.5-0ubuntu3', sizeKb: 350, desc: 'lightweight, efficient FTP server', service: 'vsftpd' },
  samba: { version: '2:4.19.5+dfsg-4ubuntu9', sizeKb: 40000, desc: 'SMB/CIFS file, print, and login server', service: 'smbd' },
  fail2ban: { version: '1.0.2-3ubuntu0.1', sizeKb: 2100, desc: 'bans IPs that cause multiple authentication errors', service: 'fail2ban' },
  ansible: { version: '9.2.0+dfsg-0ubuntu5', sizeKb: 260000, desc: 'Configuration management, deployment, and task execution system' },
  terraform: { version: '1.9.8-1', sizeKb: 87000, desc: 'Infrastructure as Code tool (HashiCorp)' },
  awscli: { version: '2.18.4', sizeKb: 180000, desc: 'Universal Command Line Environment for AWS' },
  'python3-pip': { version: '24.0+dfsg-1ubuntu1', sizeKb: 7000, desc: 'Python package installer' },
  nodejs: { version: '18.19.1+dfsg-6ubuntu5', sizeKb: 35000, desc: 'evented I/O for V8 javascript' },
  tshark: { version: '4.2.2-1.1build3', sizeKb: 500, desc: 'network traffic analyzer - console version' },
  'prometheus-node-exporter': { version: '1.7.0-1ubuntu0.3', sizeKb: 9000, desc: 'Prometheus exporter for machine metrics', service: 'prometheus-node-exporter' },
  neofetch: { version: '7.1.0-4', sizeKb: 400, desc: 'Shows Linux System Information with Distribution Logo' },
  'openmpi-bin': { version: '4.1.6-7ubuntu2', sizeKb: 2000, desc: 'high performance message passing library' },
};

/** Which package provides a missing command (Ubuntu's "command-not-found" helper). */
export const COMMAND_PKG: Record<string, string> = {
  ifconfig: 'net-tools',
  netstat: 'net-tools',
  route: 'net-tools',
  arp: 'net-tools',
  traceroute: 'traceroute',
  nmap: 'nmap',
  htop: 'htop',
  tree: 'tree',
  git: 'git',
  wget: 'wget',
  tcpdump: 'tcpdump',
  iperf3: 'iperf3',
  mtr: 'mtr',
  whois: 'whois',
  docker: 'docker.io',
  mysql: 'mysql-server',
  psql: 'postgresql',
  ansible: 'ansible',
  'ansible-playbook': 'ansible',
  terraform: 'terraform',
  aws: 'awscli',
  pip: 'python3-pip',
  pip3: 'python3-pip',
  node: 'nodejs',
  tshark: 'tshark',
  neofetch: 'neofetch',
  mpirun: 'openmpi-bin',
};

export const SERVICE_INFO: Record<string, { desc: string; ports: string[]; proc: string }> = {
  nginx: { desc: 'A high performance web server and a reverse proxy server', ports: ['tcp 0.0.0.0:80'], proc: 'nginx' },
  apache2: { desc: 'The Apache HTTP Server', ports: ['tcp *:80'], proc: 'apache2' },
  ssh: { desc: 'OpenBSD Secure Shell server', ports: ['tcp 0.0.0.0:22'], proc: 'sshd' },
  docker: { desc: 'Docker Application Container Engine', ports: [], proc: 'dockerd' },
  mysql: { desc: 'MySQL Community Server', ports: ['tcp 127.0.0.1:3306'], proc: 'mysqld' },
  postgresql: { desc: 'PostgreSQL RDBMS', ports: ['tcp 127.0.0.1:5432'], proc: 'postgres' },
  'isc-dhcp-server': { desc: 'ISC DHCP IPv4 server', ports: ['udp 0.0.0.0:67'], proc: 'dhcpd' },
  named: { desc: 'BIND Domain Name Server', ports: ['udp 0.0.0.0:53', 'tcp 0.0.0.0:53'], proc: 'named' },
  vsftpd: { desc: 'vsftpd FTP server', ports: ['tcp 0.0.0.0:21'], proc: 'vsftpd' },
  smbd: { desc: 'Samba SMB Daemon', ports: ['tcp 0.0.0.0:445'], proc: 'smbd' },
  fail2ban: { desc: 'Fail2Ban Service', ports: [], proc: 'fail2ban-server' },
  'prometheus-node-exporter': { desc: 'Prometheus exporter for machine metrics', ports: ['tcp *:9100'], proc: 'prometheus-node-exporter' },
  'systemd-networkd': { desc: 'Network Configuration', ports: [], proc: 'systemd-networkd' },
  'systemd-resolved': { desc: 'Network Name Resolution', ports: ['udp 127.0.0.53:53'], proc: 'systemd-resolved' },
  cron: { desc: 'Regular background program processing daemon', ports: [], proc: 'cron' },
  ufw: { desc: 'Uncomplicated firewall', ports: [], proc: 'ufw' },
  slurmctld: { desc: 'Slurm controller daemon', ports: ['tcp 0.0.0.0:6817'], proc: 'slurmctld' },
};

export const MAN: Record<string, string> = {
  ls: 'list directory contents. -l long format, -a show hidden (dot) files, -h human sizes',
  cd: 'change directory. "cd .." goes up, "cd ~" goes home, "cd -" goes back',
  pwd: 'print working directory - "where am I?"',
  mkdir: 'make directories. -p creates parent folders too',
  touch: 'create an empty file (or update its timestamp)',
  cat: 'print a file to the screen (concatenate)',
  cp: 'copy files. -r copies folders',
  mv: 'move or rename files',
  rm: 'remove files. -r for folders, -f to force. There is NO recycle bin!',
  chmod: 'change permissions. 755 = rwxr-xr-x, 644 = rw-r--r--, u+x adds execute for the owner',
  chown: 'change owner: chown user:group file',
  grep: 'search text for a pattern. -i ignore case, -n line numbers, -v invert',
  sudo: 'run one command as root (superuser). Asks for YOUR password',
  apt: 'package manager: apt update (refresh list), apt install NAME, apt remove NAME',
  systemctl: 'control services: status | start | stop | restart | enable (start at boot) | disable',
  ip: 'modern network tool: ip a (addresses), ip r (routes), ip link (interfaces), ip neigh (ARP)',
  ping: 'send ICMP echo requests to test reachability. -c 4 sends four',
  ss: 'socket statistics: ss -tulpn shows listening TCP/UDP ports and the program using them',
  netplan: 'Ubuntu network config: edit /etc/netplan/*.yaml then "sudo netplan apply"',
  ufw: 'Uncomplicated Firewall: ufw allow 22/tcp, ufw enable, ufw status verbose',
  useradd: 'low-level add user (use -m to create home). On Ubuntu prefer "adduser"',
  adduser: 'friendly add-user script (creates home, asks for password)',
  usermod: 'modify a user. usermod -aG sudo bob adds bob to the sudo group (-a = append!)',
  passwd: 'change a password',
  ps: 'snapshot of processes. ps aux shows everything',
  kill: 'send a signal to a process (default TERM). kill -9 PID forces it',
  df: 'disk free space per filesystem (-h human readable)',
  free: 'memory (RAM) usage (-h human readable)',
  curl: 'transfer data from/to a URL - great for testing web servers',
  ssh: 'secure shell: log into another machine. ssh user@host',
  'ssh-keygen': 'create an SSH key pair (private key stays secret, public key goes to servers)',
  nano: 'simple text editor. Ctrl+O save, Ctrl+X exit (Route Runner opens its own editor)',
  tail: 'last lines of a file. -n 20 for 20 lines, -f follows live logs',
  head: 'first lines of a file',
  journalctl: 'read systemd logs. journalctl -u nginx for one service',
  hostnamectl: 'show or set the hostname: sudo hostnamectl set-hostname web01',
  docker: 'run and manage containers (see "docker --help")',
  kubectl: 'talk to a Kubernetes cluster (see "kubectl help")',
  terraform: 'Infrastructure as Code: init, plan, apply, destroy',
  aws: 'Amazon Web Services command line',
  sbatch: 'HPC: submit a batch job script to Slurm',
  squeue: 'HPC: show the job queue',
  module: 'HPC: load software environments (module avail / load / list)',
};
