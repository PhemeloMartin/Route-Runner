/**
 * A Windows-style Command Prompt for PCs, laptops and servers in the network lab.
 * Real commands: ipconfig, ping, tracert, arp, nslookup, netsh, ssh, telnet, putty.
 */
import { type CliResult, type CliSession } from '../cli/types.js';
import { isIPv4, isValidMask } from '../net/ip.js';
import { type Device, type Topology, getDevice, peerOf } from '../net/model.js';
import { dhcpRelease, dhcpRequest, forward, learnArp, ping, runtimeOf, tcpReach } from '../net/sim.js';
import { IosSession, sshProblem } from '../ios/session.js';

export class HostSession implements CliSession {
  readonly kind = 'host' as const;
  private pendingSsh?: { target: string; user: string };

  constructor(
    public topo: Topology,
    public deviceId: string,
    public hints = true,
  ) {}

  get dev(): Device {
    return getDevice(this.topo, this.deviceId);
  }

  title() {
    return `${this.dev.hostname} - Command Prompt`;
  }

  banner() {
    return 'Cisco Packet Tracer PC Command Line 1.0\n(Route Runner edition - type "help" for commands)\n';
  }

  prompt() {
    return this.pendingSsh ? 'Password: ' : 'C:\\>';
  }

  private nic() {
    return this.dev.interfaces.find((i) => i.media === 'copper')!;
  }

