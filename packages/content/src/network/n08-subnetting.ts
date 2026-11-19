import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n08 | Subnetting and VLSM - Your Superpower | 8
@domain 1.0 Network Infrastructure and Connectivity
@sources ComNet Chapter 9 - Subnetting (Full Chapter); 11.7.5 Packet Tracer - Subnetting Scenario; IP_Subnetting_Cheat_Sheet.xlsx
@story
"I can't remember ANY of this," Phemelo admits, staring at his old Chapter 9 slides. Mma Neo slides a coin across the table. "Then we'll learn it the way engineers actually do it in exams - not with long binary, but with one magic number. Ten minutes a day, and in three weeks you'll subnet faster than the calculator."
@lab drill:subnet | Subnetting sprint in the Exam Hall

=== lesson n08-1 | Why Subnet, and the Magic Number Method | 30
@analogy Subnetting is cutting one big sheet of land into equal plots. The "magic number" (block size) is the width of each plot. Once you know the width, you can walk along the fence and count: 0, 64, 128, 192...
@objectives
- Explain why networks are subnetted
- Find the block size (magic number) from any mask
- Find network, broadcast and host range in seconds
@body
**Why subnet?** Smaller broadcast domains (less noise), security (separate departments), better use of addresses, and easier management (one subnet per floor/VLAN/site).

**The magic number method (the fastest way):**
1. Find the **interesting octet** - the one where the mask is not 255 or 0.
2. **Block size = 256 - mask value** in that octet.
3. Subnets start at multiples of the block size in that octet.
4. Network = the multiple at or below the IP; broadcast = next network minus 1.

**Example: 172.16.45.200/20**
- /20 = 255.255.**240**.0 -> interesting octet is the 3rd.
- Block = 256 - 240 = **16**. Multiples: 0, 16, 32, **48**...
- 45 is between 32 and 48 -> network **172.16.32.0**, broadcast **172.16.47.255**.
- Hosts 172.16.32.1 - 172.16.47.254, 2^12 - 2 = 4094 hosts.

**Example: 10.1.1.100/27**
- /27 = .224 in the 4th octet. Block = **32**: 0, 32, 64, **96**, 128.
- Network **10.1.1.96**, broadcast **10.1.1.127**, hosts .97 - .126.

**Know these by heart:** /25 = 128, /26 = 64, /27 = 32, /28 = 16, /29 = 8, /30 = 4 (in the last octet). Same pattern repeats one octet left for /17-/24.
@terms
- Subnetting :: Dividing a network into smaller networks by borrowing host bits
- Interesting octet :: The octet where the mask is neither 255 nor 0
- Block size (magic number) :: 256 minus the mask value in the interesting octet
- Borrowed bits :: Host bits turned into network bits to create subnets
@pro
- "/20 is 255.255.240.0, so the block size is 16 in the third octet."
- "Subnets = 2^borrowed bits; hosts per subnet = 2^remaining host bits minus 2."
@interview How would you quickly find the subnet of 172.16.45.200/20 without a calculator? :: /20 means the third octet mask is 240, so the block size is 256 - 240 = 16. Counting by 16 in the third octet: 0, 16, 32, 48. 45 falls in the 32 block, so the network is 172.16.32.0 and the broadcast is 172.16.47.255.
@quiz
?= What is the block size for a /26 mask?
= 64
> 256 - 192 = 64.
?= Network address of 10.1.1.100/27?
= 10.1.1.96
> Block 32: 96-127.
?= Broadcast address of 172.16.45.200/20?
= 172.16.47.255
> Network 172.16.32.0, next network 172.16.48.0, minus one.
?= How many /26 subnets fit inside one /24?
= 4
> 2 borrowed bits -> 2^2 = 4 subnets.

=== lesson n08-2 | Designing Subnets: How Many Networks, How Many Hosts | 25
@analogy Planning subnets is like planning a kitchen: first count the people (hosts) so every room is big enough, then count how many rooms (subnets) you need, and only then draw the walls.
@objectives
- Choose a prefix that fits a required number of hosts
- Choose a prefix that gives a required number of subnets
- Build an addressing table
@body
**Hosts first:** find the smallest h where 2^h - 2 >= hosts needed. Prefix = 32 - h.
- 50 hosts -> 2^6 - 2 = 62 -> h = 6 -> **/26**
- 200 hosts -> 2^8 - 2 = 254 -> **/24**
- 2 hosts (point-to-point WAN) -> **/30** (or /31 on modern routers)

**Subnets needed:** borrow s bits where 2^s >= subnets needed. From a /24 needing 6 subnets: 2^3 = 8 -> borrow 3 -> **/27** (30 hosts each).

**Addressing table** (what you hand to the next engineer):
| Device | Interface | IP | Mask | Gateway |
|---|---|---|---|---|
| R1 | G0/0/0.10 | 192.168.10.1 | 255.255.255.192 | - |
| PC-Sales | NIC | 192.168.10.10 | 255.255.255.192 | 192.168.10.1 |

