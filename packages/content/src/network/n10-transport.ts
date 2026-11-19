import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n10 | Transport Layer: TCP, UDP and Ports | 10
@domain 1.0 Network Infrastructure and Connectivity
@sources ComNet Chapter 8 slides (TCP 20-byte vs UDP 8-byte headers); Cisco ITN ch.14 Transport Layer
@story
The Marketplace's payment terminal and its CCTV cameras share the same link. Payments must NEVER lose a byte; the cameras would rather drop a frame than freeze the picture. "Two different jobs, two different delivery services," says Mma Neo. "Meet TCP and UDP."
@lab drill:ports | Port numbers & OSI drill

=== lesson n10-1 | TCP vs UDP | 20
@analogy TCP is registered mail with tracking: numbered pages, signed delivery, resend if lost. UDP is shouting across a taxi rank: fast, no confirmation - if someone missed it, too bad.
@objectives
- Compare TCP and UDP features and headers
- Choose the right protocol for an application
@body
| | **TCP** | **UDP** |
|---|---|---|
| Connection | Connection-oriented (handshake) | Connectionless |
| Reliability | Acknowledgements + retransmission | None - best effort |
| Ordering | Sequence numbers reorder data | No ordering |
| Flow control | Window size | None |
| Header | **20 bytes** | **8 bytes** |
| Used by | HTTP/HTTPS, SSH, FTP, SMTP, Telnet | DNS queries, DHCP, VoIP, video streaming, SNMP, TFTP, syslog |

**Rule of thumb:** if losing data is worse than delay -> TCP. If delay is worse than losing a little data (real-time voice/video, gaming) -> UDP. Applications using UDP can add their own reliability if needed (e.g. QUIC/HTTP-3 runs over UDP).

**Port numbers** identify the application:
- **Well-known** 0-1023 (HTTP 80, HTTPS 443, SSH 22)
- **Registered** 1024-49151 (e.g. MySQL 3306, RDP 3389)
- **Dynamic/ephemeral** 49152-65535 - chosen by the client for its side of the conversation

A **socket** = IP address + port. A connection is identified by the pair of sockets, e.g. 192.168.1.10:51234 -> 142.250.200.14:443. Check open sockets with [[netstat -an]] (Windows) or [[ss -tulpn]] (Linux).
@terms
- TCP :: Transmission Control Protocol - reliable, ordered, connection-oriented
- UDP :: User Datagram Protocol - fast, connectionless, best-effort
- Port number :: 16-bit number identifying an application/service
- Ephemeral port :: Temporary source port (49152-65535) chosen by a client
- Socket :: An IP address and port pair
@pro
- "Voice and video use UDP because a late packet is useless - retransmitting it would only add delay."
@quiz
? Which application is best suited to UDP?
- File transfer
- Online banking
+ Live voice calls
- Email
> Real-time traffic prefers low delay over retransmission.
?= What is the size of the UDP header in bytes?
= 8
> TCP is 20 bytes (without options); UDP is 8.
? Which range is used for ephemeral (client) ports?
- 0-1023
- 1024-49151
+ 49152-65535
- 1-255
> Dynamic/private ports.

=== lesson n10-2 | The Three-Way Handshake, Windows and Teardown | 20
@analogy Phoning a friend: "Can you hear me?" (SYN) - "Yes, can you hear ME?" (SYN-ACK) - "Yes!" (ACK). Now you talk. At the end you both say goodbye (FIN) before hanging up.
@objectives
- Describe the TCP three-way handshake and four-way termination
- Explain sequence numbers, acknowledgements and windowing
@body
**Opening a TCP connection (three-way handshake):**
1. Client -> Server: **SYN** (seq = x)
2. Server -> Client: **SYN, ACK** (seq = y, ack = x+1)
3. Client -> Server: **ACK** (ack = y+1)

**Reliability:** every byte has a **sequence number**; the receiver sends **acknowledgements** ("I've got up to byte N, send N+1 next"). If an ACK doesn't arrive in time, the sender retransmits.

**Flow control - the window:** the receiver advertises how many bytes it can accept before the sender must wait for an ACK. **Sliding windows** let many segments be in flight at once; if the receiver is overwhelmed it shrinks the window. TCP also slows down when it detects congestion (packet loss).

**Closing:** FIN -> ACK -> FIN -> ACK (four-way). A **RST** aborts a connection immediately (e.g. connecting to a closed port).

