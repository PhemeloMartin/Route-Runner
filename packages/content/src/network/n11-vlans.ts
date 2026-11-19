import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n11 | VLANs, Trunks and Inter-VLAN Routing | 11
@domain 2.0 Switching and Network Access
@sources ComNet Chapter 8.1.1 (SSH VLAN); Cisco SRWE ch.3-4; CCNA v2.0 topics: VLANs, trunks, SVIs
@story
The clinic next to the Marketplace wants patient records separated from the public Wi-Fi - but they only have ONE switch. "Buy two switches?" suggests the owner. Phemelo shakes his head: "No. One switch, several virtual switches inside it. VLANs."
@lab network:vlans | Mission 6 - Separate Departments with VLANs
@lab network:router-on-a-stick | Mission 7 - Router-on-a-Stick

=== lesson n11-1 | VLANs - Many Switches Inside One | 25
@analogy A VLAN is like painting the ports of a switch different colours. Red ports can only talk to red ports, blue to blue - as if they were on completely separate switches. To get between colours, you need a router.
@objectives
- Explain what a VLAN is and why we use them
- Create VLANs and assign access ports
- Verify with show vlan brief
@body
A **VLAN (Virtual LAN)** splits one physical switch into multiple **logical** switches. Each VLAN is its own **broadcast domain** and usually its own **IP subnet**.

