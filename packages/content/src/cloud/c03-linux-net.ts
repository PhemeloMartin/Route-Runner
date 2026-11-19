import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c03 | Linux Networking, SSH and Server Hardening | 3
@sources Ubuntu Practice and Configuration (the ip tool, services); Information Security modules (hardening, authentication); LFS101 networking chapter
@story
"Your server got an IP from DHCP," says Lindiwe. "Tomorrow it might get a different one - and every customer bookmark breaks. Servers need fixed addresses, a firewall, and SSH keys instead of passwords. That's the difference between a hobby box and production."
@lab linux:static-ip | Linux Mission 4 - Static IP with Netplan + Firewall

=== lesson c03-1 | Linux Network Commands and Netplan | 25
@analogy The ip command is your server's dashboard: ip a shows the number plates (addresses), ip r shows the road map (routes). Netplan is the settings file you edit to change them permanently.
@objectives
- Inspect addresses, routes and DNS with ip and resolvectl
- Configure a static IP with netplan
- Test connectivity with ping, curl, dig and traceroute
@body
| Task | Modern command | Old (net-tools) |
|---|---|---|
| Show IPs | [[ip a]] | ifconfig |
| Show routes | [[ip r]] | route -n |
| ARP/neighbours | [[ip neigh]] | arp -a |
| Listening ports | [[ss -tulpn]] | netstat -tulpn |
| DNS servers | [[resolvectl status]] | cat /etc/resolv.conf |

**Netplan** (Ubuntu) - YAML files in [[/etc/netplan/]]. Static example:
~~~
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: false
      addresses:
        - 192.168.1.50/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
~~~
Then [[sudo netplan try]] (auto-reverts in 120 s if you lose access - lifesaver over SSH!) or [[sudo netplan apply]]. YAML rules: **spaces only, never tabs**; indentation is meaning. The old [[gateway4:]] key is deprecated - use **routes**. Keep the file **chmod 600**.

