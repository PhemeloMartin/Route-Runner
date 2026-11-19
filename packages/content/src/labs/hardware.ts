/** Data for the 3D hardware labs: PC Workshop, Data Centre rack and the Cable bench. */

export interface PcPart {
  id: string;
  name: string;
  what: string;
  analogy: string;
  color: string;
}

export interface PcStep {
  part: string;
  action: string;
  why: string;
  mistake: string;
}

export const PC_PARTS: PcPart[] = [
  { id: 'case', name: 'Case (chassis)', what: 'The metal box that holds and protects everything and guides airflow.', analogy: 'The body of a car.', color: '#2b2f3a' },
  { id: 'motherboard', name: 'Motherboard', what: 'The main circuit board. Every part plugs into it and talks through it (via buses like PCIe).', analogy: 'The road network of a city connecting every building.', color: '#1f6f43' },
  { id: 'cpu', name: 'CPU (processor)', what: 'Executes instructions: fetch, decode, execute - billions of times per second. Cores let it do several things at once.', analogy: 'The chef in the kitchen following recipes (programs).', color: '#c0c4cc' },
  { id: 'paste', name: 'Thermal paste', what: 'A thin layer that fills microscopic gaps between CPU and cooler so heat flows out.', analogy: 'Butter on bread - spread thin, not a whole block.', color: '#e5e7eb' },
  { id: 'cooler', name: 'CPU cooler', what: 'Heatsink + fan (or liquid AIO) that pulls heat off the CPU. Without it the CPU throttles or shuts down within seconds.', analogy: 'A car radiator.', color: '#7c8796' },
  { id: 'ram', name: 'RAM (memory)', what: 'Fast, temporary workspace. Cleared when power is off. More RAM = more programs open without slowing down.', analogy: 'The chef\'s countertop - big counter, more dishes at once.', color: '#3b82f6' },
  { id: 'ssd', name: 'NVMe SSD (storage)', what: 'Permanent storage for the OS and files. NVMe sits in an M.2 slot and talks over PCIe - much faster than an old hard drive.', analogy: 'The pantry: slower than the counter but keeps food permanently.', color: '#111827' },
  { id: 'gpu', name: 'GPU (graphics card)', what: 'Thousands of small cores for parallel maths - graphics, AI and HPC work.', analogy: 'A team of 1000 junior cooks all chopping onions at the same time.', color: '#374151' },
  { id: 'psu', name: 'PSU (power supply)', what: 'Converts AC from the wall into the DC voltages (12V, 5V, 3.3V) the parts need.', analogy: 'The power station + transformer for the city.', color: '#4b5563' },
  { id: 'fans', name: 'Case fans', what: 'Create airflow: cool air IN at the front/bottom, hot air OUT at the back/top.', analogy: 'Open the front door and back window to get a breeze through the house.', color: '#9ca3af' },
  { id: 'nic', name: 'Network card (NIC)', what: 'Connects the PC to the network. Has a unique MAC address burned in. Often built into the motherboard.', analogy: 'The house\'s postbox with a fixed street number.', color: '#f59e0b' },
];

export const PC_BUILD_STEPS: PcStep[] = [
  { part: 'cpu', action: 'Lift the socket lever and drop the CPU in - match the golden triangle. NO force.', why: 'The CPU only fits one way. Bent pins = dead board.', mistake: 'Pushing the CPU in at an angle and bending the socket pins.' },
  { part: 'paste', action: 'Apply a pea-sized drop of thermal paste on the centre of the CPU.', why: 'Air is a terrible heat conductor; paste replaces the air gaps.', mistake: 'Using too much - it squeezes out and makes a mess (non-conductive paste is safe, but messy).' },
  { part: 'cooler', action: 'Mount the cooler evenly, tighten screws in an X pattern, plug its fan into CPU_FAN.', why: 'Even pressure = even contact = good cooling. The BIOS warns if CPU_FAN is empty.', mistake: 'Forgetting to peel the plastic film off the cooler base.' },
  { part: 'ram', action: 'Install two RAM sticks in slots A2 and B2 (2nd and 4th from the CPU) until both clips click.', why: 'A2/B2 enables DUAL-CHANNEL mode - double the memory bandwidth.', mistake: 'Putting both sticks side by side (A1/A2) = single channel, slower.' },
  { part: 'ssd', action: 'Slide the NVMe SSD into the M.2 slot at an angle and screw it down.', why: 'NVMe uses PCIe lanes directly - 5-10x faster than SATA SSDs.', mistake: 'Leaving the M.2 heatsink film on, or using the slot that disables SATA ports.' },
  { part: 'motherboard', action: 'Install the I/O shield, then mount the motherboard on the standoffs in the case.', why: 'Standoffs stop the board touching the metal case and short-circuiting.', mistake: 'Missing a standoff or adding an extra one where there is no hole.' },
  { part: 'psu', action: 'Mount the PSU (fan facing down if there is a vent) and route the cables.', why: 'The PSU fan should breathe fresh air, not the GPU\'s exhaust.', mistake: 'Not connecting the 8-pin CPU (EPS) power - the PC won\'t POST.' },
  { part: 'gpu', action: 'Remove two slot covers and press the GPU into the top PCIe x16 slot. Plug in PCIe power.', why: 'The top x16 slot is wired straight to the CPU with the full 16 lanes.', mistake: 'Forgetting the GPU power cable - black screen or a warning light.' },
  { part: 'fans', action: 'Front fans = INTAKE, rear/top fans = EXHAUST. Slightly more intake than exhaust.', why: 'Positive pressure pushes air out of the gaps, so less dust gets sucked in.', mistake: 'All fans blowing in (or all out) - hot air gets trapped.' },
  { part: 'nic', action: 'Connect the Ethernet cable from the motherboard NIC to the wall/switch.', why: 'Now the PC can join the network: it will ask DHCP for an IP address at boot.', mistake: 'A loose RJ45 that didn\'t click - the link light stays off.' },
];

