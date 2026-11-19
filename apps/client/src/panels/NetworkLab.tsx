import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  HostSession,
  IosSession,
  cloneTopology,
  createIsp,
  createL3Switch,
  createPC,
  createRouter,
  createSwitch,
  ifaceStatus,
  isEndHost,
  ping,
  recommendedCopperCable,
  type CableType,
  type CliSession,
  type Device,
  type Iface,
  type Topology,
} from '@route-runner/engine';
import { CABLES, NETWORK_LABS, type NetworkLab as Lab } from '@route-runner/content';
import { api } from '../api';
import { useGame } from '../store';
import { Panel } from '../ui/Panel';
import { Terminal } from '../ui/Terminal';
import { sfx } from '../sfx';

const SANDBOX: Lab = {
  id: 'sandbox',
  title: 'Sandbox: Build Anything',
  brief: 'An empty bench. Add routers, switches, PCs and servers from the palette, cable them and configure them however you like. Nothing is graded - this is your playground.',
  difficulty: 1,
  minutes: 0,
  cabling: true,
  build: () => ({ devices: [], links: [] }),
  objectives: [],
  hints: [],
  solution: [],
};
const ALL_LABS = [...NETWORK_LABS, SANDBOX];

interface SavedState {
  topology: Topology;
  events: string[];
}

