import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n02 | Cables, Fiber, Wireless and the Physical Layer | 2
@domain 1.0 Network Infrastructure and Connectivity
@sources Cisco ITN ch.4 Physical Layer; ComNet Chapter 1.2; PT-CreateTopology lab; CCNA v2.0 topic: identify physical faults
@story
The Marketplace's new office is full of boxes: switches, a router, rolls of blue cable, a bag of RJ45 plugs and a crimping tool. "Half of all network problems are Layer 1," says Mma Neo, "a loose plug, a bad crimp, the wrong cable, a cable run past a fridge motor. Learn the physical layer properly and you'll fix in five minutes what others take a day to find."
@lab cable:bench | 3D Cable Bench: crimp an RJ45 and cable the office
@lab network:cable-it | Mission 2 - Cable the Office

=== lesson n02-1 | Copper: UTP, RJ45, T568A/B, Straight vs Crossover | 25
@analogy The 8 wires in a network cable are 4 pairs of dancers twisting around each other. The twisting cancels out noise - like two people holding hands and spinning so the wind can't push them apart.
@objectives
- Explain UTP categories and why pairs are twisted
- Wire an RJ45 to T568B from memory
- Choose straight-through vs crossover vs rollover cables
- Know the 100 m copper limit and PoE basics
@body
**UTP (Unshielded Twisted Pair)** is the most common LAN cable. Four twisted pairs; the twisting cancels **EMI** (electromagnetic interference) and **crosstalk** between pairs. **STP** (shielded) adds foil for noisy environments like factories.

**Categories:** Cat5e (1 Gbps), **Cat6** (1 Gbps, 10 Gbps to ~55 m), Cat6a (10 Gbps at 100 m), Cat8 (25-40 Gbps short runs in data centres). Maximum copper Ethernet run: **100 m** (90 m permanent link + 10 m patch cords).

**RJ45 wiring - T568B** (most common in South Africa and worldwide):
1 white-orange, 2 orange, 3 white-green, 4 blue, 5 white-blue, 6 green, 7 white-brown, 8 brown.
**T568A** swaps the orange and green pairs: 1 white-green, 2 green, 3 white-orange, 4 blue, 5 white-blue, 6 orange, 7 white-brown, 8 brown.

**Cable types:**
- **Straight-through** (B-B): connects *unlike* devices - PC to switch, switch to router.
- **Crossover** (A-B): connects *like* devices - switch to switch, router to router, PC to PC, **PC to router** (both are "host-like").
- **Rollover / console** (light blue): laptop to the router/switch **console port** for first setup. Not a network cable!

Modern ports support **Auto-MDIX**, which detects and fixes the wrong cable automatically - but the CCNA still expects you to know the rule.

**PoE (Power over Ethernet)** sends power down the same cable to IP phones, access points and cameras - no power socket needed at the ceiling.

**Common physical faults (CCNA v2.0 asks you to identify these):** bad crimp (wrong colour order), untwisted pairs at the plug, cable longer than 100 m, damaged/kinked cable, EMI from motors and fluorescent lights, duplex mismatch, and a port simply being shut down.
@terms
- UTP :: Unshielded Twisted Pair - common copper LAN cable with 4 twisted pairs
- EMI :: Electromagnetic interference - electrical noise from motors, lights, power cables
- Crosstalk :: Signal from one wire pair leaking into another
- T568B :: RJ45 wiring standard: wO, O, wG, B, wB, G, wBr, Br
- Straight-through :: Same standard both ends - for unlike devices (PC-switch)
- Crossover :: T568A one end, T568B other end - for like devices (switch-switch, PC-router)
- Rollover (console) :: Cable from a PC to a Cisco console port for out-of-band setup
- Auto-MDIX :: Port feature that automatically adjusts for straight or crossover cables
- PoE :: Power over Ethernet - powering phones, APs and cameras through the data cable
@pro
- "Copper Ethernet is limited to 100 metres; beyond that we use fiber or add a switch."
- "Like devices use a crossover, unlike devices use straight-through - although Auto-MDIX hides the difference today."
@interview A new PC in a warehouse has an intermittent connection. The cable runs 120 m past the forklift charging station. What are your two suspects and fixes? :: First, distance: 120 m exceeds the 100 m limit for copper Ethernet - add a switch midway or use fiber. Second, EMI from the charging equipment - reroute the cable away from it, use shielded cable, or use fiber which is immune to EMI.
@quiz
? What is pin 1 in the T568B standard?
+ White-orange
- White-green
- Orange
- Blue
> T568B: white-orange, orange, white-green, blue, white-blue, green, white-brown, brown.
? Which cable connects a switch to another switch on older equipment without Auto-MDIX?
- Straight-through
+ Crossover
- Rollover
- Serial
> Like devices need a crossover.
? Which cable do you use to connect a PC directly to a router's GigabitEthernet port (no Auto-MDIX)?
- Straight-through
+ Crossover
- Console
- Fiber
> PCs and routers both transmit on the same pins, so they're "like" devices.
?= What is the maximum length (in metres) of a copper Ethernet segment? (number)
= 100 | 100m | 100 m
> 100 m: 90 m horizontal + 10 m patch cords.

