/**
 * HPC (High Performance Computing) login node: Slurm scheduler + environment modules + MPI.
 * Analogy: an HPC cluster is a huge shared kitchen with 100 stoves. You don't cook on the
 * stoves directly - you hand your recipe (job script) to the head chef (Slurm), who queues
 * it and gives you stoves (nodes/cores/GPUs) when they're free.
 */
import { type Handler, type SlurmState, fail, ok, table } from './types.js';

export function createSlurm(): SlurmState {
  return {
    cluster: 'lengau-sim',
    partitions: [
      { name: 'normal*', nodes: ['cnode[001-024]'], gpus: 0, timeLimit: '2-00:00:00' },
      { name: 'gpu', nodes: ['gpu[01-04]'], gpus: 4, timeLimit: '12:00:00' },
      { name: 'bigmem', nodes: ['fat[01-02]'], gpus: 0, timeLimit: '2-00:00:00' },
    ],
    jobs: [],
    nextId: 4100231,
    modules: [],
  };
}

const AVAILABLE_MODULES = ['gcc/13.2.0', 'openmpi/4.1.6', 'python/3.12', 'cuda/12.4', 'gromacs/2024.3', 'lammps/2Aug2023', 'R/4.4.1', 'anaconda3/2024.06'];

/** Advance every job one tick (called on each shell command so the queue "moves"). */
export function tickSlurm(sl: SlurmState, write: (path: string, content: string) => void) {
  for (const j of sl.jobs) {
    if (j.state === 'PD' && j.ticks >= 1) j.state = 'R';
    else if (j.state === 'R' && j.ticks >= 3) {
      j.state = 'CD';
      const mpi = /mpirun|srun/.test(j.script);
      const lines = [`Job ${j.id} (${j.name}) started on ${j.nodes} node(s), ${j.tasks} task(s)`];
      if (mpi) for (let r = 0; r < Math.min(j.tasks, 8); r++) lines.push(`Hello from rank ${r} of ${j.tasks} on cnode${String(1 + Math.floor(r / 4)).padStart(3, '0')}`);
      if (j.gpus) lines.push(`GPU: NVIDIA A100-SXM4-40GB x${j.gpus} visible (CUDA_VISIBLE_DEVICES=${Array.from({ length: j.gpus }, (_, k) => k).join(',')})`);
      lines.push(`Elapsed: 00:0${Math.min(9, j.tasks)}:12   Exit code: 0`);
      write(`${j.cwd}/${j.outFile}`, lines.join('\n') + '\n');
    }
    j.ticks++;
  }
}

function directive(script: string, key: string): string | undefined {
  const re = new RegExp(`^#SBATCH\\s+(?:--${key}[= ]|-${key[0]}\\s)(\\S+)`, 'm');
  return script.match(re)?.[1];
}

export const sbatch: Handler = (ctx, args) => {
  const sl = (ctx.s.slurm ??= createSlurm());
  const file = args.find((a) => !a.startsWith('-'));
  if (!file) return fail('sbatch: error: Batch job submission failed: no script given (usage: sbatch job.sh)');
  const script = ctx.read(ctx.abs(file));
  if (script === undefined) return fail(`sbatch: error: Unable to open file ${file}`);
  if (!script.startsWith('#!')) return fail('sbatch: error: This does not look like a batch script.  The first\nsbatch: error: line must start with #! followed by the path to an interpreter.\nsbatch: error: For instance: #!/bin/bash');
  const partition = directive(script, 'partition') ?? 'normal';
  if (!sl.partitions.some((p) => p.name.replace('*', '') === partition)) return fail(`sbatch: error: invalid partition specified: ${partition}`);
  const gpus = Number((directive(script, 'gres') ?? 'gpu:0').split(':').pop());
  if (gpus > 0 && partition !== 'gpu') return fail('sbatch: error: Batch job submission failed: Requested node configuration is not available (GPUs live in the "gpu" partition)');
  const id = sl.nextId++;
  const name = directive(script, 'job-name') ?? file.replace(/\.sh$/, '');
  const nodes = Number(directive(script, 'nodes') ?? 1);
  const tasks = Number(directive(script, 'ntasks') ?? nodes);
  sl.jobs.push({ id, name, user: ctx.s.user, partition, nodes, tasks, gpus, state: 'PD', ticks: 0, outFile: (directive(script, 'output') ?? 'slurm-%j.out').replace('%j', String(id)), cwd: ctx.s.cwd, script });
  ctx.emit('hpc:sbatch');
  return ok(`Submitted batch job ${id}\n`);
};

export const squeue: Handler = (ctx) => {
  const sl = (ctx.s.slurm ??= createSlurm());
  const rows = [['JOBID', 'PARTITION', 'NAME', 'USER', 'ST', 'TIME', 'NODES', 'NODELIST(REASON)']];
  rows.push(['4100101', 'normal', 'climate', 'researcher', 'R', '1-02:13:44', '16', 'cnode[005-020]']);
  for (const j of sl.jobs.filter((x) => x.state === 'PD' || x.state === 'R'))
    rows.push([String(j.id), j.partition, j.name.slice(0, 8), j.user, j.state, j.state === 'R' ? `0:${String(j.ticks * 7).padStart(2, '0')}` : '0:00', String(j.nodes), j.state === 'PD' ? '(Priority)' : j.partition === 'gpu' ? 'gpu01' : `cnode[0${21}-0${20 + j.nodes}]`]);
  return ok(table(rows));
};

