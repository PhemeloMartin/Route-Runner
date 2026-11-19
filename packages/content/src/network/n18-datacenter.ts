import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n18 | Servers, Data Centres and Virtualization | 18
@domain 1.0 Network Infrastructure and Connectivity
@sources Operating Systems & Server Management: Windows Server 2012 ebook, AZ-800 Mod 1-2, Ubuntu Server topics, Client-Server Computing (Yadav & Singh); Virtualization_Footprint_Why_Re_Invest.pdf; Big Data: Virtualization for Big Data
@story
The Marketplace's "server" is a desktop PC under the counter, next to the kettle. When it overheated during a heatwave, the whole business stopped. The owner finally agrees: proper servers, a proper rack, a UPS for load-shedding - and virtualization, so one powerful machine can do the work of five.
@lab rack:web-cluster | Data Centre: build a rack to best practice
@lab vm:vm-manager | Server Room: VM Manager

=== lesson n18-1 | What Makes a Server a Server | 20
@analogy A desktop PC is a family car. A server is a delivery truck: built to run 24/7, carry heavy loads, have spare parts you can swap while driving (hot-swap) and a second engine (redundant PSU).
@objectives
- Describe server hardware features and form factors
- Explain RAID levels and why they matter
- Name common server roles
@body
**Server hardware** is built for **reliability, availability and serviceability (RAS)**:
- **Redundant PSUs** fed from two power circuits (A and B feeds)
- **ECC RAM** - detects and corrects memory bit errors
- **Hot-swap** drives, fans and PSUs - replace without shutting down
- **Out-of-band management** - Dell iDRAC, HPE iLO, Cisco CIMC: a separate network port to power-cycle and see the console even if the OS is dead
- Multiple NICs, often bonded (teaming/LACP) for bandwidth and redundancy

**Form factors:** tower, **rack** (measured in **U** = 1.75 inches: 1U, 2U, 4U), **blade** (many thin servers sharing a chassis).

**RAID** (from your Big Data and OS modules):
| Level | How | Survives | Usable space |
|---|---|---|---|
| RAID 0 | Striping | **no failures** | 100% (fast, risky) |
| RAID 1 | Mirroring | 1 disk | 50% |
| RAID 5 | Striping + single parity | 1 disk | n-1 disks |
| RAID 6 | Double parity | 2 disks | n-2 disks |
| RAID 10 | Mirrors, then striped | 1 per mirror | 50% (fast + safe) |
**RAID is not a backup!** Deleting a file or ransomware affects every mirror instantly. Follow **3-2-1 backups**: 3 copies, 2 media, 1 off-site.

**Common server roles:** DNS, DHCP, Active Directory (identity - Windows Server/AZ-800), file/print, web, database, mail, monitoring, backup.
@terms
- Rack unit (U) :: 1.75-inch height unit for rack equipment; a standard rack is 42U
- ECC RAM :: Error-correcting memory used in servers
- Hot-swap :: Replace a component while the system keeps running
- Out-of-band management :: Separate management controller (iLO/iDRAC/CIMC) reachable even if the OS is down
- RAID 1 / 5 / 10 :: Mirroring / striping with parity / mirrored stripes
- 3-2-1 backup :: 3 copies, on 2 types of media, 1 off-site
@pro
- "RAID protects against disk failure, not against deletion or ransomware - that's what backups are for."
@quiz
? Which RAID level offers NO redundancy?
+ RAID 0
- RAID 1
- RAID 5
- RAID 10
> Striping only - one disk fails, everything is lost.
?= A RAID 5 array has 4 x 2 TB disks. How many TB are usable?
= 6
> n - 1 disks of capacity: 3 x 2 TB.
? Which feature lets an admin power-cycle a crashed server remotely?
- ECC RAM
+ Out-of-band management (iLO/iDRAC/CIMC)
- RAID 10
- A blanking panel
> Separate management controller.

=== lesson n18-2 | Inside the Data Centre: Racks, Power, Cooling and Topology | 25
@analogy A data centre is a hospital for computers: steady power (with generators and batteries), climate control, strict access control, and a careful floor plan so nurses (engineers) can reach every bed quickly.
@objectives
- Describe hot/cold aisle cooling and rack best practice
- Explain UPS, PDU, A/B power and generator backup
- Compare three-tier and spine-leaf data-centre topologies
@body
**Cooling:** racks face front-to-front and back-to-back, creating **cold aisles** (intake) and **hot aisles** (exhaust). **Blanking panels** close empty U spaces so hot air can't loop back to the front. Recommended inlet temperature: about **18-27 degrees C** (ASHRAE). Efficiency is measured as **PUE** = total facility power / IT power (1.0 is perfect; 1.2-1.5 is good).

**Power:** utility -> **generator** (minutes to start) -> **UPS** batteries (bridge the gap, condition power) -> **PDUs** in each rack. Servers with two PSUs connect to **A and B** PDUs on separate circuits. In South Africa, load-shedding made UPS sizing and generator fuel planning a core skill.

**Rack best practice** (build it in the 3D Data Centre): heavy gear (UPS, storage) at the **bottom**; patch panel and **top-of-rack (ToR)** switch at the top; label every cable at both ends; colour-code cables by purpose; respect the power budget per rack.

**Data-centre network topologies:**
- **Three-tier** (campus): **access** (users) -> **distribution** (policy, routing between VLANs) -> **core** (fast backbone). Small sites collapse core+distribution (**two-tier / collapsed core**).
- **Spine-leaf** (modern data centres): every **leaf** (ToR) switch connects to every **spine** switch - any server is the same number of hops from any other (predictable latency for east-west traffic between servers). Add spines for bandwidth, leaves for ports.

