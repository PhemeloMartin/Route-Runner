import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n01 | Exploring the Network | 1
@domain 1.0 Network Infrastructure and Connectivity
@sources ComNet: Chapter 1.1 & 1.2 - Exploring the Network (Cisco ITN); Cisco Press Introduction to Networks Companion Guide ch.1
@story
Mma Neo hands Phemelo a tablet showing a map of Kuruman: a school, a clinic, the Marketplace, a few homes. "Every one of these places wants to share something - files, printers, the internet, a payment system. Your job, starting today, is to connect them. First, learn the language: what kinds of networks exist, what they're made of, and what makes one GOOD."
@lab network:first-lan | Mission 1 - Your First LAN

=== lesson n01-1 | What Is a Network? Hosts, Devices and Media | 15
@analogy A network is a postal system. Houses are end devices (they send and receive letters), post offices and sorting centres are intermediary devices (switches and routers), and roads/trucks are the media (cables and Wi-Fi).
@objectives
- Define end devices, intermediary devices and media
- Distinguish clients from servers and peer-to-peer from client-server
- Read basic topology diagrams
@body
A **network** is two or more devices connected so they can share data and resources.

**Three building blocks (Cisco calls them network components):**
1. **End devices (hosts)** - where data starts or ends: PCs, laptops, phones, servers, printers, IP cameras, smart TVs. Each has an **IP address**.
2. **Intermediary devices** - move data between hosts: **switches** (connect devices in the same LAN), **routers** (connect different networks), wireless access points, firewalls.
3. **Network media** - the path: copper cables (UTP), fiber optic, and wireless (radio waves).

**Clients and servers.** A *server* provides a service (web, email, files, DHCP). A *client* asks for it. One computer can be both. In **peer-to-peer** networks (e.g. two home PCs sharing a folder) every PC is client and server - cheap and simple, but not scalable or secure. **Client-server** networks centralise services on dedicated servers - easier to secure, back up and scale.

**Topology diagrams.** A *physical topology* shows where devices and cables really are (which room, which rack). A *logical topology* shows how data flows: IP networks, VLANs, which port connects to which. You'll draw both on your CCNA journey - and the exam shows you diagrams constantly.
@terms
- Host / end device :: A device where data originates or ends - has an IP address (PC, phone, server)
- Intermediary device :: Moves data between hosts: switch, router, access point, firewall
- Network media :: The physical path: copper, fiber or wireless
- Client :: Software or device that requests a service
- Server :: Software or device that provides a service to clients
- Peer-to-peer :: Every device is both client and server; no dedicated server
@pro
- "Switches connect hosts within a LAN; routers connect different networks."
- "A logical topology shows addressing and data flow; a physical topology shows where things really are."
@quiz
? Which is an INTERMEDIARY device?
- Laptop
- IP camera
+ Switch
- Printer
> Switches, routers, access points and firewalls forward data on behalf of end devices.
? A disadvantage of peer-to-peer networks is...
- they are expensive to set up
+ they don't scale well and have no centralised security
- they need a dedicated server
- they cannot share files
> Peer-to-peer is cheap and simple but becomes chaotic and insecure beyond a handful of devices.
? Which diagram shows IP addressing and how data flows between networks?
+ Logical topology
- Physical topology
- Wiring diagram
- Floor plan
> Logical = addressing and flow. Physical = locations and cables.

=== lesson n01-2 | LANs, WANs and the Internet | 15
@analogy A LAN is the roads inside your own estate - you own and control them. A WAN is the national highway you pay to use (owned by a telco). The internet is the whole global road network made of thousands of connected highways.
@objectives
- Compare LAN and WAN
- Describe how homes and businesses connect to the internet
- Name intranet, extranet and the internet
@body
**LAN (Local Area Network):** covers a small area (a home, office, campus). Owned and managed by one organisation. High speed (1-10 Gbps+), cheap per port.

**WAN (Wide Area Network):** connects LANs across large distances (Kuruman to Kimberley). Usually leased from a service provider (e.g. Telkom, Openserve, Liquid). Slower and more expensive per Mbps.

Other names you'll meet: **WLAN** (wireless LAN), **MAN** (metropolitan), **SAN** (storage area network in a data centre), **PAN** (personal - Bluetooth).

**The internet** is a worldwide collection of interconnected networks (*internetwork*). No single owner - organisations like IETF, ICANN and IANA coordinate standards and addresses.

**Intranet vs extranet:** an *intranet* is a private network for an organisation's own staff; an *extranet* gives partners/suppliers secure access to parts of it.

