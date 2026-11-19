import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n13 | Routing: Static Routes and OSPF | 13
@domain 3.0 IP Routing
@sources Cisco SRWE/ENSA (routing concepts, static routing, OSPFv2); CCNA v2.0 topics: FIB decisions, IPv4/IPv6 static, single-area OSPFv2/OSPFv3
@story
Three branches - Kimberley, Kuruman and Upington - are joined by WAN links. Each router knows only its own networks. "A router without routes is like a taxi driver who knows only his own street," says Mma Neo. "Today you teach them the map - first by hand, then automatically."
@lab network:static-routing | Mission 8 - Static and Default Routes
@lab network:ospf | Mission 9 - OSPF

=== lesson n13-1 | How a Router Decides: the Routing Table | 25
@analogy The routing table is the road-sign board at an interchange. A sign that says "Kuruman, 12 Main Rd" (very specific) beats a sign that just says "North" (less specific). If two signs are equally specific, you trust the more reliable source (lower administrative distance).
@objectives
- Read show ip route output and route codes
- Apply longest-prefix match
- Use administrative distance and metric to pick the best route
@body
For every packet a router: (1) looks up the **destination IP** in its routing table, (2) picks the **best match**, (3) forwards out the exit interface towards the next hop, (4) rewrites the Layer 2 frame (new MACs, TTL - 1).

**Route sources and codes** ([[show ip route]]):
- **C** connected - networks on the router's own up/up interfaces
- **L** local - the router's own interface IP (/32)
- **S** static, **S*** static default (candidate default)
- **O** OSPF, **D** EIGRP, **R** RIP, **B** BGP

**Decision rules, in order:**
1. **Longest prefix match** - the most specific route wins. For 10.1.1.5: 10.1.1.0/24 beats 10.1.0.0/16 beats 0.0.0.0/0.
2. If two sources offer the **same prefix**, lowest **Administrative Distance (AD)** wins - how much the router trusts the source:
| Source | AD |
|---|---|
| Connected | 0 |
| Static | 1 |
| eBGP | 20 |
| EIGRP | 90 |
| **OSPF** | **110** |
| RIP | 120 |
| iBGP | 200 |
3. Same source and prefix -> lowest **metric** (OSPF cost, RIP hops); equal metrics -> load balance (ECMP).

Reading a route: **O 10.2.2.0/24 [110/2] via 10.0.12.2, 00:01:12, G0/0/1** = learned by OSPF, AD 110, metric 2, next hop 10.0.12.2, out G0/0/1.

**RIB vs FIB:** the routing table (RIB) is the control plane's view; the router installs the best routes into the **FIB** (Forwarding Information Base, used by CEF) - the data plane uses the FIB plus an adjacency table (pre-built Layer 2 headers) to forward at high speed. CCNA v2.0 asks you to interpret forwarding decisions.
@terms
- Routing table (RIB) :: All best routes known by the router (show ip route)
- Longest prefix match :: The most specific matching route is chosen
- Administrative distance :: Trustworthiness of a route source - lower is better (static 1, OSPF 110)
- Metric :: Cost of a route within one routing protocol
- FIB :: Forwarding Information Base - the CEF table used to forward packets in hardware
- Gateway of last resort :: The default route used when nothing more specific matches
@pro
- "Longest-prefix match comes first; administrative distance only breaks ties between identical prefixes from different sources."
@interview A router has 10.0.0.0/8 via OSPF and 10.1.1.0/24 via a static route. Where does a packet for 10.1.1.20 go, and why? :: It follows the static /24 route. Longest prefix match is evaluated first, and /24 is more specific than /8. Administrative distance would only matter if both routes had exactly the same prefix.
@quiz
? A router has routes 172.16.0.0/16 and 172.16.5.0/24. A packet goes to 172.16.5.9. Which route is used?
- 172.16.0.0/16
+ 172.16.5.0/24
- The default route
- Both (load balancing)
> Longest prefix wins.
?= What is OSPF's administrative distance?
= 110
> Static 1, EIGRP 90, OSPF 110, RIP 120.
? In "O 10.2.2.0/24 [110/2] via 10.0.12.2", what is 2?
- The AD
+ The OSPF metric (cost)
- The hop count to the destination
- The process ID
> [AD/metric].