Other topology words from the exam: **SOHO** (small office/home office), **WAN**, on-premises vs **cloud**.
@terms
- Hot aisle / cold aisle :: Rack layout separating server intake (cold) from exhaust (hot) air
- Blanking panel :: Cover for empty rack space that prevents hot-air recirculation
- PUE :: Power Usage Effectiveness = total facility power / IT power
- PDU :: Power Distribution Unit - the power strip inside a rack
- Spine-leaf :: Data-centre topology where every leaf connects to every spine
- Three-tier architecture :: Access, distribution and core layers
- Collapsed core :: Two-tier design where core and distribution are combined
@pro
- "Spine-leaf gives predictable latency for east-west traffic because every leaf is exactly one hop from every spine."
@quiz
? Why install blanking panels in empty rack spaces?
+ To stop hot exhaust air recirculating to the cold front intake
- To make the rack heavier
- To add more ports
- To block Wi-Fi
> Airflow management.
? In a spine-leaf design, each leaf connects to...
- only one spine
+ every spine
- other leaves directly
- the internet only
> Full mesh between layers.
? Which layer of the three-tier model connects end users?
+ Access
- Distribution
- Core
- Spine
> Users plug into access switches.

=== lesson n18-3 | Virtualization: Hypervisors, VMs, Containers and Virtual Networking | 25
@analogy A hypervisor is a landlord who divides one big house into flats. Each tenant (VM) gets their own front door, kitchen and bathroom (OS, CPU, RAM) and can't see into the others - even though they share the same foundation (hardware).
@objectives
- Compare type 1 and type 2 hypervisors
- Compare VMs and containers
- Explain virtual switches and VRFs
@body
**Virtualization** runs many isolated **virtual machines** on one physical **host**. Benefits: server consolidation (fewer boxes, less power), fast provisioning, snapshots, live migration, isolation. CCNA v2.0 lists virtualization fundamentals in Domain 1.

**Hypervisors:**
- **Type 1 (bare-metal)** - runs directly on hardware: VMware **ESXi**, **Microsoft Hyper-V**, **KVM**, Proxmox, Xen. Data centres and clouds.
- **Type 2 (hosted)** - runs on top of a desktop OS: **VirtualBox**, **VMware Workstation** (you have the installer in your Linux folder!). Labs and learning.

**VMs vs containers:** a VM includes a full guest OS (GBs, boots in minutes, strong isolation). A **container** shares the host kernel and packages only the app and its libraries (MBs, starts in seconds) - Docker, Kubernetes (Cloud stream).

**Virtual networking:** inside the host, VMs connect to a **virtual switch** (vSwitch - VMware vSwitch/vDS, Hyper-V switch, Linux bridge/Open vSwitch) that behaves like a Layer 2 switch with VLAN tags; the host's physical NICs are its uplinks (usually trunks to the physical switch). Hypervisor network modes you'll test in the VM lab: **NAT, bridged, host-only, internal**.

**VRF (Virtual Routing and Forwarding)** - multiple separate routing tables on one router: network virtualization at Layer 3 (e.g. guest and corporate traffic fully separated on the same router).
@terms
- Hypervisor :: Software that creates and runs virtual machines
- Type 1 hypervisor :: Runs on bare metal - ESXi, Hyper-V, KVM
- Type 2 hypervisor :: Runs on a host OS - VirtualBox, VMware Workstation
- Container :: Isolated app package sharing the host OS kernel
- Virtual switch :: Software switch connecting VMs to each other and to physical NICs
- VRF :: Virtual Routing and Forwarding - multiple isolated routing tables on one device
- Snapshot :: Saved point-in-time state of a VM you can roll back to
@pro
- "Type 1 hypervisors run on bare metal; type 2 run on top of an existing OS like Windows."
@interview Explain the difference between a VM and a container to a manager. :: A VM is a whole virtual computer with its own operating system - strong isolation but heavier. A container packages just the application and its dependencies and shares the host's operating system kernel, so it's much lighter and starts in seconds. We use VMs to isolate whole systems and containers to deploy and scale applications quickly.
@quiz
? Which is a Type 1 hypervisor?
+ VMware ESXi
- VirtualBox
- VMware Workstation
- Docker Desktop
> ESXi installs directly on the server hardware (bare metal) - that is what Type 1 means.
? What does a container share with its host?
- Nothing
+ The OS kernel
- Its own full OS
- Its BIOS
> Containers are lighter than VMs.
? Which technology gives one router several separate routing tables?
- VLAN
+ VRF
- HSRP
- NAT
> Layer 3 virtualization.

=== boss
? Which RAID level survives TWO simultaneous disk failures?
- RAID 1
- RAID 5
+ RAID 6
- RAID 0
> Double parity.
? Where should the UPS go in a rack?
+ At the bottom
- At the top
- In the middle
- Outside the rack only
> Heaviest at the bottom for stability.
? VirtualBox on a Windows laptop is an example of a...
- Type 1 hypervisor
+ Type 2 hypervisor
- Container runtime
- VRF
> Hosted hypervisor.
? Which topology gives every server the same hop count to every other server?
- Three-tier
+ Spine-leaf
- Ring
- Star with one switch
> Leaf -> spine -> leaf.
?= A rack is 42U. Two 2U UPSs, a 4U GPU server and ten 1U servers are installed. How many U are free?
= 24
> 4 + 4 + 10 = 18 used; 42 - 18 = 24.
`;
