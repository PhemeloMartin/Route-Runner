import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n00 | How a Computer Really Works | 0
@sources Operating Systems & Server Management: Chapter 1 (Computer System Overview), Chapter 3 (Memory Management), 05-interrupts.pdf, Memory Calculations.pptx; Tanenbaum - Modern Operating Systems
@story
Day 1. Phemelo walks into the Route Runner Academy holding an old laptop that "just got slow". The mentor, Mma Neo, smiles: "Before we connect computers together, you must understand ONE computer. Every network is just computers talking - if you don't know what's inside the box, you'll never troubleshoot what's between the boxes." She slides a screwdriver across the table. "Open it."
@lab pcbuild:workshop | Build a PC in the 3D Workshop

=== lesson n00-1 | Inside the Box: The Parts of a Computer | 15
@analogy A computer is a restaurant. The CPU is the chef, RAM is the counter where ingredients are laid out, the SSD is the pantry, the motherboard is the corridors connecting everything, the PSU is the electricity supply, and the NIC is the front door where orders (network data) arrive.
@objectives
- Name every major part inside a PC and what it does
- Explain the difference between memory (RAM) and storage (SSD/HDD)
- Know which parts a network engineer cares about most (NIC, CPU, RAM)
@body
Every computer - your laptop, a Cisco router, a cloud server, a supercomputer - has the same basic parts:

| Part | Job in plain English |
|---|---|
| **CPU** | Does the thinking: runs program instructions billions of times per second |
| **RAM** | Short-term memory. Fast, but forgets everything when power goes off |
| **Storage (SSD/HDD)** | Long-term memory. Keeps files and the operating system when powered off |
| **Motherboard** | The big circuit board everything plugs into; carries data between parts |
| **PSU** | Turns wall AC power into the DC voltages parts need |
| **GPU** | Graphics and massively parallel maths (games, AI, HPC) |
| **NIC** | Network Interface Card - connects to the network, has a unique MAC address |

**Memory vs storage** is the classic confusion. RAM is the countertop: everything you are working on *right now* sits there because it is fast to reach. Storage is the pantry: big and permanent, but slower. When a program "opens", it is copied from storage into RAM.

**Fun fact for networking:** a Cisco router is a computer too. It has a CPU, RAM (holds the *running-config*), NVRAM (holds the *startup-config*), flash (holds the IOS operating system) and ROM (bootstrap). You will meet these again in Chapter 6.

Go to the **PC Workshop** in the 3D world and build a PC part by part - each part explains itself as you install it.
@terms
- CPU :: Central Processing Unit - the chip that executes program instructions (the chef)
- RAM :: Random Access Memory - fast, temporary working memory, wiped when power is off
- SSD :: Solid State Drive - permanent storage with no moving parts; NVMe SSDs use PCIe and are very fast
- Motherboard :: The main circuit board that connects all components
- PSU :: Power Supply Unit - converts AC wall power to DC voltages
- NIC :: Network Interface Card - connects a device to a network; has a burned-in MAC address
@pro
- "RAM is volatile working memory; storage is non-volatile. Programs load from storage into RAM to run."
- "On a Cisco device the running-config lives in RAM and the startup-config lives in NVRAM."
@interview A user says their PC is slow when many browser tabs are open. Which component would you check first and why? :: RAM. Each tab uses memory; when RAM is full the OS starts swapping pages to the much slower SSD/HDD (paging), so everything slows down. I would check memory usage in Task Manager or with free -h on Linux.
@quiz
? Which component keeps your files when the computer is switched off?
- RAM
+ SSD / hard drive
- CPU cache
- The NIC
> Storage (SSD/HDD) is non-volatile. RAM and CPU cache are volatile and lose their contents without power.
? On a Cisco router, where is the running-config stored?
+ RAM
- NVRAM
- Flash
- ROM
> Running-config = RAM (lost on reboot). Startup-config = NVRAM. IOS image = flash. Bootstrap = ROM.
?? Which of these are found inside a typical PC? (choose all that apply)
+ CPU
+ NIC
+ PSU
- Router
> A router is a separate network device. The NIC is the PC's own network connection.

