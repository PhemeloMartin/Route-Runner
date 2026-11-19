import type { ShellState } from '../shell/state.js';
import type { Vfs } from '../shell/vfs.js';

export interface CmdResult {
  out: string;
  err?: string;
  code?: number;
}

export interface ShellCtx {
  s: ShellState;
  vfs: Vfs;
  sudo: boolean;
  abs(path: string): string;
  read(path: string): string | undefined;
  write(path: string, content: string, append?: boolean): string | undefined;
  emit(ev: string): void;
  isRoot(): boolean;
  inGroup(group: string): boolean;
}

export type Handler = (ctx: ShellCtx, args: string[], stdin: string) => CmdResult;

export const ok = (out = ''): CmdResult => ({ out, code: 0 });
export const fail = (err: string, code = 1): CmdResult => ({ out: '', err, code });

// ------------------------------------------------------------ docker
export interface DockerImage {
  repo: string;
  tag: string;
  id: string;
  sizeMb: number;
  created: number;
}
export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'exited' | 'created';
  ports: string;
  created: number;
  command: string;
  env: string[];
  logs: string[];
}
export interface DockerState {
  images: DockerImage[];
  containers: DockerContainer[];
  networks: string[];
  volumes: string[];
}

// ------------------------------------------------------------ kubernetes
export interface K8sNode {
  name: string;
  role: 'control-plane' | 'worker';
  status: 'Ready' | 'NotReady';
  schedulable: boolean;
  cpu: number;
  memGi: number;
}
export interface K8sPod {
  name: string;
  ns: string;
  app: string;
  owner?: string; // deployment name
  node: string;
  status: 'Running' | 'Pending' | 'ContainerCreating' | 'ImagePullBackOff' | 'CrashLoopBackOff' | 'Terminating';
  restarts: number;
  image: string;
  ip: string;
  age: number;
}
export interface K8sDeployment {
  name: string;
  ns: string;
  image: string;
  replicas: number;
  revision: number;
  history: string[];
  port?: number;
  created: number;
}
export interface K8sService {
  name: string;
  ns: string;
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  selector: string;
  port: number;
  targetPort: number;
  nodePort?: number;
  clusterIp: string;
  externalIp?: string;
}
export interface K8sState {
  cluster: string;
  currentNs: string;
  nodes: K8sNode[];
  namespaces: string[];
  deployments: K8sDeployment[];
  pods: K8sPod[];
  services: K8sService[];
  configmaps: { name: string; ns: string; data: Record<string, string> }[];
  secrets: { name: string; ns: string; keys: string[] }[];
  hpas: { name: string; ns: string; target: string; min: number; max: number; cpu: number }[];
  ingresses: { name: string; ns: string; host: string; service: string }[];
  events: string[];
  seq: number;
}

// ------------------------------------------------------------ aws
export interface AwsState {
  account: string;
  region: string;
  user: string;
  vpcs: { id: string; cidr: string; name?: string; isDefault: boolean }[];
  subnets: { id: string; vpc: string; cidr: string; az: string; public: boolean; name?: string }[];
  igws: { id: string; vpc?: string }[];
  routeTables: { id: string; vpc: string; routes: { dest: string; target: string }[]; subnets: string[] }[];
  sgs: { id: string; name: string; vpc: string; description: string; ingress: { proto: string; port: string; cidr: string }[] }[];
  instances: { id: string; name?: string; type: string; ami: string; subnet: string; sg: string; state: 'pending' | 'running' | 'stopped' | 'terminated'; privateIp: string; publicIp?: string; launched: number }[];
  buckets: { name: string; created: number; objects: { key: string; size: number }[] }[];
  iamUsers: string[];
  seq: number;
}

// ------------------------------------------------------------ terraform
export interface TfState {
  initialized: boolean;
  dir?: string;
  applied: { type: string; name: string; id: string }[];
}

// ------------------------------------------------------------ slurm (HPC)
export interface SlurmJob {
  id: number;
  name: string;
  user: string;
  partition: string;
  nodes: number;
  tasks: number;
  gpus: number;
  state: 'PD' | 'R' | 'CD' | 'F' | 'CA';
  ticks: number;
  outFile: string;
  cwd: string;
  script: string;
}
export interface SlurmState {
  cluster: string;
  partitions: { name: string; nodes: string[]; gpus: number; timeLimit: string }[];
  jobs: SlurmJob[];
  nextId: number;
  modules: string[];
}

export function shortId(seed: number, len = 12): string {
  let x = (seed * 2654435761) >>> 0;
  let s = '';
  while (s.length < len) {
    x = Math.imul(x ^ (x >>> 15), 2246822507) >>> 0;
    s += x.toString(16);
  }
  return s.slice(0, len);
}

export function parseFlags(args: string[]): { flags: Record<string, string | true>; pos: string[] } {
  const flags: Record<string, string | true> = {};
  const pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) flags[k] = v;
      else if (args[i + 1] !== undefined && !args[i + 1].startsWith('-')) flags[k] = args[++i];
      else flags[k] = true;
    } else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
      const k = a.slice(1);
      if (args[i + 1] !== undefined && !args[i + 1].startsWith('-') && ['n', 'f', 'o', 'l', 'p', 'e', 'v', 't', 'c', 'i', 'N', 'J', 'G', 'w'].includes(k)) flags[k] = args[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { flags, pos };
}

export function table(rows: string[][]): string {
  if (!rows.length) return '';
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => (r[c] ?? '').length)));
  return rows.map((r) => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c] + 3))).join('').trimEnd()).join('\n') + '\n';
}

export function age(created: number, now = Date.now()): string {
  const s = Math.max(1, Math.floor((now - created) / 1000));
  if (s < 120) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 120) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
