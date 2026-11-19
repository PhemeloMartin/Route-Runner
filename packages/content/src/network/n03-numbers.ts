import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n03 | Binary, Decimal and Hex - The Language of Networks | 3
@domain 1.0 Network Infrastructure and Connectivity
@sources ComNet Chapter 8 - IP Addressing (binary/decimal conversion slides); IP_Subnetting_Cheat_Sheet.xlsx
@story
Mma Neo writes 11000000.10101000.00000001.00001010 on the whiteboard. "This is the same thing as 192.168.1.10. Computers only see ones and zeros. If you can flip between binary and decimal in your head, subnetting becomes easy. If you can't, subnetting will haunt you forever." Phemelo groans. She smiles: "It's only eight numbers. Let's go."
@lab drill:binary | Binary & wildcard drills in the Exam Hall

=== lesson n03-1 | Binary in Ten Minutes | 20
@analogy An octet is a row of 8 light switches. Each switch has a fixed value: 128, 64, 32, 16, 8, 4, 2, 1. Switch some on, add up the values of the ones that are ON - that's the decimal number.
@objectives
- Convert an 8-bit binary octet to decimal and back
- Explain why the biggest octet value is 255
- Convert a full IPv4 address to binary
@body
Every IPv4 address is **32 bits**, written as four **octets** (8 bits each) separated by dots.

**The place values never change:** 128 | 64 | 32 | 16 | 8 | 4 | 2 | 1

**Binary to decimal:** add the place values where there is a 1.
- 11000000 = 128 + 64 = **192**
- 10101000 = 128 + 32 + 8 = **168**
- 11111111 = 128+64+32+16+8+4+2+1 = **255** (all switches on - the maximum)

**Decimal to binary (the subtraction method):** go left to right. Does the place value fit into what's left? Write 1 and subtract; otherwise write 0.
- 172: 128 fits (44 left) **1**, 64 no **0**, 32 fits (12 left) **1**, 16 no **0**, 8 fits (4 left) **1**, 4 fits (0 left) **1**, 2 **0**, 1 **0** -> **10101100**

**Memorise the "mask values"** - the numbers you get by turning switches on from the LEFT:
128, 192, 224, 240, 248, 252, 254, 255. These are the only values a subnet mask octet can have. You'll use them every single day.

Speed tip: you only need the full method for the "interesting" octet. 0 and 255 you know instantly.
@terms
- Bit :: A single binary digit: 0 or 1
- Octet :: A group of 8 bits; IPv4 has four octets
- Place value :: The fixed value of each bit position: 128, 64, 32, 16, 8, 4, 2, 1
- Mask values :: 128, 192, 224, 240, 248, 252, 254, 255 - the only valid subnet-mask octet values
@pro
- "An IPv4 address is a 32-bit number shown as four decimal octets."
- "The valid mask octet values are 128, 192, 224, 240, 248, 252, 254 and 255."
@interview Why can't an IPv4 octet be 256 or higher? :: Each octet is 8 bits. With all 8 bits set to 1 the value is 128+64+32+16+8+4+2+1 = 255, so 0 to 255 is the full range - 256 values in total.
@quiz
?= Convert 11110000 to decimal.
= 240
> 128 + 64 + 32 + 16 = 240.
?= Convert 10 to an 8-bit binary number.
= 00001010
> 8 + 2 = 10, so the 8 and 2 bits are on: 00001010.
? Which of these can NOT be a subnet mask octet?
- 252
- 224
+ 250
- 128
> Mask octets are contiguous ones from the left: 128, 192, 224, 240, 248, 252, 254, 255. 250 = 11111010 has a gap.
?= Convert 10101000 to decimal.
= 168
> 128 + 32 + 8 = 168.

=== lesson n03-2 | Hexadecimal - for MAC and IPv6 Addresses | 15
@analogy Hex is shorthand. Writing 1111 1010 is tiring, so we give each group of 4 bits a single symbol from 0-9 and A-F. One hex digit = 4 bits, every time.
@objectives
- Count in hexadecimal and convert hex digits to binary
- Read MAC addresses and IPv6 groups
@body
**Hexadecimal (base 16)** uses 16 symbols: 0 1 2 3 4 5 6 7 8 9 A B C D E F (A=10 ... F=15).

**One hex digit = 4 bits (a nibble).** So one byte = 2 hex digits:
- 1111 1111 = **FF** = 255
- 1010 1100 = **AC** = 172
- 0000 1010 = **0A** = 10

**Where you see hex:**
- **MAC addresses**: 48 bits = 12 hex digits, e.g. 00D0.97A3.4F21 (Cisco format) or 00-D0-97-A3-4F-21 (Windows). The first 24 bits are the **OUI** - the manufacturer's ID.
- **IPv6 addresses**: 128 bits = 32 hex digits in 8 groups of 4, e.g. 2001:0DB8:ACAD:0001:0000:0000:0000:0010.
- **Cisco config register** 0x2102 and memory addresses.

Quick conversion: hex -> split each digit into 4 bits (8 4 2 1). C = 12 = 1100, so 0xC0 = 1100 0000 = 192.
@terms
- Hexadecimal :: Base-16 numbering using 0-9 and A-F
- Nibble :: 4 bits = one hex digit
- MAC address :: 48-bit hardware address, written as 12 hex digits
- OUI :: Organizationally Unique Identifier - first half of a MAC that identifies the vendor
@pro
- "One hex digit represents exactly four bits, so a 48-bit MAC address is 12 hex digits."
@quiz
?= What is hex F in decimal?
= 15
> A=10, B=11, C=12, D=13, E=14, F=15.
?= Convert hex C0 to decimal.
= 192
> C = 1100, 0 = 0000 -> 11000000 = 192.
? How many bits does one hex digit represent?
- 2
+ 4
- 8
- 16
> One hex digit covers 16 values = 2^4, so 4 bits.

=== boss
?= Convert 11111100 to decimal.
= 252
> 128+64+32+16+8+4 = 252 (a /30 mask octet!).
?= Convert 200 to binary (8 bits).
= 11001000
> 128 + 64 + 8 = 200.
? A MAC address has how many bits?
- 32
+ 48
- 64
- 128
> 48 bits = 6 bytes = 12 hex digits.
?= Convert hex FE to decimal.
= 254
> F = 15 x 16 = 240, plus E = 14 -> 254.
? What is 192.168.1.1 in binary (first octet only)?
+ 11000000
- 10101000
- 11100000
- 10000000
> 192 = 128 + 64.
`;
