import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c11 | High Performance Computing (HPC) | 11
@sources OS Chapter 1 (multiprocessor & multicore organisation, DMA); Big Data modules (parallel processing); CHPC (Centre for High Performance Computing, Cape Town) public user guides concepts
@story
A researcher from Sol Plaatje University visits the Supercomputer building: her climate model would take 9 months on her laptop. On a cluster it takes 6 hours. "HPC is where networking, Linux, storage and cloud all meet at their most extreme," she says. "And South Africa runs one of Africa's biggest - Lengau, at the CHPC in Cape Town."
@lab hpc:hpc-first-job | HPC Mission - Submit your first cluster job

=== lesson c11-1 | What HPC Is and How Clusters Are Built | 25
@analogy One computer solving a huge problem is one person painting a stadium. HPC is hiring 10,000 painters, giving each a section (parallelism), a walkie-talkie network so they coordinate (interconnect), and a foreman who assigns work (scheduler).
@objectives
- Define HPC, FLOPS and parallel computing
- Describe cluster components: login, compute, storage, interconnect
- Name real HPC uses and systems
@body
**High Performance Computing** aggregates many computers (**nodes**) to solve problems far beyond a single machine: weather and climate, genomics and drug discovery, mining and geology, astronomy (the **Square Kilometre Array** radio telescope in the Northern Cape - near you! - produces enormous data volumes), financial risk, and **AI model training**.

Performance is measured in **FLOPS** (floating-point operations per second). Laptops: hundreds of GFLOPS. Top supercomputers: **exaFLOPS** (10^18). The **TOP500** list ranks them.

**Anatomy of a cluster:**
- **Login nodes** - where you SSH in, edit, compile and **submit jobs** (never run heavy work here!)
- **Compute nodes** - hundreds/thousands of many-core CPU nodes, plus **GPU nodes** (NVIDIA A100/H100) and **fat (big-memory) nodes**
- **High-speed interconnect** - **InfiniBand** or high-speed Ethernet with very low latency (microseconds) and RDMA, so nodes can exchange data fast
- **Parallel file system** - **Lustre**, GPFS/Spectrum Scale, BeeGFS - thousands of nodes reading/writing at once
- **Scheduler / resource manager** - **Slurm** (most common), PBS - queues and allocates jobs fairly
- Cooling and power on a huge scale (often liquid cooling)

**Cloud HPC** - AWS ParallelCluster with hpc6a instances and EFA networking, Azure HPC (HB/ND series): burst to thousands of cores without owning a machine room.
@terms
- HPC :: High Performance Computing - many nodes working together on large problems
- Node :: One server in a cluster
- FLOPS :: Floating-point operations per second - the HPC speed measure
- InfiniBand :: Very low-latency, high-bandwidth interconnect used in HPC
- Lustre :: Parallel file system for HPC clusters
- Login node :: Entry point for users to prepare and submit jobs
- Slurm :: The most widely used HPC job scheduler
@pro
- "On a cluster I compile and submit on the login node; real work always runs on compute nodes via the scheduler."
@quiz
? What should you NOT do on an HPC login node?
+ Run large computations
- Edit job scripts
- Submit jobs
- Check the queue
> Use the scheduler.
? Which interconnect is typical in HPC for low latency?
+ InfiniBand
- Wi-Fi 6
- USB 3
- Bluetooth
> Microsecond latency, RDMA.
? Which unit measures HPC speed?
- RPM
+ FLOPS
- MB/s only
- dBm
> Floating-point operations per second.