**Internet connections in South Africa:** home users use **fibre (FTTH)**, **LTE/5G**, satellite (e.g. Starlink in rural areas), or legacy **DSL**. Businesses add **dedicated leased lines**, **Metro Ethernet** and **business fibre** with SLAs (service level agreements). Rural areas like the Northern Cape often rely on fixed-wireless and LTE - one reason network engineers are needed everywhere.
@terms
- LAN :: Local Area Network - small area, owned by one organisation, high speed
- WAN :: Wide Area Network - connects LANs over long distances, usually leased from a provider
- Internet :: The global network of interconnected networks
- Intranet :: A private network used only inside an organisation
- Extranet :: Controlled access to an organisation's network for outside partners
- ISP :: Internet Service Provider - sells internet connectivity
@pro
- "LANs are owned and administered by the organisation; WAN links are typically leased from a service provider."
@quiz
? A company connects its Kimberley and Kuruman offices using a link leased from Telkom. This link is part of a...
- LAN
+ WAN
- PAN
- SAN
> Connecting geographically separate sites over a provider's infrastructure = WAN.
? Suppliers log in to a company portal to see stock levels. This is an example of...
- the internet
- an intranet
+ an extranet
- a peer-to-peer network
> An extranet gives trusted outside parties limited access.
?? Which are typical home internet access technologies? (choose all)
+ Fibre to the home
+ LTE / 5G
+ Satellite
- Metro Ethernet with an SLA
> Metro Ethernet with SLAs is a business-grade WAN service.

=== lesson n01-3 | What Makes a Network Reliable and Secure | 15
@analogy A good network is like a good taxi rank: if one road is closed there's another route (fault tolerance), more taxis can be added when it's busy (scalability), ambulances get priority (QoS), and only paying passengers get in (security).
@objectives
- Describe the four characteristics of a reliable network
- Explain converged networks and QoS
- List network trends: BYOD, cloud, IoT, video
@body
Cisco describes four characteristics of a reliable network architecture:

1. **Fault tolerance** - limits the impact of a failure and recovers quickly, mainly through **redundancy** (multiple paths). The internet uses *packet switching*: data is split into packets that can take different routes if a link fails.
2. **Scalability** - can grow (more users, more sites) without redesigning everything. Built on standards and hierarchical design.
3. **Quality of Service (QoS)** - prioritises time-sensitive traffic. A voice call or video meeting suffers from delay and jitter; an email doesn't care. QoS queues voice first.
4. **Security** - protects **confidentiality, integrity and availability (CIA)** of data and the network itself.

**Converged networks** carry voice, video and data on ONE infrastructure (instead of separate phone and data networks). That's why QoS matters.

**Trends:** BYOD (Bring Your Own Device), online collaboration, video everywhere, cloud computing, IoT (Internet of Things - sensors, smart meters), and powerline/wireless broadband. Each one increases the need for security and good design.
@terms
- Fault tolerance :: The network keeps working (or recovers fast) when something fails - usually via redundancy
- Scalability :: The network can grow without a redesign
- QoS :: Quality of Service - prioritising sensitive traffic like voice and video
- Converged network :: One network carrying voice, video and data
- CIA triad :: Confidentiality, Integrity, Availability - the three goals of security
- BYOD :: Bring Your Own Device - staff use personal devices on the network
@pro
- "Redundant paths give fault tolerance; QoS protects latency-sensitive traffic on converged networks."
@interview A hospital asks why they should pay for a second internet link. How do you explain it? :: It provides fault tolerance. If the primary link or its router fails, traffic fails over to the second link, so systems like patient records and telemedicine remain AVAILABLE - availability is one leg of the CIA triad. The cost of downtime in a hospital is far higher than the cost of the link.
@quiz
? Which characteristic is achieved mainly through redundant links and devices?
+ Fault tolerance
- QoS
- Scalability
- Confidentiality
> Redundancy means an alternative path exists when one fails.
? Why does a converged network need QoS?
- To encrypt emails
+ Voice and video are sensitive to delay and jitter, so they must be prioritised
- To assign IP addresses
- To block viruses
> Data like email tolerates delay; real-time voice/video doesn't.
? Which security goal is violated if an attacker CHANGES bank records?
- Confidentiality
+ Integrity
- Availability
- Scalability
> Integrity = data is accurate and unaltered.

=== boss
? A small office has 6 PCs that share files directly with each other and no server. What type of network is this?
+ Peer-to-peer
- Client-server
- WAN
- SAN
> No dedicated server, every PC both shares and requests resources.
? Which device connects two DIFFERENT IP networks?
- Hub
- Switch
+ Router
- Access point
> Routers forward packets between networks; switches forward frames within a LAN.
? A DDoS attack takes the company website offline. Which part of the CIA triad was attacked?
- Confidentiality
- Integrity
+ Availability
- Authenticity
> Denial of service attacks availability.
?? Which are characteristics of a reliable network according to Cisco? (choose all)
+ Fault tolerance
+ Scalability
+ Quality of Service
+ Security
- Peer-to-peer sharing
> The four pillars: fault tolerance, scalability, QoS and security.
? Data is broken into packets that can take different paths across the internet. This is called...
- circuit switching
+ packet switching
- multiplexing
- QoS
> Packet switching is what gives the internet its resilience.
`;
