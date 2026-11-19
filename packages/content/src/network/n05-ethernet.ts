import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n05 | Ethernet, Switching and ARP | 5
@domain 2.0 Switching and Network Access
@sources Cisco ITN ch.6-7 (Data Link Layer, Ethernet Switching), ch.9 (Address Resolution)
@story
The Marketplace's old network uses a dusty hub. "Every time the till PC talks, EVERY computer hears it," complains the owner. Phemelo replaces the hub with a switch and the network suddenly feels fast. "Why?" asks the owner. Phemelo opens his notes - this chapter is the answer.
@lab network:first-lan | Mission 1 - Your First LAN

=== lesson n05-1 | Ethernet Frames and MAC Addresses | 15
@analogy A MAC address is like the serial number engraved on your phone at the factory - it identifies the hardware. An IP address is like your postal address - it can change when you move.
@objectives
- Describe the Ethernet frame fields
- Distinguish unicast, broadcast and multicast MAC addresses
- Explain what MTU means
@body
**Ethernet (IEEE 802.3)** is the Layer 1 + Layer 2 technology of almost every wired LAN.

**Ethernet II frame:** Preamble (sync) -> **Destination MAC** (6 bytes) -> **Source MAC** (6 bytes) -> **EtherType** (what's inside: 0x0800 = IPv4, 0x86DD = IPv6, 0x0806 = ARP) -> **Data** (46-1500 bytes) -> **FCS** (CRC check).

Frames smaller than 64 bytes are **runts**; bigger than 1518 bytes are **giants** (unless jumbo frames are enabled). The normal payload limit, **MTU**, is **1500 bytes**.

**MAC address types:**
- **Unicast** - one specific NIC, e.g. 00D0.97A3.4F21
- **Broadcast** - **FFFF.FFFF.FFFF** - every device on the LAN (used by ARP and DHCP Discover)
- **Multicast** - starts with 01-00-5E (IPv4) or 33-33 (IPv6) - a group of devices

**Duplex:** **half-duplex** (one direction at a time, collisions possible - hubs, Wi-Fi) vs **full-duplex** (send and receive simultaneously, no collisions - switch ports). Modern switches use **autonegotiation** for speed and duplex.
@terms
- Ethernet :: IEEE 802.3 - the standard for wired LANs
- MAC address :: 48-bit Layer 2 hardware address, burned into the NIC
- Broadcast MAC :: FFFF.FFFF.FFFF - delivered to every device in the broadcast domain
- EtherType :: Frame field identifying the payload: 0x0800 IPv4, 0x86DD IPv6, 0x0806 ARP
- MTU :: Maximum Transmission Unit - largest payload, 1500 bytes for Ethernet
@pro
- "The Ethernet MTU is 1500 bytes; frames under 64 bytes are runts and are discarded."
@quiz
? What is the Ethernet broadcast MAC address?
- 0000.0000.0000
+ FFFF.FFFF.FFFF
- 0100.5E00.0001
- 3333.0000.0001
> All ones = broadcast.
? EtherType 0x0806 means the frame carries...
- IPv4
- IPv6
+ ARP
- VLAN tag
> 0x0800 IPv4, 0x86DD IPv6, 0x0806 ARP, 0x8100 802.1Q tag.
?= What is the standard Ethernet MTU in bytes?
= 1500
> 1500 bytes of payload per frame.

=== lesson n05-2 | How a Switch Thinks: Learn, Flood, Forward, Filter | 20
@analogy A switch is a receptionist with a notebook. When someone walks in from door 3, she writes "Thabo is behind door 3". When a letter for Thabo arrives, she sends it only through door 3. If she has never seen the name, she shouts through every door except the one it came from.
@objectives
- Explain how a switch builds its MAC address table
- Describe flooding, forwarding and filtering
- Compare collision domains and broadcast domains
@body
A switch makes decisions using the **MAC address table** (also called the CAM table).

1. **Learn:** for every frame that arrives, the switch records **source MAC -> incoming port** (and VLAN).
2. **Forward:** if the **destination MAC** is in the table, send the frame out that one port only.
3. **Flood:** if the destination is unknown, a broadcast or a multicast - send it out **every port except the one it came in on** (in the same VLAN).
4. **Filter:** if the destination is on the same port it came in on, drop it.

Entries age out after **300 seconds** of silence by default. View the table with [[show mac address-table]].

**Switching methods:** **store-and-forward** (receive the whole frame, check the FCS, then forward - Cisco default, catches errors) vs **cut-through** (start forwarding after reading the destination MAC - lower latency).

**Domains:**
- **Collision domain** = where frames can collide. Every **switch port** is its own collision domain (and full-duplex removes collisions). A hub is one big collision domain.
- **Broadcast domain** = where a broadcast reaches. A switch forwards broadcasts everywhere, so by default **all ports of a switch are ONE broadcast domain**. **Routers (and VLANs) break up broadcast domains.**
@terms
- MAC address table :: Switch table mapping MAC addresses to ports (CAM table)
- Flooding :: Sending a frame out all ports except the incoming one
- Store-and-forward :: Receive the whole frame and check the FCS before forwarding
- Collision domain :: Segment where simultaneous transmissions collide - one per switch port
- Broadcast domain :: Area a broadcast reaches - bounded by routers and VLANs
@pro
- "A switch learns from SOURCE MACs and forwards based on DESTINATION MACs."
- "Each switch port is a separate collision domain, but by default the whole switch is one broadcast domain."
@interview A switch just booted. PC-A sends a frame to PC-B. What happens? :: The MAC table is empty, so the switch learns PC-A's MAC on its incoming port, then floods the frame out every other port in that VLAN because PC-B is unknown. When PC-B replies, the switch learns PC-B's port and can forward directly from then on.
@quiz
? A switch receives a frame whose destination MAC is NOT in its table. What does it do?
- Drops it
+ Floods it out all ports except the incoming one
- Sends it to the router
- Sends it back to the sender
> Unknown unicast frames are flooded.
? How many broadcast domains does a single 24-port switch (one VLAN) have?
+ 1
- 2
- 12
- 24
> One VLAN = one broadcast domain. It has 24 collision domains.
? Which address does a switch LEARN from?
+ The source MAC
- The destination MAC
- The source IP
- The destination IP
> Learning uses the source address; forwarding uses the destination.

=== lesson n05-3 | ARP - Finding the MAC for an IP | 15
@analogy ARP is standing in a crowded hall and shouting: "Who is 192.168.1.1? Please tell 192.168.1.10!" Only the person with that name answers, and you write their face (MAC) in your notebook so you don't have to shout again.
@objectives
- Explain the ARP request and reply
- Explain why PCs ARP for the default gateway for remote destinations
- Recognise ARP-related security risks
@body
To send a frame, a host needs the destination **MAC**. It knows the IP. **ARP (Address Resolution Protocol)** bridges Layer 3 and Layer 2:

1. **ARP request** - broadcast (FFFF.FFFF.FFFF): "Who has 192.168.1.1? Tell 192.168.1.10"
2. **ARP reply** - unicast from the owner: "192.168.1.1 is at 00D0.1A2B.0101"
3. The result is cached in the **ARP table** for a few minutes. Windows: [[arp -a]]; Cisco: [[show ip arp]]; Linux: [[ip neigh]].

**Local or remote?** The host compares the destination IP with its own IP and mask:
- **Same subnet** -> ARP for the destination itself.
- **Different subnet** -> ARP for the **default gateway** and send the frame there.

That's why a missing or wrong default gateway breaks access to every remote network while local pings still work.

The first ping often loses one packet ("Request timed out." then replies) - that's the ARP lookup happening.

**Security:** ARP has no authentication. An attacker can send fake ARP replies (**ARP spoofing / poisoning**) to become a man-in-the-middle. **Dynamic ARP Inspection (DAI)** on switches stops this (Chapter 16). IPv6 replaces ARP with **Neighbor Discovery (NDP)**.
@terms
- ARP :: Address Resolution Protocol - maps a known IPv4 address to a MAC address
- ARP request :: Broadcast asking who owns an IP address
- ARP table :: Cache of IP-to-MAC mappings (arp -a, show ip arp)
- ARP spoofing :: Sending fake ARP replies to intercept traffic
- Default gateway :: The router a host sends traffic to when the destination is on another network
@pro
- "For a remote destination, the host ARPs for its default gateway, not for the remote host."
@quiz
? ARP requests are sent as...
- unicast
+ broadcast
- multicast
- anycast
> "Who has this IP?" must reach everyone on the LAN.
? PC 10.1.1.5/24 wants to reach 8.8.8.8. Whose MAC does it ARP for?
- 8.8.8.8
+ Its default gateway
- The DNS server
- The switch
> 8.8.8.8 is remote, so the frame goes to the gateway.
? Which feature protects against ARP spoofing on Cisco switches?
- PortFast
+ Dynamic ARP Inspection
- CDP
- HSRP
> DAI validates ARP packets against the DHCP snooping binding table.

=== boss
? Which statement about switches is TRUE?
- They forward broadcasts only to the router
+ They learn source MAC addresses and forward based on destination MAC addresses
- They separate broadcast domains by default
- They use IP addresses to forward frames
> Learn source, forward destination; one broadcast domain per VLAN.
? What do routers do with Layer 2 broadcasts?
+ They do not forward them - routers bound broadcast domains
- They flood them to all networks
- They convert them to unicast
- They send them to the ISP
> Routers separate broadcast domains.
? Which Windows command shows the ARP cache?
- ipconfig /all
+ arp -a
- netstat -r
- tracert
> arp -a lists IP-to-MAC mappings.
? Frames smaller than 64 bytes are called...
+ runts
- giants
- jumbos
- jabbers
> Runts are usually the result of collisions.
? A PC can ping hosts on its own LAN but not the internet. The most likely cause is...
- a bad cable
+ a missing or wrong default gateway
- a duplex mismatch
- the switch MAC table is full
> Local works (Layer 1-2 fine); remote fails = gateway problem.
`;