=== lesson n00-2 | The CPU, Instruction Cycle and Interrupts | 20
@analogy An interrupt is a waiter tapping the busy chef on the shoulder: "Table 4's order is ready!" The chef bookmarks the recipe, handles the urgent thing, then goes back to exactly where they stopped.
@objectives
- Describe the fetch-decode-execute cycle
- Explain what an interrupt is and list the four classes
- Explain why interrupts and DMA make computers efficient
@body
**The instruction cycle.** A CPU endlessly repeats: **fetch** the next instruction from memory (address in the *program counter*), **decode** it, **execute** it, then move to the next one. A 3 GHz CPU does about 3 billion cycles per second, per core.

**Why interrupts exist.** Devices like the keyboard, disk and network card are thousands of times slower than the CPU. Without interrupts the CPU would waste time constantly asking "any data yet?" (this is called *polling*). With interrupts, the device *signals* the CPU only when it needs attention.

**The interrupt cycle** (from your OS module):
1. A device raises an interrupt signal.
2. The CPU finishes the current instruction.
3. It saves its state (program counter, registers) - like a bookmark.
4. It jumps to the **interrupt handler** (a small OS routine for that device).
5. The handler services the device, then the CPU restores state and continues the interrupted program.

**Four classes of interrupts:** **Program** (e.g. divide by zero, illegal memory access), **Timer** (lets the OS share the CPU between programs - multitasking), **I/O** (a device finished, e.g. a packet arrived on the NIC), **Hardware failure** (power failure, memory parity error).

**Multiple interrupts** can be handled *sequentially* (disable interrupts while handling one) or with *priorities* (a high-priority interrupt like the network card can interrupt a low-priority printer handler).

**DMA (Direct Memory Access)** goes one step further: a big transfer (e.g. a 1 MB file from disk, or a burst of network packets) is copied straight into RAM by a DMA controller, and the CPU gets ONE interrupt at the end instead of one per byte.

**Network link:** every Ethernet frame your NIC receives triggers (or is batched into) an interrupt. A router forwarding millions of packets per second is an interrupt-handling machine - that's why high-end routers use special hardware (ASICs) to forward packets without bothering the CPU.
@terms
- Fetch-decode-execute :: The endless cycle a CPU runs to process each instruction
- Interrupt :: A signal that makes the CPU pause its current work to handle an urgent event
- Interrupt handler :: The OS routine (ISR) that services a specific interrupt
- Polling :: The CPU repeatedly checking a device for data - wasteful compared to interrupts
- DMA :: Direct Memory Access - a controller moves blocks of data to RAM without the CPU, then interrupts once
- Timer interrupt :: Lets the OS take the CPU back regularly so many programs can share it (multitasking)
@pro
- "Interrupts let the CPU work on other tasks instead of polling slow I/O devices."
- "With DMA, the CPU is only interrupted once the whole block transfer is complete."
@interview Explain what happens, at the hardware level, when a network packet arrives at a server. :: The NIC receives the frame and uses DMA to copy it into a buffer in RAM. It then raises an I/O interrupt. The CPU saves its current state, runs the NIC driver's interrupt handler, which hands the packet to the operating system's network stack (IP, then TCP/UDP), and finally resumes what it was doing.
@quiz
? Which interrupt class lets an operating system share one CPU between many programs?
- I/O interrupt
+ Timer interrupt
- Program interrupt
- Hardware failure interrupt
> The timer interrupt fires regularly so the OS scheduler can switch between processes (time-slicing).
? Before jumping to an interrupt handler, what must the CPU do first?
- Restart the computer
+ Save the current program counter and registers
- Clear RAM
- Poll every device
> Saving state is the "bookmark" that lets the CPU resume the interrupted program exactly where it left off.
? What is the main benefit of DMA?
- It makes the CPU clock faster
+ Large data transfers happen without the CPU copying every byte
- It replaces RAM
- It stops all interrupts
> The DMA controller moves the block and raises a single interrupt when done, freeing the CPU.
?= Dividing by zero triggers which class of interrupt? (one word)
= program | program interrupt
> Errors caused by the running program (divide by zero, illegal instruction, bad memory access) are program interrupts.

=== lesson n00-3 | Memory Hierarchy, Paging and Memory Maths | 25
@analogy The memory hierarchy is like where you keep things at home: your hands (registers), the table next to you (cache), the kitchen cupboard (RAM), the storeroom (SSD), and the storage unit across town (HDD/cloud). The closer it is, the faster - but the smaller.
@objectives
- Order the memory hierarchy by speed, size and cost
- Explain cache hits/misses and why locality matters
- Explain virtual memory, paging, page faults and the TLB
- Do basic memory calculations (address bits <-> memory size)
@body
**The hierarchy (fastest/smallest/most expensive at the top):** registers -> L1 cache -> L2 -> L3 -> RAM -> SSD -> HDD -> tape/cloud archive.

