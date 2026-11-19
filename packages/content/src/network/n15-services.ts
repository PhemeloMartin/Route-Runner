import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n15 | Network Services: DHCP, DNS, NAT, NTP, FHRP and QoS | 15
@domain 4.0 Network Services and Security
@sources Cisco ENSA (NAT, QoS, network management); CCNA v2.0 topics: broader DHCP troubleshooting, NAT/PAT, DNS, FHRP status (HSRP/VRRP)
@story
Monday morning, the Marketplace phones Phemelo in a panic: "Nobody can get on the internet!" Every PC shows 169.254.x.x. By lunch he has fixed DHCP, explained NAT to the owner, and added a second router so this never happens again. Services are the invisible plumbing users only notice when it breaks.
@lab network:dhcp-dns | Mission 5 - DHCP and DNS
@lab network:nat-internet | Mission 10 - PAT to the internet
@lab network:hsrp | Mission 13 - HSRP

=== lesson n15-1 | DHCP: DORA, Pools, Relay and Troubleshooting | 30
@analogy DHCP is the hotel front desk. A guest walks in shouting "I need a room!" (Discover); the desk offers room 112 (Offer); the guest says "I'll take 112" (Request); the desk hands over the key card (Acknowledge) - valid until checkout (lease).
@objectives
- Explain the DORA process and lease
- Configure a Cisco router as a DHCP server and as a relay
- Troubleshoot clients that get APIPA addresses
@body
**DORA:**
1. **Discover** - client broadcasts (src 0.0.0.0, dst 255.255.255.255, UDP 68 -> 67)
2. **Offer** - server offers an address + mask, gateway, DNS, lease time
3. **Request** - client broadcasts "I accept this offer" (so other servers know)
4. **Acknowledge** - server confirms; the address is leased

Clients renew at 50% of the lease. [[ipconfig /release]] and [[ipconfig /renew]] force it.

**Cisco DHCP server:**
~~~
ip dhcp excluded-address 192.168.10.1 192.168.10.10
ip dhcp pool LAN10
 network 192.168.10.0 255.255.255.0
 default-router 192.168.10.1
 dns-server 192.168.10.5
 domain-name kmp.lab
~~~
Verify: [[show ip dhcp binding]], [[show ip dhcp pool]], [[show ip dhcp conflict]].

**DHCP relay** - broadcasts don't cross routers. If the server is on another subnet, configure the router interface facing the clients with [[ip helper-address SERVER-IP]]. It forwards the broadcast as a unicast to the server (and sets giaddr so the server picks the right pool).

**A router interface can be a DHCP client too:** [[ip address dhcp]] (typical on an ISP-facing port).

**Troubleshooting (CCNA v2.0 emphasises this):** a client with **169.254.x.x** got no answer. Check in order: is the client's switch port up and in the right VLAN? Is the router interface up? Does a pool exist for that subnet - and is the pool's network correct? Is the pool exhausted (show ip dhcp pool)? Is the server on another subnet without an **ip helper-address**? Is an ACL blocking UDP 67/68? Are excluded addresses covering the whole range? Is there an address conflict?
@terms
- DORA :: Discover, Offer, Request, Acknowledge - the DHCPv4 exchange
- Lease :: How long a client may use its DHCP address
- Excluded address :: Address a DHCP server will never hand out (gateways, printers, servers)
- ip helper-address :: Turns a router interface into a DHCP relay agent
- DHCP pool :: Range and options a DHCP server hands out for one subnet
@pro
- "DHCP Discovers are broadcasts, so a server on another subnet needs ip helper-address on the client-facing router interface."
@interview Users in a new VLAN all get 169.254 addresses. The DHCP server is on another subnet. What do you check? :: 169.254 means no DHCP answer. Because broadcasts don't cross routers, I'd first check the SVI or sub-interface for that VLAN has ip helper-address pointing at the server. Then that the server has a scope for that subnet, that the interface is up, the VLAN is allowed on trunks, and no ACL blocks UDP 67/68.
@quiz
? What is the correct DHCP message order?
+ Discover, Offer, Request, Acknowledge
- Request, Offer, Discover, Acknowledge
- Discover, Request, Offer, Acknowledge
- Offer, Discover, Acknowledge, Request
> DORA: the client Discovers, the server Offers, the client Requests, the server Acknowledges.
?= Which interface command forwards DHCP broadcasts to a server on another subnet? (just the command word pair)
= ip helper-address
> Configured on the interface facing the clients.
? Why exclude 192.168.10.1-10 from the pool?
+ They are reserved for static devices like the gateway, servers and printers
- DHCP cannot use low numbers
- To speed up DHCP
- They are broadcast addresses
> Prevents address conflicts.

