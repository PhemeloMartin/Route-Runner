import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n16 | Security Fundamentals: Threats, ACLs and Layer 2 Protection | 16
@domain 4.0 Network Services and Security
@sources Information Security (NINS742): Topic 1-5, principles-of-information-security (Whitman & Mattord), Threat Identification activities, Authentication Authorization Accounting.docx; OS Chapter 9 (Security); CCNA v2.0 topics: AAA, IPv4 ACLs, Layer 2 protections, IPsec
@story
A guest at the Marketplace plugs a laptop into a free wall port and runs a tool that pretends to be the DHCP server. Half the shop's PCs start sending their traffic to his laptop. Phemelo spots it in the logs. "Your InfoSec module taught you the theory," says Mma Neo. "Now let's make the switches and routers enforce it."
@lab network:acl-secure | Mission 11 - Extended ACL
@lab network:ssh-mgmt | Mission 4 - SSH management

=== lesson n16-1 | Threats, Vulnerabilities and Attacks | 25
@analogy A vulnerability is an unlocked window. A threat is a burglar in the neighbourhood. An exploit is the burglar actually climbing in. Risk is how likely that is and how bad it would be. Security is closing windows, adding alarms and having insurance.
@objectives
- Define threat, vulnerability, exploit and risk
- Recognise common attack types
- Apply the CIA triad and defence in depth
@body
- **Vulnerability** - a weakness (unpatched IOS, default password, Telnet enabled)
- **Threat** - something that could exploit it (attacker, malware, insider, flood)
- **Exploit** - the method/tool used
- **Risk** - likelihood x impact. **Mitigation** reduces it.

**Common attacks (CCNA level):**
- **Malware**: virus (needs a host file), worm (self-propagates), trojan (disguised), ransomware, spyware
- **Social engineering**: **phishing** (mass email), **spear phishing** (targeted), vishing (voice), smishing (SMS), pretexting, tailgating
- **DoS / DDoS** - overwhelm a service (attacks **availability**)
- **Reconnaissance** - ping sweeps, port scans
- **Man-in-the-middle** - ARP spoofing, rogue DHCP, evil-twin Wi-Fi
- **Spoofing** - fake IP or MAC addresses
- **Password attacks** - brute force, dictionary, credential stuffing
- **Buffer overflow** - code bugs (your OS module: return-to-libc, code injection)

**CIA triad:** Confidentiality (encryption, access control), Integrity (hashing - your HashCalc research!), Availability (redundancy, DDoS protection, UPS).

**Defence in depth** - many layers: physical locks, port security, ACLs, firewalls/IPS, strong authentication, patching, encryption, user training, logging and monitoring.
@terms
- Vulnerability :: A weakness that could be exploited
- Threat :: A potential danger that could exploit a vulnerability
- Exploit :: The tool or technique that takes advantage of a vulnerability
- Phishing :: Fraudulent messages that trick users into giving credentials or running malware
- DDoS :: Distributed Denial of Service - many sources overwhelm a target
- Defence in depth :: Multiple layers of security controls
@pro
- "Risk is likelihood times impact - we mitigate the highest risks first."
@quiz
? An attacker sends a fake bank email to thousands of people. This is...
+ phishing
- spear phishing
- a worm
- a DoS attack
> Mass, untargeted = phishing.
? Which malware spreads by itself across the network without user action?
- Virus
+ Worm
- Trojan
- Spyware
> Worms self-propagate.
? A DDoS attack mainly targets which part of the CIA triad?
- Confidentiality
- Integrity
+ Availability
- Accounting
> Service is made unavailable.

=== lesson n16-2 | AAA, Passwords, MFA and Device Hardening | 20
@analogy AAA is airport security. Authentication: show your passport (who are you?). Authorization: your boarding pass says which plane you may board (what may you do?). Accounting: the cameras record where you went (what did you do?).
@objectives
- Explain authentication, authorization and accounting
- Compare RADIUS and TACACS+
- Apply password and device hardening best practice
@body
**AAA:**
- **Authentication** - prove identity (password, certificate, MFA)
- **Authorization** - what you're allowed to do (privilege levels, command authorization)
- **Accounting** - record what you did (logs for audit)

**Servers:**
| | RADIUS | TACACS+ |
|---|---|---|
| Transport | UDP 1812/1813 | TCP 49 |
| Encryption | password only | whole payload |
| AAA | authN + authZ combined | separates all three |
| Typical use | network ACCESS (Wi-Fi 802.1X, VPN) | device ADMINISTRATION (who typed which command) |

**MFA (multi-factor):** something you **know** (password), something you **have** (phone app, token), something you **are** (fingerprint). Two passwords is NOT MFA.

**Password policy:** long passphrases beat complex short ones; never reuse; a password manager; no defaults. On Cisco: [[security passwords min-length 10]], [[login block-for 120 attempts 3 within 60]] (blocks brute-force), [[exec-timeout 5 0]].