=== lesson n13-2 | Static and Default Routes | 25
@analogy A static route is a hand-written direction you stick on the board yourself: "To reach Kuruman, take exit 2." It never changes - even if the road floods - until you change it.
@objectives
- Configure IPv4 and IPv6 static routes with next-hop or exit interface
- Configure a default route and a floating static route
- Know when static routing is the right choice
@body
**Syntax:** [[ip route NETWORK MASK next-hop-IP-or-exit-interface (optional-AD)]]
~~~
ip route 10.2.2.0 255.255.255.0 172.16.0.2            ! next-hop
ip route 10.3.3.0 255.255.255.0 Serial0/1/0           ! directly attached (point-to-point)
ip route 10.4.4.0 255.255.255.0 g0/0/1 10.0.0.2       ! fully specified
ip route 0.0.0.0 0.0.0.0 203.0.113.1                  ! default route
ip route 0.0.0.0 0.0.0.0 198.51.100.1 5               ! floating static backup (AD 5)
~~~
- **Default route** (0.0.0.0/0) = "everything I don't know goes to the ISP". Typical on edge routers and stub branches.
- **Floating static route** - give a backup route a higher AD than the primary (e.g. AD 5, or 115 to back up OSPF). It only appears in the table when the primary disappears.
- **Host route** - a /32 to a single device.

**IPv6 static** works the same: [[ipv6 route 2001:db8:2::/64 2001:db8:12::2]] and a default [[ipv6 route ::/0 2001:db8:12::2]]. Next hop can be a link-local address if you also give the exit interface.

**Remember the return path!** A ping needs a route there AND a route back. Half of all static-routing tickets are a missing return route.

**When to use static:** small or stub networks, default routes to the ISP, backup paths. **When not:** networks with many routers or redundant paths - use a dynamic protocol like OSPF.
@terms
- Static route :: Manually configured route
- Default route :: 0.0.0.0/0 (or ::/0) - matches everything not otherwise known
- Floating static route :: Backup static route with a higher AD than the primary route
- Stub network :: A network with only one way out
@pro
- "I put a default route on the edge router and redistribute it into OSPF with default-information originate."
@quiz
?= Write a default route to next hop 203.0.113.1.
= ip route 0.0.0.0 0.0.0.0 203.0.113.1
> 0.0.0.0/0 matches every destination.
? How do you make a static route a backup for an OSPF route to the same prefix?
- Give it AD 1
+ Give it an AD higher than 110, e.g. 115
- Use a /32 mask
- Point it to Null0
> Floating static - used only if the OSPF route disappears.
? Branch PC can ping HQ's router but not HQ's server. Static routes exist only on the branch. What's missing?
+ A route on HQ back to the branch LAN
- A default route on the PC
- OSPF on the switch
- NAT
> Traffic needs a path in both directions.

=== lesson n13-3 | OSPF - Routers That Draw Their Own Map | 30
@analogy OSPF routers are surveyors. Each one tells every neighbour about the roads it can see (link states). Soon every router has an identical map of the whole area and calculates its own shortest routes with Dijkstra's algorithm - like a GPS.
@objectives
- Explain link-state routing, neighbours, DR/BDR and cost
- Configure single-area OSPFv2 with network statements and passive interfaces
- Verify with show ip ospf neighbor and show ip route ospf
@body
**OSPF (Open Shortest Path First)** is an open-standard **link-state** protocol. Routers form **adjacencies**, flood **LSAs** (link-state advertisements) into the **LSDB**, and each runs **SPF (Dijkstra)** to compute best paths. **Area 0** is the backbone; CCNA focuses on **single-area OSPF**.

**Neighbours form when these match:** area ID, subnet and mask, **hello/dead timers** (10/40 s on Ethernet), authentication, MTU and network type. Neighbour states: Down -> Init -> 2-Way -> ExStart -> Exchange -> Loading -> **FULL**.

**Router ID** - chosen in this order: [[router-id]] command -> highest loopback IP -> highest active interface IP.

**DR/BDR** - on multi-access segments (Ethernet) a **Designated Router** and backup reduce flooding; others are DROTHER. Highest **OSPF priority** (default 1) wins, then highest router ID. Point-to-point links don't elect a DR.

**Cost** = reference bandwidth (100 Mbps) / interface bandwidth -> Fast and Gigabit Ethernet both cost **1** by default (raise the reference: [[auto-cost reference-bandwidth 10000]]). Lowest total cost wins.