export const sinfo: Handler = (ctx) => {
  const sl = (ctx.s.slurm ??= createSlurm());
  return ok(table([['PARTITION', 'AVAIL', 'TIMELIMIT', 'NODES', 'STATE', 'NODELIST'], ...sl.partitions.flatMap((p) => p.name.startsWith('normal') ? [[p.name, 'up', p.timeLimit, '16', 'alloc', 'cnode[005-020]'], [p.name, 'up', p.timeLimit, '8', 'idle', 'cnode[001-004,021-024]']] : [[p.name, 'up', p.timeLimit, p.name === 'gpu' ? '4' : '2', 'idle', p.nodes[0]]])]));
};

export const scancel: Handler = (ctx, args) => {
  const sl = (ctx.s.slurm ??= createSlurm());
  const j = sl.jobs.find((x) => String(x.id) === args[0]);
  if (!j) return fail(`scancel: error: Kill job error on job id ${args[0]}: Invalid job id specified`);
  j.state = 'CA';
  return ok();
};

export const sacct: Handler = (ctx) => {
  const sl = (ctx.s.slurm ??= createSlurm());
  const st = { PD: 'PENDING', R: 'RUNNING', CD: 'COMPLETED', F: 'FAILED', CA: 'CANCELLED' } as const;
  return ok(table([['JobID', 'JobName', 'Partition', 'AllocCPUS', 'State', 'ExitCode'], ...sl.jobs.map((j) => [String(j.id), j.name, j.partition, String(j.tasks), st[j.state], j.state === 'CD' ? '0:0' : '0:0'])]));
};

export const srun: Handler = (ctx, args) => {
  const n = Number(args[args.indexOf('-n') + 1] ?? 1) || 1;
  const cmd = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '-n' && args[i - 1] !== '-N').join(' ');
  if (cmd === 'hostname') return ok(Array.from({ length: n }, (_, k) => `cnode${String(21 + Math.floor(k / 24)).padStart(3, '0')}`).join('\n') + '\n');
  return ok(`(srun ran "${cmd}" on ${n} task(s))\n`);
};

export const mpirun: Handler = (ctx, args) => {
  const n = Number(args[args.indexOf('-np') + 1] ?? args[args.indexOf('-n') + 1] ?? 4) || 4;
  const sl = (ctx.s.slurm ??= createSlurm());
  if (!sl.modules.some((m) => m.startsWith('openmpi'))) return fail("bash: mpirun: command not found\n[Route Runner hint] Load the MPI library first: module load openmpi/4.1.6");
  return ok(Array.from({ length: n }, (_, r) => `Hello world from processor cnode0${21 + Math.floor(r / 24)}, rank ${r} out of ${n} processors`).join('\n') + '\n[Route Runner] On a real cluster, run MPI jobs through sbatch - never on the login node!\n');
};

export const moduleCmd: Handler = (ctx, args) => {
  const sl = (ctx.s.slurm ??= createSlurm());
  const [sub, name] = args;
  if (sub === 'avail') return ok(`------------------------- /apps/modulefiles -------------------------\n${AVAILABLE_MODULES.join('   ')}\n`);
  if (sub === 'list') return ok(sl.modules.length ? `Currently Loaded Modulefiles:\n${sl.modules.map((m, i) => ` ${i + 1}) ${m}`).join('\n')}\n` : 'No Modulefiles Currently Loaded.\n');
  if (sub === 'load') {
    const found = AVAILABLE_MODULES.find((m) => m === name || m.split('/')[0] === name);
    if (!found) return fail(`ERROR: Unable to locate a modulefile for '${name}'`);
    if (!sl.modules.includes(found)) sl.modules.push(found);
    ctx.emit('hpc:module');
    return ok();
  }
  if (sub === 'purge') {
    sl.modules = [];
    return ok();
  }
  return fail('Usage: module avail | list | load NAME | purge');
};

export const nvidiaSmi: Handler = (ctx) => {
  if (ctx.s.profile !== 'hpc') return fail('NVIDIA-SMI has failed because it couldn\'t communicate with the NVIDIA driver.');
  return ok(`+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 550.90.07              Driver Version: 550.90.07      CUDA Version: 12.4     |
|-----------------------------------------+------------------------+----------------------+
| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |
|=========================================+========================+======================|
|   0  NVIDIA A100-SXM4-40GB          On  |   00000000:07:00.0 Off |                    0 |
| N/A   34C    P0             52W /  400W |       1MiB /  40960MiB |      0%      Default |
+-----------------------------------------+------------------------+----------------------+
[Route Runner] (login node shows a sample GPU - submit to the "gpu" partition to really use them)
`);
};