**Troubleshooting tip:** if a firewall blocks a port, the client sees its SYN go unanswered (timeout) or gets a RST (refused). You saw this in the Linux lab with [[curl]]: "Connection refused" = nothing listening; "Timed out" = filtered or unreachable.
@terms
- Three-way handshake :: SYN, SYN-ACK, ACK - how TCP opens a connection
- Sequence number :: Numbers each byte so data can be ordered and acknowledged
- Window size :: Amount of data a receiver will accept before an acknowledgement
- RST :: TCP reset - abruptly refuses or closes a connection
@pro
- "TCP opens with SYN, SYN-ACK, ACK and uses windowing for flow control."
@quiz
? What is the correct order of the TCP handshake?
+ SYN, SYN-ACK, ACK
- SYN, ACK, FIN
- ACK, SYN, SYN-ACK
- SYN, FIN, ACK
> Then data flows.
? What does TCP use to control how much data is sent before an acknowledgement?
- Port numbers
+ Window size
- TTL
- Checksum
> Windowing = flow control.
? "Connection refused" from curl usually means...
+ the host is reachable but nothing is listening on that port
- DNS failed
- the cable is unplugged
- the TTL expired
> The host answered with a TCP RST.

=== lesson n10-3 | Application Protocols and Ports to Memorise | 20
@analogy Port numbers are like door numbers in a big shopping mall. The mall's address (IP) gets you to the building; door 443 is the bank, door 25 is the post office, door 53 is the information desk.
@objectives
- Memorise the CCNA port numbers
- Describe what HTTP(S), DNS, DHCP, FTP, TFTP, SMTP, SNMP, NTP and syslog do
@body
| Service | Port | Transport | Plain-English job |
|---|---|---|---|
| FTP | 20 (data), 21 (control) | TCP | File transfer (clear text) |
| SSH / SCP / SFTP | 22 | TCP | Secure remote login and file copy |
| Telnet | 23 | TCP | Insecure remote login |
| SMTP | 25 | TCP | Sending email between servers |
| DNS | 53 | UDP (TCP for big replies/zone transfers) | Names to IPs |
| DHCP | 67 server / 68 client | UDP | Hand out IP settings |
| TFTP | 69 | UDP | Simple file transfer (IOS images, configs) |
| HTTP | 80 | TCP | Web |
| POP3 / IMAP | 110 / 143 | TCP | Reading email |
| NTP | 123 | UDP | Time synchronisation |
| SNMP | 161 (traps 162) | UDP | Monitoring devices |
| HTTPS | 443 | TCP | Encrypted web (TLS) |
| Syslog | 514 | UDP | Sending log messages |
| RDP | 3389 | TCP | Windows Remote Desktop |

**Secure file transfer** (CCNA v2.0 lists it): prefer **SFTP/SCP** (over SSH, port 22) or **FTPS** over plain FTP/TFTP, which send credentials and data in clear text.

Drill these in the Exam Hall until they're automatic - they show up in many exam questions as well as in ACL configs ([[eq 443]]).
@terms
- DNS :: Domain Name System - resolves names to IPs, UDP/TCP 53
- DHCP :: Dynamic Host Configuration Protocol - UDP 67/68
- TFTP :: Trivial FTP - UDP 69, no authentication
- SNMP :: Simple Network Management Protocol - UDP 161, traps on 162
- NTP :: Network Time Protocol - UDP 123
- SFTP :: SSH File Transfer Protocol - secure file transfer over TCP 22
@pro
- "For moving configs and images securely I'd use SCP or SFTP rather than TFTP."
@quiz
?= Which port does HTTPS use?
= 443
> HTTPS = HTTP inside TLS encryption, on TCP port 443 (plain HTTP is 80).
?= Which UDP port does a DHCP server listen on?
= 67
> Server 67, client 68.
? Which protocol is the SECURE choice to copy an IOS image?
- TFTP
- FTP
+ SCP
- Telnet
> SCP runs over SSH and encrypts.
?= Which port does NTP use?
= 123
> NTP uses UDP port 123 to synchronise clocks.

=== boss
? Which statement about UDP is TRUE?
- It retransmits lost data
- It uses a three-way handshake
+ It has an 8-byte header and no acknowledgements
- It guarantees ordering
> Best effort, tiny header.
?= Syslog uses which UDP port?
= 514
> Devices send syslog messages to a log server on UDP port 514.
? Which two protocols use UDP? (pick the correct pair)
+ DNS queries and DHCP
- SSH and HTTP
- FTP and SMTP
- Telnet and HTTPS
> DNS (mostly) and DHCP are UDP.
? A packet arrives with destination port 22. Which service?
- Telnet
+ SSH
- FTP control
- SMTP
> Port 22 = SSH (and SCP/SFTP). Telnet is 23, FTP 20/21, SMTP 25.
? What does a TCP receiver do when its buffer fills up?
+ Advertises a smaller window
- Sends a SYN
- Switches to UDP
- Changes the port number
> Flow control via window size.
`;
