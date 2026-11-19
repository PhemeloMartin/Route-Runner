import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c04 | Virtualization and Virtual Machines | 4
@sources Big Data: Virtualization for Big Data (slides & journal); OS research: Virtualization_Footprint_Why_Re_Invest.pdf; your VMware Workstation 17.6 installer and Ubuntu 24.04.3 ISO (Linux folder)
@story
"The cloud is just somebody else's computer," Lindiwe jokes, "chopped into thousands of virtual ones. Before you rent VMs from AWS, build your own." She points at the Server Room's VM Manager. "Create one. Break its network. Snapshot it. Restore it. Then you'll understand what EC2 really is."
@lab vm:vm-manager | VM Manager: create VMs & test network modes

=== lesson c04-1 | Hypervisors and How Virtualization Works | 20
@analogy One physical server running VMs is like a big office building rented out floor by floor. Each tenant thinks they have their own building - their own front door, lights and plumbing - but it's all one structure managed by the landlord (hypervisor).
@objectives
- Explain what a hypervisor does and type 1 vs type 2
- List the benefits of virtualization
- Explain resource overcommitment
@body
A **hypervisor** (virtual machine monitor) presents virtual hardware - vCPUs, vRAM, virtual disks, virtual NICs - to each **guest OS**, and schedules the real hardware between them. Modern CPUs help with **hardware virtualization extensions** (Intel VT-x, AMD-V) - enable them in the BIOS/UEFI or your VMs will be slow or won't start.

- **Type 1 / bare metal:** VMware ESXi, Microsoft Hyper-V, KVM (the hypervisor behind most public clouds, incl. AWS Nitro and Google), Proxmox, Xen.
- **Type 2 / hosted:** VirtualBox, VMware Workstation, Parallels - run as an app on Windows/macOS.

**Benefits:** consolidation (10-20 VMs on one host -> less hardware, power and cooling - a big deal with South African electricity costs), fast provisioning (minutes not weeks), **snapshots**, **cloning/templates**, **live migration** (move a running VM to another host - vMotion), isolation, and easy lab environments.

**Overcommitment:** you can allocate more vCPUs/vRAM in total than physically exists because VMs rarely peak together - but overdo it and everything slows (CPU ready time, memory ballooning/swapping).

**Virtual disks:** thin-provisioned (grows as used) vs thick (allocated up front). Formats: VMDK (VMware), VHDX (Hyper-V), QCOW2 (KVM), VDI (VirtualBox).
@terms
- Hypervisor :: Software layer that creates and runs virtual machines
- Guest OS :: The operating system running inside a VM
- VT-x / AMD-V :: CPU features that accelerate virtualization - enable in BIOS
- Live migration :: Moving a running VM between hosts without downtime
- Thin provisioning :: Virtual disk that only uses real space as data is written
- Overcommitment :: Allocating more virtual resources than physically exist
@pro
- "Public clouds run on type 1 hypervisors - AWS uses its KVM-based Nitro system."
@quiz
? A VM won't start: "VT-x is disabled". Where do you fix it?
+ In the host computer's BIOS/UEFI settings
- In Ubuntu inside the VM
- In the router
- In the VM's network adapter
> Hardware virtualization must be enabled on the host.
? Which hypervisor is Type 2?
+ VMware Workstation
- VMware ESXi
- Hyper-V Server
- KVM
> Runs on Windows as an application.
? What is live migration?
+ Moving a running VM to another host without downtime
- Installing an OS
- Copying a VM while it's off
- Upgrading the hypervisor
> e.g. VMware vMotion.

=== lesson c04-2 | VM Network Modes, Snapshots and Templates | 25
@analogy NAT mode is staying in a hotel room - you can phone out through reception, but outsiders can't dial your room directly. Bridged is renting your own house on the street. Host-only is a walkie-talkie between you and your PC only. Internal is a private intercom between VMs.
@objectives
- Compare NAT, bridged, host-only and internal network modes
- Predict what IP a VM gets in each mode
- Use snapshots correctly (and know their limits)
@body
| Mode | VM gets IP from | Internet? | Reachable from your LAN? | Use it for |
|---|---|---|---|---|
| **NAT** | hypervisor's DHCP (VirtualBox 10.0.2.15) | yes | no (needs port forwarding) | default, browsing, updates |
| **Bridged** | your real router (e.g. 192.168.1.x) | yes | yes - a real LAN device | servers others must reach |
| **Host-only** | hypervisor's host-only DHCP (192.168.56.x) | **no** | only from the host PC | safe isolated labs |
| **Internal** | nothing unless you run DHCP | no | no - VMs only | multi-VM lab networks |

You can give a VM **two NICs** - e.g. NAT for updates + host-only for SSH from your laptop.

**Troubleshooting a VM's network** is pure networking: [[ip a]] (did it get an address?), [[ip r]] (default route?), ping the gateway, ping 8.8.8.8, ping a name. A host-only VM failing [[apt update]] is *expected* - no internet.

**Snapshots** save a VM's disk (and optionally memory) state so you can roll back - perfect before risky changes. But **snapshots are not backups**: they live on the same storage, and long-lived snapshot chains hurt performance. Delete them after the change succeeds.

**Templates/golden images** - a pre-configured, patched VM you clone to deploy new servers in minutes. In the cloud these are **AMIs** (Amazon Machine Images).
@terms
- NAT mode :: VM shares the host's connection; outbound internet, not reachable from outside
- Bridged mode :: VM appears as its own device on the physical LAN
- Host-only mode :: Private network between host and VMs, no internet
- Internal network :: VM-to-VM only network
- Snapshot :: Point-in-time VM state for quick rollback - not a backup
- Golden image :: Pre-built, patched template used to clone new VMs
@pro
- "A snapshot is a rollback point, not a backup - it lives on the same storage as the VM."
@interview A colleague's VM can't install packages but you can SSH to it from the host. Which network mode is it probably using, and how do you fix it? :: Host-only - the host can reach it, but there's no route to the internet. Add a second adapter in NAT mode (or switch to NAT/bridged), confirm with ip a and ip r that it has a default route, then apt update.
@quiz
? Which mode lets other computers on your home LAN reach the VM directly?
- NAT
+ Bridged
- Host-only
- Internal
> The VM gets a real LAN address.
? A VM in host-only mode can't run apt update. Why?
+ Host-only networks have no internet access
- apt is broken
- The VM has no disk
- DNS is disabled forever
> Expected behaviour.
? What is the BEST use of a snapshot?
+ A quick rollback point before a risky change
- A long-term backup
- A way to make the VM faster
- A replacement for RAID
> Delete it once the change is verified.

=== boss
? Which hypervisor type do public cloud providers use?
+ Type 1 (bare metal)
- Type 2 (hosted)
- Containers only
- No hypervisor
> e.g. KVM/Nitro, Hyper-V, Xen.
? A VirtualBox VM in NAT mode usually gets which address?
+ 10.0.2.15
- 192.168.1.50
- 192.168.56.101
- 169.254.0.1
> VirtualBox NAT default.
? Which statement about snapshots is TRUE?
+ They are not backups and degrade performance if kept too long
- They are stored off-site automatically
- They replace RAID
- They speed up the VM
> Use, then delete.
? What is a golden image?
+ A patched, pre-configured template used to clone new VMs
- A gold-plated server
- A backup tape
- A RAID level
> AMIs in AWS.
? Which CPU feature must be enabled in the BIOS to run 64-bit VMs efficiently?
+ VT-x / AMD-V
- Hyper-threading only
- Secure Boot
- XMP
> Hardware virtualization extensions.
`;