**Cache.** When the CPU needs data it checks the cache first. A **hit** is fast; a **miss** means a slow trip to RAM. Caches work because of **locality of reference**: programs reuse recent data (temporal locality) and nearby data (spatial locality).

**Virtual memory and paging.** Every process believes it owns a large, private address space. The OS splits memory into fixed-size **pages** (usually 4 KiB) and physical RAM into **frames** of the same size. The **page table** maps virtual pages to physical frames. If a page isn't in RAM, a **page fault** occurs (a program interrupt!) and the OS loads it from disk. The **TLB** (Translation Lookaside Buffer) is a tiny cache of recent page-table lookups, so translation is fast.

**Page replacement.** When RAM is full, the OS must evict a page. Algorithms from your OS slides: **FIFO** (oldest first), **LRU** (least recently used - good but costly), **Clock/Second-chance** (a cheap LRU approximation), **Working set**. Too much paging = **thrashing**: the disk light never stops and the PC crawls.

**Memory maths you must be able to do:**
- *n* address bits can address 2^n bytes. 32 bits -> 2^32 = 4,294,967,296 bytes = **4 GiB** (why 32-bit Windows can't use more than 4 GB RAM).
- 1 KiB = 2^10 = 1024 bytes; 1 MiB = 2^20; 1 GiB = 2^30.
- A 4 KiB page = 2^12 bytes, so the **offset** inside a page needs 12 bits. In a 32-bit address, 32 - 12 = **20 bits** are the page number -> 2^20 pages.

This "how many bits do I need?" thinking is EXACTLY the skill you'll use for subnetting in Chapter 8. Powers of two are a network engineer's best friend.
@terms
- Cache hit / miss :: Hit = data found in the fast cache; miss = must fetch from slower RAM
- Locality of reference :: Programs tend to reuse recent and nearby data - why caches work
- Virtual memory :: Each process gets its own address space mapped onto real RAM by the OS
- Page / frame :: Fixed-size blocks of virtual memory (page) and physical RAM (frame), typically 4 KiB
- Page fault :: The requested page isn't in RAM, so the OS must load it from disk
- TLB :: Translation Lookaside Buffer - a cache of recent virtual-to-physical address translations
- Thrashing :: The system spends more time swapping pages than doing useful work
@pro
- "With 4 KiB pages, the low 12 bits of an address are the offset and the rest is the page number."
- "Thrashing means the working set doesn't fit in RAM, so page faults dominate."
@interview A 32-bit system uses 4 KiB pages. How many bits are the page offset and how many pages can a process have? :: 4 KiB = 2^12 bytes, so the offset is 12 bits. That leaves 32 - 12 = 20 bits for the page number, so 2^20 = 1,048,576 pages.
@quiz
? Put these from FASTEST to slowest: RAM, L1 cache, SSD, registers. Which is the correct order?
- L1 cache, registers, RAM, SSD
+ registers, L1 cache, RAM, SSD
- RAM, registers, L1 cache, SSD
- registers, RAM, L1 cache, SSD
> Registers are inside the CPU core; then the cache levels; then RAM; storage is slowest.
?= How many bytes can a 16-bit address bus address? (number)
= 65536 | 65,536 | 64k | 64 kib
> 2^16 = 65,536 bytes = 64 KiB.
? A page fault happens when...
- the CPU overheats
+ a program accesses a page that is not currently in RAM
- the TLB is full
- two programs use the same page
> The OS handles the fault by loading the page from disk into a free frame (possibly evicting another page).
?= With 4 KiB pages, how many bits is the page offset? (number)
= 12
> 4096 = 2^12, so 12 bits address any byte inside the page.

=== lesson n00-4 | Cooling, Power, Booting and the Operating System | 20
@analogy An operating system is the restaurant manager: it decides which chef works on which order (process scheduling), who gets which counter space (memory), where the pantry items are (file system), and who's allowed in the kitchen (security).
@objectives
- Explain why cooling and airflow matter (thermal throttling)
- List the boot sequence from power-on to login
- Describe the core jobs of an operating system and kernel vs user mode
@body
**Heat is the enemy.** Every watt a chip uses becomes heat. A CPU's **TDP** (thermal design power) tells you how much heat the cooler must remove. If temperatures get too high the CPU **throttles** (slows itself down) and eventually shuts off to protect itself. Good airflow: **cool air in at the front/bottom, hot air out at the back/top**. Data centres scale this into **hot aisles and cold aisles** - you'll build one in the Data Centre lab.

**Power.** The PSU's 80 PLUS rating shows its efficiency. In South Africa a **UPS** (uninterruptible power supply) is essential: it bridges load-shedding until the generator takes over, and protects equipment from surges. Network gear in a cabinet with no UPS is a ticket waiting to happen.

**Boot sequence:** Power on -> **POST** (Power-On Self-Test) -> **UEFI/BIOS** finds the boot device -> **bootloader** (GRUB / Windows Boot Manager) -> **kernel** loads -> **init/systemd** (PID 1) starts services such as networking and SSH -> login. A Cisco router boots similarly: ROM bootstrap -> POST -> load IOS from flash -> load startup-config from NVRAM.

**What the OS does:** process management (scheduling), memory management (paging), file systems, device drivers and I/O (interrupt handlers), networking stack, and security (users, permissions).

**Kernel mode vs user mode.** The kernel runs with full hardware access. Your apps run in user mode and must ask the kernel for anything privileged through **system calls** (e.g. "open this file", "send this packet"). This separation stops a buggy app from crashing the whole machine - one of the security principles from your Information Security module.
@terms
- TDP :: Thermal Design Power - how much heat (watts) a cooler must remove from a chip
- Thermal throttling :: A chip slows itself down to avoid overheating
- POST :: Power-On Self-Test - firmware checks hardware before booting
- UEFI / BIOS :: Firmware that initialises hardware and finds the bootloader
- Kernel :: The core of the OS with full hardware access
- System call :: How a user program asks the kernel to do something privileged
- UPS :: Uninterruptible Power Supply - battery backup that rides through power cuts
@pro
- "Airflow should be front-to-back: cold aisle intake, hot aisle exhaust."
- "A Cisco router loads IOS from flash and the startup-config from NVRAM during boot."
@interview After load-shedding, a branch switch came back with no VLANs configured on some ports. What probably happened and how do you prevent it? :: The changes were only in the running-config (RAM) and were never saved to NVRAM with copy running-config startup-config, so the reboot loaded an older config. Prevention: always save after changes, use a UPS, and keep config backups (e.g. automated with Ansible).
@quiz
? Which step comes FIRST when a PC is switched on?
+ POST
- Bootloader
- Kernel
- Login screen
> POST checks the hardware before anything is loaded from disk.
? A CPU slowing itself down because it is too hot is called...
- overclocking
+ thermal throttling
- paging
- an interrupt storm
> Throttling protects the chip. Fix the cooling (paste, fans, airflow, dust).
? Why do applications use system calls?
- To speed up the CPU
+ To ask the kernel to perform privileged operations like file or network access
- To bypass the operating system
- To cool the processor
> User-mode programs cannot touch hardware directly; the kernel does it for them safely.

=== boss
? A server is extremely slow, the disk activity light is constantly on and RAM usage is 100%. What is the most likely explanation?
- The CPU is overclocked
+ Thrashing - the system is constantly paging to disk
- The NIC is faulty
- The PSU is too powerful
> When the working set exceeds RAM, page faults dominate and performance collapses.
? Which memory holds a Cisco router's IOS operating system image?
- NVRAM
- RAM
+ Flash
- ROM
> Flash = IOS image; NVRAM = startup-config; RAM = running-config; ROM = bootstrap/POST.
?= A system uses 36-bit physical addresses. How many GiB of RAM can it address? (number)
= 64
> 2^36 bytes = 2^6 x 2^30 = 64 GiB.
?? Which statements about interrupts are TRUE? (choose two)
+ They allow the CPU to avoid wasteful polling
+ The CPU saves its state before running the handler
- They can only be caused by the keyboard
- They make the CPU forget the current program
> Interrupts can come from any device, timers, errors or hardware failures, and state is always saved.
? What is the best airflow design for a PC case?
- All fans blowing inwards
+ Intake at the front/bottom, exhaust at the back/top
- All fans blowing outwards
- No fans if the CPU cooler is big
> Front-to-back, bottom-to-top follows natural convection; slightly more intake gives positive pressure (less dust).
`;