**Testing:** [[ping -c 4 8.8.8.8]] (Linux ping runs forever without -c), [[ping google.com]] (tests DNS too), [[dig +short ubuntu.com]], [[traceroute 8.8.8.8]], [[curl -I http://localhost]] (HTTP headers).
@terms
- ip a / ip r :: Show interface addresses / routing table on Linux
- Netplan :: Ubuntu's YAML-based network configuration
- netplan try :: Applies config but reverts automatically unless you confirm
- dig :: DNS lookup tool
- curl :: Command-line HTTP client - great for testing web servers and APIs
@pro
- "Over SSH I use netplan try, so a typo can't lock me out of the server."
@quiz
? Which command shows the Linux routing table?
- ip a
+ ip r
- ss -t
- dig
> "ip r" (short for ip route) prints the routing table, including the default route.
? A netplan file fails with "found a tab character". Why?
+ YAML only allows spaces for indentation
- Netplan is not installed
- The IP is wrong
- The file must be JSON
> Tabs are illegal in YAML.
? Why use "netplan try" on a remote server?
+ It automatically rolls back if you lose connectivity
- It is faster than apply
- It works without sudo
- It enables DHCP
> netplan try applies the change but rolls it back automatically after 120 seconds unless you confirm - so a typo cannot lock you out.

=== lesson c03-2 | SSH Keys and Secure Remote Access | 20
@analogy A password is a secret you have to say out loud every time - anyone listening could learn it. An SSH key pair is a padlock (public key) you hand out freely and a key (private key) that never leaves your pocket. Servers install your padlock; only your key opens it.
@objectives
- Generate and deploy SSH keys
- Harden sshd_config
- Explain why key authentication beats passwords
@body
~~~
ssh-keygen -t ed25519                 # creates ~/.ssh/id_ed25519 (PRIVATE) and .pub (public)
ssh-copy-id phemelo@192.168.1.50      # installs the public key on the server
ssh phemelo@192.168.1.50              # log in with the key
scp report.pdf phemelo@server:/tmp/   # secure copy (port 22)
~~~
The public key goes into the server's [[~/.ssh/authorized_keys]]. **Never share or upload the private key** (not to GitHub, not to a chat, not to an AI tool).

**Harden [[/etc/ssh/sshd_config]]**, then [[sudo systemctl restart ssh]]:
~~~
PermitRootLogin no
PasswordAuthentication no      # keys only - after confirming your key works!
PubkeyAuthentication yes
AllowUsers phemelo thabo
~~~
Add **fail2ban** to ban IPs after repeated failed logins, and consider changing nothing else "clever" (moving the port reduces log noise but isn't real security).

Internet-facing servers get thousands of SSH brute-force attempts per day - [[grep -c "Failed password" /var/log/auth.log]] will show you.
@terms
- SSH key pair :: Public key (shareable) + private key (secret) for passwordless, secure login
- authorized_keys :: Server file listing public keys allowed to log in
- sshd_config :: SSH server configuration file
- PermitRootLogin no :: Blocks direct root logins over SSH
- fail2ban :: Bans IPs after repeated failed login attempts
@pro
- "I disable password authentication only after confirming my key login works in a second session."
@quiz
? Which file must NEVER leave your computer?
+ ~/.ssh/id_ed25519
- ~/.ssh/id_ed25519.pub
- authorized_keys on the server
- known_hosts
> The private key.
? Which sshd_config line blocks root from logging in directly?
+ PermitRootLogin no
- RootLogin disable
- AllowRoot false
- DenyUsers *
> Classic hardening line.
?= Which command copies your public key to a server?
= ssh-copy-id | ssh-copy-id user@server
> It appends to ~/.ssh/authorized_keys.

=== lesson c03-3 | Host Firewalls with UFW and a Hardening Checklist | 20
@analogy A host firewall is the security guard at your own front door, even though the estate (network) already has a gate. Defence in depth: if one layer fails, the next still stops the intruder.
@objectives
- Configure UFW safely without locking yourself out
- Apply a Linux server hardening checklist
@body
**UFW (Uncomplicated Firewall)** - a friendly front-end to Linux's netfilter/iptables/nftables:
~~~
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh                 # ALWAYS before enabling, on a remote server!
sudo ufw allow 80/tcp
sudo ufw allow from 192.168.56.0/24 to any port 3306   # DB only from the app subnet
sudo ufw enable
sudo ufw status verbose
sudo ufw delete allow 80/tcp
~~~
Enabling UFW without allowing SSH on a cloud server = locked out (and in the cloud you'd need the provider's console to recover).

**Linux server hardening checklist:**
1. Patch: [[sudo apt update && sudo apt upgrade]] (and unattended-upgrades)
2. Users: individual accounts, sudo group, no shared logins
3. SSH: keys only, no root login, fail2ban
4. Firewall: default deny incoming, allow only needed ports
5. Services: remove/disable what you don't use ([[systemctl list-units]])
6. Logs: time sync (NTP), central logging, check auth.log
7. Backups: automated and **tested**
8. Least privilege on files (600 for secrets, no 777)
@terms
- UFW :: Uncomplicated Firewall - simple host firewall for Ubuntu
- Default deny :: Block everything not explicitly allowed
- Defence in depth :: Several layers of security so one failure isn't fatal
- unattended-upgrades :: Ubuntu package that installs security updates automatically
@pro
- "On a remote server I always allow SSH before running ufw enable."
@quiz
? What must you do BEFORE "ufw enable" on a remote cloud server?
+ ufw allow ssh
- ufw reset
- ufw disable
- reboot
> Or you'll cut your own connection.
? Which UFW rule allows MySQL only from 10.0.1.0/24?
+ ufw allow from 10.0.1.0/24 to any port 3306
- ufw allow 3306
- ufw deny 10.0.1.0/24
- ufw allow mysql from any
> Source-restricted rule.
? Which item is NOT good hardening practice?
- Disable root SSH login
- Apply security updates
+ chmod 777 on web folders so everything works
- Default-deny firewall
> 777 lets anyone modify files.

=== boss
? A server must keep the same IP forever. Which netplan setting?
+ dhcp4: false with addresses and a default route
- dhcp4: true
- gateway4 only
- dhcp6: true
> Static config.
? What does "ss -tulpn" show?
+ Listening TCP/UDP ports and the processes using them
- Disk usage
- User list
- Routing table
> ss lists sockets: -t TCP, -u UDP, -l listening, -p process, -n numeric ports.
? Which authentication method is most secure for SSH?
+ Key pairs with password authentication disabled
- Short passwords
- Root login with a password
- Telnet
> Keys resist brute force.
? UFW default policy for a web server's incoming traffic should be...
+ deny, with explicit allows for 22 and 80/443
- allow everything
- deny everything including SSH
- disabled
> Default deny.
? ping -c 4 8.8.8.8 works but ping google.com fails. The problem is...
+ DNS
- the default route
- the cable
- the firewall blocking ICMP
> IP works; names don't.
`;