export const BOOT_SEQUENCE = [
  { step: 'Power on', plain: 'The PSU sends a "power good" signal; the CPU starts executing firmware code from a chip on the motherboard.' },
  { step: 'POST', plain: 'Power-On Self-Test: the firmware checks CPU, RAM and GPU. Beeps or debug LEDs tell you what failed.' },
  { step: 'UEFI / BIOS', plain: 'Firmware finds a boot device (the SSD) according to the boot order.' },
  { step: 'Bootloader', plain: 'GRUB (Linux) or Windows Boot Manager loads the operating system kernel into RAM.' },
  { step: 'Kernel', plain: 'The kernel takes control of hardware, sets up memory management and starts handling INTERRUPTS.' },
  { step: 'Init / systemd', plain: 'The first process (PID 1) starts services: networking (DHCP request), logging, SSH, your desktop.' },
  { step: 'Login', plain: 'You log in. Every keypress you type now raises a hardware interrupt that the CPU pauses to handle.' },
];

// ------------------------------------------------------------ data centre rack

export interface RackItem {
  id: string;
  name: string;
  units: number;
  weightKg: number;
  color: string;
  what: string;
  ports?: number;
}

export const RACK_ITEMS: RackItem[] = [
  { id: 'patch', name: 'Patch panel (24-port)', units: 1, weightKg: 1, color: '#d1d5db', what: 'Where building cables terminate. Short patch cords then run to the switch - you never re-cable the walls.' },
  { id: 'switch', name: 'Top-of-rack switch (48x 10G)', units: 1, weightKg: 7, color: '#1d4ed8', what: 'Connects every server in this rack and uplinks to the core/spine.', ports: 48 },
  { id: 'router', name: 'Edge router / firewall', units: 1, weightKg: 8, color: '#0f766e', what: 'Connects the data centre to the ISP and filters traffic.', ports: 8 },
  { id: 'server1u', name: '1U server (web)', units: 1, weightKg: 16, color: '#374151', what: 'Thin "pizza box" server: 1-2 CPUs, lots of RAM, a few SSDs. Ideal for web and app tiers.', ports: 2 },
  { id: 'server2u', name: '2U server (database/virtualisation host)', units: 2, weightKg: 28, color: '#1f2937', what: 'More drive bays and PCIe slots - runs a hypervisor with many VMs, or a database.', ports: 4 },
  { id: 'gpu4u', name: '4U GPU server (HPC / AI)', units: 4, weightKg: 45, color: '#111827', what: '8 GPUs for AI training and HPC. Draws 5-10 kW - plan power and cooling first!', ports: 4 },
  { id: 'storage', name: '2U storage array (SAN/NAS)', units: 2, weightKg: 30, color: '#4b5563', what: 'Many disks in RAID, shared to servers over the network (iSCSI/NFS).', ports: 4 },
  { id: 'ups', name: 'UPS (3 kVA)', units: 2, weightKg: 40, color: '#92400e', what: 'Batteries that keep everything running through load-shedding until the generator starts. HEAVY - goes at the bottom.' },
  { id: 'kvm', name: 'KVM console drawer', units: 1, weightKg: 9, color: '#6b7280', what: 'Fold-out screen + keyboard to work on any server locally.' },
  { id: 'blank', name: 'Blanking panel', units: 1, weightKg: 0.3, color: '#0b0f19', what: 'Covers empty U spaces so hot exhaust air cannot loop back to the cold front. Cheap, very effective.' },
  { id: 'cable-mgmt', name: 'Cable manager (1U)', units: 1, weightKg: 1, color: '#9ca3af', what: 'Brush/finger panel that keeps patch cables tidy - tidy cables = good airflow and fast troubleshooting.' },
];

export interface RackRule {
  id: string;
  text: string;
  why: string;
}

