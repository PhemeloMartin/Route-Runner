/** Linux / VM / Cloud / HPC terminal missions, checked against the shell simulator state. */
import type { MachineOptions, ShellState } from '@route-runner/engine';

export interface ShellObjective {
  id: string;
  text: string;
  check: (s: ShellState, events: string[]) => boolean;
}

export interface ShellLab {
  id: string;
  kind: 'linux' | 'vm' | 'cloud' | 'hpc' | 'dev';
  title: string;
  brief: string;
  minutes: number;
  machine: MachineOptions;
  objectives: ShellObjective[];
  hints: string[];
}

const file = (s: ShellState, path: string): string | undefined => {
  let n = s.fs;
  for (const seg of path.split('/').filter(Boolean)) {
    if (!n.children?.[seg]) return undefined;
    n = n.children[seg];
  }
  return n.type === 'file' ? n.content ?? '' : '[dir]';
};
const node = (s: ShellState, path: string) => {
  let n = s.fs;
  for (const seg of path.split('/').filter(Boolean)) {
    if (!n.children?.[seg]) return undefined;
    n = n.children[seg];
  }
  return n;
};

export const SHELL_LABS: ShellLab[] = [
  {
    id: 'first-steps',
    kind: 'linux',
    title: 'Linux Mission 1: Find Your Way Around',
    brief: 'You just SSHed into your first Ubuntu server. Learn where you are, look around, and build a tidy workspace.',
    minutes: 15,
    machine: { hostname: 'ubuntu-srv' },
    objectives: [
      { id: 'readme', text: 'Read README.txt in your home folder', check: (s) => s.history.some((h) => /(cat|less|more|head)\s+.*README/.test(h)) },
      { id: 'dirs', text: 'Create ~/projects/route-runner (one command, use -p)', check: (s) => file(s, `/home/${s.users[1].name}/projects/route-runner`) === '[dir]' },
      { id: 'notes', text: 'Create ~/projects/route-runner/notes.txt containing the word "linux"', check: (s) => /linux/i.test(file(s, `/home/${s.users[1].name}/projects/route-runner/notes.txt`) ?? '') },
      { id: 'os', text: 'Find out which Ubuntu version this is (cat /etc/os-release or lsb_release -a)', check: (s) => s.history.some((h) => /os-release|lsb_release/.test(h)) },
    ],
    hints: ['pwd shows where you are; ls -la shows everything (including hidden files).', 'mkdir -p projects/route-runner', 'echo "I am learning linux" > projects/route-runner/notes.txt', 'cat /etc/os-release'],
  },
  {
    id: 'web-server',
    kind: 'linux',
    title: 'Linux Mission 2: Launch a Web Server',
    brief: 'Kuruman Marketplace needs a website by tonight. Install nginx, make sure it starts on boot, publish your own homepage and prove it works with curl.',
    minutes: 25,
    machine: { hostname: 'kmp-web01' },
    objectives: [
      { id: 'update', text: 'Refresh the package lists (sudo apt update)', check: (s) => s.aptUpdated },
      { id: 'nginx', text: 'Install nginx', check: (s) => s.packages.includes('nginx') },
      { id: 'running', text: 'nginx is active AND enabled at boot', check: (s) => !!s.services.nginx?.active && !!s.services.nginx?.enabled },
      { id: 'page', text: 'Replace /var/www/html/index.html with a page that says "Kuruman Marketplace"', check: (s) => /Kuruman Marketplace/i.test(file(s, '/var/www/html/index.html') ?? '') },
      { id: 'curl', text: 'Test it locally with curl localhost', check: (_s, ev) => ev.includes('curl:local:ok') },
    ],
    hints: ['sudo apt update && sudo apt install nginx -y', 'systemctl status nginx  |  sudo systemctl enable nginx', 'echo "<h1>Kuruman Marketplace</h1>" | sudo tee /var/www/html/index.html  - or: sudo nano /var/www/html/index.html', 'curl localhost'],
  },
  {
    id: 'users-perms',
    kind: 'linux',
    title: 'Linux Mission 3: Users, Groups and Permissions',
    brief: 'A new junior admin, Thabo, starts today. Give him an account, admin rights via the sudo group, and a shared /srv/reports folder that only the "finance" group can read and write.',
    minutes: 25,
    machine: { hostname: 'files01' },
    objectives: [
      { id: 'user', text: 'User thabo exists with a home folder', check: (s) => s.users.some((u) => u.name === 'thabo') && file(s, '/home/thabo') === '[dir]' },
      { id: 'sudo', text: 'thabo is in the sudo group (and kept his other groups)', check: (s) => !!s.users.find((u) => u.name === 'thabo')?.groups.includes('sudo') && !!s.users.find((u) => u.name === 'thabo')?.groups.includes('users') },
      { id: 'group', text: 'Group finance exists', check: (s) => s.groups.includes('finance') },
      { id: 'dir', text: '/srv/reports exists with permissions 770 (rwxrwx---)', check: (s) => node(s, '/srv/reports')?.mode === 'rwxrwx---' },
    ],
    hints: ['sudo adduser thabo  (or sudo useradd -m thabo)', 'sudo usermod -aG sudo thabo   <- the -a matters!', 'sudo groupadd finance', 'sudo mkdir /srv/reports && sudo chmod 770 /srv/reports'],
  },
  {
    id: 'static-ip',
    kind: 'linux',
    title: 'Linux Mission 4: Static IP with Netplan + Firewall',
    brief: 'Servers should not change address. Give this server the static IP 192.168.1.50/24, gateway 192.168.1.1, DNS 8.8.8.8 using netplan. Then turn on the UFW firewall allowing only SSH and HTTP.',
    minutes: 30,
    machine: { hostname: 'web02', mode: 'bridged' },
    objectives: [
      { id: 'ip', text: 'enp0s3 has 192.168.1.50/24 (static, not DHCP)', check: (s) => s.net.ip === '192.168.1.50' && s.net.prefix === 24 && !s.net.dhcp },
      { id: 'gw', text: 'Default route via 192.168.1.1 and DNS 8.8.8.8', check: (s) => s.net.gateway === '192.168.1.1' && s.net.dns.includes('8.8.8.8') },
      { id: 'net', text: 'Internet still works (ping -c 2 google.com)', check: (_s, ev) => ev.some((e) => e.startsWith('linux:ping:ok:142.')) },
      { id: 'ufw', text: 'UFW is enabled and allows 22/tcp and 80/tcp', check: (s) => s.ufw.enabled && s.ufw.rules.some((r) => r.includes('22')) && s.ufw.rules.some((r) => r.includes('80')) },
    ],
    hints: ['cat /etc/netplan/50-cloud-init.yaml first, then: sudo nano /etc/netplan/50-cloud-init.yaml', 'dhcp4: false, addresses: [192.168.1.50/24], routes: - to: default  via: 192.168.1.1, nameservers: addresses: [8.8.8.8]', 'YAML uses SPACES not tabs. Then: sudo netplan apply', 'sudo ufw allow ssh && sudo ufw allow 80/tcp && sudo ufw enable'],
  },
  {
    id: 'vm-modes',
    kind: 'vm',
    title: 'VM Mission: Network Modes Explained by Breaking Them',
    brief: 'Create a VM, then test how each hypervisor network mode behaves. A Host-only VM cannot reach the internet - prove it. A NAT VM can. Write down why.',
    minutes: 30,
    machine: { hostname: 'lab-vm', mode: 'host-only' },
    objectives: [
      { id: 'noinet', text: 'In Host-only mode, show that apt update FAILS (no internet)', check: (s) => s.net.mode === 'host-only' && s.history.some((h) => h.includes('apt update')) },
      { id: 'host', text: 'In Host-only mode, ping the host machine 192.168.56.1 successfully', check: (_s, ev) => ev.includes('linux:ping:ok:192.168.56.1') },
      { id: 'ipa', text: 'Check your address with ip a', check: (_s, ev) => ev.includes('ip:a') },
    ],
    hints: ['Host-only = a private cable between the VM and your PC only.', 'NAT = VM hides behind your PC to reach the internet; nothing can reach the VM from outside.', 'Bridged = the VM is a full citizen on your real LAN with its own IP from the real router.'],
  },
  {
    id: 'docker-first',
    kind: 'cloud',
    title: 'Cloud Mission 1: Your First Containers',
    brief: 'Run your first container, then publish an nginx container on port 8080, then build your own image from ~/docker-demo.',
    minutes: 25,
    machine: { profile: 'cloud', hostname: 'cloudshell' },
    objectives: [
      { id: 'hello', text: 'docker run hello-world', check: (_s, ev) => ev.includes('docker:run:hello-world') },
      { id: 'web', text: 'An nginx container is running and published on 8080', check: (s) => !!s.docker?.containers.some((c) => c.status === 'running' && c.image.startsWith('nginx') && c.ports.startsWith('0.0.0.0:8080')) },
      { id: 'curl', text: 'curl localhost:8080 returns the nginx page', check: (_s, ev) => ev.includes('curl:docker:ok') },
      { id: 'build', text: 'Build an image tagged phemelo/site from ~/docker-demo', check: (s) => !!s.docker?.images.some((i) => i.repo === 'phemelo/site') },
    ],
    hints: ['docker run hello-world', 'docker run -d --name web -p 8080:80 nginx', 'curl localhost:8080', 'cd ~/docker-demo && cat Dockerfile && docker build -t phemelo/site .'],
  },
  {
    id: 'k8s-deploy',
    kind: 'cloud',
    title: 'Cloud Mission 2: Kubernetes - Deploy, Break, Heal, Scale',
    brief: 'Deploy the web app to the cluster from YAML, expose it, kill a pod and watch Kubernetes heal it, then scale to 6 replicas. Watch the 3D cluster view while you work!',
    minutes: 35,
    machine: { profile: 'cloud', hostname: 'cloudshell' },
    objectives: [
      { id: 'apply', text: 'kubectl apply -f ~/k8s/web-deployment.yaml', check: (s) => !!s.k8s?.deployments.some((d) => d.name === 'web') },
      { id: 'svc', text: 'A Service named web exposes the deployment', check: (s) => !!s.k8s?.services.some((x) => x.name === 'web') },
      { id: 'heal', text: 'Delete one pod and see a replacement appear (self-healing)', check: (_s, ev) => ev.includes('k8s:selfheal') },
      { id: 'scale', text: 'Scale web to 6 replicas, all Running', check: (s) => s.k8s?.deployments.find((d) => d.name === 'web')?.replicas === 6 && s.k8s.pods.filter((p) => p.owner === 'web' && p.status === 'Running').length === 6 },
    ],
    hints: ['kubectl apply -f ~/k8s/web-deployment.yaml && kubectl get pods -o wide', 'kubectl apply -f ~/k8s/web-service.yaml (or kubectl expose deployment web --port=80 --type=NodePort)', 'kubectl delete pod <name-from-get-pods>', 'kubectl scale deployment web --replicas=6'],
  },
  {
    id: 'aws-vpc',
    kind: 'cloud',
    title: 'Cloud Mission 3: Build a VPC in Cape Town (af-south-1)',
    brief: 'Create a VPC 10.20.0.0/16, a public subnet 10.20.1.0/24 with an Internet Gateway route, a security group that allows HTTP from anywhere and SSH only from your IP, and launch a t3.micro Ubuntu instance in it.',
    minutes: 40,
    machine: { profile: 'cloud', hostname: 'cloudshell' },
    objectives: [
      { id: 'vpc', text: 'VPC 10.20.0.0/16 exists', check: (s) => !!s.aws?.vpcs.some((v) => v.cidr === '10.20.0.0/16') },
      { id: 'subnet', text: 'Subnet 10.20.1.0/24 exists in that VPC', check: (s) => !!s.aws?.subnets.some((x) => x.cidr === '10.20.1.0/24') },
      { id: 'igw', text: 'An Internet Gateway is attached and the subnet routes 0.0.0.0/0 to it (public)', check: (s) => !!s.aws?.subnets.some((x) => x.cidr === '10.20.1.0/24' && x.public) },
      { id: 'sg', text: 'A security group allows tcp/80 from 0.0.0.0/0 and tcp/22 NOT from 0.0.0.0/0', check: (s) => !!s.aws?.sgs.some((g) => g.ingress.some((r) => r.port === '80' && r.cidr === '0.0.0.0/0') && g.ingress.some((r) => r.port === '22' && r.cidr !== '0.0.0.0/0')) },
      { id: 'ec2', text: 'A running t3.micro instance with a public IP', check: (s) => !!s.aws?.instances.some((i) => i.state === 'running' && i.type === 't3.micro' && !!i.publicIp) },
    ],
    hints: ['aws ec2 create-vpc --cidr-block 10.20.0.0/16', 'aws ec2 create-subnet --vpc-id vpc-... --cidr-block 10.20.1.0/24', 'aws ec2 create-internet-gateway, attach-internet-gateway, create-route-table, create-route --destination-cidr-block 0.0.0.0/0 --gateway-id igw-..., associate-route-table', 'aws ec2 create-security-group ... then authorize-security-group-ingress --protocol tcp --port 22 --cidr 102.66.143.27/32', 'aws ec2 run-instances --image-id ami-0ubuntu2404 --instance-type t3.micro --subnet-id subnet-...'],
  },
  {
    id: 'iac',
    kind: 'cloud',
    title: 'Cloud Mission 4: Infrastructure as Code + Network Automation',
    brief: 'Click-ops doesn\'t scale. Use Terraform to create the demo infrastructure, then use Ansible to "ping" every network device in the inventory and run the backup playbook.',
    minutes: 30,
    machine: { profile: 'cloud', hostname: 'cloudshell' },
    objectives: [
      { id: 'init', text: 'terraform init in ~/terraform-demo', check: (s) => !!s.tf?.initialized },
      { id: 'apply', text: 'terraform apply creates the resources', check: (s) => (s.tf?.applied.length ?? 0) >= 3 },
      { id: 'aping', text: 'ansible all -i inventory.ini -m ping (from ~/ansible)', check: (_s, ev) => ev.includes('ansible:ping') },
      { id: 'book', text: 'ansible-playbook -i inventory.ini backup-configs.yml', check: (_s, ev) => ev.includes('ansible:playbook') },
    ],
    hints: ['cd ~/terraform-demo && terraform init && terraform plan && terraform apply', 'cd ~/ansible && ansible all -i inventory.ini -m ping', 'ansible-playbook -i inventory.ini backup-configs.yml'],
  },
  {
    id: 'hpc-first-job',
    kind: 'hpc',
    title: 'HPC Mission: Submit Your First Cluster Job',
    brief: 'You have an account on a supercomputer modelled on the CHPC Lengau cluster in Cape Town. Explore the partitions, load MPI, submit an 8-rank MPI job with Slurm and read its output.',
    minutes: 25,
    machine: { profile: 'hpc', hostname: 'login01' },
    objectives: [
      { id: 'sinfo', text: 'See the partitions with sinfo', check: (s) => s.history.some((h) => h.startsWith('sinfo')) },
      { id: 'module', text: 'module load openmpi', check: (_s, ev) => ev.includes('hpc:module') },
      { id: 'submit', text: 'sbatch ~/jobs/hello_mpi.sh', check: (_s, ev) => ev.includes('hpc:sbatch') },
      { id: 'done', text: 'The job COMPLETED (check squeue / sacct) and you read its .out file', check: (s) => !!s.slurm?.jobs.some((j) => j.state === 'CD') && s.history.some((h) => /cat .*\.out/.test(h)) },
    ],
    hints: ['sinfo  |  module avail  |  module load openmpi/4.1.6', 'cat ~/jobs/hello_mpi.sh - read the #SBATCH lines', 'sbatch ~/jobs/hello_mpi.sh then squeue (run it a few times - jobs go PD -> R -> done)', 'ls then cat hello-<jobid>.out'],
  },
  // ------------------------------------------------------------------ App & DevOps (Dev Studio)
  {
    id: 'aspnet-api',
    kind: 'dev',
    title: 'ASP.NET Mission 1: Your First Web API',
    brief: 'Lindiwe needs a back end for Kasi Market. Create an ASP.NET Core Web API with the .NET 10 CLI, run it on Kestrel, call it with curl, then add your own endpoint and see it answer.',
    minutes: 20,
    machine: { profile: 'dev', hostname: 'devbox' },
    objectives: [
      { id: 'sdk', text: 'Check the installed .NET SDK (dotnet --version)', check: (s) => s.history.some((h) => /dotnet\s+--(version|info)/.test(h)) },
      { id: 'new', text: 'Create a Web API project called TodoApi in your home folder', check: (s) => !!s.dev?.dotnet.projects.some((p) => p.name === 'TodoApi' && p.template === 'webapi' && !p.dir.includes('/labs/')) },
      { id: 'run', text: 'Start it with dotnet run (from inside the project folder)', check: (_s, ev) => ev.includes('dotnet:run') },
      { id: 'weather', text: 'Call GET /weatherforecast with curl and read the JSON', check: (_s, ev) => ev.includes('dotnet:http:GET:/weatherforecast') },
      { id: 'hello', text: 'Add an endpoint that answers with your name (e.g. "Hello from Phemelo"), restart and curl it', check: (_s, ev) => ev.includes('dotnet:hello') },
    ],
    hints: ['dotnet --version', 'dotnet new webapi -n TodoApi   then   cd TodoApi', 'dotnet run   (it keeps running in the background of this simulator)', 'curl localhost:5080/weatherforecast', 'nano Program.cs - above app.Run(); add:  app.MapGet("/hello", () => "Hello from Phemelo");  save (Ctrl+O), exit (Ctrl+X), dotnet run, curl localhost:5080/hello'],
  },
  {
    id: 'aspnet-ef',
    kind: 'dev',
    title: 'ASP.NET Mission 2: A Real Database with EF Core',
    brief: 'The Todo API in ~/labs/ef-core/TodoApi already has a model and a DbContext, but no database packages, tools or migrations - so it does not even build. Wire up EF Core with SQLite, create the schema with a migration, then create and read todos through the API.',
    minutes: 25,
    machine: { profile: 'dev', hostname: 'devbox' },
    objectives: [
      { id: 'pkgs', text: 'Add Microsoft.EntityFrameworkCore.Sqlite and Microsoft.EntityFrameworkCore.Design', check: (s) => { const x = file(s, `/home/${s.users[1].name}/labs/ef-core/TodoApi/TodoApi.csproj`) ?? ''; return /EntityFrameworkCore\.Sqlite/.test(x) && /EntityFrameworkCore\.Design/.test(x); } },
      { id: 'tool', text: 'Install the EF Core CLI tool (dotnet-ef)', check: (s) => !!s.dev?.dotnet.tools.includes('dotnet-ef') },
      { id: 'migration', text: 'Create a migration called InitialCreate', check: (s) => !!s.dev?.dotnet.projects.find((p) => p.dir.endsWith('/labs/ef-core/TodoApi'))?.migrations.some((m) => m.endsWith('_InitialCreate')) },
      { id: 'db', text: 'Apply it to the database (app.db appears)', check: (s) => !!s.dev?.dotnet.projects.find((p) => p.dir.endsWith('/labs/ef-core/TodoApi'))?.dbUpdated },
      { id: 'crud', text: 'Run the API, POST a new todo with curl and GET the list back', check: (_s, ev) => ev.includes('dotnet:todo:created') },
    ],
    hints: ['cd ~/labs/ef-core/TodoApi   then try dotnet build - read the error', 'dotnet add package Microsoft.EntityFrameworkCore.Sqlite   and   dotnet add package Microsoft.EntityFrameworkCore.Design', 'dotnet tool install --global dotnet-ef', 'dotnet ef migrations add InitialCreate   then   dotnet ef database update', 'dotnet run   then   curl -X POST localhost:5080/todos -H "Content-Type: application/json" -d \'{"title":"Buy airtime"}\'   and   curl localhost:5080/todos'],
  },
  {
    id: 'flutter-first',
    kind: 'dev',
    title: 'Flutter Mission: The Kasi Market App',
    brief: 'Create the Kasi Market Flutter app, add the http package for talking to your API, make the home screen say "Kasi Market", prove it with the widget tests and run it in Chrome.',
    minutes: 25,
    machine: { profile: 'dev', hostname: 'devbox' },
    objectives: [
      { id: 'doctor', text: 'Check your toolchain with flutter doctor', check: (s) => !!s.dev?.flutter.doctor },
      { id: 'create', text: 'Create a project named kasi_market (Dart names are lower_snake_case)', check: (s) => !!s.dev?.flutter.projects.some((p) => p.name === 'kasi_market') },
      { id: 'http', text: 'Add the http package (flutter pub add http)', check: (s) => { const p = s.dev?.flutter.projects.find((x) => x.name === 'kasi_market'); return !!p && /^\s+http:/m.test(file(s, p.dir + '/pubspec.yaml') ?? ''); } },
      { id: 'title', text: 'Change the home page title in lib/main.dart to "Kasi Market"', check: (s) => { const p = s.dev?.flutter.projects.find((x) => x.name === 'kasi_market'); return !!p && /Kasi Market/.test(file(s, p.dir + '/lib/main.dart') ?? ''); } },
      { id: 'test', text: 'flutter test passes', check: (s) => !!s.dev?.flutter.projects.find((x) => x.name === 'kasi_market')?.tested },
      { id: 'run', text: 'Run the app in Chrome (flutter run -d chrome)', check: (s) => s.dev?.flutter.projects.find((x) => x.name === 'kasi_market')?.ran === 'chrome' },
    ],
    hints: ['flutter doctor', 'flutter create kasi_market   then   cd kasi_market', 'flutter pub add http   then   cat pubspec.yaml', "nano lib/main.dart - find title: 'Flutter Demo Home Page' and change it to 'Kasi Market'", 'flutter test   then   flutter run -d chrome'],
  },
  {
    id: 'ci-pipeline',
    kind: 'dev',
    title: 'DevOps Mission: Turn the Pipeline Green',
    brief: 'The repo in ~/labs/pipeline has the Todo API, unit tests, a Dockerfile and a GitHub Actions workflow - but the workflow never runs the tests, so broken code could ship. Put the repo under Git, fix the workflow, run it locally with act until it is green, and let it build the container image.',
    minutes: 25,
    machine: { profile: 'dev', hostname: 'devbox' },
    objectives: [
      { id: 'git', text: 'Initialise Git in ~/labs/pipeline and make a first commit', check: (s) => file(s, `/home/${s.users[1].name}/labs/pipeline/.git`) === '[dir]' && s.history.some((h) => /git commit/.test(h)) },
      { id: 'list', text: 'List the workflow jobs with act -l', check: (s) => s.history.some((h) => /^act\s+(-l|--list)/.test(h)) },
      { id: 'test', text: 'Add a step named Test that runs dotnet test to .github/workflows/ci.yml', check: (s) => /run:\s*dotnet test/.test(file(s, `/home/${s.users[1].name}/labs/pipeline/.github/workflows/ci.yml`) ?? '') },
      { id: 'green', text: 'Run the pipeline with act - green, with the tests included', check: (s, ev) => ev.includes('ci:green') && /run:\s*dotnet test/.test(file(s, `/home/${s.users[1].name}/labs/pipeline/.github/workflows/ci.yml`) ?? '') },
      { id: 'image', text: 'The docker job built ghcr.io/phemelo/todo-api:1.2', check: (s) => !!s.docker?.images.some((i) => i.repo === 'ghcr.io/phemelo/todo-api' && i.tag === '1.2') },
    ],
    hints: ['cd ~/labs/pipeline   then   git init   git add .   git commit -m "Initial commit"', 'act -l   shows the jobs; cat .github/workflows/ci.yml', 'nano .github/workflows/ci.yml - under the Build step add, with the same indentation:   - name: Test   and on the next line   run: dotnet test', 'act   (read every step; red means read the first failure)', 'Try breaking a test on purpose (Assert.Equal(115, 114)) and watch the pipeline go red - that is CI doing its job.'],
  },
  {
    id: 'helm-ship',
    kind: 'dev',
    title: 'Kubernetes Mission: Ship It with Helm',
    brief: 'The CI pipeline pushed ghcr.io/phemelo/todo-api to the registry. Use the Helm chart in ~/labs/helm to install the API on the cluster, scale it, deploy a broken version on purpose and roll back like an on-call engineer.',
    minutes: 25,
    machine: { profile: 'dev', hostname: 'devbox' },
    objectives: [
      { id: 'repo', text: 'Add the bitnami chart repository and search it', check: (s) => !!s.dev?.helm.repos.some((r) => r.name === 'bitnami') },
      { id: 'install', text: 'Install ./charts/todo-api as a release named todo', check: (s) => !!s.dev?.helm.releases.some((r) => r.name === 'todo') },
      { id: 'scale', text: 'Upgrade the release to 4 replicas - 4 pods Running', check: (s) => s.k8s?.deployments.find((d) => d.name === 'todo-todo-api')?.replicas === 4 && s.k8s.pods.filter((p) => p.owner === 'todo-todo-api' && p.status === 'Running').length === 4 },
      { id: 'break', text: 'Deploy a tag that does not exist (image.tag=9.9) and see ImagePullBackOff', check: (s) => !!s.dev?.helm.releases.find((r) => r.name === 'todo')?.revisions.some((r) => r.values['image.tag'] === '9.9') },
      { id: 'rollback', text: 'Roll back with helm rollback - every todo pod healthy again (check helm history)', check: (s, ev) => ev.includes('helm:rollback') && !!s.k8s && s.k8s.pods.some((p) => p.owner === 'todo-todo-api') && s.k8s.pods.filter((p) => p.owner === 'todo-todo-api').every((p) => p.status === 'Running') },
    ],
    hints: ['helm repo add bitnami https://charts.bitnami.com/bitnami   then   helm search repo bitnami', 'cd ~/labs/helm   cat charts/todo-api/values.yaml   helm install todo ./charts/todo-api', 'helm upgrade todo ./charts/todo-api --set replicaCount=4   then   kubectl get pods', 'helm upgrade todo ./charts/todo-api --reuse-values --set image.tag=9.9   then   kubectl get pods  (and kubectl describe pod ... for the Events)', 'helm history todo   then   helm rollback todo 2   then   kubectl get pods'],
  },
];

export function shellLab(id: string): ShellLab | undefined {
  return SHELL_LABS.find((l) => l.id === id);
}