**Configuration:**
~~~
router ospf 1
 router-id 1.1.1.1
 network 192.168.1.0 0.0.0.255 area 0
 network 10.0.12.0 0.0.0.3 area 0
 passive-interface g0/0/0
 default-information originate
~~~
The **network** command uses a **wildcard mask** (inverse mask: /30 -> 0.0.0.3) to choose which interfaces run OSPF. Alternative: [[ip ospf 1 area 0]] directly on the interface. **passive-interface** stops hellos on LAN ports (security + less noise) while still advertising the network.

**Verify:** [[show ip ospf neighbor]] (FULL?), [[show ip route ospf]], [[show ip protocols]], [[show ip ospf interface brief]].

**OSPFv3** is OSPF for IPv6 (CCNA v2.0): enabled per interface, e.g. [[ipv6 ospf 1 area 0]], uses link-local addresses for neighbours. Concepts are identical.
@terms
- OSPF :: Open Shortest Path First - open-standard link-state routing protocol
- LSA / LSDB :: Link-state advertisements and the database every router builds from them
- SPF (Dijkstra) :: Algorithm that computes the shortest-path tree from the LSDB
- Area 0 :: The OSPF backbone area
- Router ID :: 32-bit ID: router-id command, else highest loopback, else highest interface IP
- DR / BDR :: Designated/Backup Designated Router on multi-access networks
- Passive interface :: Advertised in OSPF but sends no hellos
- Wildcard mask :: Inverse of the subnet mask used by OSPF network statements and ACLs
- OSPFv3 :: OSPF for IPv6
@pro
- "Neighbours must agree on area, subnet, timers and authentication, otherwise they never reach FULL."
- "I make LAN interfaces passive so OSPF advertises them without sending hellos to users."
@interview Two OSPF routers on the same link aren't becoming neighbours. How do you troubleshoot? :: Confirm Layer 1-3 first: interfaces up/up and both in the same subnet with the same mask, and they can ping each other. Then compare OSPF settings with show ip ospf interface: same area, matching hello/dead timers, no passive-interface on that link, matching authentication and MTU, and unique router IDs. debug ip ospf adj shows the exact mismatch.
@quiz
?= What wildcard mask matches a /30 network in an OSPF network statement?
= 0.0.0.3
> 255.255.255.255 - 255.255.255.252.
? Which neighbour state means the LSDBs are synchronised?
- 2-Way
- ExStart
+ FULL
- Loading
> FULL = adjacency complete.
? A router has no router-id command and loopback 10.10.10.10. Its interfaces use 192.168.x.x. What is its router ID?
+ 10.10.10.10
- The highest 192.168 address
- 0.0.0.0
- 1.1.1.1
> A loopback beats physical interfaces (when no router-id is set).
? Which mismatch prevents an OSPF adjacency?
+ Different hello timers
- Different hostnames
- Different OSPF process IDs
- Different router models
> Process IDs are locally significant and may differ.

=== boss
? Which route will be preferred for 10.10.10.0/24?
+ A static route (AD 1) over an OSPF route (AD 110) for the same prefix
- The OSPF route because it's dynamic
- Whichever was learned first
- Both equally
> Same prefix -> lower AD wins.
? What does "passive-interface g0/0/0" do in OSPF?
+ Stops OSPF hellos on G0/0/0 but still advertises its network
- Removes the network from OSPF
- Shuts the interface down
- Makes it the DR
> Classic for LAN interfaces.
?= A packet for 192.168.5.77 matches 192.168.5.64/26, 192.168.5.0/24 and 0.0.0.0/0. Which prefix length is used?
= /26 | 26 | 192.168.5.64/26
> Longest match.
? On an Ethernet segment, which router becomes DR (equal priorities)?
- The lowest router ID
+ The highest router ID
- The oldest router
- The router with most interfaces
> Highest priority, then highest RID.
? What does "default-information originate" do?
+ Advertises the router's default route into OSPF
- Creates a default route to Null0
- Makes OSPF the default protocol
- Resets OSPF
> Requires a default route to exist on that router.
? OSPF neighbours stuck in INIT/EXSTART are a sign of...
- a correct, healthy adjacency
+ a mismatch (e.g. MTU or authentication) or one-way communication
- too many routes
- an IPv6 problem only
> FULL is the healthy state.
`;
