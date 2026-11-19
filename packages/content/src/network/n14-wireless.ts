import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n14 | Wireless Networking | 14
@domain 1.0 Network Infrastructure and Connectivity
@sources ComNet Chapter 11 - Small Network (WLAN, integrated router, wireless security); Cisco SRWE WLAN chapters
@story
Customers at the Marketplace complain: "The Wi-Fi drops near the fridges, and it's slow at lunchtime." Phemelo walks around with his phone's Wi-Fi analyser. Two access points on the same channel, one hidden behind a metal fridge, and the guest network using an old password everyone knows. Time to learn Wi-Fi properly.

=== lesson n14-1 | 802.11 Standards, Bands and Channels | 25
@analogy Wi-Fi channels are lanes on a highway. On 2.4 GHz there are only 3 lanes that don't overlap (1, 6, 11), so neighbours crash into each other. 5 GHz and 6 GHz are wide new highways with many lanes - but the signal doesn't travel as far through walls.
@objectives
- Compare 802.11 standards and Wi-Fi generations
- Compare 2.4, 5 and 6 GHz bands
- Plan non-overlapping channels
@body
| Standard | Name | Bands | Max (theoretical) |
|---|---|---|---|
| 802.11n | Wi-Fi 4 | 2.4 / 5 GHz | 600 Mbps |
| 802.11ac | Wi-Fi 5 | 5 GHz | ~3.5 Gbps |
| 802.11ax | Wi-Fi 6 / 6E | 2.4 / 5 / (6E: 6 GHz) | ~9.6 Gbps |
| 802.11be | Wi-Fi 7 | 2.4 / 5 / 6 GHz | ~46 Gbps |

**2.4 GHz:** longer range, better through walls, but crowded (microwaves, Bluetooth) and only **three non-overlapping channels: 1, 6, 11**.
**5 GHz:** many more non-overlapping channels, faster, shorter range. Some channels need **DFS** (radar avoidance).
**6 GHz (Wi-Fi 6E/7):** lots of clean spectrum; requires WPA3.

**Wi-Fi is half-duplex and shared** - it uses **CSMA/CA** (collision *avoidance*: listen before talking). More clients on one AP = less airtime each.

