import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n09 | IPv6 - The Next Internet | 9
@domain 1.0 Network Infrastructure and Connectivity
@sources Cisco ITN ch.12 IPv6 Addressing; CCNA v2.0 topics: IPv6 addressing and OSPFv3
@story
The ISP emails: "Your new fibre line includes a free IPv6 /48." Phemelo opens it and sees 2001:db8:acad::/48. "What on earth is this?" Mma Neo: "The internet ran out of IPv4 addresses. IPv6 has enough for every grain of sand on every beach. Learn to read it - CCNA v2.0 expects you to configure it."
@lab drill:ipv6 | IPv6 compression drills

=== lesson n09-1 | Reading and Shortening IPv6 Addresses | 25
@analogy An IPv6 address is a very long phone number written in eight groups so it's readable. The compression rules are like saying "double-oh-seven" instead of "zero-zero-seven" - shorter, same meaning.
@objectives
- Describe the 128-bit IPv6 format
- Apply the two compression rules
- Expand a compressed address back to full form
@body
IPv6 addresses are **128 bits**, written as **8 groups (hextets) of 4 hex digits** separated by colons:
**2001:0DB8:0000:0000:0000:FF00:0042:8329**

**Rule 1 - drop leading zeros in each hextet:** 0DB8 -> DB8, 0042 -> 42, 0000 -> 0
-> 2001:DB8:0:0:0:FF00:42:8329

**Rule 2 - replace ONE run of consecutive all-zero hextets with ::** (only once per address!)
-> **2001:DB8::FF00:42:8329**

If there are two zero runs, compress the **longest** (if equal, the first). Using :: twice is invalid because you couldn't tell how many zeros each one hides.

**Expanding:** count the hextets present, add zero groups for :: until there are 8, then pad each to 4 digits.
2001:db8::1 -> 2001:0db8:0000:0000:0000:0000:0000:0001

**Prefixes** work like IPv4 CIDR. Almost every LAN is a **/64** (64-bit network + 64-bit interface ID). An ISP typically gives a site a **/48** (65,536 subnets of /64) or a home a /56.
@terms
- IPv6 :: 128-bit addressing written as 8 hextets of hex digits
- Hextet :: One 16-bit group of 4 hex digits in an IPv6 address
- Double colon (::) :: Replaces one run of consecutive all-zero hextets - only once per address
- /64 :: The standard IPv6 LAN prefix length
@pro
- "IPv6 LANs are /64 by convention; a site usually receives a /48."
@quiz
?= Compress 2001:0DB8:0000:0000:0000:0000:0000:0001 fully.
= 2001:db8::1
> Drop leading zeros, replace the zero run with ::.
? Which address is INVALID?
- 2001:db8::1
- fe80::1
+ 2001::db8::1
- ::1
> :: may appear only once.
? How many bits is an IPv6 address?
- 32
- 64
+ 128
- 256
> IPv6 uses 128-bit addresses (IPv4 uses 32), written as 8 groups of 16 bits.

=== lesson n09-2 | Address Types, SLAAC and EUI-64 | 25
@analogy Link-local addresses are like first names - fine inside your house, meaningless outside. Global unicast addresses are your full name and street address - unique worldwide.
@objectives
- Identify global unicast, link-local, unique local, multicast and loopback
- Explain SLAAC, stateless and stateful DHCPv6
- Build an EUI-64 interface ID from a MAC
@body
**Address types:**
| Type | Prefix | Like IPv4... |
|---|---|---|
| Global unicast (GUA) | **2000::/3** (starts with 2 or 3) | public address |
| Link-local (LLA) | **FE80::/10** | 169.254 - but always present and used |
| Unique local (ULA) | **FC00::/7** (FD..) | RFC 1918 private |
| Multicast | **FF00::/8** | 224.0.0.0/4 |
| Loopback | **::1/128** | 127.0.0.1 |
| Unspecified | **::/128** | 0.0.0.0 |

**There is no broadcast in IPv6** - multicast replaces it. **FF02::1** = all nodes, **FF02::2** = all routers.

