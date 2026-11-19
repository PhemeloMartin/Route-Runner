import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n07 | IPv4 Addressing | 7
@domain 1.0 Network Infrastructure and Connectivity
@sources ComNet Chapter 8.1.1 - IP Addressing (v4) Introduction; Cisco ITN ch.11
@story
Kuruman Marketplace is growing: 40 staff PCs, 6 printers, a server, Wi-Fi for customers. The owner hands Phemelo a sticky note: "192.168.1.something?" Phemelo laughs - it's time to understand addresses properly: which part is the street, which part is the house, and which addresses you must never give to a PC.
@lab network:first-lan | Mission 1 - Your First LAN

=== lesson n07-1 | Network and Host Portions, Masks and Prefixes | 25
@analogy An IP address is a full postal address: "12 Beach Road, Kuruman". The subnet mask tells you which part is the street (network) and which part is the house number (host). Everyone on the same street can talk directly; to reach another street you go through the post office (router).
@objectives
- Split an address into network and host portions using the mask
- Convert between dotted masks and /prefix notation
- Find the network address with the AND operation
@body
An IPv4 address has a **network portion** and a **host portion**. The **subnet mask** marks the boundary: mask bits set to **1** = network, **0** = host.

| Prefix | Mask | Host bits | Usable hosts |
|---|---|---|---|
| /8 | 255.0.0.0 | 24 | 16,777,214 |
| /16 | 255.255.0.0 | 16 | 65,534 |
| /24 | 255.255.255.0 | 8 | 254 |
| /25 | 255.255.255.128 | 7 | 126 |
| /26 | 255.255.255.192 | 6 | 62 |
| /27 | 255.255.255.224 | 5 | 30 |
| /28 | 255.255.255.240 | 4 | 14 |
| /29 | 255.255.255.248 | 3 | 6 |
| /30 | 255.255.255.252 | 2 | 2 |

**Usable hosts = 2^(host bits) - 2** (minus the network and broadcast addresses).

**Finding the network address - the AND operation:** a device ANDs its IP with the mask bit-by-bit (1 AND 1 = 1, anything AND 0 = 0). For 192.168.1.77/26: the last octet 77 = 01001101, mask 192 = 11000000 -> AND = 01000000 = **64**. Network = **192.168.1.64**.

This is exactly how a PC decides "local or remote?": it ANDs its own IP and the destination IP with its mask - if the results match, the destination is on the same network.
@terms
- Network portion :: The bits of an IP address that identify the network (mask bits = 1)
- Host portion :: The bits that identify the device within the network (mask bits = 0)
- Subnet mask :: 32-bit value that marks network vs host bits, e.g. 255.255.255.0
- Prefix length :: The number of network bits written as /n, e.g. /24
- Bitwise AND :: How a device calculates the network address from an IP and mask
@pro
- "A /26 leaves six host bits, so 2^6 - 2 = 62 usable hosts."
- "Hosts AND their IP with the mask to decide whether a destination is local or needs the default gateway."
@quiz
?= How many usable hosts does a /27 provide?
= 30
> 32 - 27 = 5 host bits; 2^5 - 2 = 30.
?= Write /28 as a dotted-decimal mask.
= 255.255.255.240
> 28 ones: 255.255.255.11110000 = .240.
?= What is the network address of 172.16.5.200/24?
= 172.16.5.0
> /24 keeps the first three octets.
?= What is the network address of 192.168.1.77/26?
= 192.168.1.64
> Blocks of 64: 0, 64, 128, 192. 77 falls in the 64 block.

=== lesson n07-2 | Network, Broadcast, Hosts and the Default Gateway | 20
@analogy In every street, house number 0 is the street sign (network address) and the last number is the town crier who shouts to everyone (broadcast). You can't give either to a family. The houses in between are yours to assign.
@objectives
- Identify network, broadcast, first and last usable addresses
- Explain unicast, broadcast and multicast IPv4 addresses
- Explain the role of the default gateway
@body
In every subnet:
- **Network address** - all host bits **0**. Identifies the subnet. Not assignable.
- **Broadcast address** - all host bits **1**. Reaches every host in the subnet. Not assignable.
- **Usable range** - everything in between. Convention: give the **router (gateway) the first usable** address.

Example **192.168.10.0/24**: network .0, first host .1 (gateway), last host .254, broadcast .255.
Example **10.0.0.32/27**: network .32, hosts .33-.62, broadcast .63.

**Types of IPv4 traffic:** **unicast** (one host), **broadcast** (all hosts in the subnet - 255.255.255.255 is the *limited* broadcast; 192.168.10.255 is the *directed* broadcast), **multicast** (224.0.0.0-239.255.255.255, e.g. OSPF uses 224.0.0.5 and 224.0.0.6).

**The default gateway** is the router interface on the host's subnet. Every host needs: **IP address + subnet mask + default gateway + DNS server**. If the gateway is wrong or missing, local traffic works but nothing leaves the LAN. The gateway must be in the **same subnet** as the host.