**Device hardening checklist:** SSH v2 only, [[transport input ssh]], local users with **secret** (or AAA server), disable unused services (HTTP server, CDP on edge ports), shut unused ports and put them in an unused VLAN, NTP + syslog, a legal banner, and **patch IOS**.
@terms
- Authentication :: Verifying identity
- Authorization :: Deciding what an authenticated user may do
- Accounting :: Recording what users did
- RADIUS :: AAA protocol over UDP, common for network access (802.1X, VPN)
- TACACS+ :: Cisco AAA protocol over TCP 49 - encrypts the whole payload, separates AAA
- MFA :: Multi-factor authentication - two or more different factor types
@pro
- "TACACS+ is my choice for device administration because it separates authorization and logs every command."
@quiz
? Which factor combination is true MFA?
- Password and PIN
+ Password and a code from an authenticator app
- Two different passwords
- Username and password
> Know + have.
? Which AAA protocol encrypts the entire packet and uses TCP 49?
- RADIUS
+ TACACS+
- LDAP
- Kerberos
> TACACS+ = TCP 49, full encryption.
? "Accounting" in AAA means...
+ logging what a user did
- checking the password
- deciding which commands are allowed
- billing the user
> Audit trail.

=== lesson n16-3 | Access Control Lists | 30
@analogy An ACL is a bouncer with a guest list read from the top. The first line that matches you decides - in or out - and he stops reading. If your name isn't on the list at all, you're out (the invisible "deny everyone" at the bottom).
@objectives
- Explain ACL processing, wildcard masks and the implicit deny
- Configure standard and extended, numbered and named ACLs
- Place ACLs correctly and apply them in or out
@body
**Processing rules:** top-down, **first match wins**, and an **implicit deny any** at the end. An ACL with only deny lines blocks everything!

**Wildcard masks:** 0 = must match, 1 = don't care. Shortcuts: [[host 10.1.1.5]] = 10.1.1.5 0.0.0.0; [[any]] = 0.0.0.0 255.255.255.255. A /24 = 0.0.0.255; /26 = 0.0.0.63.

**Standard ACL (1-99, 1300-1999)** - matches **source IP only**. Place **close to the destination** (otherwise you block the source from everything).
~~~
access-list 10 permit 192.168.10.0 0.0.0.255
access-list 10 deny any
line vty 0 4
 access-class 10 in
~~~
(access-class restricts who can SSH to the device - a classic use.)

**Extended ACL (100-199, 2000-2699)** - matches **protocol, source, destination and port**. Place **close to the source** to drop traffic early.
~~~
ip access-list extended GUEST-IN
 remark Guests may only browse the web server
 permit tcp 192.168.30.0 0.0.0.255 host 192.168.10.100 eq 80
 permit tcp 192.168.30.0 0.0.0.255 host 192.168.10.100 eq 443
 deny ip any any log
interface g0/0/1
 ip access-group GUEST-IN in
~~~
**One ACL per interface, per direction, per protocol.** "in" = traffic entering the interface; "out" = leaving it.

Verify: [[show access-lists]] (shows hit counters), [[show ip interface g0/0/1]] (which ACL is applied). Named ACLs let you insert/delete individual lines by sequence number.
@terms
- ACL :: Access Control List - ordered permit/deny statements filtering traffic
- Implicit deny :: The invisible "deny any" at the end of every ACL
- Standard ACL :: Filters on source IP only (1-99) - place near the destination
- Extended ACL :: Filters on protocol, source, destination and port (100-199) - place near the source
- Wildcard mask :: 0 bits must match, 1 bits are ignored
- access-class :: Applies an ACL to VTY lines to restrict remote management
@pro
- "Extended ACLs go close to the source and standard ACLs close to the destination."
- "Every ACL ends with an implicit deny, so at least one permit is required."
@interview Guests must reach only the web server on HTTPS. Write and place the ACL. :: An extended ACL inbound on the guest-facing interface: permit tcp from the guest subnet to host webserver eq 443, then deny ip any any log (the implicit deny exists anyway, but explicit logging helps). Extended because I need destination and port, and inbound on the guest interface so unwanted traffic is dropped at the first router.
@quiz
?= Which wildcard mask matches exactly the network 172.16.4.0/22?
= 0.0.3.255
> 255.255.255.255 - 255.255.252.0.
? An ACL contains only "access-list 5 deny host 10.1.1.9" and is applied. What happens to traffic from 10.1.1.20?
- It is permitted
+ It is denied by the implicit deny
- It is logged and permitted
- The ACL is ignored
> No permit line matches - implicit deny.
? Where should a STANDARD ACL normally be placed?
- As close to the source as possible
+ As close to the destination as possible
- On every interface
- Only on VTY lines
> It only sees the source, so near the source it would block too much.
? Which command applies an ACL to SSH/Telnet access?
- ip access-group 10 in
+ access-class 10 in
- transport input 10
- line acl 10
> access-class on the VTY lines.