=== lesson n02-2 | Fiber Optic Cabling | 15
@analogy Copper is shouting a message down a long pipe - it gets quieter and the neighbours' noise gets in. Fiber is flashing a torch down a mirrored tube - fast, far, and no one's noise can interfere with light.
@objectives
- Compare single-mode and multimode fiber
- Explain when fiber beats copper
- Name common connectors and SFP transceivers
@body
Fiber optic cable carries data as **pulses of light** through glass (or plastic) strands.

**Advantages over copper:** much longer distances, higher bandwidth, **immune to EMI** and lightning, more secure (hard to tap), lighter. **Disadvantages:** more expensive to terminate, more fragile, needs special skills/tools.

**Single-mode fiber (SMF):** very thin core (~9 micron), uses **laser** light, one path of light -> **long distance** (10-100+ km). Yellow jacket. Used by ISPs and between buildings/cities.
**Multimode fiber (MMF):** thicker core (50/62.5 micron), uses **LED/VCSEL** light, many paths that spread out -> **shorter distances** (up to ~550 m). Aqua or orange jacket. Used inside buildings and data centres.

**Connectors:** **LC** (small, most common on switches today), SC (square, push-pull), ST (bayonet, older). Fiber is used in **pairs** - one strand to send, one to receive (or bidirectional optics).

**SFP / SFP+ / QSFP transceivers** are small modules you plug into a switch port to choose the media (SFP for 1G, SFP+ 10G, SFP28 25G, QSFP 40/100G). This is why a switch might have "fiber ports" with nothing in them - you add the transceiver you need.

**Fiber to the home (FTTH)** - Openserve, Vumatel, Frogfoot in SA - brings fiber to your house; the ONT box converts light to Ethernet.
@terms
- Single-mode fiber :: Thin core, laser light, long distances (km) - yellow jacket
- Multimode fiber :: Thicker core, LED light, shorter distances (hundreds of m) - aqua/orange jacket
- LC connector :: Small form-factor fiber connector common on modern switches
- SFP :: Small Form-factor Pluggable transceiver that adds a fiber or copper port to a switch
- ONT :: Optical Network Terminal - converts fiber light to Ethernet at a customer site
@pro
- "Between buildings I'd use fiber - it's immune to EMI and lightning-induced surges and supports longer distances."
@quiz
? Two buildings are 3 km apart. Which medium is best?
- Cat6 UTP
- Multimode fiber
+ Single-mode fiber
- Crossover cable
> Single-mode fiber easily reaches several km; multimode is limited to hundreds of metres.
? Which is an advantage of fiber over copper?
- Cheaper to terminate
+ Immune to electromagnetic interference
- Can carry PoE
- More flexible and tougher
> Light isn't affected by EMI. Copper is cheaper and can carry PoE.
? What does an SFP module do?
+ Plugs into a switch port to provide a specific fiber or copper interface
- Encrypts fiber traffic
- Converts AC power to DC
- Assigns IP addresses
> SFPs make ports modular - choose SMF, MMF or copper as needed.