**Always plan for growth** - if Sales has 50 people today, a /26 (62) gives room for 12 more. Expect the business to grow.
@terms
- Addressing table :: Documentation of every device's interfaces, IPs, masks and gateways
- /30 :: 2 usable hosts - classic point-to-point WAN link
- /31 :: RFC 3021 point-to-point link with no network/broadcast (2 addresses, both usable)
@pro
- "I size subnets on host count first and leave headroom for growth."
@quiz
? A department needs 100 hosts. Which is the smallest suitable prefix?
- /26
+ /25
- /24
- /27
> /25 = 126 hosts; /26 = 62 is too small.
? You must split 192.168.1.0/24 into at least 5 equal subnets. Which mask?
- 255.255.255.128
- 255.255.255.192
+ 255.255.255.224
- 255.255.255.240
> 3 borrowed bits = 8 subnets of 30 hosts. /26 gives only 4.
?= How many usable hosts per subnet when 192.168.1.0/24 is split into /28s?
= 14
> 2^4 - 2 = 14.

=== lesson n08-3 | VLSM - No Wasted Addresses | 25
@analogy VLSM is packing a suitcase: big items first (the jacket), then smaller ones in the gaps (socks). If you put the socks in first, the jacket won't fit.
@objectives
- Explain Variable Length Subnet Masking
- Allocate subnets largest-first without overlaps
@body
With **fixed-length** subnetting every subnet is the same size - a /30 WAN link would waste 60 addresses if every subnet were /26. **VLSM** uses a different mask for each subnet, sized to its need.

**Method - largest first:**
Given **192.168.50.0/24** and needs: Sales 100 hosts, IT 50, Guest 25, WAN-1 2, WAN-2 2.
1. Sales 100 -> /25 -> **192.168.50.0/25** (.0 - .127)
2. IT 50 -> /26 -> **192.168.50.128/26** (.128 - .191)
3. Guest 25 -> /27 -> **192.168.50.192/27** (.192 - .223)
4. WAN-1 2 -> /30 -> **192.168.50.224/30** (.224 - .227)
5. WAN-2 2 -> /30 -> **192.168.50.228/30** (.228 - .231)
Free for later: 192.168.50.232 - .255.

**Rules:** allocate largest first; every subnet must start on a multiple of its own block size; never overlap. Route **summarisation** (advertising 192.168.50.0/24 for all of them) works best when subnets are contiguous like this.

The Exam Hall has an endless VLSM-style drill ("smallest subnet that fits"). In the real exam, VLSM questions often give you a list of hosts and ask which subnet is correct - eliminate options that overlap or are too small.
@terms
- VLSM :: Variable Length Subnet Masking - different prefix lengths in one address space
- Overlap :: Two subnets sharing addresses - a configuration error routers will reject
- Route summarisation :: Advertising one bigger prefix instead of many small ones
@pro
- "With VLSM I allocate the largest subnet first so every block starts on its boundary."
@quiz
? Which VLSM rule is correct?
+ Allocate the largest subnet first
- Allocate the smallest subnet first
- All subnets must use the same mask
- WAN links should use /24
> Largest first keeps boundaries aligned.
? After allocating 10.0.0.0/25 and 10.0.0.128/26, which is the next free /27?
- 10.0.0.160/27
+ 10.0.0.192/27
- 10.0.0.128/27
- 10.0.0.64/27
> .0-.127 and .128-.191 are used; next is .192.
? Why use VLSM?
- It makes OSPF faster
+ To size each subnet to its needs and avoid wasting addresses
- It encrypts traffic
- It is required for VLANs
> One mask per need.

=== boss
?= What is the network address of 192.168.100.170/29?
= 192.168.100.168
> Block 8: 168-175.
?= Broadcast of 10.20.30.40/22?
= 10.20.31.255
> /22 = .252 in the 3rd octet, block 4: 28-31.
? Which host address is in the same subnet as 172.16.10.50/28?
- 172.16.10.64
+ 172.16.10.60
- 172.16.10.47
- 172.16.10.48
> 172.16.10.48/28 = .48-.63; .48 is the network, .60 is a valid host.
?= A WAN link needs 2 addresses. What prefix is traditional?
= /30 | 30
> /30 gives exactly 2 usable addresses.
? Which pair of subnets OVERLAPS?
+ 10.1.0.0/23 and 10.1.1.0/24
- 10.1.0.0/24 and 10.1.1.0/24
- 10.1.2.0/24 and 10.1.3.0/24
- 10.1.4.0/23 and 10.1.6.0/23
> 10.1.0.0/23 covers 10.1.0.0 - 10.1.1.255, which contains 10.1.1.0/24.
?= How many hosts does 255.255.252.0 support per subnet?
= 1022
> /22 = 10 host bits; 1024 - 2.
`;