**Static vs dynamic:** servers, printers and network devices get **static** addresses (they must never change). PCs and phones get **dynamic** addresses from **DHCP** (Chapter 15).
@terms
- Network address :: First address of a subnet (all host bits 0) - identifies the subnet
- Broadcast address :: Last address of a subnet (all host bits 1) - reaches all hosts
- Default gateway :: The local router interface hosts use to reach other networks
- Multicast range :: 224.0.0.0 - 239.255.255.255 (Class D)
@pro
- "By convention the gateway gets the first usable address in the subnet."
@quiz
?= What is the broadcast address of 10.0.0.32/27?
= 10.0.0.63
> Block of 32: 32-63. Broadcast = last address = .63.
? Which address can be assigned to a host in 192.168.5.0/24?
- 192.168.5.0
+ 192.168.5.254
- 192.168.5.255
- 192.168.6.1
> .0 is the network, .255 broadcast, 6.1 is another network.
? Which four settings does a host need to browse the internet?
+ IP address, subnet mask, default gateway, DNS server
- IP address, MAC address, VLAN, DNS server
- MAC address, subnet mask, router ID, NTP server
- IP address, OSPF area, gateway, SSID
> Without DNS, names don't resolve; without a gateway, nothing leaves the LAN.

=== lesson n07-3 | Public, Private and Special Addresses | 15
@analogy Private addresses are like office extension numbers (ext. 201). Every company uses ext. 201 internally, and it works fine inside - but you can't dial ext. 201 from outside. The switchboard (NAT) translates for you.
@objectives
- List the RFC 1918 private ranges
- Recognise loopback, APIPA and other special addresses
- Know the legacy classes A-E
@body
**Private addresses (RFC 1918)** - free to use inside any organisation, NOT routed on the internet:
- **10.0.0.0/8** (10.0.0.0 - 10.255.255.255)
- **172.16.0.0/12** (172.16.0.0 - 172.31.255.255)
- **192.168.0.0/16** (192.168.0.0 - 192.168.255.255)

To reach the internet, private addresses are translated to a public address by **NAT** on the edge router (Chapter 15). IPv4 public addresses are almost exhausted - AFRINIC was one of the last regions to run out - which is a big reason for IPv6.

**Special addresses:**
- **127.0.0.0/8** - loopback (127.0.0.1 = "myself"); [[ping 127.0.0.1]] tests your own TCP/IP stack
- **169.254.0.0/16** - **APIPA / link-local**: Windows gives itself this when DHCP fails. Seeing 169.254.x.x = "no DHCP server answered"!
- **0.0.0.0** - "this network" / default route
- **100.64.0.0/10** - carrier-grade NAT (used by mobile operators)

**Legacy classes** (classful addressing, replaced by CIDR in 1993 but still asked about): Class **A** 1-126 (/8), **B** 128-191 (/16), **C** 192-223 (/24), **D** 224-239 multicast, **E** 240-255 experimental.
@terms
- RFC 1918 :: Defines the private ranges 10/8, 172.16/12, 192.168/16
- APIPA :: 169.254.x.x self-assigned address when DHCP fails
- Loopback :: 127.0.0.1 - an address that always means "this device"
- CIDR :: Classless Inter-Domain Routing - any prefix length, not just /8, /16, /24
- NAT :: Network Address Translation - converts private to public addresses
@pro
- "A 169.254 address tells me the client never got a DHCP lease."
@quiz
? Which address is private?
- 172.32.1.1
+ 172.20.4.9
- 192.169.1.1
- 11.0.0.1
> 172.16.0.0 - 172.31.255.255 is the private /12.
? A laptop shows IP 169.254.33.7. What does that mean?
- It is connected to the internet
+ It could not reach a DHCP server
- It has a static IP
- It is using IPv6
> APIPA is the self-assigned fallback.
? 130.45.2.1 belongs to which legacy class?
- A
+ B
- C
- D
> Class B = first octet 128-191.

=== boss
?= What is the last usable host in 192.168.20.0/26?
= 192.168.20.62
> Block 0-63; broadcast .63; last usable .62.
? A PC is 192.168.1.10/24 with gateway 192.168.2.1. What happens?
- Everything works
+ Local hosts are reachable but remote networks are not - the gateway is not in the PC's subnet
- Nothing works, even locally
- DHCP fixes it automatically
> The gateway must be in the same subnet as the host.
?? Which are RFC 1918 private ranges? (choose all)
+ 10.0.0.0/8
+ 172.16.0.0/12
+ 192.168.0.0/16
- 169.254.0.0/16
> 169.254 is link-local (APIPA), not RFC 1918.
?= How many usable hosts are in a /30? (common on WAN links)
= 2
> 2^2 - 2 = 2 - exactly one for each router.
? Which command tests your own PC's TCP/IP stack without using the network?
+ ping 127.0.0.1
- ping 255.255.255.255
- ipconfig /renew
- tracert 8.8.8.8
> Loopback never leaves the host.
`;