=== lesson n02-3 | Wireless Media and Physical-Layer Troubleshooting | 15
@analogy Wi-Fi is a classroom where everyone shares one teacher's attention. Only one person can talk at a time, the further away you sit the harder it is to hear, and the noisy class next door (other networks) makes it worse.
@objectives
- Describe wireless as a shared, half-duplex medium
- List the main factors that degrade wireless signals
- Apply a bottom-up troubleshooting method starting at Layer 1
@body
**Wireless** uses radio waves - no cable, but the medium is **shared** and **half-duplex** (only one device transmits at a time on a channel). Signals weaken with distance and are absorbed or reflected by walls (especially concrete, metal and water - yes, fish tanks and people!). Interference comes from neighbouring Wi-Fi networks, microwaves, Bluetooth and cordless phones. You'll study 802.11 standards in Chapter 14.

**Physical-layer troubleshooting (bottom-up):**
1. **Is it plugged in?** Look at link lights. No light = Layer 1 problem.
2. **Is the port enabled?** On Cisco: [[show ip interface brief]] - "administratively down" means someone typed [[shutdown]].
3. **Right cable?** Correct type and wiring; test with a cable tester.
4. **Within limits?** Copper under 100 m; fiber type matches the optic; no tight bends.
5. **Errors on the interface?** [[show interfaces]] shows CRC errors (bad cable/EMI), collisions and late collisions (duplex mismatch), input errors.
6. **Duplex/speed** - both sides must agree. A duplex mismatch causes slow, error-filled links that still "work".

The interface status pair tells you a lot:
- **up / up** - healthy.
- **administratively down / down** - port has been shut down - [[no shutdown]].
- **down / down** - no cable, other end off, or a Layer 1 fault.
- **up / down** - Layer 1 OK but Layer 2 problem (e.g. encapsulation mismatch on serial links, or keepalives failing).
@terms
- Half-duplex :: Only one device can send at a time (Wi-Fi, hubs)
- Full-duplex :: Both sides send and receive at the same time (switched Ethernet)
- CRC error :: A frame arrived damaged - usually a cabling or EMI problem
- Duplex mismatch :: One side full-duplex, the other half - causes late collisions and slow performance
- Administratively down :: The interface was disabled with the shutdown command
@pro
- "I troubleshoot bottom-up: link lights and cabling first, then interface status and errors, then addressing."
- "Rising CRC errors on an interface usually point to a bad cable or interference."
@quiz
? [[show ip interface brief]] shows "administratively down / down" on a router port. What is the fix?
+ Enter interface configuration and type no shutdown
- Replace the cable
- Change the IP address
- Reload the router
> Router interfaces are shut down by default. "Administratively" = someone (or the default config) disabled it.
? An interface shows many CRC errors. What is the most likely cause?
- Wrong IP address
+ A damaged cable or electromagnetic interference
- A missing default gateway
- Too many VLANs
> CRC errors mean frames arrived corrupted - a Layer 1 issue.
? Late collisions on a full-duplex switch port usually indicate...
- a routing loop
+ a duplex mismatch
- DHCP failure
- a DNS problem
> One side is half-duplex. Set both sides to auto or both to full.

=== boss
? Which cable type is used to connect to the console port of a new Cisco switch for initial configuration?
- Straight-through
- Crossover
+ Rollover (console)
- Single-mode fiber
> The light-blue rollover cable plus a terminal program like PuTTY.
? What is pin 3 in a T568A termination?
- White-green
+ White-orange
- Orange
- Blue
> T568A: wG, G, wO, B, wB, O, wBr, Br.
? Which medium is completely immune to EMI?
- Cat6 UTP
- STP
+ Fiber optic
- Coaxial
> Light in glass isn't affected by electrical noise.
?? A user's PC shows no link light. Which are sensible first checks? (choose two)
+ Is the cable firmly clicked in at both ends?
+ Is the switch port shut down or err-disabled?
- Is the DNS server reachable?
- Is the default gateway correct?
> No link light is Layer 1/2. DNS and gateway are higher layers.
? Which cable category supports 10 Gbps over the full 100 m?
- Cat5e
- Cat6
+ Cat6a
- Cat3
> Cat6 only reaches ~55 m at 10 Gbps; Cat6a does 100 m.
`;