=== lesson c11-2 | Parallel Programming: MPI, OpenMP and GPUs | 20
@analogy OpenMP is one kitchen with many cooks sharing the same fridge (shared memory). MPI is many separate kitchens in different buildings that phone each other with ingredients (message passing). GPUs are a factory of thousands of simple workers all doing the same small task at once.
@objectives
- Compare shared-memory (OpenMP) and distributed-memory (MPI) parallelism
- Explain GPU computing at a high level
- Explain speedup limits (Amdahl's law)
@body
- **Shared memory (OpenMP, threads)** - many cores in ONE node see the same RAM. Easy, but limited to one machine.
- **Distributed memory (MPI - Message Passing Interface)** - many processes (**ranks**) across MANY nodes, each with its own memory, exchanging messages over the interconnect. Scales to thousands of nodes. Run with [[mpirun -np 64 ./app]] or [[srun]].
- **Hybrid** - MPI between nodes + OpenMP within nodes.
- **GPUs (CUDA, ROCm)** - thousands of small cores ideal for data-parallel maths (matrix operations: AI training, simulations). Check with [[nvidia-smi]].

**Amdahl's law:** speedup is limited by the part that can't be parallelised. If 10% of a program is serial, even infinite processors give at most **10x** speedup. That's why HPC engineers profile and optimise the serial bits.

**Environment modules** manage many software versions on a shared cluster: [[module avail]], [[module load openmpi/4.1.6 gcc/13.2.0]], [[module list]], [[module purge]]. Containers on HPC: Apptainer/Singularity.

**Your OS course connection:** multicore organisation, cache, memory hierarchy and DMA (Chapter 1) are exactly what HPC performance tuning is about - keeping data close to the cores.
@terms
- MPI :: Message Passing Interface - distributed-memory parallel programming across nodes
- Rank :: One MPI process, identified by a number
- OpenMP :: Shared-memory multithreading within one node
- CUDA :: NVIDIA's GPU programming platform
- Amdahl's law :: Serial portions limit the maximum parallel speedup
- Environment modules :: The module command for loading software versions on clusters
@pro
- "Amdahl's law says a 10% serial portion caps speedup at 10x, no matter how many cores we add."
@quiz
? Which model runs processes on many nodes that exchange messages?
+ MPI
- OpenMP
- A single thread
- RAID
> Distributed memory.
?= If 5% of a program is serial, what is the maximum possible speedup? (times)
= 20 | 20x
> 1 / 0.05 = 20.
? Which command loads a software environment on a cluster?
+ module load openmpi
- apt install openmpi on the login node as a user
- docker run openmpi
- sbatch openmpi
> Environment modules.

=== lesson c11-3 | Slurm: Submitting and Managing Jobs | 20
@analogy Slurm is the queue at Home Affairs with a ticket machine. You take a ticket (sbatch), wait for your number (squeue shows PD - pending), go to a counter when one frees up (R - running), and leave when done (CD - completed). Ask for too many counters at once and you wait longer.
@objectives
- Write a Slurm batch script with #SBATCH directives
- Submit, monitor and cancel jobs
- Request GPUs and choose partitions
@body
~~~
#!/bin/bash
#SBATCH --job-name=hello_mpi
#SBATCH --partition=normal
#SBATCH --nodes=2
#SBATCH --ntasks=8
#SBATCH --time=00:05:00
#SBATCH --output=hello-%j.out

module load openmpi/4.1.6
mpirun -np 8 ./hello_mpi
~~~
| Command | Does |
|---|---|
| [[sinfo]] | partitions (queues) and node states (idle/alloc/down) |
| [[sbatch job.sh]] | submit -> "Submitted batch job 4100231" |
| [[squeue -u phemelo]] | your jobs: ST = PD pending, R running |
| [[scancel 4100231]] | cancel |
| [[sacct]] | history and exit codes |
| [[srun -n 4 hostname]] | run a parallel step / interactive |

**GPUs:** [[#SBATCH --partition=gpu]] and [[#SBATCH --gres=gpu:2]]. **Fair share:** your priority depends on recent usage; **ask only for what you need** - smaller, shorter jobs start sooner (backfill). Output goes to the [[.out]] file in your submit directory.

**Career note:** HPC sysadmins combine everything in Route Runner - Linux, networking (InfiniBand/Ethernet fabrics), storage, scheduling, automation (Ansible), and increasingly Kubernetes and cloud for AI workloads.
@terms
- sbatch :: Submit a batch job script to Slurm
- squeue :: Show queued and running jobs
- Partition :: A Slurm queue/group of nodes (e.g. normal, gpu, bigmem)
- #SBATCH :: Directive lines in a job script that request resources
- --gres=gpu:N :: Requests N GPUs for a job
- Backfill :: Scheduler starting small jobs in gaps while big jobs wait
@pro
- "I request realistic time and resources so backfill can start my job sooner."
@quiz
? A job shows ST = PD in squeue. What does it mean?
+ Pending - waiting for resources
- Running
- Completed
- Failed
> PD = pending.
? Which line requests 2 GPUs?
+ #SBATCH --gres=gpu:2
- #SBATCH --gpu-count=two
- module load gpu 2
- srun --gpus please
> Generic resources.
?= Which command submits job.sh?
= sbatch job.sh
> Returns the job ID.

=== boss
? Which file system type is designed for thousands of nodes accessing data at once?
+ Lustre (parallel file system)
- FAT32
- A single NFS share on a laptop
- S3 Glacier
> Parallel I/O.
? A climate model needs 512 cores across 16 nodes. Which programming model?
+ MPI (possibly with OpenMP inside nodes)
- A single Python thread
- OpenMP alone on one node
- Excel macros
> Distributed memory.
? Your job sits in PD for hours. A sensible fix?
+ Request fewer resources or a shorter time limit
- Run it on the login node instead
- Submit it 50 times
- Delete other users' jobs
> Smaller jobs schedule sooner.
? Which South African facility runs the Lengau supercomputer?
+ CHPC in Cape Town
- SARB in Pretoria
- Telkom in Centurion
- SKA in Kuruman
> Centre for High Performance Computing.
? Which tool shows GPU utilisation on a node?
+ nvidia-smi
- sinfo
- ip a
- ufw status
> NVIDIA System Management Interface.
`;
