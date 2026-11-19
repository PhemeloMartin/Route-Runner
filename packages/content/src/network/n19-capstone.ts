import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n19 | Capstone: Troubleshooting Like a Pro and Passing the CCNA | 19
@sources Cisco CCNA v2.0 exam topics (published 20 May 2026, testing from 3 February 2027); your ComNet test memos and Packet Tracer activities
@story
Twelve weeks ago Phemelo couldn't remember what a subnet mask was. Today a client calls with a real outage and he finds it in eight minutes using a method, not luck. One mission remains: build Phemelo Corp from nothing - then book the exam.
@lab network:ticket-1 | Ticket #1042
@lab network:ticket-2 | Ticket #1077
@lab network:capstone | CAPSTONE: Build Phemelo Corp

=== lesson n19-1 | A Troubleshooting Method That Always Works | 25
@analogy A doctor doesn't randomly give medicine - she asks questions, takes your temperature, runs tests, forms a diagnosis, treats, then checks you got better. Network troubleshooting is exactly the same, and CCNA v2.0 tests it heavily.
@objectives
- Apply a structured troubleshooting process
- Choose bottom-up, top-down, divide-and-conquer or follow-the-path
- Use the right command at each layer
@body
**The process:**
1. **Define the problem** - who, what, since when, what changed? ("Only VLAN 30, since this morning's change window.")
2. **Gather information** - show commands, logs, ping/traceroute, user reports.
3. **Analyse and form a hypothesis** - compare with how it *should* work (baseline, documentation).
4. **Test the hypothesis / implement a fix** - one change at a time; have a rollback plan.
5. **Verify** - did it fix it? Did you break anything else?
6. **Document** - what, why, how fixed. The next engineer (maybe you at 2 a.m.) will thank you.

**Approaches:** **bottom-up** (Layer 1 first - best when physical issues are suspected), **top-down** (start at the application), **divide-and-conquer** (start with ping at Layer 3, then go up or down), **follow-the-path** (traceroute hop by hop), **compare known-good** (diff a working config).

**Layer-by-layer toolkit:**
| Layer | Check | Commands |
|---|---|---|
| 1 | link, cable, errors, err-disabled | [[show interfaces]], [[show ip int brief]], LEDs |
| 2 | VLAN, trunk, STP, MAC, port security | [[show vlan brief]], [[show interfaces trunk]], [[show spanning-tree]], [[show mac address-table]] |
| 3 | IP/mask/gateway, routes, ACL, NAT | [[ipconfig]], [[show ip route]], [[show access-lists]], [[ping]], [[traceroute]] |
| 4-7 | ports, DNS, DHCP, app | [[nslookup]], [[show ip dhcp binding]], telnet/curl to a port |

**Golden rules:** a ping needs a route **there and back**; "it worked yesterday" means **something changed**; read the error message - IOS usually tells you exactly what's wrong.
@terms
- Divide and conquer :: Start troubleshooting at Layer 3 with ping, then move up or down
- Follow the path :: Trace traffic hop by hop to find where it stops
- Baseline :: Documented normal behaviour to compare against
- Rollback plan :: How to undo a change if it makes things worse
@pro
- "I define the problem, gather information, form a hypothesis, test one change at a time, verify, and document."
@interview A user says "the internet is down". Walk me through your first five minutes. :: First I'd define the scope: just this user, this VLAN, or everyone? What changed? Then from their PC: ipconfig to check IP, mask, gateway and DNS (a 169.254 address means DHCP failed). Ping the gateway, then 8.8.8.8, then a name. If the IP ping works but the name fails, it's DNS; if the gateway fails, it's local Layer 1-3; if the gateway works but 8.8.8.8 fails, I look at routing and NAT on the edge router with show ip route and show ip nat translations.
@quiz
? A user can ping 8.8.8.8 but not www.google.com. What is the most likely problem?
- Default gateway
+ DNS
- Cable
- VLAN
> IP works, names don't.
? Which approach starts by pinging, then moves up or down the OSI model?
- Bottom-up
- Top-down
+ Divide and conquer
- Shoot from the hip
> Start in the middle.
? What is the LAST step of the troubleshooting process?
- Implement the fix
- Verify
+ Document
- Gather information
> Document what happened and how it was fixed.

