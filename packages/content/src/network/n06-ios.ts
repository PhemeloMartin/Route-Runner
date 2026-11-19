import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n06 | Cisco IOS: Access, Modes and Basic Configuration | 6
@domain 1.0 Network Infrastructure and Connectivity
@sources ComNet Chapter 2 - Configuring Cisco IOS (final); Cisco ITN Companion Guide ch.2; Chapter 11 - Small Network (Securing Devices, Enable SSH)
@story
The new router arrives in its box. No screen, no mouse, no Windows. Just a blue console cable and a blinking cursor: [[Router>]]. "Welcome to the real job," says Mma Neo. "Every Cisco engineer on earth started exactly here."
@lab network:basic-config | Mission 3 - Secure the Router
@lab network:ssh-mgmt | Mission 4 - Remote Management with SSH

=== lesson n06-1 | Getting In: Console, SSH and the IOS Modes | 20
@analogy IOS modes are like rooms in a building with more and more security. The lobby (user EXEC) lets you look around. The manager's office (privileged EXEC) lets you see everything and save. The control room (global config) lets you change how the building works.
@objectives
- Name the ways to access a Cisco device
- Navigate user EXEC, privileged EXEC and configuration modes
- Use abbreviations, ? help and Tab completion
@body
**Ways in:**
- **Console port** - out-of-band, needs physical access and a rollover cable + terminal emulator (PuTTY, Tera Term) at **9600 baud**. Used for first-time setup.
- **SSH** - in-band, encrypted remote access. The standard.
- **Telnet** - in-band but **plain text** (passwords visible to anyone sniffing). Never in production.
- **AUX** - old dial-up modem port.

