import type { PanelId } from '../store';

export interface Zone {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  color: string;
  pos: [number, number]; // x, z
  size: [number, number, number]; // w, h, d
  style: 'academy' | 'lab' | 'tower' | 'datacenter' | 'hut' | 'trading' | 'home' | 'hpc' | 'exam' | 'linux';
  panel: PanelId;
}

export const ZONES: Zone[] = [
  { id: 'academy', name: 'Network Academy', subtitle: 'CCNA lessons, chapter bosses', icon: '🌐', color: '#3b82f6', pos: [-18, -8], size: [8, 6, 6], style: 'academy', panel: { kind: 'academy', stream: 'network' } },
  { id: 'netlab', name: 'Packet Lab', subtitle: 'Cisco routers, switches, missions', icon: '🔌', color: '#2563eb', pos: [-21, 7], size: [7, 4, 6], style: 'lab', panel: { kind: 'netlab' } },
  { id: 'cable', name: 'Cable Bench', subtitle: 'Crimp RJ45 · pick the right cable', icon: '🧵', color: '#f97316', pos: [-9, 17], size: [5, 3, 4], style: 'hut', panel: { kind: 'cable' } },
  { id: 'pcworkshop', name: 'PC Workshop', subtitle: 'Build a computer · cooling · boot', icon: '🖥️', color: '#f59e0b', pos: [5, 20], size: [6, 4, 5], style: 'hut', panel: { kind: 'pcbuild' } },
  { id: 'datacenter', name: 'Data Centre', subtitle: 'Racks, power, airflow', icon: '🗄️', color: '#94a3b8', pos: [18, 12], size: [9, 4.5, 6], style: 'datacenter', panel: { kind: 'rack' } },
  { id: 'linux', name: 'Server Room', subtitle: 'Linux & Virtual Machines', icon: '🐧', color: '#eab308', pos: [22, -3], size: [6, 5, 6], style: 'linux', panel: { kind: 'shelllab', profile: 'linux' } },
  { id: 'hpc', name: 'Supercomputer', subtitle: 'HPC cluster · Slurm · MPI', icon: '🧮', color: '#a855f7', pos: [15, -16], size: [6, 7, 6], style: 'hpc', panel: { kind: 'shelllab', profile: 'hpc', labId: 'hpc-first-job' } },
  { id: 'cloud', name: 'Cloud Tower', subtitle: 'AWS · Docker · Kubernetes · DevOps', icon: '☁️', color: '#06b6d4', pos: [1, -21], size: [6, 12, 6], style: 'tower', panel: { kind: 'academy', stream: 'cloud' } },
  { id: 'trading', name: 'Trading Floor', subtitle: 'Forex lessons · real charts · demo trading', icon: '📈', color: '#22c55e', pos: [-13, -20], size: [8, 4, 6], style: 'trading', panel: { kind: 'trading' } },
  { id: 'exam', name: 'Exam Hall', subtitle: 'CCNA mock exams · drills · flashcards', icon: '🎓', color: '#e11d48', pos: [-6, 8], size: [5, 4, 4], style: 'exam', panel: { kind: 'exam', tab: 'exam' } },
  { id: 'home', name: "Phemelo's Room", subtitle: 'Profile · achievements · save file', icon: '🏠', color: '#ec4899', pos: [9, 4], size: [4, 3.5, 4], style: 'home', panel: { kind: 'profile' } },
];

/** Door position: the side of the building facing the central plaza. */
export function doorOf(z: Zone): [number, number] {
  const [x, zz] = z.pos;
  const len = Math.hypot(x, zz) || 1;
  const d = Math.max(z.size[0], z.size[2]) / 2 + 0.6;
  return [x - (x / len) * d, zz - (zz / len) * d];
}

export const ISLAND_RADIUS = 34;
