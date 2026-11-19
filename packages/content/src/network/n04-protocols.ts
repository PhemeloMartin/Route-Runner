import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n04 | Protocols, the OSI Model and Encapsulation | 4
@domain 1.0 Network Infrastructure and Connectivity
@sources ComNet Chapter 3 - Network Protocols & Communication (Cisco ITN); OS_and_network_security.pdf
@story
Phemelo sends a WhatsApp voice note to his cousin in Kimberley. "How does it actually GET there?" Mma Neo grins. "Ah. That question is the whole CCNA. The answer is: in layers. Each layer does one job and wraps the data like a parcel inside a parcel inside a parcel."

=== lesson n04-1 | Protocols and Standards | 15
@analogy A protocol is a set of manners for a conversation. When you phone someone you both know: say hello, take turns, say goodbye. Computers need the same rules - agreed in advance and written down as standards.
@objectives
- Define a protocol and name what it specifies
- Name the main standards organisations
@body
A **protocol** is a set of rules for communication. Protocols define:
- **Message format and encoding** (what the bits mean)
- **Message size** (how big a packet can be)
- **Timing** (flow control - don't send faster than the receiver can handle; response timeouts)
- **Delivery options**: **unicast** (one-to-one), **multicast** (one-to-a-group), **broadcast** (one-to-all)

A **protocol suite** is a group of protocols that work together - the **TCP/IP suite** runs the internet: HTTP, DNS, DHCP, TCP, UDP, IP, ICMP, ARP, Ethernet...

**Open standards** mean any vendor's device can talk to any other. Key organisations:
- **IETF** - internet standards, published as **RFCs** (e.g. RFC 1918 private addresses)
- **IEEE** - Ethernet and Wi-Fi (802.3, 802.11, 802.1Q)
- **ICANN / IANA** - IP address and domain name allocation; **AFRINIC** is Africa's regional internet registry
- **ITU, TIA/EIA** - telecommunications and cabling (T568A/B is TIA/EIA-568)
@terms
- Protocol :: An agreed set of rules for communication
- Protocol suite :: A group of protocols that work together, e.g. TCP/IP
- Unicast / multicast / broadcast :: One-to-one / one-to-a-group / one-to-all delivery
- RFC :: Request for Comments - IETF's published internet standards
- IEEE :: Standards body for Ethernet (802.3) and Wi-Fi (802.11)
- AFRINIC :: The Regional Internet Registry that allocates IP addresses in Africa
@pro
- "Open standards like IEEE 802.3 let devices from different vendors interoperate."
@quiz
? Which organisation publishes Ethernet (802.3) and Wi-Fi (802.11) standards?
- IETF
+ IEEE
- ICANN
- AFRINIC
> IEEE = Institute of Electrical and Electronics Engineers.
? A message sent to ALL devices on a LAN is a...
- unicast
- multicast
+ broadcast
- anycast
> Broadcast = one to all on the local network.
? Which body allocates IP address blocks to ISPs in Africa?
+ AFRINIC
- IEEE
- ITU
- ARIN
> The five RIRs: AFRINIC, ARIN, APNIC, LACNIC, RIPE NCC.

=== lesson n04-2 | The OSI and TCP/IP Models | 25
@analogy Sending a letter: you write it (application), choose a language (presentation), start the conversation (session), number the pages so they can be put in order (transport), write the street address (network), hand it to the local courier for the next leg (data link), and the truck drives the road (physical).
@objectives
- List the 7 OSI layers and 4 TCP/IP layers in order
- Match devices, addresses and protocols to their layer
- Explain why layered models help troubleshooting
@body
**OSI model (7 layers, top to bottom):**
| # | Layer | Job | Examples |
|---|---|---|---|
| 7 | Application | Network services for apps | HTTP, DNS, DHCP, SMTP, FTP |
| 6 | Presentation | Format, encryption, compression | TLS, JPEG, ASCII |
| 5 | Session | Start/maintain/end conversations | NetBIOS, RPC |
| 4 | Transport | Segment data, ports, reliability | TCP, UDP |
| 3 | Network | Logical addressing and routing | IP, ICMP, OSPF - **routers** |
| 2 | Data Link | Frames, MAC addresses, local delivery | Ethernet, 802.11, ARP - **switches** |
| 1 | Physical | Bits on the medium | cables, fiber, radio, hubs |

Memory trick top-down: **All People Seem To Need Data Processing**. Bottom-up: **Please Do Not Throw Sausage Pizza Away**.

**TCP/IP model (4 layers):** Application (OSI 5-7), Transport (4), Internet (3), Network Access (1-2). The TCP/IP model is what the internet actually runs; the OSI model is the reference everyone uses to *talk* about networks ("that's a Layer 2 problem").

**Why layers matter for troubleshooting:** if a PC has no link light, don't waste time on DNS - fix Layer 1 first. Engineers work **bottom-up** (cable first), **top-down** (start at the app) or **divide-and-conquer** (start at Layer 3 with a ping, then go up or down).
@terms
- OSI model :: 7-layer reference model: Physical, Data Link, Network, Transport, Session, Presentation, Application
- TCP/IP model :: 4-layer model: Network Access, Internet, Transport, Application
- Layer 2 device :: A switch - forwards frames using MAC addresses
- Layer 3 device :: A router - forwards packets using IP addresses
@pro
- "Switches operate at Layer 2 using MAC addresses; routers operate at Layer 3 using IP addresses."
- "I troubleshoot with the OSI model - usually bottom-up, starting at the physical layer."
@interview Walk me through what happens when you type www.google.com in a browser. :: DNS first (Application layer) resolves the name to an IP. The browser opens a TCP connection to port 443 (Transport, three-way handshake), TLS negotiates encryption (Presentation). The data is placed in IP packets addressed to Google's IP (Network). Because Google isn't local, the PC sends the frames to its default gateway's MAC, learned with ARP (Data Link), and the bits go out over the cable or Wi-Fi (Physical). Each router hop repeats Layer 3 forwarding until it arrives; the reply comes back the same way.
@quiz
? At which OSI layer do routers make forwarding decisions?
- Layer 2
+ Layer 3
- Layer 4
- Layer 7
> Routers use IP addresses (Layer 3).
? Which OSI layer is responsible for encryption and data formatting?
- Session
+ Presentation
- Application
- Transport
> Presentation handles format, encryption (TLS) and compression.
? The TCP/IP "Internet" layer corresponds to which OSI layer?
- Data Link
+ Network
- Transport
- Session
> Internet layer = IP = OSI Layer 3.
?? Which are Layer 2 concepts? (choose two)
+ MAC addresses
+ Ethernet frames
- IP addresses
- TCP ports
> MAC + frames = Layer 2; IP = Layer 3; ports = Layer 4.

=== lesson n04-3 | Encapsulation and PDUs | 20
@analogy Russian dolls. Your data goes in a TCP doll (segment), which goes in an IP doll (packet), which goes in an Ethernet doll (frame), which is turned into a stream of bits. The receiver opens the dolls in reverse order.
@objectives
- Name the PDU at each layer
- Describe encapsulation and de-encapsulation
- Explain why the MAC changes at every hop but the IP doesn't
@body
As data goes **down** the stack, each layer adds its own header - **encapsulation**:

| Layer | PDU name | Adds |
|---|---|---|
| Application | Data | - |
| Transport | **Segment** (TCP) / Datagram (UDP) | Source & destination **ports** |
| Network | **Packet** | Source & destination **IP addresses** |
| Data Link | **Frame** | Source & destination **MAC addresses** + FCS trailer |
| Physical | **Bits** | - |

The receiver strips headers going **up** - **de-encapsulation**.

**The key insight every engineer must know:** when a packet crosses routers,
- the **IP addresses stay the same** end-to-end (source PC -> destination server) - unless NAT changes them,
- the **MAC addresses change at every hop** - each frame is only addressed to the *next* device on the local link.

So when PC1 talks to a server on another network, the frame's destination MAC is the **default gateway's MAC**, while the packet's destination IP is the **server's IP**. This is why the default gateway matters so much.

The **FCS** (Frame Check Sequence) in the Ethernet trailer is a CRC checksum - if it doesn't match, the frame is dropped (that's a CRC error in [[show interfaces]]).
@terms
- Encapsulation :: Adding headers (and trailers) as data moves down the layers
- PDU :: Protocol Data Unit - the name of data at each layer: data, segment, packet, frame, bits
- Segment :: Transport-layer PDU with port numbers
- Packet :: Network-layer PDU with IP addresses
- Frame :: Data-link PDU with MAC addresses and an FCS trailer
- FCS :: Frame Check Sequence - checksum that detects corrupted frames
@pro
- "IP addresses are end-to-end; MAC addresses only have meaning on the local link and change at every router hop."
@quiz
? What is the PDU at the Transport layer called?
+ Segment
- Packet
- Frame
- Bits
> Segment (TCP) or datagram (UDP).
? PC1 (192.168.1.10) sends a packet to a web server on another network. What is the DESTINATION MAC in the frame leaving PC1?
- The web server's MAC
+ The default gateway's MAC
- The broadcast MAC FF:FF:FF:FF:FF:FF
- PC1's own MAC
> Frames are only addressed to the next hop on the local link - the router (gateway).
? Which part of a frame is used to detect corruption?
- Preamble
- Source MAC
+ FCS
- EtherType
> The Frame Check Sequence is a CRC calculated over the frame.

=== boss
? Which layer and PDU match?
- Layer 3 - Frame
- Layer 2 - Packet
+ Layer 4 - Segment
- Layer 1 - Datagram
> L4 segment, L3 packet, L2 frame, L1 bits.
? As a packet crosses three routers, which addresses normally stay the same?
+ Source and destination IP addresses
- Source and destination MAC addresses
- Both IP and MAC
- Neither
> MACs are rewritten each hop; IPs stay the same unless NAT is used.
? HTTP, DNS and DHCP operate at which OSI layer?
- 4
- 5
- 6
+ 7
> Application layer protocols.
? Which troubleshooting approach starts by pinging (Layer 3) and then moves up or down?
- Top-down
- Bottom-up
+ Divide and conquer
- Follow the path
> Divide-and-conquer starts in the middle of the stack.
? Which standards body publishes RFCs?
+ IETF
- IEEE
- TIA
- ISO
> The Internet Engineering Task Force.
`;