**Modes and prompts:**
| Mode | Prompt | Get there with |
|---|---|---|
| User EXEC | [[Router>]] | log in |
| Privileged EXEC | [[Router#]] | [[enable]] |
| Global configuration | [[Router(config)#]] | [[configure terminal]] |
| Interface config | [[Router(config-if)#]] | [[interface g0/0/0]] |
| Line config | [[Router(config-line)#]] | [[line console 0]] / [[line vty 0 4]] |

Go back one level with [[exit]]; jump straight to privileged EXEC with [[end]] or **Ctrl+Z**. Run an EXEC command from config mode with [[do]], e.g. [[do show ip interface brief]].

**Shortcuts that save hours:** IOS accepts the shortest unique abbreviation ([[conf t]], [[sh ip int br]], [[int g0/0/0]], [[no shut]]). Press **?** for context help and **Tab** to complete a word. Up-arrow recalls history.

**The DNS trap:** type a wrong word in EXEC mode and IOS assumes it's a hostname and tries DNS for ~30 seconds ("Translating..."). Fix: [[no ip domain-lookup]].
@terms
- Console port :: Out-of-band management port used with a rollover cable at 9600 baud
- User EXEC mode :: Limited monitoring mode, prompt ends in >
- Privileged EXEC mode :: Full monitoring and file commands, prompt ends in # (enable)
- Global configuration mode :: Changes that affect the whole device (configure terminal)
- SSH :: Secure Shell - encrypted remote CLI access on TCP 22
- Telnet :: Unencrypted remote CLI access on TCP 23 - insecure
@pro
- "I console in out-of-band for the initial setup, then manage it in-band over SSH."
@quiz
? Which prompt indicates privileged EXEC mode?
- Router>
+ Router#
- Router(config)#
- Router(config-if)#
> # without (config) = privileged EXEC.
? Which command moves from privileged EXEC to global configuration mode?
- enable
+ configure terminal
- interface
- end
> "configure terminal" (short: conf t) takes you from Router# to Router(config)#.
? Why should Telnet not be used?
- It is too slow
+ It sends everything, including passwords, in clear text
- It only works on the console port
- It needs a rollover cable
> SSH encrypts the session; Telnet doesn't.
? What does Ctrl+Z do in configuration mode?
+ Returns directly to privileged EXEC mode
- Exits the device
- Undoes the last command
- Saves the configuration
> Same as "end".

=== lesson n06-2 | Basic Hardening: Names, Passwords and Banners | 25
@analogy Hardening a router is like moving into a new house: change the locks (passwords), put your name on the door (hostname), stick a "no trespassing" sign on the gate (banner), and hide the spare key properly (encryption).
@objectives
- Configure hostname, enable secret, console and VTY passwords
- Explain enable secret vs enable password and type 5 vs type 7
- Configure a MOTD banner
@body
The classic first-ten-commands (you'll do this hundreds of times):
~~~
enable
configure terminal
hostname KMP-R1
no ip domain-lookup
enable secret Cl@ss2026
line console 0
 password Con$ole1
 login
line vty 0 4
 password Vty$ecret
 login
 transport input ssh
service password-encryption
banner motd #Authorised access only. Activity is logged.#
end
~~~

**enable secret vs enable password:** [[enable secret]] stores a one-way **hash** (type 5/8/9). [[enable password]] is stored in clear text (or weak type 7). If both exist, the secret wins. Always use secret.

**service password-encryption** scrambles the clear-text passwords in the config (console, VTY) as **type 7**. Type 7 is *reversible* - it only stops shoulder-surfing. Real protection comes from **secret** and **local usernames with secret**.

**Banner MOTD** - legal notice shown before login. It should warn; it should **never** say "Welcome".

**login** tells a line to ask for its password. **login local** tells it to ask for a username and password from the local database ([[username admin secret ...]]) - required for SSH.
@terms
- enable secret :: Privileged EXEC password stored as a one-way hash
- service password-encryption :: Encrypts clear-text passwords in the config as weak type 7
- Type 7 :: Reversible Cisco password scramble - not real security
- Banner MOTD :: Message of the day shown before login - should be a legal warning
- login local :: Authenticate a line using the local username database
- VTY lines :: Virtual terminal lines used by SSH/Telnet sessions
@pro
- "I use enable secret, never enable password, because the secret is hashed."
- "Type 7 is reversible, so service password-encryption only protects against shoulder-surfing."
@interview You find "enable password cisco" in a router config. What do you change and why? :: Remove it and configure "enable secret" with a strong password, because enable password is stored in clear text or reversible type 7, while the secret is a one-way hash. I'd also add local users with secrets, login local and SSH-only VTY lines, and turn on service password-encryption.
@quiz
? Which command stores the privileged password as a one-way hash?
- enable password
+ enable secret
- service password-encryption
- password 7
> Secrets are hashed; type 7 can be decoded.
? What does "login" under line console 0 do?
+ Requires the line password before access
- Creates a local user
- Enables SSH
- Saves the configuration
> Without "login", the password isn't checked.
? Which banner is BEST practice?
- Welcome to our network!
+ Authorised access only. All activity is monitored.
- Hello, enjoy your stay
- Router 1 in Kimberley
> Never invite intruders; give a legal warning.

=== lesson n06-3 | Running vs Startup Config, Saving and Verifying | 20
@analogy The running-config is the document open on your screen. The startup-config is the saved file. Close without saving (reload) and your changes are gone.
@objectives
- Explain running-config vs startup-config
- Save, erase and verify configurations
- Configure a switch management SVI and default gateway
@body
- **running-config** - in **RAM**, active now, changes immediately as you type.
- **startup-config** - in **NVRAM**, loaded at boot.

Save: [[copy running-config startup-config]] (or the classic [[write memory]] / [[wr]]).
Undo all unsaved changes: [[reload]] (without saving). Factory reset: [[erase startup-config]] then [[reload]].

**Verification commands you'll use daily:**
- [[show running-config]] - full config
- [[show ip interface brief]] - every interface, IP, status/protocol at a glance
- [[show interfaces g0/0/0]] - details, errors, MAC, speed/duplex
- [[show version]] - IOS version, uptime, memory, config register
- [[show history]] - your recent commands

**Managing a Layer 2 switch remotely:** a switch has no routed ports, so you give it an IP on a virtual interface, the **SVI** (Switch Virtual Interface):
~~~
interface vlan 1
 ip address 192.168.99.2 255.255.255.0
 no shutdown
exit
ip default-gateway 192.168.99.1
~~~
The **ip default-gateway** lets the switch reply to admins on other networks.

**Router interfaces are shut down by default** - always [[no shutdown]]. Switch ports are up by default.
@terms
- running-config :: The active configuration in RAM
- startup-config :: The saved configuration in NVRAM, loaded at boot
- SVI :: Switch Virtual Interface - a virtual Layer 3 interface (interface vlan X) for management or routing
- ip default-gateway :: Default gateway for a Layer 2 switch's management traffic
- show ip interface brief :: Quick summary of interfaces, IPs and up/down status
@pro
- "Changes are live in the running-config but only survive a reload once copied to the startup-config."
@quiz
? Where is the startup-config stored?
- RAM
+ NVRAM
- Flash
- ROM
> NVRAM = non-volatile RAM.
? Which command saves the configuration?
+ copy running-config startup-config
- copy startup-config running-config
- save config
- reload
> Or "write memory" / "wr".
? To manage a Layer 2 switch from another subnet, what two things does it need?
- An IP on a physical port and OSPF
+ An IP on an SVI and an ip default-gateway
- A loopback and NAT
- DHCP snooping and a banner
> The SVI gives it an address; the default gateway lets replies leave the subnet.
?= Which command shows a one-line summary of every interface's IP and status? (full command)
= show ip interface brief | sh ip int br | show ip int brief
> show ip interface brief - the most-used command in networking.

=== boss
? You configure an IP on G0/0/0 but [[show ip interface brief]] shows "administratively down". What is missing?
+ no shutdown
- ip routing
- login local
- enable secret
> Router interfaces are disabled by default.
? Which access method is out-of-band?
+ Console
- SSH
- Telnet
- HTTPS
> Console doesn't use the network.
? After a power cut the router lost today's changes. Why?
- Flash was corrupted
+ The running-config was never copied to the startup-config
- The enable secret expired
- The banner was too long
> RAM is volatile; save to NVRAM.
?? Which are required to log in to a router with SSH using a username? (choose three)
+ A hostname other than Router and an ip domain-name
+ RSA keys (crypto key generate rsa)
+ login local on the VTY lines and a local username
- service password-encryption
> Password encryption is good practice but not required for SSH.
? Which command stops the router from treating mistyped commands as hostnames?
- no banner motd
+ no ip domain-lookup
- no service dns
- no cdp run
> Prevents the 30-second "Translating..." delay.
`;