**Why:** security (Finance can't see Guest), smaller broadcast domains (performance), and flexibility (group people by job, not by floor).

**VLAN types:** **Data/user VLANs**; **Voice VLAN** for IP phones (QoS); **Management VLAN** for switch SVIs; **Native VLAN** (untagged on trunks); **Default VLAN 1** (all ports start here - best practice is to move everything off VLAN 1).

Normal-range VLANs are **1-1005** (stored in the vlan.dat file in flash - which is why VLANs survive even if you erase the startup-config!). Extended range is 1006-4094.

**Configuration:**
~~~
vlan 10
 name SALES
vlan 20
 name FINANCE
interface range fa0/1 - 12
 switchport mode access
 switchport access vlan 10
~~~
If you assign a port to a VLAN that doesn't exist, IOS creates it ("% Access VLAN does not exist. Creating vlan 20").

**Verify:** [[show vlan brief]] lists each VLAN and its access ports. If you **delete a VLAN**, its ports go inactive - they don't fall back to VLAN 1.
@terms
- VLAN :: Virtual LAN - a logical broadcast domain on a switch
- Access port :: Switch port belonging to exactly one VLAN, for end devices
- Voice VLAN :: Separate VLAN for IP phones on the same access port
- Native VLAN :: The VLAN whose traffic crosses a trunk untagged (default VLAN 1)
- vlan.dat :: File in flash that stores the VLAN database
@pro
- "Each VLAN is a separate broadcast domain and normally maps to its own subnet."
- "Best practice is to move user ports and management off VLAN 1."
@quiz
? Two PCs in different VLANs on the same switch try to ping each other with no router. What happens?
- It works because they share a switch
+ It fails - VLANs are separate broadcast domains
- It works only if they're in the same subnet
- The switch routes it automatically
> Inter-VLAN traffic needs a Layer 3 device.
? Which command shows which access ports belong to which VLAN?
- show interfaces trunk
+ show vlan brief
- show ip route
- show mac address-table count
> show vlan brief.
? A VLAN is deleted. What happens to its access ports?
- They move to VLAN 1
+ They become inactive until assigned to an existing VLAN
- They become trunks
- They shut down permanently
> Classic exam trap.

=== lesson n11-2 | Trunks and 802.1Q Tagging | 25
@analogy A trunk is a highway between two buildings carrying traffic for every department. Each car (frame) gets a coloured sticker (VLAN tag) at the on-ramp so the other side knows which department it belongs to.
@objectives
- Explain 802.1Q tags and the native VLAN
- Configure and verify trunks
- Explain DTP and why to disable it
@body
A **trunk** carries frames for **many VLANs** over one link - between switches, or from a switch to a router or server.

**802.1Q** inserts a **4-byte tag** into the Ethernet frame containing the **12-bit VLAN ID** (so up to 4094 VLANs) and a 3-bit priority (CoS) for QoS. The receiving switch reads the tag, removes it, and forwards the frame inside the right VLAN.

**Native VLAN:** frames in the native VLAN cross the trunk **untagged**. Both ends must agree, otherwise traffic leaks between VLANs (CDP reports "native VLAN mismatch"). Security best practice: change the native VLAN to an unused one (e.g. 999).

**Configuration:**
~~~
interface g0/1
 switchport mode trunk
 switchport trunk native vlan 999
 switchport trunk allowed vlan 10,20,99
 switchport nonegotiate
~~~
**DTP (Dynamic Trunking Protocol)** is Cisco's auto-negotiation: "dynamic auto" + "dynamic auto" = access; "dynamic auto" + "trunk" = trunk. Because attackers can abuse DTP to form a trunk (VLAN hopping), **hard-code** trunks and access ports and add [[switchport nonegotiate]].

**Verify:** [[show interfaces trunk]] - mode, native VLAN, allowed VLANs and VLANs actually forwarding.
@terms
- Trunk :: Link carrying multiple VLANs, using 802.1Q tags
- 802.1Q :: IEEE standard that inserts a 4-byte VLAN tag into Ethernet frames
- VLAN ID :: 12-bit field in the tag - values 1 to 4094
- DTP :: Dynamic Trunking Protocol - Cisco trunk negotiation; disable with nonegotiate
- Native VLAN mismatch :: Trunk ends disagree on the untagged VLAN - traffic leaks between VLANs
@pro
- "I hard-code trunks, prune the allowed VLAN list and set an unused native VLAN."
@quiz
? How big is the 802.1Q tag?
- 2 bytes
+ 4 bytes
- 8 bytes
- 12 bytes
> 4 bytes, containing a 12-bit VLAN ID.
? Which VLAN's traffic is sent UNTAGGED on an 802.1Q trunk?
- VLAN 1005
+ The native VLAN
- The voice VLAN
- The management VLAN
> Native = untagged; default is VLAN 1.
? Two switch ports are both "dynamic auto". What is the result?
+ An access link
- A trunk
- An EtherChannel
- Err-disabled ports
> Both wait for the other to ask - nobody asks.
?= Which command lists active trunks and their allowed VLANs?
= show interfaces trunk | sh int trunk | show interface trunk
> show interfaces trunk.

=== lesson n11-3 | Inter-VLAN Routing: Router-on-a-Stick and Layer 3 Switches | 25
@analogy Router-on-a-stick is one door between two rooms that everyone queues to use. A Layer 3 switch puts a door in every wall - much faster traffic between departments.
@objectives
- Configure router-on-a-stick with 802.1Q sub-interfaces
- Configure inter-VLAN routing with SVIs on a multilayer switch
- Troubleshoot common inter-VLAN mistakes
@body
**Router-on-a-stick:** one physical router port trunks to the switch; a **sub-interface** per VLAN acts as each VLAN's gateway.
~~~
interface g0/0/0
 no shutdown
interface g0/0/0.10
 encapsulation dot1Q 10
 ip address 192.168.10.1 255.255.255.0
interface g0/0/0.20
 encapsulation dot1Q 20
 ip address 192.168.20.1 255.255.255.0
~~~
The switch port facing the router must be a **trunk**. Cheap and simple, but all inter-VLAN traffic shares one link - a bottleneck.

**Layer 3 (multilayer) switch with SVIs** - the enterprise way:
~~~
ip routing
interface vlan 10
 ip address 192.168.10.1 255.255.255.0
interface vlan 20
 ip address 192.168.20.1 255.255.255.0
~~~
Routing happens in hardware at wire speed. An SVI comes **up/up** only if its VLAN exists and at least one port in that VLAN is up. A multilayer switch can also have **routed ports** ([[no switchport]]) for uplinks to routers.

**Troubleshooting checklist:** physical router port shut down? switch port not a trunk? wrong VLAN in [[encapsulation dot1Q]]? VLAN not allowed on the trunk? PC gateway wrong? [[ip routing]] missing on the L3 switch? SVI down because the VLAN has no active ports?
@terms
- Router-on-a-stick :: Inter-VLAN routing using 802.1Q sub-interfaces on one router port
- Sub-interface :: Logical interface on a physical port, e.g. G0/0/0.10
- encapsulation dot1Q :: Command binding a sub-interface to a VLAN tag
- Multilayer switch :: Switch that can also route (ip routing + SVIs)
- Routed port :: A switch port made into a Layer 3 interface with no switchport
@pro
- "The sub-interface's encapsulation dot1Q VLAN must match the VLAN on the switch, and the switch side must be a trunk."
@interview Users in VLAN 10 can't reach VLAN 20 through router-on-a-stick, but each can ping its own gateway. What would you check? :: Since both gateways answer, the trunk and sub-interfaces are up. I'd check that the second sub-interface has the right encapsulation dot1Q VLAN and IP, that VLAN 20 is allowed on the trunk, the PCs' gateways and masks, and whether an ACL is blocking. show ip interface brief, show interfaces trunk and show ip route on the router would confirm it.
@quiz
? On router-on-a-stick, the switch port connected to the router must be...
- an access port in VLAN 1
+ a trunk
- a routed port
- shut down
> Frames for every VLAN cross it tagged.
?= Which global command enables routing on a multilayer switch?
= ip routing
> Without it, SVIs are only management interfaces.
? An SVI shows "up/down". The most likely reason?
+ No active ports exist in that VLAN
- ip routing is missing
- The native VLAN is wrong
- The router is off
> The SVI needs at least one up port in the VLAN.

=== boss
? Which command assigns a port to VLAN 30?
+ switchport access vlan 30
- vlan 30 access
- switchport trunk vlan 30
- encapsulation dot1Q 30
> Under interface config, with switchport mode access.
? What field does 802.1Q use to identify the VLAN?
+ A 12-bit VLAN ID in a 4-byte tag
- The EtherType alone
- The destination MAC
- The IP TOS byte
> 12 bits -> 4096 values (1-4094 usable).
? Which is a security best practice for trunks?
- Use VLAN 1 as native
+ Set an unused native VLAN and disable DTP
- Allow all VLANs
- Use dynamic desirable everywhere
> Prevents VLAN hopping.
? Which inter-VLAN method scales best for a large campus?
- Router-on-a-stick
- One router port per VLAN
+ Layer 3 switch with SVIs
- A hub
> Hardware routing on the switch.
?? A PC in VLAN 10 can't reach its router-on-a-stick gateway. Which could cause it? (choose two)
+ The router's physical port is shut down
+ The switch uplink is an access port in VLAN 1
- The PC has a /24 mask
- CDP is disabled
> Physical port and trunking are the classic faults.
`;
