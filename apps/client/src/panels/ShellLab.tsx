import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { ShellSession, dhcpLeaseFor, killNode, reviveNode, type ShellState, type VmNetworkMode, type K8sState } from '@route-runner/engine';
import { SHELL_LABS, type ShellLab as Lab } from '@route-runner/content';
import { api } from '../api';
import { useGame } from '../store';
import { Panel } from '../ui/Panel';
import { Terminal } from '../ui/Terminal';
import { Editor } from '../ui/Editor';
import { sfx } from '../sfx';

type Profile = 'linux' | 'cloud' | 'hpc' | 'vm' | 'dev';

const ICON: Record<Profile, string> = { linux: '🐧', vm: '🐧', cloud: '☁️', hpc: '🧮', dev: '📱' };
const COLOR: Record<Profile, string> = { linux: '#eab308', vm: '#eab308', cloud: '#06b6d4', hpc: '#a855f7', dev: '#8b5cf6' };
const TAB: Record<Profile, string> = { linux: '🐧 Linux/VM', vm: '🖥 VMs', cloud: '☁️ Cloud', hpc: '🧮 HPC', dev: '📱 Dev Studio' };

const FREE: Record<Profile, Lab> = {
  linux: { id: 'free-linux', kind: 'linux', title: 'Free Ubuntu Server terminal', brief: 'Your own Ubuntu 24.04 server to explore. Nothing is graded - break it, fix it, learn.', minutes: 0, machine: { hostname: 'ubuntu-srv' }, objectives: [], hints: [] },
  vm: { id: 'vm-manager', kind: 'vm', title: 'VM Manager (VirtualBox-style)', brief: 'Create virtual machines, choose their network mode, start them and take snapshots.', minutes: 0, machine: {}, objectives: [], hints: [] },
  cloud: { id: 'free-cloud', kind: 'cloud', title: 'Free CloudShell', brief: 'Docker, kubectl, aws, terraform and ansible - all simulated and safe.', minutes: 0, machine: { profile: 'cloud', hostname: 'cloudshell' }, objectives: [], hints: [] },
  hpc: { id: 'free-hpc', kind: 'hpc', title: 'Free HPC login node', brief: 'A supercomputer login node with Slurm, modules and MPI.', minutes: 0, machine: { profile: 'hpc', hostname: 'login01' }, objectives: [], hints: [] },
  dev: { id: 'free-dev', kind: 'dev', title: 'Free Dev Studio terminal', brief: '.NET 10, Flutter, Docker, kubectl, Helm and act (GitHub Actions) - build, test and ship anything. Nothing is graded.', minutes: 0, machine: { profile: 'dev', hostname: 'devbox' }, objectives: [], hints: [] },
};

export default function ShellLab({ initial, profile = 'linux' }: { initial?: string; profile?: Profile }) {
  const [labId, setLabId] = useState<string | undefined>(initial);
  const [prof, setProf] = useState<Profile>(profile);
  const progress = useGame((s) => s.progress);
  const done = new Set((progress?.labs ?? []).filter((l) => l.completed_at).map((l) => l.lab_id));
  const kinds: Record<Profile, Lab['kind'][]> = { linux: ['linux', 'vm'], vm: ['vm', 'linux'], cloud: ['cloud'], hpc: ['hpc'], dev: ['dev'] };
  const list = [...SHELL_LABS.filter((l) => kinds[prof].includes(l.kind)), FREE[prof], ...(prof === 'linux' ? [FREE.vm] : [])];
  const lab = [...SHELL_LABS, ...Object.values(FREE)].find((l) => l.id === labId);
  const titles: Record<Profile, string> = { linux: 'Server Room - Linux & VMs', vm: 'Server Room - Virtual Machines', cloud: 'Cloud Tower - CloudShell', hpc: 'Supercomputer - HPC Cluster', dev: 'App Studio - Flutter, ASP.NET, DevOps & Kubernetes' };
  return (
    <Panel title={lab ? lab.title : titles[prof]} icon={ICON[prof]} color={COLOR[prof]} flush={!!lab} actions={lab ? <button className="btn small" onClick={() => setLabId(undefined)}>← All labs</button> : <div className="tabs">{(['linux', 'cloud', 'dev', 'hpc'] as Profile[]).map((p) => <button key={p} className={`tab ${prof === p ? 'active' : ''}`} onClick={() => setProf(p)}>{TAB[p]}</button>)}</div>}>
      {!lab ? (
        <div className="grid-auto">
          {list.map((l) => (
            <div key={l.id} className="card hover" onClick={() => setLabId(l.id)} style={{ borderColor: done.has(l.id) ? '#166534' : undefined }}>
              <div className="row">
                <b className="grow">{l.title}</b>
                {done.has(l.id) && '✅'}
              </div>
              <div className="dim" style={{ fontSize: 12, margin: '4px 0' }}>
                {l.kind.toUpperCase()} {l.minutes ? `· ~${l.minutes} min · ${l.objectives.length} objectives` : '· free play'}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{l.brief}</div>
            </div>
          ))}
        </div>
      ) : lab.kind === 'vm' ? (
        <VmManager lab={lab} completed={done.has(lab.id)} />
      ) : (
        <ShellRunner key={lab.id} lab={lab} completed={done.has(lab.id)} />
      )}
    </Panel>
  );
}