=== lesson n15-2 | DNS and NAT/PAT | 30
@analogy DNS is the contacts app on your phone - you tap "Mom", it dials the number. NAT is the receptionist at a company switchboard: every employee's outgoing call shows the main company number, and the receptionist remembers who called whom so replies get to the right desk.
@objectives
- Explain DNS resolution and common record types
- Explain static NAT, dynamic NAT and PAT with inside/outside terminology
- Configure and verify PAT
@body
**DNS** resolves names to IPs (UDP/TCP 53). A client asks its configured resolver, which may ask root -> TLD (.za) -> authoritative servers and caches the answer for its **TTL**. Records: **A** (IPv4), **AAAA** (IPv6), **CNAME** (alias), **MX** (mail), **NS**, **PTR** (reverse). Test with [[nslookup]] or [[dig]]. On Cisco: [[ip name-server 8.8.8.8]] and [[ip domain-lookup]].

**NAT** translates private (RFC 1918) addresses to public ones at the edge. Terms (from the router's view):
- **Inside local** - the private IP of the inside host (192.168.1.10)
- **Inside global** - the public IP that represents it (203.0.113.2)
- **Outside global** - the real public IP of the outside host (8.8.8.8)
- **Outside local** - how the outside host appears inside (usually the same as outside global)

**Types:** **Static NAT** (1:1, for servers that must be reachable from the internet), **Dynamic NAT** (pool of public IPs, first-come), **PAT / NAT overload** (many inside hosts share ONE public IP, distinguished by **port numbers** - what every home router does).

**PAT configuration:**
~~~
access-list 1 permit 192.168.1.0 0.0.0.255
ip nat inside source list 1 interface g0/0/1 overload
interface g0/0/0
 ip nat inside
interface g0/0/1
 ip nat outside
~~~
Static NAT: [[ip nat inside source static 192.168.1.20 203.0.113.5]].
Verify: [[show ip nat translations]], [[show ip nat statistics]]; clear with [[clear ip nat translation *]].

Common faults: inside/outside swapped, ACL doesn't match the inside subnet, missing default route to the ISP.
@terms
- DNS A / AAAA record :: Maps a name to an IPv4 / IPv6 address
- CNAME :: An alias pointing to another name
- Inside local :: Private address of an inside host
- Inside global :: Public address representing an inside host
- PAT (NAT overload) :: Many private hosts share one public IP using different source ports
- Static NAT :: Permanent one-to-one mapping, used to publish internal servers
@pro
- "PAT lets the whole office share one public IP by tracking source port numbers."
@quiz
? 192.168.1.10 is translated to 203.0.113.2. What is 192.168.1.10 called?
+ Inside local
- Inside global
- Outside local
- Outside global
> Inside host, local (private) address.
? Which keyword turns dynamic NAT into PAT?
- static
+ overload
- pool
- extendable
> "overload" = port address translation.
? Which DNS record maps a name to an IPv6 address?
- A
+ AAAA
- MX
- PTR
> AAAA ("quad-A") records hold IPv6 addresses; A records hold IPv4.
? An internal web server must be reachable from the internet on a fixed public IP. Which NAT type?
+ Static NAT
- PAT
- Dynamic NAT
- No NAT is possible
> 1:1 permanent mapping.

=== lesson n15-3 | First-Hop Redundancy (HSRP/VRRP), NTP and QoS | 25
@analogy HSRP is two security guards sharing one radio call-sign "Gate". Only the senior guard answers. If he faints, the junior one answers "Gate" instantly - visitors never need a new number.
@objectives
- Explain FHRPs, virtual IP/MAC and Active/Standby roles
- Interpret show standby brief output
- Explain why NTP matters and the basics of QoS
@body
**The problem:** hosts have ONE default gateway. If that router dies, the subnet is cut off.
**First Hop Redundancy Protocols** give a **virtual IP** (and virtual MAC) shared by two or more routers. Hosts use the virtual IP as their gateway.
- **HSRP** (Cisco): **Active** forwards, **Standby** waits. Highest **priority** (default 100) wins, tie -> highest IP. **preempt** lets a higher-priority router take the role back when it recovers. Virtual MAC 0000.0C07.ACxx (v1).
- **VRRP** (open standard): **Master/Backup**, preempt on by default.
- **GLBP** (Cisco): load-balances across multiple gateways.
~~~
interface g0/0/0
 ip address 10.10.10.2 255.255.255.0
 standby 1 ip 10.10.10.1
 standby 1 priority 110
 standby 1 preempt
~~~
[[show standby brief]] shows interface, group, priority, P (preempt), state (Active/Standby), active and standby addresses, and the virtual IP. CCNA v2.0 asks you to *interpret* this output.

**NTP (UDP 123)** - synchronises clocks. Without correct time, logs from different devices can't be correlated, certificates fail and authentication breaks. [[ntp server 10.0.0.5]]; [[show ntp status]]. Lower **stratum** = closer to a reference clock.

**QoS basics** - when links are congested, decide who goes first: **classify and mark** traffic (DSCP **EF** for voice, CoS on 802.1Q), **queue** (LLQ gives voice a strict-priority queue), **police/shape** rates, **congestion avoidance** (WRED). Voice targets: one-way delay < 150 ms, jitter < 30 ms, loss < 1%.
@terms
- FHRP :: First Hop Redundancy Protocol - shared virtual gateway (HSRP, VRRP, GLBP)
- HSRP :: Cisco Hot Standby Router Protocol - Active/Standby routers share a virtual IP
- VRRP :: Virtual Router Redundancy Protocol - open-standard FHRP (Master/Backup)
- Preempt :: Lets a higher-priority router reclaim the Active role
- NTP :: Network Time Protocol (UDP 123) - accurate clocks for logs and security
- DSCP EF :: Expedited Forwarding marking for voice traffic
@pro
- "HSRP gives hosts a virtual gateway; with preempt the higher-priority router reclaims the Active role after recovering."
@quiz
? In HSRP, which router becomes Active (preempt configured on both)?
+ The router with the highest priority
- The router with the lowest IP
- The router that booted first, always
- Both routers equally
> Priority (default 100) decides; tie -> highest IP.
? What gateway address do hosts use with HSRP?
- The Active router's physical IP
+ The virtual IP
- The Standby router's IP
- Any router IP
> The virtual IP never changes.
? Why is NTP important for security operations?
+ Logs from different devices can be correlated by accurate timestamps
- It encrypts logs
- It speeds up routing
- It assigns IP addresses
> Incident response depends on time.
? Which DSCP marking is used for voice?
+ EF
- AF11
- CS1
- Default (0)
> Expedited Forwarding.

=== boss
? Clients on VLAN 30 get 169.254.x.x. The DHCP server is 10.1.1.5 on another VLAN. Which fix is most likely?
+ Add ip helper-address 10.1.1.5 on the VLAN 30 gateway interface
- Change the clients to static IPs
- Enable PortFast
- Add a default route on the clients
> Relay the broadcast.
? Which NAT term describes the public IP that represents an inside host?
- Inside local
+ Inside global
- Outside local
- Outside global
> Inside host, global (public) address.
? PAT distinguishes many inside hosts sharing one public IP using...
- MAC addresses
+ Source port numbers
- VLAN tags
- TTL values
> Port Address Translation.
? show standby brief shows "Active local, Standby 10.1.1.3, Virtual IP 10.1.1.1" on R1. What does it mean?
+ R1 is forwarding for 10.1.1.1 and 10.1.1.3 is ready to take over
- R1 is the standby router
- HSRP is broken
- 10.1.1.3 is the virtual IP
> "local" means this router.
? Which is the open-standard FHRP?
- HSRP
+ VRRP
- GLBP
- CARP only
> VRRP is IETF RFC 5798.
?= Which port does DNS use?
= 53
> UDP (and TCP) 53.
`;