  exec(raw: string): CliResult {
    const line = raw.trim();
    const events: string[] = [];
    if (this.pendingSsh) {
      const { target, user } = this.pendingSsh;
      this.pendingSsh = undefined;
      const td = getDevice(this.topo, target);
      const u = td.users.find((x) => x.name === user);
      if (!u || u.secret !== line) return { output: '% Login invalid\n\n[Connection to host closed by foreign host]\n' };
      events.push('ssh:ok');
      return {
        output: '',
        events,
        push: new IosSession(this.topo, td.id, { hints: this.hints, via: 'vty', startPrivileged: u.privilege >= 15 }),
      };
    }
    if (!line) return { output: '' };
    const [cmd0, ...args] = line.split(/\s+/);
    const cmd = cmd0.toLowerCase();
    const out: string[] = [];
    const hint = (s: string) => this.hints && out.push(`[Route Runner hint] ${s}`);

    switch (cmd) {
      case 'help':
      case '?':
        out.push(
          'Available commands:',
          '  ipconfig [/all | /release | /renew]   show or refresh IP settings',
          '  netsh interface ip set address "Ethernet" static <ip> <mask> [gateway]',
          '  netsh interface ip set address "Ethernet" dhcp',
          '  netsh interface ip set dns "Ethernet" static <dns-ip>',
          '  ping [-n count] <ip|name>            test reachability (ICMP echo)',
          '  tracert <ip>                         list every router on the path',
          '  arp -a | arp -d                      show / clear the ARP cache',
          '  nslookup <name>                      ask DNS for an IP',
          '  ssh -l <user> <ip>                   secure remote login to a router/switch',
          '  telnet <ip>                          insecure remote login (try it, then use SSH!)',
          '  putty -serial COM1                   open the console cable session',
          '  getmac | hostname | cls | exit',
        );
        break;
      case 'cls':
        return { output: '', clear: true };
      case 'hostname':
        out.push(this.dev.hostname);
        break;
      case 'getmac':
        out.push(`Physical Address    Transport Name`, `=================== ==========================================================`, `${this.nic().mac.replace(/\./g, '').match(/.{2}/g)!.join('-').toUpperCase()}   \\Device\\Tcpip_{4A1B}`);
        break;
      case 'ipconfig': {
        const flag = (args[0] ?? '').toLowerCase();
        const nic = this.nic();
        if (flag === '/release') {
          dhcpRelease(this.topo, this.deviceId);
          out.push('', 'FastEthernet0 Connection:(default port)', '', '   IP Address......................: 0.0.0.0', '   Subnet Mask.....................: 0.0.0.0', '   Default Gateway.................: 0.0.0.0');
          break;
        }
        if (flag === '/renew') {
          const lease = dhcpRequest(this.topo, this.deviceId);
          if (lease.apipa) {
            out.push('DHCP request failed.', '', `   Autoconfiguration IPv4 Address..: ${lease.ip}`, '   Subnet Mask.....................: 255.255.0.0');
            hint('169.254.x.x (APIPA) means NO DHCP server answered. Check: is there a pool for this subnet? Is the router port up? Different VLAN? Need "ip helper-address"?');
            events.push('dhcp:fail');
          } else {
            out.push('', '   IP Address......................: ' + lease.ip, '   Subnet Mask.....................: ' + lease.mask, '   Default Gateway.................: ' + (lease.gateway ?? '0.0.0.0'), '   DNS Server......................: ' + (lease.dns ?? '0.0.0.0'));
            events.push('dhcp:ok');
          }
          break;
        }
        out.push('', 'FastEthernet0 Connection:(default port)', '');
        if (flag === '/all') {
          out.push(`   Connection-specific DNS Suffix..: `, `   Physical Address................: ${nic.mac.toUpperCase()}`, `   DHCP Enabled....................: ${nic.dhcpClient ? 'Yes' : 'No'}`);
        }
        out.push(
          `   Link-local IPv6 Address.........: FE80::2D0:${nic.mac.slice(5, 9).toUpperCase()}`,
          `   IPv4 Address....................: ${nic.ip ?? '0.0.0.0'}`,
          `   Subnet Mask.....................: ${nic.mask ?? '0.0.0.0'}`,
          `   Default Gateway.................: ${this.dev.defaultGateway ?? '0.0.0.0'}`,
        );
        if (flag === '/all') out.push(`   DNS Servers.....................: ${this.dev.dns ?? '0.0.0.0'}`);
        break;
      }
      case 'netsh': {
        const txt = line.replace(/"/g, '');
        const s = txt.match(/^netsh\s+interface\s+ip(?:v4)?\s+set\s+address\s+\S+\s+static\s+(\S+)\s+(\S+)(?:\s+(\S+))?/i);
        const dh = txt.match(/^netsh\s+interface\s+ip(?:v4)?\s+set\s+address\s+\S+\s+dhcp/i);
        const dns = txt.match(/^netsh\s+interface\s+ip(?:v4)?\s+set\s+dns(?:servers)?\s+\S+\s+static\s+(\S+)/i);
        if (s) {
          if (!isIPv4(s[1]) || !isValidMask(s[2]) || (s[3] && !isIPv4(s[3]))) {
            out.push('The parameter is incorrect.');
            break;
          }
          this.setStatic(s[1], s[2], s[3]);
          events.push('ip:set:host');
          out.push('Ok.');
        } else if (dh) {
          const lease = dhcpRequest(this.topo, this.deviceId);
          out.push(lease.apipa ? 'DHCP request failed - using APIPA ' + lease.ip : `Ok. Leased ${lease.ip}`);
        } else if (dns) {
          this.dev.dns = dns[1];
          out.push('Ok.');
        } else out.push('The syntax supplied for this command is not valid. Type "help".');
        break;
      }
      case 'ping': {
        let count = 4;
        const nIdx = args.findIndex((a) => a.toLowerCase() === '-n');
        if (nIdx >= 0) {
          count = Math.max(1, Math.min(20, Number(args[nIdx + 1]) || 4));
          args.splice(nIdx, 2);
        }
        const target = args[0];
        if (!target) {
          out.push('Usage: ping [-n count] target_name');
          break;
        }
        const ip = isIPv4(target) ? target : this.nslookup(target, out);
        if (!ip) break;
        out.push('', `Pinging ${ip} with 32 bytes of data:`, '');
        const res = ping(this.topo, this.deviceId, ip);
        if (res.success) {
          const cold = learnArp(this.topo, res);
          for (let k = 0; k < count; k++) out.push(k === 0 && cold ? 'Request timed out.' : `Reply from ${ip}: bytes=32 time<1ms TTL=${128 - Math.max(0, res.forward.hops.length - 2)}`);
          const ok = cold ? count - 1 : count;
          out.push('', `Ping statistics for ${ip}:`, `    Packets: Sent = ${count}, Received = ${ok}, Lost = ${count - ok} (${Math.round(((count - ok) / count) * 100)}% loss),`);
          if (cold) hint('The first request timed out while ARP found the MAC address - totally normal.');
          events.push(`ping:ok:${this.deviceId}:${ip}`);
        } else {
          for (let k = 0; k < count; k++) out.push('Request timed out.');
          out.push('', `Ping statistics for ${ip}:`, `    Packets: Sent = ${count}, Received = 0, Lost = ${count} (100% loss),`);
          if (res.reason) hint(res.reason);
          events.push(`ping:fail:${this.deviceId}:${ip}`);
        }
        break;
      }
      case 'tracert':
      case 'traceroute': {
        const target = args[0];
        const ip = target && (isIPv4(target) ? target : this.nslookup(target, out));
        if (!ip) break;
        out.push('', `Tracing route to ${ip} over a maximum of 30 hops:`, '');
        const res = forward(this.topo, this.deviceId, { src: '', dst: ip, proto: 'icmp' });
        res.hops.slice(1).forEach((h, n) => {
          const dv = getDevice(this.topo, h.device);
          const hopIp = h.note === 'delivered' ? ip : dv.interfaces.find((x) => x.name === h.ingress)?.ip ?? '*';
          out.push(`  ${String(n + 1).padStart(2)}   0 ms      0 ms      1 ms      ${hopIp}`);
        });
        if (!res.ok) {
          out.push(`  ${String(res.hops.length).padStart(2)}   *        *        *        Request timed out.`);
          if (res.reason) hint(res.reason);
        }
        out.push('', 'Trace complete.');
        break;
      }
      case 'arp': {
        if ((args[0] ?? '').toLowerCase() === '-d') {
          runtimeOf(this.topo).arp[this.deviceId] = [];
          break;
        }
        const entries = runtimeOf(this.topo).arp[this.deviceId] ?? [];
        if (!entries.length) {
          out.push('No ARP Entries Found');
          break;
        }
        out.push(`  Internet Address      Physical Address      Type`);
        for (const e of entries) out.push(`  ${e.ip.padEnd(22)}${e.mac.padEnd(22)}dynamic`);
        break;
      }
      case 'nslookup': {
        const name = args[0];
        if (!name) {
          out.push(`Server: ${this.dev.dns ?? 'Unknown'}`);
          break;
        }
        const ip = this.nslookup(name, out);
        if (ip) out.push(`Server: ${this.dev.dns}`, `Address: ${this.dev.dns}`, '', `Non-authoritative answer:`, `Name:    ${name}`, `Address: ${ip}`);
        break;
      }
      case 'ssh': {
        const li = args.findIndex((a) => a === '-l');
        const user = li >= 0 ? args[li + 1] : undefined;
        const ip = args.filter((_, k) => k !== li && k !== li + 1)[0];
        if (!user || !ip) {
          out.push('Usage: ssh -l username target');
          break;
        }
        const r = tcpReach(this.topo, this.deviceId, ip, 22);
        if (!r.ok) {
          out.push('% Connection timed out; remote host not responding');
          if (r.reason) hint(r.reason);
          break;
        }
        const td = getDevice(this.topo, r.device!);
        if (td.kind === 'pc' || td.kind === 'laptop') {
          out.push('% Connection refused by remote host');
          break;
        }
        const problem = sshProblem(td);
        if (problem) {
          out.push('% Connection refused by remote host');
          hint(problem);
          break;
        }
        this.pendingSsh = { target: td.id, user };
        return { output: '', secret: true };
      }
      case 'telnet': {
        const ip = args[0];
        if (!ip) {
          out.push('Usage: telnet target');
          break;
        }
        const r = tcpReach(this.topo, this.deviceId, ip, 23);
        if (!r.ok) {
          out.push(`Trying ${ip} ...`, '% Connection timed out; remote host not responding');
          break;
        }
        const td = getDevice(this.topo, r.device!);
        if (td.lineVty.transportInput === 'ssh' || td.lineVty.transportInput === 'none') {
          out.push(`Trying ${ip} ...`, '% Connection refused by remote host');
          hint('Good security! This device only allows SSH. Telnet sends passwords in clear text.');
          break;
        }
        if (!td.lineVty.password && !td.lineVty.loginLocal) {
          out.push(`Trying ${ip} ...Open`, '', '[Connection to ' + ip + ' closed by foreign host]');
          hint('The VTY lines have no password, so IOS refuses remote logins ("Password required, but none set").');
          break;
        }
        events.push('telnet:ok');
        return { output: `Trying ${ip} ...Open\n`, push: new IosSession(this.topo, td.id, { hints: this.hints, via: 'vty' }), events };
      }
      case 'putty':
      case 'terminal': {
        const con = this.dev.interfaces.find((i) => i.media === 'console');
        const peer = con && peerOf(this.topo, this.deviceId, con.name);
        if (!peer) {
          out.push('Unable to open serial port COM1.');
          hint('Connect the light-blue CONSOLE cable from this PC\'s RS232 port to the router/switch Console port first.');
          break;
        }
        events.push('console:open');
        return { output: '', push: new IosSession(this.topo, peer.device, { hints: this.hints, via: 'console' }), events };
      }
      case 'exit':
        return { output: '', exit: true };
      default:
        out.push(`'${cmd0}' is not recognized as an internal or external command,`, 'operable program or batch file. Type "help".');
    }
    return { output: out.join('\n') + '\n', events };
  }

  setStatic(ip: string, mask: string, gw?: string) {
    const nic = this.nic();
    nic.ip = ip;
    nic.mask = mask;
    nic.dhcpClient = false;
    this.dev.defaultGateway = gw;
    for (const s of this.topo.devices) s.dhcpBindings = s.dhcpBindings.filter((b) => b.mac !== nic.mac);
  }

  private nslookup(name: string, out: string[]): string | undefined {
    const dnsIp = this.dev.dns;
    if (!dnsIp) {
      out.push(`Ping request could not find host ${name}. Please check the name and try again.`);
      if (this.hints) out.push('[Route Runner hint] This PC has no DNS server configured, so names cannot be turned into IPs.');
      return undefined;
    }
    const r = tcpReach(this.topo, this.deviceId, dnsIp, 53, 'udp');
    if (!r.ok) {
      out.push(`DNS request timed out.`);
      if (this.hints && r.reason) out.push(`[Route Runner hint] Could not reach DNS server ${dnsIp}: ${r.reason}`);
      return undefined;
    }
    const server = getDevice(this.topo, r.device!);
    const rec = server.dnsRecords?.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!rec) {
      out.push(`*** ${dnsIp} can't find ${name}: Non-existent domain`);
      return undefined;
    }
    return rec.ip;
  }
}