export default function NetworkLab({ initial }: { initial?: string }) {
  const [labId, setLabId] = useState<string | undefined>(initial);
  const progress = useGame((s) => s.progress);
  const done = new Set((progress?.labs ?? []).filter((l) => l.kind === 'network' && l.completed_at).map((l) => l.lab_id));
  const lab = ALL_LABS.find((l) => l.id === labId);
  return (
    <Panel title={lab ? lab.title : 'Packet Lab - Network Missions'} icon="🔌" color="#2563eb" flush={!!lab} actions={lab && <button className="btn small" onClick={() => setLabId(undefined)}>← All missions</button>}>
      {!lab ? (
        <div className="col">
          <p className="muted" style={{ marginTop: 0 }}>
            Every mission runs on the Route Runner network simulator: real Cisco IOS commands, real addressing, VLANs, routing, DHCP, NAT, ACLs, OSPF and HSRP. Objectives are checked live as you type. Troubleshooting tickets are worth extra - CCNA v2.0 tests troubleshooting heavily.
          </p>
          <div className="grid-auto">
            {ALL_LABS.map((l) => (
              <div key={l.id} className="card hover" onClick={() => setLabId(l.id)} style={{ borderColor: done.has(l.id) ? '#166534' : l.troubleshooting ? '#92400e' : undefined }}>
                <div className="row">
                  <b className="grow">{l.title}</b>
                  {done.has(l.id) && <span>✅</span>}
                </div>
                <div className="dim" style={{ fontSize: 12, margin: '4px 0' }}>
                  {'★'.repeat(l.difficulty)}
                  {'☆'.repeat(5 - l.difficulty)} {l.minutes ? `· ~${l.minutes} min` : ''} {l.troubleshooting ? '· 🎫 troubleshooting' : ''} {l.cabling ? '· 🧵 cabling' : ''}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {l.brief.slice(0, 150)}
                  {l.brief.length > 150 ? '...' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <LabRunner key={lab.id} lab={lab} completed={done.has(lab.id)} />
      )}
    </Panel>
  );
}

function LabRunner({ lab, completed }: { lab: Lab; completed: boolean }) {
  const { reward, profile } = useGame();
  const [topo, setTopo] = useState<Topology | null>(null);
  const [version, setVersion] = useState(0);
  const events = useRef<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'mission' | 'cli' | 'device'>('mission');
  const [cable, setCable] = useState<CableType | 'delete' | null>(null);
  const [pending, setPending] = useState<{ device: string; iface: string } | null>(null);
  const [anim, setAnim] = useState<THREE.Vector3[] | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [doneNow, setDoneNow] = useState(completed);
  const sessions = useRef(new Map<string, CliSession>());
  const saveTimer = useRef<number>();
  const start = useRef(Date.now());
  const hints = profile?.settings.hints !== false;

  useEffect(() => {
    api
      .getLab<SavedState>('network', lab.id)
      .then((r) => {
        const t = r.state?.topology?.devices ? r.state.topology : lab.build();
        events.current = r.state?.events ?? [];
        setTopo(t);
      })
      .catch(() => setTopo(lab.build()));
  }, [lab]);

  const results = useMemo(() => {
    if (!topo) return [];
    return lab.objectives.map((o) => {
      try {
        return o.check(topo, events.current);
      } catch {
        return false;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topo, version, lab]);

  const changed = useCallback(
    (ev: string[] = []) => {
      if (!topo) return;
      events.current = [...events.current, ...ev].slice(-300);
      setVersion((v) => v + 1);
      // animate successful pings along the real path
      const okPing = ev.find((e) => e.startsWith('ping:ok:'));
      if (okPing) {
        const [, , src, ip] = okPing.split(':');
        const r = ping(cloneTopology(topo), src, ip);
        const pts = [...r.forward.hops, ...(r.reply?.hops.slice(1) ?? [])].map((h) => devicePos(topo, h.device).add(new THREE.Vector3(0, 0.9, 0)));
        if (pts.length > 1) setAnim(pts);
      }
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const ids = lab.objectives.filter((o) => {
          try {
            return o.check(topo, events.current);
          } catch {
            return false;
          }
        }).map((o) => o.id);
        void api.saveLab('network', lab.id, { topology: topo, events: events.current }, ids).catch(() => undefined);
      }, 1200);
    },
    [topo, lab],
  );

  useEffect(() => {
    if (!topo || doneNow || !lab.objectives.length) return;
    if (results.length && results.every(Boolean)) {
      setDoneNow(true);
      sfx('level');
      api.completeLab('network', lab.id, Math.max(1, Math.round((Date.now() - start.current) / 60000))).then((r) => reward(r, `Mission complete: ${lab.title}`));
    }
  }, [results, topo, doneNow, lab, reward]);

  const sessionFor = (d: Device): CliSession => {
    let s = sessions.current.get(d.id);
    if (!s) {
      s = isEndHost(d) ? new HostSession(topo!, d.id, hints) : new IosSession(topo!, d.id, { hints, via: 'console' });
      sessions.current.set(d.id, s);
    }
    return s;
  };

  const onPort = (device: string, iface: string) => {
    if (!topo || !cable || cable === 'delete') return;
    const used = topo.links.some((l) => (l.a.device === device && l.a.iface === iface) || (l.b.device === device && l.b.iface === iface));
    if (used) return useGame.getState().toast({ text: `${iface} already has a cable. Use ✂ to remove it first.`, tone: 'error' });
    if (!pending) {
      setPending({ device, iface });
      sfx('click');
      return;
    }
    if (pending.device === device) {
      setPending({ device, iface });
      return;
    }
    topo.links.push({ id: `${pending.device}:${pending.iface}-${device}:${iface}`, a: pending, b: { device, iface }, cable });
    const da = topo.devices.find((x) => x.id === pending.device)!;
    const db = topo.devices.find((x) => x.id === device)!;
    const ia = da.interfaces.find((i) => i.name === pending.iface)!;
    const ib = db.interfaces.find((i) => i.name === iface)!;
    if ((cable === 'straight' || cable === 'crossover') && ia.media === 'copper' && ib.media === 'copper') {
      const rec = recommendedCopperCable(da.kind, db.kind);
      if (rec !== cable) useGame.getState().toast({ text: `Textbook rule: ${da.kind} ↔ ${db.kind} uses a ${rec} cable. (Auto-MDIX would still make this work on modern gear.)`, tone: 'info', icon: '📘' });
    }
    setPending(null);
    sfx('correct');
    changed(['cable:connect']);
  };

  const removeLink = (id: string) => {
    if (!topo) return;
    topo.links = topo.links.filter((l) => l.id !== id);
    sfx('hit');
    changed(['cable:remove']);
  };

  const addDevice = (kind: 'router' | 'switch' | 'l3switch' | 'pc' | 'server' | 'isp') => {
    if (!topo) return;
    const n = topo.devices.filter((d) => d.kind === kind).length + 1;
    const id = `${kind.toUpperCase()}${n}`;
    const d = kind === 'router' ? createRouter(id, `R${n}`) : kind === 'switch' ? createSwitch(id, `S${n}`) : kind === 'l3switch' ? createL3Switch(id, `MLS${n}`) : kind === 'isp' ? createIsp(id, `ISP${n}`) : createPC(id, kind === 'server' ? `Server${n}` : `PC${n}`, kind === 'server' ? 'server' : 'pc');
    const k = topo.devices.length;
    d.position = [((k % 4) - 1.5) * 4, 0, Math.floor(k / 4) * 4 - 3];
    topo.devices.push(d);
    changed(['device:add']);
  };

  const reset = async () => {
    if (!confirm('Reset this lab to the beginning? Your configuration will be lost.')) return;
    await api.resetLab('network', lab.id).catch(() => undefined);
    sessions.current.clear();
    events.current = [];
    setSelected(null);
    setTopo(lab.build());
  };

  if (!topo) return <div style={{ padding: 20 }}>Loading lab...</div>;
  const dev = topo.devices.find((d) => d.id === selected);
  const doneCount = results.filter(Boolean).length;

  return (
    <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(420px, 1fr)' }}>
      <div style={{ position: 'relative', background: '#0a1020' }}>
        <Canvas camera={{ position: [0, 12, 14], fov: 45 }} shadows>
          <color attach="background" args={['#0a1020']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[8, 14, 10]} intensity={1.1} castShadow />
          <LabScene topo={topo} version={version} selected={selected} onSelect={(id) => { setSelected(id); setTab('cli'); }} cableMode={cable} pending={pending} onPort={onPort} onRemoveLink={removeLink} anim={anim} onAnimDone={() => setAnim(null)} />
          <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.15} minDistance={5} maxDistance={40} target={[0, 0, 0]} />
        </Canvas>
        <div style={{ position: 'absolute', top: 10, left: 10, right: 10 }} className="row wrap">
          <span className="pill" style={{ background: '#0b1324' }}>
            🧵 Cable:
          </span>
          {CABLES.map((c) => (
            <button key={c.id} className="btn small" title={`${c.use} ${c.detail}`} style={{ borderColor: cable === c.id ? c.color : undefined, background: cable === c.id ? '#1d2c4d' : undefined }} onClick={() => { setCable(cable === c.id ? null : c.id); setPending(null); }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: 'inline-block' }} /> {c.name.split(' (')[0]}
            </button>
          ))}
          <button className="btn small" style={{ borderColor: cable === 'delete' ? '#ef4444' : undefined }} onClick={() => setCable(cable === 'delete' ? null : 'delete')}>
            ✂ Remove cable
          </button>
        </div>
        {lab.id === 'sandbox' && (
          <div style={{ position: 'absolute', bottom: 10, left: 10 }} className="row wrap">
            <span className="pill">➕ Add:</span>
            {(['router', 'switch', 'l3switch', 'pc', 'server', 'isp'] as const).map((k) => (
              <button key={k} className="btn small" onClick={() => addDevice(k)}>
                {k === 'l3switch' ? 'L3 switch' : k}
              </button>
            ))}
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 10, right: 10 }} className="pill">
          {cable ? (pending ? `Now click the other end (${pending.iface})` : cable === 'delete' ? 'Click a cable to remove it' : 'Click a port to start the cable') : 'Click a device to open its CLI · drag to orbit · wheel to zoom'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--line)', minHeight: 0 }}>
        <div className="row" style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>
          <div className="tabs">
            <button className={`tab ${tab === 'mission' ? 'active' : ''}`} onClick={() => setTab('mission')}>
              🎯 Mission {lab.objectives.length ? `${doneCount}/${lab.objectives.length}` : ''}
            </button>
            <button className={`tab ${tab === 'cli' ? 'active' : ''}`} onClick={() => setTab('cli')}>
              ⌨ {dev ? dev.hostname : 'CLI'}
            </button>
            <button className={`tab ${tab === 'device' ? 'active' : ''}`} onClick={() => setTab('device')}>
              🔎 Device
            </button>
          </div>
          <span className="grow" />
          <button className="btn small" onClick={() => void reset()}>
            ↺ Reset
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: tab === 'cli' ? 'hidden' : 'auto', padding: tab === 'cli' ? 0 : 14 }}>
          {tab === 'mission' && (
            <div className="col">
              {doneNow && lab.objectives.length > 0 && <div className="card" style={{ borderColor: '#16a34a' }}>🏆 Mission complete! Keep experimenting - try breaking things and fixing them.</div>}
              <p style={{ margin: 0, lineHeight: 1.6 }}>{lab.brief}</p>
              {lab.objectives.map((o, i) => (
                <div key={o.id} className={`objective ${results[i] ? 'done' : ''}`}>
                  <div className="check">{results[i] ? '✓' : ''}</div>
                  <div>{o.text}</div>
                </div>
              ))}
              {lab.hints.length > 0 && (
                <div className="card">
                  <div className="row">
                    <b className="grow">💡 Hints</b>
                    <button className="btn small" disabled={hintsShown >= lab.hints.length} onClick={() => setHintsShown((h) => h + 1)}>
                      Reveal a hint ({hintsShown}/{lab.hints.length})
                    </button>
                  </div>
                  <ol style={{ marginBottom: 0 }}>
                    {lab.hints.slice(0, hintsShown).map((h) => (
                      <li key={h} className="mono" style={{ fontSize: 13, margin: '4px 0' }}>
                        {h}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {lab.solution.length > 0 && (
                <div className="card">
                  <button className="btn small" disabled={hintsShown < lab.hints.length} onClick={() => setShowSolution(!showSolution)} title="Unlocks after all hints">
                    🗝 {showSolution ? 'Hide' : 'Show'} full solution
                  </button>
                  {showSolution && <pre className="exhibit" style={{ marginTop: 8 }}>{lab.solution.join('\n')}</pre>}
                </div>
              )}
              <div className="dim" style={{ fontSize: 12 }}>
                Devices: {topo.devices.map((d) => d.hostname).join(', ')}. Click one in 3D (or below) to configure it.
              </div>
              <div className="row wrap">
                {topo.devices.map((d) => (
                  <button key={d.id} className="btn small" onClick={() => { setSelected(d.id); setTab('cli'); }}>
                    {d.kind === 'router' || d.kind === 'isp' ? '🛜' : d.kind.includes('switch') ? '🔀' : d.kind === 'server' ? '🗄' : '💻'} {d.hostname}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === 'cli' &&
            (dev ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {isEndHost(dev) && <HostIpForm dev={dev} onChange={() => changed(['ip:set:form'])} />}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <Terminal key={dev.id} session={sessionFor(dev)} onEvents={changed} title={`${dev.hostname} ${isEndHost(dev) ? '- Command Prompt' : '- Console'}`} />
                </div>
              </div>
            ) : (
              <div style={{ padding: 20 }} className="muted">
                Click a device in the 3D bench to open its command line.
              </div>
            ))}
          {tab === 'device' && (dev ? <DeviceInfo topo={topo} dev={dev} /> : <div className="muted">Select a device first.</div>)}
        </div>
      </div>
    </div>
  );
}

function HostIpForm({ dev, onChange }: { dev: Device; onChange: () => void }) {
  const nic = dev.interfaces.find((i) => i.media === 'copper')!;
  const [ip, setIp] = useState(nic.ip ?? '');
  const [mask, setMask] = useState(nic.mask ?? '255.255.255.0');
  const [gw, setGw] = useState(dev.defaultGateway ?? '');
  const [dns, setDns] = useState(dev.dns ?? '');
  return (
    <details style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)', background: '#0b1222' }}>
      <summary style={{ cursor: 'pointer' }} className="muted">
        🖥 Desktop → IP Configuration (or use netsh / ipconfig in the prompt below)
      </summary>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <input placeholder="IPv4 address" value={ip} onChange={(e) => setIp(e.target.value)} style={{ width: 140 }} />
        <input placeholder="Subnet mask" value={mask} onChange={(e) => setMask(e.target.value)} style={{ width: 140 }} />
        <input placeholder="Default gateway" value={gw} onChange={(e) => setGw(e.target.value)} style={{ width: 140 }} />
        <input placeholder="DNS server" value={dns} onChange={(e) => setDns(e.target.value)} style={{ width: 120 }} />
        <button
          className="btn small primary"
          onClick={() => {
            nic.ip = ip || undefined;
            nic.mask = mask || undefined;
            nic.dhcpClient = false;
            dev.defaultGateway = gw || undefined;
            dev.dns = dns || undefined;
            onChange();
          }}
        >
          Apply static
        </button>
      </div>
    </details>
  );
}

function DeviceInfo({ topo, dev }: { topo: Topology; dev: Device }) {
  const rows = dev.interfaces.filter((i) => i.media !== 'virtual' || i.ip || i.name.startsWith('Vlan'));
  return (
    <div className="col">
      <h3>
        {dev.hostname} <span className="muted" style={{ fontSize: 13 }}>{dev.model}</span>
      </h3>
      <table className="lesson" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>Interface</th>
            <th>IP</th>
            <th>Status</th>
            <th>Mode/VLAN</th>
            <th>Connected to</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const st = ifaceStatus(topo, dev, i);
            const l = topo.links.find((x) => (x.a.device === dev.id && x.a.iface === i.name) || (x.b.device === dev.id && x.b.iface === i.name));
            const peer = l ? (l.a.device === dev.id ? l.b : l.a) : null;
            const pd = peer ? topo.devices.find((d) => d.id === peer.device) : null;
            return (
              <tr key={i.name}>
                <td className="mono">{i.name}</td>
                <td className="mono">{i.ip ? `${i.ip}` : '-'}</td>
                <td style={{ color: st.protocol === 'up' ? 'var(--ok)' : st.status === 'administratively down' ? 'var(--gold)' : 'var(--danger)' }} title={st.reason}>
                  {st.status}/{st.protocol}
                  {st.reason && st.protocol !== 'up' ? <div className="dim" style={{ fontSize: 11 }}>{st.reason}</div> : null}
                </td>
                <td>{i.switchport ? `${i.mode ?? 'dynamic'} ${i.mode === 'trunk' ? '' : `v${i.accessVlan ?? 1}`}` : i.dot1qVlan ? `802.1Q ${i.dot1qVlan}` : ''}</td>
                <td>{pd ? `${pd.hostname} ${peer!.iface} (${l!.cable})` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {dev.defaultGateway && <div className="muted">Default gateway: {dev.defaultGateway}</div>}
    </div>
  );
}

// ======================================================================= 3D scene

const DEVICE_SIZE: Record<string, [number, number, number]> = { router: [2.4, 0.6, 1.3], isp: [2.4, 0.6, 1.3], switch: [3.4, 0.4, 1.1], l3switch: [3.4, 0.5, 1.1], pc: [1.2, 1.1, 0.9], laptop: [1.2, 0.8, 0.9], server: [1.0, 1.7, 1.2] };

function physicalPorts(d: Device): Iface[] {
  return d.interfaces.filter((i) => i.media !== 'virtual' && !i.parent);
}

function devicePos(t: Topology, id: string): THREE.Vector3 {
  const d = t.devices.find((x) => x.id === id);
  const p = d?.position ?? [0, 0, 0];
  return new THREE.Vector3(p[0], 0, p[2]);
}

function portLocal(d: Device, idx: number, total: number): THREE.Vector3 {
  const [w, h, dd] = DEVICE_SIZE[d.kind] ?? [1, 1, 1];
  if (d.kind === 'pc' || d.kind === 'laptop' || d.kind === 'server') return new THREE.Vector3(-0.25 + idx * 0.5, 0.25, dd / 2 + 0.02);
  const perRow = d.kind.includes('switch') ? 14 : total;
  const row = Math.floor(idx / perRow);
  const col = idx % perRow;
  const span = w - 0.4;
  return new THREE.Vector3(-span / 2 + (col + 0.5) * (span / perRow), h / 2 + 0.12 - row * 0.2, dd / 2 + 0.02);
}

function portWorld(t: Topology, device: string, iface: string): THREE.Vector3 {
  const d = t.devices.find((x) => x.id === device)!;
  const ports = physicalPorts(d);
  const idx = ports.findIndex((p) => p.name === iface);
  return devicePos(t, device).add(portLocal(d, Math.max(0, idx), ports.length));
}

const MEDIA_COLOR: Record<string, string> = { copper: '#0f172a', console: '#38bdf8', serial: '#dc2626', fiber: '#eab308' };
const CABLE_COLOR: Record<string, string> = Object.fromEntries(CABLES.map((c) => [c.id, c.color]));

function LabScene({
  topo,
  version,
  selected,
  onSelect,
  cableMode,
  pending,
  onPort,
  onRemoveLink,
  anim,
  onAnimDone,
}: {
  topo: Topology;
  version: number;
  selected: string | null;
  onSelect: (id: string) => void;
  cableMode: string | null;
  pending: { device: string; iface: string } | null;
  onPort: (d: string, i: string) => void;
  onRemoveLink: (id: string) => void;
  anim: THREE.Vector3[] | null;
  onAnimDone: () => void;
}) {
  void version;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <gridHelper args={[40, 40, '#334155', '#1f2a3d']} position={[0, 0, 0]} />
      {topo.devices.map((d) => (
        <DeviceModel key={d.id} topo={topo} d={d} selected={selected === d.id} onSelect={() => onSelect(d.id)} cableMode={cableMode} pending={pending} onPort={onPort} />
      ))}
      {topo.links.map((l) => {
        const a = portWorld(topo, l.a.device, l.a.iface);
        const b = portWorld(topo, l.b.device, l.b.iface);
        const mid1 = a.clone().add(new THREE.Vector3(0, -0.2, 1.2));
        const mid2 = b.clone().add(new THREE.Vector3(0, -0.2, 1.2));
        const curve = new THREE.CubicBezierCurve3(a, mid1, mid2, b);
        return (
          <mesh key={l.id} onClick={(e) => { if (cableMode === 'delete') { e.stopPropagation(); onRemoveLink(l.id); } }}>
            <tubeGeometry args={[curve, 40, cableMode === 'delete' ? 0.07 : 0.045, 6, false]} />
            <meshStandardMaterial color={CABLE_COLOR[l.cable] ?? '#22c55e'} emissive={cableMode === 'delete' ? '#7f1d1d' : '#000'} />
          </mesh>
        );
      })}
      {anim && <PacketAnim points={anim} onDone={onAnimDone} />}
    </group>
  );
}

function PacketAnim({ points, onDone }: { points: THREE.Vector3[]; onDone: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const t0 = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = (clock.elapsedTime - t0.current) / 0.45;
    const seg = Math.floor(t);
    if (seg >= points.length - 1) {
      onDone();
      return;
    }
    const p = points[seg].clone().lerp(points[seg + 1], t - seg);
    p.y += Math.sin((t - seg) * Math.PI) * 0.8;
    ref.current?.position.copy(p);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.18, 16, 16]} />
      <meshBasicMaterial color="#fde047" />
    </mesh>
  );
}

function DeviceModel({ topo, d, selected, onSelect, cableMode, pending, onPort }: { topo: Topology; d: Device; selected: boolean; onSelect: () => void; cableMode: string | null; pending: { device: string; iface: string } | null; onPort: (d: string, i: string) => void }) {
  const [w, h, dd] = DEVICE_SIZE[d.kind] ?? [1, 1, 1];
  const pos = d.position ?? [0, 0, 0];
  const ports = physicalPorts(d);
  const host = d.kind === 'pc' || d.kind === 'laptop' || d.kind === 'server';
  const bodyColor = d.kind === 'router' ? '#1e3a5f' : d.kind === 'isp' ? '#4c1d95' : d.kind.includes('switch') ? '#334155' : d.kind === 'server' ? '#111827' : '#475569';
  return (
    <group position={[pos[0], 0, pos[2]]}>
      <group
        onClick={(e) => {
          if (cableMode) return;
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        {d.kind === 'pc' ? (
          <>
            <mesh position={[0, 0.3, 0]} castShadow>
              <boxGeometry args={[1.2, 0.6, 0.9]} />
              <meshStandardMaterial color="#cbd5e1" />
            </mesh>
            <mesh position={[0, 1.15, -0.1]} castShadow>
              <boxGeometry args={[1.3, 0.85, 0.08]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
            <mesh position={[0, 1.15, -0.05]}>
              <boxGeometry args={[1.15, 0.7, 0.02]} />
              <meshBasicMaterial color={d.interfaces[0].ip ? '#1d4ed8' : '#1e293b'} />
            </mesh>
          </>
        ) : d.kind === 'laptop' ? (
          <>
            <mesh position={[0, 0.06, 0]} castShadow>
              <boxGeometry args={[1.2, 0.1, 0.9]} />
              <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <mesh position={[0, 0.45, -0.42]} rotation-x={-0.25} castShadow>
              <boxGeometry args={[1.2, 0.75, 0.05]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
          </>
        ) : d.kind === 'isp' ? (
          <>
            {[[-0.6, 0.5, 0, 0.6], [0.1, 0.7, 0, 0.75], [0.8, 0.5, 0, 0.55], [0, 0.35, 0.2, 0.6]].map(([x, y, z, r], i) => (
              <mesh key={i} position={[x, y, z]}>
                <sphereGeometry args={[r, 16, 16]} />
                <meshStandardMaterial color="#e0e7ff" />
              </mesh>
            ))}
            <mesh position={[0, 0.25, 0.4]}>
              <boxGeometry args={[w, 0.3, 0.6]} />
              <meshStandardMaterial color={bodyColor} />
            </mesh>
          </>
        ) : (
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, dd]} />
            <meshStandardMaterial color={bodyColor} metalness={0.3} roughness={0.6} />
          </mesh>
        )}
        {selected && (
          <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[Math.max(w, dd) * 0.75, Math.max(w, dd) * 0.85, 40]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
        )}
      </group>
      {ports.map((p, i) => {
        const lp = portLocal(d, i, ports.length);
        const st = ifaceStatus(topo, d, p);
        const linked = topo.links.some((l) => (l.a.device === d.id && l.a.iface === p.name) || (l.b.device === d.id && l.b.iface === p.name));
        const isPending = pending?.device === d.id && pending.iface === p.name;
        return (
          <group key={p.name} position={lp}>
            <mesh
              onClick={(e) => {
                if (!cableMode || cableMode === 'delete') return;
                e.stopPropagation();
                onPort(d.id, p.name);
              }}
            >
              <boxGeometry args={host ? [0.22, 0.16, 0.04] : [0.14, 0.11, 0.04]} />
              <meshStandardMaterial color={isPending ? '#fbbf24' : MEDIA_COLOR[p.media] ?? '#0f172a'} emissive={cableMode && cableMode !== 'delete' && !linked ? '#334155' : '#000'} />
            </mesh>
            {linked && (
              <mesh position={[0, host ? 0.14 : 0.1, 0]}>
                <boxGeometry args={[0.05, 0.03, 0.03]} />
                <meshBasicMaterial color={st.protocol === 'up' ? '#22c55e' : '#f59e0b'} />
              </mesh>
            )}
          </group>
        );
      })}
      <Html position={[0, host ? 1.9 : h + 0.7, 0]} center distanceFactor={14} zIndexRange={[5, 0]}>
        <div className="label3d" style={{ fontSize: 12, borderColor: selected ? '#fbbf24' : undefined }}>
          {d.hostname}
          <small>{d.interfaces.filter((i) => i.ip && !i.name.startsWith('Loopback')).slice(0, 2).map((i) => i.ip).join(' · ') || d.model}</small>
        </div>
      </Html>
    </group>
  );
}