export const RACK_RULES: RackRule[] = [
  { id: 'heavy-bottom', text: 'Heaviest equipment (UPS, storage) in the bottom third', why: 'A top-heavy rack can tip over when you slide a server out on its rails.' },
  { id: 'tor-top', text: 'Patch panel and top-of-rack switch at the top', why: 'Short patch cords, and cables drop down to the servers neatly.' },
  { id: 'no-gaps', text: 'No open gaps: fill empty U with blanking panels', why: 'Gaps let hot exhaust recirculate into the cold aisle - servers overheat.' },
  { id: 'power', text: 'Total power under the rack budget (8 kW)', why: 'Each rack PDU circuit has a limit. Exceed it and the breaker trips - everything dies.' },
  { id: 'redundant', text: 'At least two servers for the web tier', why: 'No single point of failure: one server can fail or be patched while the other serves users.' },
];

export const RACK_POWER_W: Record<string, number> = { patch: 0, switch: 350, router: 250, server1u: 450, server2u: 800, gpu4u: 4500, storage: 700, ups: 0, kvm: 40, blank: 0, 'cable-mgmt': 0 };

export interface RackSlot {
  u: number; // bottom U of the item (1 = bottom of the rack)
  item: string;
}

export function evaluateRack(slots: RackSlot[], height = 42): { rule: RackRule; ok: boolean; detail: string }[] {
  const items = slots.map((s) => ({ ...s, info: RACK_ITEMS.find((r) => r.id === s.item)! }));
  const used = new Set<number>();
  for (const s of items) for (let k = 0; k < s.info.units; k++) used.add(s.u + k);
  const top = Math.max(0, ...items.map((s) => s.u + s.info.units - 1));
  const gaps = Array.from({ length: top }, (_, k) => k + 1).filter((u) => !used.has(u));
  const heavy = items.filter((s) => s.info.weightKg >= 30);
  const tor = items.filter((s) => s.item === 'switch' || s.item === 'patch');
  const watts = items.reduce((a, s) => a + (RACK_POWER_W[s.item] ?? 0), 0);
  const webs = items.filter((s) => s.item === 'server1u').length;
  return RACK_RULES.map((rule) => {
    switch (rule.id) {
      case 'heavy-bottom':
        return { rule, ok: heavy.length > 0 && heavy.every((s) => s.u <= height / 3), detail: heavy.length ? heavy.map((s) => `${s.info.name} at U${s.u}`).join(', ') : 'Add a UPS or storage array' };
      case 'tor-top':
        return { rule, ok: tor.length >= 2 && tor.every((s) => s.u >= top - 3), detail: tor.length ? tor.map((s) => `${s.info.name} at U${s.u}`).join(', ') : 'Add a patch panel and a switch' };
      case 'no-gaps':
        return { rule, ok: gaps.length === 0 && top > 0, detail: gaps.length ? `Open gaps at U${gaps.slice(0, 6).join(', U')}${gaps.length > 6 ? '...' : ''}` : 'No gaps below the top device' };
      case 'power':
        return { rule, ok: watts <= 8000, detail: `${watts} W of 8000 W` };
      case 'redundant':
        return { rule, ok: webs >= 2, detail: `${webs} web server(s)` };
      default:
        return { rule, ok: false, detail: '' };
    }
  });
}

/** Inlet temperature estimate for the airflow view: gaps and power density raise it. */
export function rackInletTemp(slots: RackSlot[]): number {
  const res = evaluateRack(slots);
  const gaps = res.find((r) => r.rule.id === 'no-gaps')!.ok ? 0 : 6;
  const watts = slots.reduce((a, s) => a + (RACK_POWER_W[s.item] ?? 0), 0);
  return Math.round(20 + gaps + watts / 1500);
}

// ------------------------------------------------------------ cables

export const CABLES = [
  { id: 'straight', name: 'Copper straight-through (UTP Cat6)', color: '#22c55e', use: 'Unlike devices: PC-switch, switch-router, server-switch.', detail: 'Both ends wired the same (T568B-T568B). Max 100 m.' },
  { id: 'crossover', name: 'Copper crossover', color: '#f97316', use: 'Like devices: switch-switch, router-router, PC-PC, PC-router.', detail: 'One end T568A, the other T568B: transmit pairs cross over to receive. Auto-MDIX ports make this automatic today, but the exam still asks.' },
  { id: 'console', name: 'Console (rollover)', color: '#38bdf8', use: 'Laptop serial/USB to the CONSOLE port of a router/switch for first-time setup.', detail: 'Pins are reversed (1-8, 2-7...). Not a network cable - it carries a text terminal at 9600 baud.' },
  { id: 'fiber', name: 'Fiber optic (single-/multi-mode)', color: '#eab308', use: 'Long distances and high speed between switches/buildings.', detail: 'Light, not electricity: immune to electrical interference. Multimode ~550 m; single-mode up to tens of km.' },
  { id: 'serial', name: 'Serial (DCE/DTE)', color: '#ef4444', use: 'Legacy WAN links between routers.', detail: 'The DCE end provides the clock rate. You still see it in labs and exam questions.' },
] as const;

export const T568B = ['white-orange', 'orange', 'white-green', 'blue', 'white-blue', 'green', 'white-brown', 'brown'];
export const T568A = ['white-green', 'green', 'white-orange', 'blue', 'white-blue', 'orange', 'white-brown', 'brown'];