function useShellLab(lab: Lab, completed: boolean, kind: 'linux' | 'cloud' | 'hpc' | 'vm' | 'dev', session: ShellSession | null) {
  const { reward } = useGame();
  const events = useRef<string[]>([]);
  const [version, setVersion] = useState(0);
  const [doneNow, setDoneNow] = useState(completed);
  const [edit, setEdit] = useState<{ path: string; ro: boolean } | null>(null);
  const timer = useRef<number>();
  const start = useRef(Date.now());
  const results = useMemo(
    () =>
      session
        ? lab.objectives.map((o) => {
            try {
              return o.check(session.s, events.current);
            } catch {
              return false;
            }
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, version, lab],
  );
  useEffect(() => {
    if (!session || doneNow || !lab.objectives.length || !results.length || !results.every(Boolean)) return;
    setDoneNow(true);
    sfx('level');
    api.completeLab(kind, lab.id, Math.max(1, Math.round((Date.now() - start.current) / 60000))).then((r) => reward(r, `Lab complete: ${lab.title}`));
  }, [results, session, doneNow, lab, kind, reward]);
  const onEvents = (ev: string[], save: () => void) => {
    events.current = [...events.current, ...ev].slice(-300);
    const e = ev.find((x) => x.startsWith('edit:') && !x.startsWith('edit:saved'));
    if (e) {
      const ro = e.endsWith(':ro');
      setEdit({ path: e.slice(5).replace(/:ro$/, ''), ro });
    }
    setVersion((v) => v + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 1200);
  };
  return { events, version, results, doneNow, edit, setEdit, onEvents };
}

function Objectives({ lab, results, doneNow }: { lab: Lab; results: boolean[]; doneNow: boolean }) {
  const [hints, setHints] = useState(0);
  return (
    <div className="col">
      {doneNow && lab.objectives.length > 0 && <div className="card" style={{ borderColor: '#16a34a' }}>🏆 Lab complete! Keep exploring.</div>}
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
            <button className="btn small" disabled={hints >= lab.hints.length} onClick={() => setHints(hints + 1)}>
              Reveal ({hints}/{lab.hints.length})
            </button>
          </div>
          <ol style={{ marginBottom: 0 }}>
            {lab.hints.slice(0, hints).map((h) => (
              <li key={h} className="mono" style={{ fontSize: 13, margin: '4px 0' }}>{h}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="dim" style={{ fontSize: 12 }}>Type <code>help</code> in the terminal for every command the simulator understands, or <code>man ls</code> / <code>explain chmod</code> for plain-English help.</div>
    </div>
  );
}

function ShellRunner({ lab, completed }: { lab: Lab; completed: boolean }) {
  const kind = lab.kind as 'linux' | 'cloud' | 'hpc' | 'dev';
  const [session, setSession] = useState<ShellSession | null>(null);
  const [side, setSide] = useState<'mission' | 'k8s' | 'aws' | 'hpc'>('mission');
  const { version, results, doneNow, edit, setEdit, onEvents, events } = useShellLab(lab, completed, kind, session);

  useEffect(() => {
    api
      .getLab<{ shell: ShellState; events: string[] }>(kind, lab.id)
      .then((r) => {
        if (r.state?.shell?.fs) {
          events.current = r.state.events ?? [];
          setSession(new ShellSession(r.state.shell));
        } else setSession(ShellSession.create(lab.machine));
      })
      .catch(() => setSession(ShellSession.create(lab.machine)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab]);

  if (!session) return <div style={{ padding: 20 }}>Booting machine...</div>;
  const save = () => {
    const ids = lab.objectives.filter((o) => { try { return o.check(session.s, events.current); } catch { return false; } }).map((o) => o.id);
    void api.saveLab(kind, lab.id, { shell: session.s, events: events.current }, ids).catch(() => undefined);
  };
  const reset = async () => {
    if (!confirm('Wipe this machine and start the lab again?')) return;
    await api.resetLab(kind, lab.id).catch(() => undefined);
    events.current = [];
    setSession(ShellSession.create(lab.machine));
  };

  return (
    <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(380px, 1fr)' }}>
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        <Terminal session={session} onEvents={(ev) => onEvents(ev, save)} accent={kind === 'cloud' ? '#22d3ee' : kind === 'hpc' ? '#c084fc' : kind === 'dev' ? '#a78bfa' : '#facc15'} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--line)', minHeight: 0 }}>
        <div className="row" style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>
          <div className="tabs">
            <button className={`tab ${side === 'mission' ? 'active' : ''}`} onClick={() => setSide('mission')}>
              🎯 Mission {lab.objectives.length ? `${results.filter(Boolean).length}/${lab.objectives.length}` : ''}
            </button>
            {(kind === 'cloud' || kind === 'dev') && <button className={`tab ${side === 'k8s' ? 'active' : ''}`} onClick={() => setSide('k8s')}>☸ Cluster 3D</button>}
            {kind === 'cloud' && <button className={`tab ${side === 'aws' ? 'active' : ''}`} onClick={() => setSide('aws')}>🟧 AWS</button>}
            {kind === 'hpc' && <button className={`tab ${side === 'hpc' ? 'active' : ''}`} onClick={() => setSide('hpc')}>🧮 Queue</button>}
          </div>
          <span className="grow" />
          <button className="btn small" onClick={() => void reset()}>↺ Reset</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: side === 'k8s' ? 0 : 14 }}>
          {side === 'mission' && <Objectives lab={lab} results={results} doneNow={doneNow} />}
          {side === 'k8s' && <K8sView k={session.s.k8s} version={version} onChaos={() => onEvents(['k8s:chaos'], save)} />}
          {side === 'aws' && <AwsView s={session.s} version={version} />}
          {side === 'hpc' && <HpcView s={session.s} version={version} />}
        </div>
      </div>
      {edit && (
        <Editor
          path={edit.path}
          readOnly={edit.ro}
          initial={session.vfs.read(edit.path) ?? ''}
          onSave={(t) => {
            const err = session.saveFromEditor(edit.path, t);
            onEvents([`edit:saved:${edit.path}`], save);
            return err;
          }}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

// ======================================================================= VM manager

interface Vm {
  name: string;
  mode: VmNetworkMode;
  cpus: number;
  ramMb: number;
  diskGb: number;
  iso: string;
  shell: ShellState | null;
  snapshots: { name: string; at: string; shell: ShellState }[];
}

const MODES: { id: VmNetworkMode; name: string; plain: string }[] = [
  { id: 'nat', name: 'NAT', plain: 'VM hides behind your PC (like a home router). Has internet; nothing outside can reach the VM. Default in VirtualBox.' },
  { id: 'bridged', name: 'Bridged Adapter', plain: 'VM joins your real LAN as its own device and gets an IP from your real router. Others on the LAN can reach it.' },
  { id: 'host-only', name: 'Host-only Adapter', plain: 'A private network between your PC and its VMs only. No internet. Great for safe labs.' },
  { id: 'internal', name: 'Internal Network', plain: 'VMs talk only to each other. Not even the host can reach them. No DHCP unless you run one!' },
];

function VmManager({ lab, completed }: { lab: Lab; completed: boolean }) {
  const [vms, setVms] = useState<Vm[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [running, setRunning] = useState<ShellSession | null>(null);
  const [booting, setBooting] = useState<string[] | null>(null);
  const [form, setForm] = useState<Omit<Vm, 'shell' | 'snapshots'>>({ name: 'ubuntu-lab', mode: 'nat', cpus: 2, ramMb: 2048, diskGb: 25, iso: 'ubuntu-24.04.3-live-server-amd64.iso' });
  const [creating, setCreating] = useState(false);
  const { results, doneNow, edit, setEdit, onEvents } = useShellLab(lab.id === 'vm-manager' ? SHELL_LABS.find((l) => l.id === 'vm-modes')! : lab, completed, 'vm', running);
  const { reward } = useGame();

  useEffect(() => {
    api.getLab<{ vms: Vm[] }>('vm', 'manager').then((r) => setVms(r.state?.vms ?? [])).catch(() => undefined);
  }, []);
  const persist = (list: Vm[]) => {
    setVms(list);
    void api.saveLab('vm', 'manager', { vms: list }, []).catch(() => undefined);
  };
  const vm = sel !== null ? vms[sel] : null;

  const start = (i: number) => {
    const v = vms[i];
    setSel(i);
    const steps = v.shell
      ? ['Starting VM...', 'BIOS POST ✓', 'GRUB loading Ubuntu 24.04.3 LTS', 'systemd: Reached target Multi-User System', `${v.mode === 'internal' ? 'enp0s3: no DHCP server answered' : `enp0s3: DHCPv4 address ${dhcpLeaseFor(v.mode).ip}`}`, 'Login: phemelo (auto-login for the lab)']
      : [`Booting from ${v.iso}...`, 'Ubuntu Server installer: choose language: English', 'Keyboard: English (South Africa)', `Network: enp0s3 (${v.mode.toUpperCase()}) - ${v.mode === 'internal' ? 'no address (internal network has no DHCP)' : `DHCPv4 ${dhcpLeaseFor(v.mode).ip}`}`, `Storage: guided - use entire ${v.diskGb} GB disk with LVM`, 'Profile: your name phemelo, server name ' + v.name, 'Installing OpenSSH server? [x]', 'Installing system... copying files... configuring apt... done', 'Reboot now ✓'];
    setBooting([]);
    steps.forEach((s, k) =>
      setTimeout(() => {
        setBooting((b) => [...(b ?? []), s]);
        if (k === steps.length - 1)
          setTimeout(() => {
            const sh = v.shell ? new ShellSession(v.shell) : ShellSession.create({ hostname: v.name, mode: v.mode, cpus: v.cpus, ramMb: v.ramMb, diskGb: v.diskGb });
            if (!v.shell) {
              const list = [...vms];
              list[i] = { ...v, shell: sh.s };
              persist(list);
              api.completeLab('vm', 'first-install', 15).then((r) => reward(r, 'Installed Ubuntu Server in a VM')).catch(() => undefined);
            }
            setRunning(sh);
            setBooting(null);
          }, 700);
      }, 450 * k),
    );
  };
  const saveRunning = () => {
    if (sel === null || !running) return;
    const list = [...vms];
    list[sel] = { ...list[sel], shell: running.s };
    persist(list);
  };
  const powerOff = () => {
    saveRunning();
    setRunning(null);
  };
  const snapshot = () => {
    if (sel === null || !vm?.shell) return;
    const name = prompt('Snapshot name', `before-change-${vm.snapshots.length + 1}`);
    if (!name) return;
    const list = [...vms];
    const shell = running ? running.s : vm.shell;
    list[sel] = { ...vm, shell, snapshots: [...vm.snapshots, { name, at: new Date().toISOString(), shell: JSON.parse(JSON.stringify(shell)) }] };
    persist(list);
    sfx('xp');
  };
  const restore = (k: number) => {
    if (sel === null || !vm) return;
    const snap = vm.snapshots[k];
    const list = [...vms];
    list[sel] = { ...vm, shell: JSON.parse(JSON.stringify(snap.shell)) };
    persist(list);
    if (running) setRunning(new ShellSession(list[sel].shell!));
  };
  const setMode = (mode: VmNetworkMode) => {
    if (sel === null || !vm) return;
    const list = [...vms];
    const shell = vm.shell ? { ...vm.shell, net: { ...vm.shell.net, mode, ...(vm.shell.net.dhcp ? dhcpLeaseFor(mode) : {}) } } : null;
    list[sel] = { ...vm, mode, shell };
    persist(list);
  };

  return (
    <div className="split" style={{ gridTemplateColumns: '300px minmax(0, 1fr) 340px' }}>
      <div style={{ borderRight: '1px solid var(--line)', padding: 12 }} className="col">
        <div className="row">
          <b className="grow">🖥 Virtual machines</b>
          <button className="btn small primary" onClick={() => setCreating(true)} disabled={!!running}>
            ＋ New
          </button>
        </div>
        {vms.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No VMs yet. Click New - you'll use the same Ubuntu 24.04.3 ISO that's in your "Operating Systems and Server Management\Linux" folder.</div>}
        {vms.map((v, i) => (
          <div key={v.name + i} className="card hover" style={{ padding: 10, borderColor: sel === i ? '#eab308' : undefined }} onClick={() => !running && setSel(i)}>
            <div className="row">
              <b className="grow">🐧 {v.name}</b>
              <span className="pill">{running && sel === i ? '🟢 running' : v.shell ? '⚫ off' : '💿 not installed'}</span>
            </div>
            <div className="dim" style={{ fontSize: 12 }}>
              {v.cpus} vCPU · {v.ramMb / 1024} GB RAM · {v.diskGb} GB · {MODES.find((m) => m.id === v.mode)?.name}
            </div>
          </div>
        ))}
        {vm && (
          <div className="card col" style={{ padding: 10 }}>
            <b>Settings → Network → Adapter 1</b>
            <select value={vm.mode} disabled={!!running} onChange={(e) => setMode(e.target.value as VmNetworkMode)}>
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <div className="dim" style={{ fontSize: 12 }}>{MODES.find((m) => m.id === vm.mode)?.plain}</div>
            {running && <div className="dim" style={{ fontSize: 12 }}>Power off the VM to change its adapter (like VirtualBox).</div>}
            <div className="row wrap">
              {!running ? (
                <button className="btn good small" onClick={() => start(sel!)}>▶ Start</button>
              ) : (
                <button className="btn danger small" onClick={powerOff}>⏻ Power off</button>
              )}
              <button className="btn small" disabled={!vm.shell} onClick={snapshot}>📸 Snapshot</button>
            </div>
            {vm.snapshots.length > 0 && (
              <div className="col" style={{ gap: 4 }}>
                <b style={{ fontSize: 13 }}>Snapshots</b>
                {vm.snapshots.map((s, k) => (
                  <div key={s.at} className="row" style={{ fontSize: 13 }}>
                    <span className="grow">📸 {s.name}</span>
                    <button className="btn small" onClick={() => restore(k)}>Restore</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        {creating ? (
          <div style={{ padding: 20, maxWidth: 560 }} className="col">
            <h3>Create Virtual Machine</h3>
            <label className="col">Name <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase() })} /></label>
            <label className="col">ISO image <select value={form.iso} onChange={(e) => setForm({ ...form, iso: e.target.value })}><option>ubuntu-24.04.3-live-server-amd64.iso</option></select></label>
            <label className="col">Memory: {form.ramMb} MB <input type="range" min={512} max={8192} step={512} value={form.ramMb} onChange={(e) => setForm({ ...form, ramMb: Number(e.target.value) })} /></label>
            {form.ramMb < 1024 && <div className="dim" style={{ color: 'var(--gold)' }}>Ubuntu Server needs at least 1 GB RAM to install comfortably.</div>}
            <label className="col">Processors: {form.cpus} <input type="range" min={1} max={8} value={form.cpus} onChange={(e) => setForm({ ...form, cpus: Number(e.target.value) })} /></label>
            <label className="col">Disk: {form.diskGb} GB (dynamically allocated) <input type="range" min={10} max={100} step={5} value={form.diskGb} onChange={(e) => setForm({ ...form, diskGb: Number(e.target.value) })} /></label>
            <label className="col">Network adapter <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as VmNetworkMode })}>{MODES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <div className="dim" style={{ fontSize: 13 }}>{MODES.find((m) => m.id === form.mode)?.plain}</div>
            <div className="row">
              <button className="btn primary" disabled={!form.name || vms.some((v) => v.name === form.name)} onClick={() => { persist([...vms, { ...form, shell: null, snapshots: [] }]); setSel(vms.length); setCreating(false); }}>Create</button>
              <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </div>
        ) : booting ? (
          <div className="term-wrap" style={{ padding: 16 }}>
            {booting.map((b, i) => (
              <div key={i} style={{ color: '#d1fae5' }}>[ OK ] {b}</div>
            ))}
          </div>
        ) : running ? (
          <Terminal session={running} onEvents={(ev) => onEvents(ev, saveRunning)} accent="#facc15" title={`${vm?.name} [Running] - Oracle VM VirtualBox (simulated)`} />
        ) : (
          <div style={{ padding: 30 }} className="muted">
            <h3>What is a virtual machine?</h3>
            <p>A <b>hypervisor</b> (VirtualBox, VMware Workstation - you have its installer in your Linux folder - Hyper-V, KVM) lets one physical computer pretend to be many. Each VM gets virtual CPUs, RAM, disk and network cards carved out of the real hardware.</p>
            <p><b>Type 2</b> hypervisors (VirtualBox, VMware Workstation) run on top of Windows. <b>Type 1</b> (ESXi, Hyper-V Server, KVM, Proxmox) run directly on the hardware - that's what data centres and clouds use.</p>
            <p>Create a VM on the left, start it to install Ubuntu, then try each network mode and see what changes with <code>ip a</code>, <code>ip r</code>, <code>ping 8.8.8.8</code> and <code>sudo apt update</code>.</p>
          </div>
        )}
      </div>
      <div style={{ borderLeft: '1px solid var(--line)', padding: 12, overflow: 'auto' }}>
        <b>🎯 Lab: network modes</b>
        <div style={{ marginTop: 8 }}>
          <Objectives lab={SHELL_LABS.find((l) => l.id === 'vm-modes')!} results={results} doneNow={doneNow} />
        </div>
      </div>
      {edit && running && (
        <Editor path={edit.path} readOnly={edit.ro} initial={running.vfs.read(edit.path) ?? ''} onSave={(t) => running.saveFromEditor(edit.path, t)} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

// ======================================================================= Kubernetes 3D

const POD_COLOR: Record<string, string> = { Running: '#22c55e', Pending: '#eab308', ContainerCreating: '#3b82f6', ImagePullBackOff: '#ef4444', CrashLoopBackOff: '#f97316', Terminating: '#64748b' };

function K8sView({ k, version, onChaos }: { k?: K8sState; version: number; onChaos: () => void }) {
  void version;
  if (!k) return <div style={{ padding: 14 }} className="muted">No cluster yet - run <code>kubectl get nodes</code>.</div>;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 320 }}>
        <Canvas camera={{ position: [0, 11, 19], fov: 45 }}>
          <color attach="background" args={['#081020']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 10, 6]} intensity={1} />
          {k.nodes.map((n, i) => {
            const x = (i - (k.nodes.length - 1) / 2) * 3.6;
            const pods = k.pods.filter((p) => p.node === n.name);
            return (
              <group key={n.name} position={[x, 0, 0]}>
                <mesh position={[0, -0.25, 0]}>
                  <boxGeometry args={[3, 0.5, 3]} />
                  <meshStandardMaterial color={n.status !== 'Ready' ? '#7f1d1d' : n.role === 'control-plane' ? '#4c1d95' : n.schedulable ? '#1e3a8a' : '#334155'} />
                </mesh>
                {pods.map((p, j) => (
                  <mesh key={p.name} position={[-0.9 + (j % 3) * 0.9, 0.35 + Math.floor(j / 3) * 0.75, -0.9 + Math.floor(j / 9) * 0.9]}>
                    <boxGeometry args={[0.6, 0.6, 0.6]} />
                    <meshStandardMaterial color={POD_COLOR[p.status] ?? '#94a3b8'} emissive={POD_COLOR[p.status] ?? '#000'} emissiveIntensity={0.25} />
                  </mesh>
                ))}
                <Html position={[0, -0.9, 1.6]} center distanceFactor={12}>
                  <div className="label3d" style={{ fontSize: 11 }}>
                    {n.name}
                    <small>{n.status !== 'Ready' ? '💥 NotReady' : n.role === 'control-plane' ? 'control plane' : `${pods.length} pods`}</small>
                  </div>
                </Html>
              </group>
            );
          })}
          <OrbitControls makeDefault />
        </Canvas>
      </div>
      <div style={{ padding: 10 }} className="col">
        <div className="row wrap" style={{ fontSize: 12 }}>
          {Object.entries(POD_COLOR).slice(0, 4).map(([s, c]) => (
            <span key={s} className="pill"><span style={{ width: 9, height: 9, background: c, display: 'inline-block', borderRadius: 2 }} /> {s}</span>
          ))}
        </div>
        <div className="row wrap">
          {k.nodes.filter((n) => n.role === 'worker').map((n) => (
            <button key={n.name} className={`btn small ${n.status === 'Ready' ? 'danger' : 'good'}`} onClick={() => { if (n.status === 'Ready') killNode(k, n.name); else reviveNode(k, n.name); sfx('hit'); onChaos(); }}>
              {n.status === 'Ready' ? `💥 Crash ${n.name}` : `🔧 Repair ${n.name}`}
            </button>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 12 }}>Chaos engineering: crash a worker and watch Kubernetes reschedule its pods onto healthy nodes - that's self-healing.</div>
      </div>
    </div>
  );
}

function AwsView({ s, version }: { s: ShellState; version: number }) {
  void version;
  const a = s.aws;
  if (!a) return <div className="muted">Run any <code>aws</code> command to load the account (e.g. <code>aws sts get-caller-identity</code>).</div>;
  return (
    <div className="col mono" style={{ fontSize: 13 }}>
      <div>☁ Account {a.account} · region <b>{a.region}</b> (Cape Town)</div>
      {a.vpcs.map((v) => (
        <div key={v.id} className="card" style={{ padding: 10 }}>
          <b>VPC {v.id}</b> {v.cidr} {v.isDefault ? '(default)' : ''}
          <div className="dim">IGW: {a.igws.find((g) => g.vpc === v.id)?.id ?? 'none - no internet!'}</div>
          {a.subnets.filter((sn) => sn.vpc === v.id).map((sn) => (
            <div key={sn.id} style={{ marginLeft: 14, marginTop: 6 }}>
              {sn.public ? '🌍' : '🔒'} {sn.id} {sn.cidr} {sn.az} {sn.public ? 'public' : 'private'}
              {a.instances.filter((i) => i.subnet === sn.id && i.state !== 'terminated').map((i) => (
                <div key={i.id} style={{ marginLeft: 18 }}>🖥 {i.id} {i.type} {i.state} {i.privateIp} {i.publicIp ? `→ ${i.publicIp}` : ''}</div>
              ))}
            </div>
          ))}
        </div>
      ))}
      <div className="card" style={{ padding: 10 }}>
        <b>Security groups</b>
        {a.sgs.map((g) => (
          <div key={g.id}>🛡 {g.id} {g.name}: {g.ingress.map((r) => `${r.proto}/${r.port} from ${r.cidr}`).join(', ') || 'no inbound rules'}</div>
        ))}
      </div>
      <div className="card" style={{ padding: 10 }}>
        <b>S3 buckets</b>
        {a.buckets.length ? a.buckets.map((b) => <div key={b.name}>🪣 {b.name} ({b.objects.length} objects)</div>) : <div className="dim">none</div>}
      </div>
    </div>
  );
}

function HpcView({ s, version }: { s: ShellState; version: number }) {
  void version;
  const sl = s.slurm;
  if (!sl) return <div className="muted">Run <code>sinfo</code> to see the cluster.</div>;
  return (
    <div className="col">
      <b>Cluster {sl.cluster}</b>
      <div className="row wrap" style={{ gap: 4 }}>
        {Array.from({ length: 24 }, (_, i) => {
          const busy = i >= 4 && i < 20;
          const mine = sl.jobs.some((j) => j.state === 'R' && j.partition === 'normal' && i >= 20 && i < 20 + j.nodes);
          return <div key={i} title={`cnode${String(i + 1).padStart(3, '0')}`} style={{ width: 22, height: 22, borderRadius: 4, background: mine ? '#a855f7' : busy ? '#334155' : '#14532d' }} />;
        })}
      </div>
      <div className="dim" style={{ fontSize: 12 }}>🟪 your running job · ⬛ other researchers · 🟩 idle nodes</div>
      <table className="lesson" style={{ fontSize: 13 }}>
        <thead><tr><th>Job</th><th>Name</th><th>Partition</th><th>Nodes</th><th>State</th></tr></thead>
        <tbody>
          {sl.jobs.map((j) => (
            <tr key={j.id}><td>{j.id}</td><td>{j.name}</td><td>{j.partition}</td><td>{j.nodes}</td><td>{{ PD: '⏳ pending', R: '🏃 running', CD: '✅ done', F: '❌ failed', CA: '🚫 cancelled' }[j.state]}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="dim" style={{ fontSize: 12 }}>Modules loaded: {sl.modules.join(', ') || 'none'}</div>
    </div>
  );
}
