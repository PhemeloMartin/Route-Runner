import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n12 | Spanning Tree, EtherChannel and Discovery | 12
@domain 2.0 Switching and Network Access
@sources CCNA-CCNP-lab-implement-etherchannel.pdf; etherchannel.pdf; CCNA v2.0 topics: Rapid PVST+, LACP, CDP/LLDP
@story
To avoid a single point of failure, a contractor connected the two core switches with TWO cables. Five minutes later the whole office froze, all link lights flashing like a disco. "Broadcast storm," sighs Mma Neo. "Redundancy without Spanning Tree is a weapon pointed at yourself."
@lab network:stp-etherchannel | Mission 12 - Redundancy Without Loops

=== lesson n12-1 | Why Loops Kill Networks and How STP Prevents Them | 25
@analogy Spanning Tree is a traffic officer who sees two roads between the same towns and puts a "road closed" sign on one of them. If the open road is ever blocked, he removes the sign. One path at a time, never a loop.
@objectives
- Explain broadcast storms and MAC table instability
- Describe root bridge election and port roles
- Influence the root bridge with priority
@body
Ethernet frames have **no TTL**. In a switching loop a broadcast circulates forever and multiplies: a **broadcast storm** that consumes 100% of bandwidth and CPU. MAC tables flap as the same MAC appears on different ports.

**STP (Spanning Tree Protocol, IEEE 802.1D)** builds a loop-free tree by blocking redundant ports:
1. **Elect the root bridge** - the switch with the **lowest Bridge ID** = priority (default **32768** + VLAN ID) then lowest MAC.
2. Every other switch picks one **root port** - its best (lowest-cost) path to the root.
3. Each segment gets one **designated port** - the side closest to the root.
4. Everything else becomes **alternate/blocking**.

**Port costs:** 10 Mbps = 100, 100 Mbps (FastEthernet) = **19**, 1 Gbps = **4**, 10 Gbps = 2.

**Don't leave the root to chance** - by default the switch with the oldest (lowest) MAC wins, often a dusty old access switch. Set it:
[[spanning-tree vlan 1 root primary]] or [[spanning-tree vlan 1 priority 4096]] (multiples of 4096).

**Versions:** **PVST+** (Cisco, one tree per VLAN), **Rapid PVST+** (802.1w per VLAN - converges in seconds instead of 30-50 s) - the recommended mode: [[spanning-tree mode rapid-pvst]]. CCNA v2.0 explicitly lists Rapid PVST+.

**Port states (802.1D):** blocking -> listening -> learning -> forwarding (15 s + 15 s). RSTP simplifies to discarding, learning, forwarding; port roles add **alternate** and **backup**.
@terms
- Broadcast storm :: Broadcasts looping endlessly and multiplying in a switching loop
- STP :: Spanning Tree Protocol - blocks redundant links to prevent Layer 2 loops
- Root bridge :: The switch with the lowest bridge ID; the centre of the spanning tree
- Bridge ID :: Priority (default 32768 + VLAN) followed by the switch MAC
- Root port :: A switch's best port towards the root bridge
- Designated port :: The forwarding port on a segment closest to the root
- Rapid PVST+ :: Cisco's per-VLAN Rapid STP (802.1w) - fast convergence
@pro
- "I always configure the root bridge deliberately - the default election picks the lowest MAC, often the oldest switch."
@quiz
? Which switch becomes the STP root bridge?
- The one with the highest MAC
+ The one with the lowest bridge ID (priority, then MAC)
- The first one powered on
- The one with the most ports
> Lowest wins.
?= What is the default STP bridge priority (before adding the VLAN ID)?
= 32768
> Configurable in steps of 4096.
?= What is the STP cost of a 1 Gbps link?
= 4
> 100 Mbps = 19, 1 Gbps = 4.
? Why do Layer 2 loops cause broadcast storms?
+ Ethernet frames have no TTL, so they loop forever
- Switches drop broadcasts
- Routers send too many broadcasts
- ARP is disabled
> Unlike IP packets, frames never expire.

=== lesson n12-2 | PortFast, BPDU Guard and EtherChannel | 25
@analogy EtherChannel is joining four garden hoses into one fat hose: more water, and if one hose kinks the water keeps flowing through the others. STP sees the bundle as ONE hose, so nothing gets blocked.
@objectives
- Configure PortFast and BPDU Guard on edge ports
- Configure LACP EtherChannel and verify it
- Compare LACP, PAgP and static channels
@body
**PortFast** - end-device ports skip listening/learning and go straight to forwarding (PCs get DHCP faster). Only for ports facing hosts!
**BPDU Guard** - if a PortFast port ever receives a BPDU (someone plugged in a switch), it is **err-disabled**. Protects against accidental loops and rogue switches.
~~~
interface range fa0/1 - 24
 spanning-tree portfast
 spanning-tree bpduguard enable
~~~

**EtherChannel** bundles 2-8 parallel links into one logical **Port-channel**: more bandwidth, redundancy, and STP treats it as a single link (nothing blocked).