**Every IPv6 interface has a link-local address**, automatically. Routers use them as next hops and for routing protocol neighbours.

**Getting an address dynamically:**
- **SLAAC** (Stateless Address Autoconfiguration) - the router sends a **Router Advertisement (RA)** with the /64 prefix; the host builds its own interface ID. No server needed.
- **Stateless DHCPv6** - SLAAC for the address + DHCPv6 for extras like DNS.
- **Stateful DHCPv6** - a DHCPv6 server assigns the address (like DHCPv4).

**EUI-64** builds a 64-bit interface ID from a 48-bit MAC: split the MAC in half, insert **FFFE** in the middle, and **flip the 7th bit** of the first byte.
MAC 00:1A:2B:3C:4D:5E -> 001A2B **FFFE** 3C4D5E -> flip bit 7 of 00 -> 02 -> **021A:2BFF:FE3C:4D5E**.
Many OSes now use random interface IDs instead (privacy extensions).

**NDP** (Neighbor Discovery, ICMPv6) replaces ARP: Neighbor Solicitation/Advertisement and Router Solicitation/Advertisement.

**Cisco config:**
~~~
ipv6 unicast-routing
interface g0/0/0
 ipv6 address 2001:db8:acad:1::1/64
~~~
@terms
- GUA :: Global Unicast Address - public, routable, starts with 2 or 3
- Link-local address :: FE80::/10 address valid only on one link; every IPv6 interface has one
- SLAAC :: Hosts build their own address from the router's advertised prefix
- Router Advertisement :: ICMPv6 message from a router announcing the prefix and gateway
- EUI-64 :: Interface ID made from the MAC with FFFE inserted and bit 7 flipped
- NDP :: Neighbor Discovery Protocol - IPv6 replacement for ARP
- ipv6 unicast-routing :: Global command that lets a Cisco router forward IPv6
@pro
- "IPv6 has no broadcast; multicast like FF02::1 replaces it."
- "A router must have ipv6 unicast-routing enabled to forward IPv6 and send Router Advertisements."
@interview How does a laptop get an IPv6 address with no DHCP server? :: SLAAC. It first creates its own link-local address, sends a Router Solicitation, and the router replies with a Router Advertisement containing the /64 prefix. The laptop combines that prefix with an interface ID it generates itself - EUI-64 from its MAC or a random ID - and uses the router's link-local address as its default gateway.
@quiz
? An address beginning with FE80 is a...
- Global unicast address
+ Link-local address
- Multicast address
- Unique local address
> FE80::/10 = link-local.
? Which IPv6 feature replaces ARP?
- DHCPv6
+ Neighbor Discovery (NDP)
- SLAAC
- EUI-64
> NDP uses ICMPv6 Neighbor Solicitation/Advertisement.
?= Which global command lets a Cisco router route IPv6?
= ipv6 unicast-routing
> Without it the router won't forward IPv6 or send RAs.
? In EUI-64, which value is inserted in the middle of the MAC?
- FFFF
+ FFFE
- FE80
- 0000
> Plus flipping the 7th bit of the first byte.

=== boss
? Which is the correct compressed form of 2001:0db8:0000:0000:0001:0000:0000:0001?
+ 2001:db8::1:0:0:1
- 2001:db8::1::1
- 2001:db8:0:0:1::1
- 2001:db8::0001:0:0:1
> Two equal zero runs: compress the FIRST. Never use :: twice.
? Which prefix identifies global unicast addresses?
+ 2000::/3
- FE80::/10
- FC00::/7
- FF00::/8
> 2000::/3 = addresses starting 2 or 3.
? How does IPv6 replace broadcasts?
- It doesn't need them
+ With multicast groups like FF02::1
- With anycast to the router
- With ARP
> All-nodes multicast reaches every host.
? Which method lets hosts configure an address using only the router's advertisement?
+ SLAAC
- Stateful DHCPv6
- NAT64
- EUI-48
> Stateless autoconfiguration.
?= What prefix length is standard for an IPv6 LAN?
= /64 | 64
> 64 network + 64 interface ID.
`;