=== lesson n16-4 | Layer 2 Security: Port Security, DHCP Snooping, DAI | 25
@analogy DHCP snooping makes the switch a hall monitor who knows exactly which door the real teacher (DHCP server) uses. Anyone else handing out "room numbers" from a student desk gets stopped. Port security limits how many people can sit at each desk.
@objectives
- Configure port security with maximum, sticky and violation modes
- Explain DHCP snooping trusted/untrusted ports and the binding table
- Explain Dynamic ARP Inspection and other L2 protections
@body
**Port security** - limit MAC addresses per access port:
~~~
interface fa0/5
 switchport mode access
 switchport port-security
 switchport port-security maximum 2
 switchport port-security mac-address sticky
 switchport port-security violation restrict
~~~
Violation modes: **shutdown** (default - port err-disabled, needs [[shutdown]]/[[no shutdown]] or errdisable recovery), **restrict** (drop + log + counter), **protect** (drop silently). Port security requires the port to be a static **access** (or trunk) port, not dynamic. Verify: [[show port-security interface fa0/5]].

**DHCP snooping** - stops rogue DHCP servers. Ports are **untrusted** by default (DHCP Offers/ACKs arriving there are dropped); mark uplinks to the real server **trusted**. It builds a **binding table** (MAC, IP, VLAN, port).
~~~
ip dhcp snooping
ip dhcp snooping vlan 10,20
interface g0/1
 ip dhcp snooping trust
~~~
**Dynamic ARP Inspection (DAI)** - uses the snooping binding table to drop forged ARP replies (stops ARP poisoning / MITM): [[ip arp inspection vlan 10,20]] and trust uplinks.

**Other L2 protections (v2.0 lists several):** **storm control** (limit broadcast/multicast rates), **IPv6 RA Guard** (block rogue router advertisements), BPDU Guard, disabling DTP, unused ports shut down in a "parking" VLAN, changing the native VLAN.

**VPNs** (overview): **site-to-site IPsec** joins two offices over the internet (encryption + integrity + authentication); **remote-access VPN** (SSL/TLS or IPsec clients) for travelling staff.
@terms
- Port security :: Limits and/or locks the MAC addresses allowed on a switch port
- Sticky MAC :: Port security learns MACs dynamically and saves them to the config
- Violation shutdown :: Default port-security action - the port becomes err-disabled
- DHCP snooping :: Blocks DHCP server messages on untrusted ports; builds a binding table
- Dynamic ARP Inspection :: Validates ARP packets against the DHCP snooping bindings
- Storm control :: Limits broadcast/multicast/unicast flood rates on a port
- IPsec :: Framework for encrypted, authenticated site-to-site VPN tunnels
@pro
- "Every access port is untrusted for DHCP snooping; only uplinks towards the real DHCP server are trusted."
@quiz
? What is the DEFAULT port-security violation mode?
+ shutdown
- restrict
- protect
- log
> Port goes err-disabled.
? A rogue DHCP server is on an access port with DHCP snooping enabled. What happens to its Offers?
+ They are dropped because the port is untrusted
- They are forwarded normally
- They are converted to unicasts
- The switch reboots
> Only trusted ports may send DHCP server messages.
? Which feature relies on the DHCP snooping binding table to stop ARP spoofing?
- Port security
+ Dynamic ARP Inspection
- Storm control
- PortFast
> Dynamic ARP Inspection checks every ARP reply against the DHCP snooping table and drops forged ones.
? Port security is rejected with "is a dynamic port". What's the fix?
+ switchport mode access first
- no switchport
- spanning-tree portfast
- ip dhcp snooping trust
> Port security needs a statically configured port.

=== boss
? Which ACL statement permits only HTTPS from 10.1.1.0/24 to server 172.16.1.10?
+ permit tcp 10.1.1.0 0.0.0.255 host 172.16.1.10 eq 443
- permit udp 10.1.1.0 0.0.0.255 host 172.16.1.10 eq 443
- permit tcp host 172.16.1.10 10.1.1.0 0.0.0.255 eq 443
- permit ip 10.1.1.0 255.255.255.0 172.16.1.10 eq 443
> Source first, wildcard mask, TCP, eq 443.
? What happens to a packet that matches no line of an applied ACL?
+ It is denied
- It is permitted
- It is sent to the CPU
- It is logged and forwarded
> Implicit deny.
? Which AAA protocol is best for logging every command a network admin types?
- RADIUS
+ TACACS+
- SNMP
- Syslog alone
> TACACS+ supports per-command authorization and accounting.
?? Which are Layer 2 security features? (choose three)
+ Port security
+ DHCP snooping
+ Dynamic ARP Inspection
- OSPF authentication
> OSPF is Layer 3.
? A user's switch port is err-disabled after he plugged in a hub with 3 PCs. Most likely cause?
+ Port security maximum exceeded with violation shutdown
- DHCP snooping trust
- Native VLAN mismatch
- Duplex mismatch
> More MACs than allowed.
? Which is the best defence against phishing?
- A faster firewall
+ User awareness training plus MFA
- Longer VLAN names
- Disabling DHCP
> People are the target; MFA limits stolen-password damage.
`;