| Protocol | Modes | Forms a channel when |
|---|---|---|
| **LACP** (802.3ad, open) | active / passive | active+active, active+passive |
| **PAgP** (Cisco) | desirable / auto | desirable+desirable, desirable+auto |
| Static | on | on+on (no negotiation) |
~~~
interface range g0/1 - 2
 channel-group 1 mode active
interface port-channel 1
 switchport mode trunk
~~~
**All member ports must match**: speed, duplex, access/trunk mode, allowed VLANs, native VLAN. Verify with [[show etherchannel summary]] - look for **SU** (Layer 2, in use) and **P** (bundled) flags.

**Load balancing** is per flow (hash of MACs/IPs/ports), so one single download won't exceed one link's speed.
@terms
- PortFast :: Edge ports go straight to forwarding - only for host-facing ports
- BPDU Guard :: Err-disables a PortFast port that receives a BPDU
- EtherChannel :: Several physical links bundled into one logical Port-channel
- LACP :: Link Aggregation Control Protocol (IEEE 802.3ad) - active/passive modes
- PAgP :: Cisco's Port Aggregation Protocol - desirable/auto modes
- Err-disabled :: A port shut down by the switch due to a violation
@pro
- "LACP needs at least one side in active mode - passive plus passive never forms a channel."
@quiz
? Which LACP mode combination forms an EtherChannel?
+ active / passive
- passive / passive
- auto / auto
- on / active
> At least one active side.
? A user plugs a small switch into a port with BPDU Guard. What happens?
- The switch becomes the root
+ The port is err-disabled
- The port becomes a trunk
- Nothing
> BPDU received on a guarded port.
? Which must MATCH on all EtherChannel member ports?
+ Speed, duplex, VLAN/trunk settings
- Port descriptions
- MAC addresses
- Physical cable colour
> Mismatches stop ports from bundling.

=== lesson n12-3 | CDP, LLDP and Layer 2 Diagnostic Tools | 15
@analogy CDP and LLDP are name tags neighbours wear: "Hi, I'm R1, model ISR4331, plugged into your port Gi0/1." Great for drawing a map of a network you've never seen - and a gift to attackers if you leave them on everywhere.
@objectives
- Use CDP and LLDP to discover neighbours
- Know when to disable them
- Use show commands to diagnose Layer 2
@body
**CDP (Cisco Discovery Protocol)** - Cisco-only, enabled by default, Layer 2. **LLDP (802.1AB)** - the open standard equivalent, disabled by default on Cisco ([[lldp run]]).

- [[show cdp neighbors]] - neighbour name, local port, platform, remote port
- [[show cdp neighbors detail]] - adds the neighbour's **IP address** and IOS version - perfect when you inherit an undocumented network.

**Security:** CDP/LLDP leak device models, IOS versions and IPs. Disable on edge/user ports and internet-facing ports: [[no cdp enable]] (per interface) or [[no cdp run]] (global).

**Layer 2 diagnostic toolkit (CCNA v2.0 "diagnostic tools"):**
- [[show interfaces status]] / [[show ip interface brief]] - up/down, err-disabled
- [[show mac address-table]] - which MAC is on which port and VLAN
- [[show vlan brief]], [[show interfaces trunk]]
- [[show spanning-tree]] - root, port roles and states
- [[show etherchannel summary]]
- [[show port-security]] - violations
@terms
- CDP :: Cisco Discovery Protocol - Cisco-proprietary neighbour discovery, on by default
- LLDP :: Link Layer Discovery Protocol (802.1AB) - vendor-neutral neighbour discovery
- show cdp neighbors detail :: Reveals neighbours' IP addresses and software versions
@pro
- "I use show cdp neighbors detail to map an undocumented network, then disable CDP on user-facing ports."
@quiz
? Which command shows a neighbour's IP address?
- show cdp neighbors
+ show cdp neighbors detail
- show ip arp
- show interfaces
> The detail version includes management addresses.
? Which discovery protocol is vendor-neutral?
- CDP
+ LLDP
- PAgP
- DTP
> LLDP is IEEE 802.1AB.
? Why disable CDP on internet-facing interfaces?
+ It leaks device and IOS information to attackers
- It slows down routing
- It conflicts with OSPF
- It uses too much power
> Information disclosure.

=== boss
? Which mode does Cisco recommend for fast STP convergence?
+ Rapid PVST+
- PVST+
- MST only
- STP disabled
> spanning-tree mode rapid-pvst.
? How do you guarantee SW1 becomes root for VLAN 10?
+ spanning-tree vlan 10 root primary
- spanning-tree portfast
- spanning-tree vlan 10 priority 61440
- no spanning-tree vlan 10
> Lower priority = more likely root; root primary sets it for you.
? Which EtherChannel modes belong to PAgP?
- active / passive
+ desirable / auto
- on / off
- trunk / access
> PAgP is Cisco proprietary.
? PortFast should be enabled on...
+ access ports connected to end devices
- trunk ports between switches
- all ports
- router uplinks
> Never on ports that could create a loop.
? In show etherchannel summary, the flag "P" on a member port means...
+ bundled in the port-channel
- port is down
- suspended
- standalone
> SU on the Po + P on members = healthy.
`;