=== lesson n19-2 | Exam Strategy: Booking, Question Types and Final Prep | 20
@analogy The exam is a marathon on a course you've already run in training. Twelve weeks of daily runs (lessons, labs, drills) means race day is just another run - you pace yourself, skip the hill you can't climb yet, and finish strong.
@objectives
- Know the exam format and the v1.1 to v2.0 change
- Use time-management and elimination techniques
- Build a final four-week revision plan
@body
**The exam (verify on Cisco's site before booking):** CCNA **200-301**, about **120 minutes**, roughly **100 questions**, delivered by Pearson VUE (test centre or online proctored). Question types: multiple choice (single and multiple answer), **drag-and-drop**, and **simulations/simlets** where you configure or troubleshoot in a simulated CLI - exactly what the Packet Lab trains.

**Blueprint change:** v1.1 is available until **2 February 2027**; **v2.0 starts 3 February 2027** (published 20 May 2026). v2.0 domains: Network Infrastructure and Connectivity, Switching and Network Access, IP Routing, Network Services and Security, and AI/Network Operations and Management - with more configuration and troubleshooting. Since you'll sit it in 2027, study v2.0 and download the official exam topics PDF from learningnetwork.cisco.com.

**On the day:**
- You **cannot go back** to previous questions on the Cisco exam - answer, then move on.
- Budget about **1 minute per question**; sims take longer, so bank time on quick ones.
- **Eliminate** obviously wrong answers - two left = 50/50.
- In sims, use [[?]], [[show]] commands and [[do]]; read every task bullet; save with [[copy run start]] if asked.
- Watch for keywords: **NOT**, **BEST**, **FIRST**, "choose two".

**Final 4 weeks (the Route Runner way):** daily subnetting sprint (under 30 s each), every chapter boss at 90%+, flashcards to zero due, one mock exam every 3-4 days (target **82%+ consistently**), redo every Packet Lab mission and ticket without hints, and explain topics out loud using the Interview Corner. Then book it - and walk in as a network engineer.
@terms
- Simlet :: Exam question with a simulated device where you answer by running show commands
- Simulation :: Exam task where you configure devices in a simulated CLI
- Pearson VUE :: The company that delivers Cisco exams (test centre or online)
@pro
- "I'll sit the CCNA on the v2.0 blueprint, so I'm studying from Cisco's v2.0 exam topics."
@quiz
? Can you return to earlier questions in the Cisco CCNA exam?
- Yes, anytime
+ No - once you move on, you can't go back
- Only for simulations
- Only in the last 10 minutes
> Answer carefully, then commit.
? What is the first date to sit CCNA v2.0?
+ 3 February 2027
- 1 January 2026
- 20 May 2026
- It has no new version
> v1.1 ends 2 February 2027.
? In a simlet you're unsure of an interface's VLAN. What should you do?
+ Use show commands like show vlan brief to find it
- Guess
- Skip it immediately
- Reload the switch
> Simlets are answered from show output.

=== boss
? A PC can ping its gateway but not a server in another subnet. The server can ping its own gateway. What should you check first?
+ Routes between the subnets and any ACLs on the path
- The PC's cable
- The PC's NIC driver
- The server's keyboard
> Both ends work locally; the problem is in between.
? After a change, users in one VLAN lose access. What's the fastest safe action if you can't find the fault quickly?
+ Roll back the change, restore service, then investigate
- Reload every switch
- Wait until tomorrow
- Delete the VLAN
> Restore service first, then root-cause.
? show ip interface brief shows "up/down" on a serial link. Which layer is likely at fault?
- Layer 1
+ Layer 2 (encapsulation/keepalives/clocking)
- Layer 3
- Layer 7
> Physical is up, protocol is down.
? A host has IP 10.1.1.20/24 and gateway 10.1.2.1. What is wrong?
+ The gateway is not in the host's subnet
- The mask should be /8
- Nothing
- 10.x addresses can't use gateways
> The gateway must be on the local subnet.
?? Which commands help diagnose a Layer 2 problem? (choose two)
+ show vlan brief
+ show interfaces trunk
- show ip route
- show ip nat translations
> Routing and NAT are Layer 3.
`;