**Key terms:** **SSID** (network name), **BSS** (one AP and its clients), **BSSID** (the AP radio's MAC), **ESS** (several APs with the same SSID so users roam). Signal strength is measured in **dBm** (-30 excellent ... -67 good for voice ... -80 unusable) and quality by **SNR**.

**Design tips:** place APs high and central, away from metal and water; use different non-overlapping channels on neighbouring APs; 15-20% cell overlap for roaming; lower power instead of louder APs in dense areas.
@terms
- SSID :: Service Set Identifier - the Wi-Fi network name
- BSSID :: MAC address of an AP's radio
- ESS :: Extended Service Set - many APs sharing one SSID for roaming
- CSMA/CA :: Carrier Sense Multiple Access with Collision Avoidance - Wi-Fi's listen-before-talk
- Non-overlapping channels :: On 2.4 GHz: 1, 6 and 11
- dBm :: Signal power unit; closer to 0 is stronger (-60 dBm is better than -80)
@pro
- "On 2.4 GHz I only use channels 1, 6 and 11 so neighbouring APs don't overlap."
@quiz
? Which are the non-overlapping 2.4 GHz channels?
- 1, 5, 9
+ 1, 6, 11
- 2, 7, 12
- 3, 8, 13
> The classic three.
? Which statement about 5 GHz vs 2.4 GHz is TRUE?
+ 5 GHz has more channels but shorter range
- 5 GHz travels further through walls
- 2.4 GHz is less crowded
- 5 GHz is only for Bluetooth
> Higher frequency = less penetration, more spectrum.
? Which signal is strongest?
+ -45 dBm
- -70 dBm
- -85 dBm
- -95 dBm
> Closer to zero = stronger.

=== lesson n14-2 | WLAN Architectures: Autonomous, Controller-Based and Cloud | 20
@analogy Autonomous APs are independent shopkeepers who each set their own prices. Lightweight APs with a controller are franchise stores - head office (the WLC) sets the rules and every store follows them automatically.
@objectives
- Compare autonomous, lightweight (WLC) and cloud-managed APs
- Describe CAPWAP and AP modes
- Know which switch-port type each AP needs
@body
- **Autonomous APs** - each configured individually (like a home router). Fine for one or two APs.
- **Lightweight APs + WLC (Wireless LAN Controller)** - APs are managed centrally. They tunnel to the WLC with **CAPWAP** (UDP **5246** control, **5247** data). Under **split-MAC**, the AP handles real-time radio work (beacons, encryption, ACKs) and the WLC handles management (authentication, roaming, RF tuning, policy).
- **Cloud-managed** (e.g. Cisco Meraki) - managed from a cloud dashboard; no on-site controller.
- **FlexConnect** - lightweight APs at branches that can switch traffic locally if the WAN to the WLC fails.

**Switch port types:** an autonomous AP or a FlexConnect AP with multiple SSIDs/VLANs needs a **trunk**; a lightweight AP in local mode only needs an **access port** (all client traffic is inside the CAPWAP tunnel). Most APs are powered with **PoE**.

**WLC ports and interfaces:** physical **distribution ports** (to the switch, often bundled in a **LAG** - static EtherChannel), **service port** (out-of-band management), dynamic interfaces mapping each WLAN/SSID to a VLAN.

**AP modes** include local, FlexConnect, monitor, sniffer, rogue detector and bridge (mesh).
@terms
- WLC :: Wireless LAN Controller - centrally manages lightweight APs
- Lightweight AP :: AP that relies on a WLC for management
- CAPWAP :: Control And Provisioning of Wireless Access Points - AP-to-WLC tunnel (UDP 5246/5247)
- Split-MAC :: AP does real-time radio functions; WLC does management functions
- FlexConnect :: AP mode that keeps local switching working if the WLC is unreachable
- LAG :: Link aggregation on a WLC (static EtherChannel, no LACP)
@pro
- "Lightweight APs build a CAPWAP tunnel to the WLC, so in local mode the AP's switch port can be a plain access port."
@quiz
? Which protocol carries traffic between lightweight APs and a WLC?
- LWAPP over TCP
+ CAPWAP
- RADIUS
- SNMP
> CAPWAP uses UDP 5246 (control) and 5247 (data).
? Which AP type is configured one by one with no controller?
+ Autonomous
- Lightweight
- FlexConnect
- Mesh
> Autonomous APs are standalone - each one holds its own configuration, with no controller.
? A branch AP must keep serving local clients if the WAN to HQ's WLC fails. Which mode?
- Local
+ FlexConnect
- Sniffer
- Monitor
> FlexConnect switches traffic locally.

=== lesson n14-3 | Securing Wi-Fi: WPA2, WPA3 and Enterprise Authentication | 20
@analogy WPA2-Personal is one shared house key for everyone - if a guest copies it, you must change the locks for the whole family. WPA2/3-Enterprise gives every person their own key card that can be cancelled individually.
@objectives
- Compare WEP, WPA, WPA2 and WPA3
- Compare Personal (PSK) and Enterprise (802.1X) authentication
- Configure a basic secure WLAN
@body
| Security | Encryption | Status |
|---|---|---|
| Open | none | Guest only, with a captive portal |
| WEP | RC4 | **Broken** - never use |
| WPA | TKIP | Deprecated |
| **WPA2** | **AES-CCMP** | Still common |
| **WPA3** | AES-GCMP, **SAE** | Current best; protects against offline password guessing |

**Personal (PSK)** - one pre-shared passphrase for everyone. Home and small offices. Use a long passphrase (15+ characters).
**Enterprise (802.1X)** - each user logs in with their own credentials checked by a **RADIUS** server (e.g. Cisco ISE, Windows NPS) using **EAP**. Revoke one user without changing everyone's password.

WPA3 adds **SAE** (Simultaneous Authentication of Equals) instead of the PSK four-way handshake, **forward secrecy**, and **OWE / Enhanced Open** for encrypted open guest networks. **PMF** (protected management frames) stops de-authentication attacks.

**Small-network checklist** (from your Chapter 11 slides): change the default admin password on the wireless router, update firmware, WPA2/WPA3 with AES, strong passphrase, separate guest SSID/VLAN with client isolation, disable WPS, and don't rely on hiding the SSID or MAC filtering - both are trivial to bypass.
@terms
- WPA2 :: Wi-Fi Protected Access 2 - AES-CCMP encryption
- WPA3 :: Current Wi-Fi security standard - SAE, forward secrecy, PMF required
- PSK :: Pre-Shared Key - one shared passphrase (Personal mode)
- 802.1X :: Port-based network access control - per-user authentication via RADIUS
- RADIUS :: Server protocol that authenticates users for Wi-Fi, VPN and switch ports
- WPS :: Wi-Fi Protected Setup - PIN-based convenience feature with known weaknesses; disable it
@pro
- "For staff I'd use WPA3-Enterprise with 802.1X and RADIUS, so each user has their own credentials."
@quiz
? Which Wi-Fi security option should NEVER be used?
+ WEP
- WPA2-AES
- WPA3-SAE
- WPA3-Enterprise
> WEP can be cracked in minutes.
? What does Enterprise mode use to authenticate each user?
- A shared passphrase
+ 802.1X with a RADIUS server
- MAC filtering
- A hidden SSID
> Individual credentials, centrally managed.
? Which WPA3 feature replaces the PSK handshake and resists offline dictionary attacks?
+ SAE
- TKIP
- WPS
- RC4
> Simultaneous Authentication of Equals.

=== boss
? A coffee shop's AP is on channel 6 and the neighbour's on channel 7. What is the problem?
+ Overlapping channels cause interference - use 1, 6 or 11
- Nothing - adjacent channels never interfere
- Channel 7 is illegal
- They should both use channel 6
> 2.4 GHz channels 5 MHz apart overlap.
? Which statement about split-MAC is TRUE?
+ The AP handles real-time radio functions; the WLC handles management
- The WLC transmits all beacons
- The AP stores all user accounts
- Split-MAC means two SSIDs
> Real-time on the AP, management on the controller.
? Which security setting is best for a small business with no RADIUS server?
- WEP with a long key
- Open with a hidden SSID
+ WPA3-Personal (or WPA2-AES) with a long passphrase
- WPA with TKIP
> No RADIUS -> PSK, as strong as possible.
? Wi-Fi uses which access method?
- CSMA/CD
+ CSMA/CA
- Token passing
- Full duplex
> Collision avoidance - radios can't detect collisions while transmitting.
?= Which UDP port does CAPWAP use for control traffic?
= 5246
> 5247 for data.
`;
