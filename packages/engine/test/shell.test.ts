import { describe, expect, it } from 'vitest';
import { ShellSession } from '../src/shell/shell.js';

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

function run(sh: ShellSession, ...lines: string[]): string {
  return lines.map((l) => strip(sh.exec(l).output)).join('');
}

describe('Linux shell basics', () => {
  it('navigates and manipulates files', () => {
    const sh = ShellSession.create();
    expect(run(sh, 'pwd')).toBe('/home/phemelo\n');
    run(sh, 'mkdir -p labs/day1', 'cd labs/day1', 'echo "hello world" > notes.txt', 'echo second >> notes.txt');
    expect(run(sh, 'cat notes.txt')).toBe('hello world\nsecond\n');
    expect(run(sh, 'cat notes.txt | wc -l')).toBe('2\n');
    expect(run(sh, 'grep -n second notes.txt')).toBe('2:second\n');
    expect(run(sh, 'cd ..', 'pwd')).toBe('/home/phemelo/labs\n');
    expect(run(sh, 'ls')).toBe('day1\n');
  });

  it('enforces permissions and sudo', () => {
    const sh = ShellSession.create({ password: 'secret1' });
    expect(run(sh, 'cat /etc/shadow')).toMatch(/Permission denied/);
    expect(run(sh, 'touch /etc/test')).toMatch(/Permission denied/);
    const r = sh.exec('sudo cat /etc/shadow');
    expect(r.secret).toBe(true);
    expect(strip(sh.exec('wrong').output)).toMatch(/Sorry, try again/);
    expect(strip(sh.exec('secret1').output)).toMatch(/^root:/);
  });

  it('tells you to install net-tools for ifconfig, then works', () => {
    const sh = ShellSession.create();
    expect(run(sh, 'ifconfig')).toMatch(/sudo apt install net-tools/);
    sh.s.sudoCached = true;
    run(sh, 'sudo apt install -y net-tools');
    expect(run(sh, 'ifconfig')).toMatch(/inet 10\.0\.2\.15/);
  });

  it('installs nginx, serves a page, and blocks a second web server on port 80', () => {
    const sh = ShellSession.create();
    sh.s.sudoCached = true;
    expect(run(sh, 'curl localhost')).toMatch(/Couldn't connect/);
    run(sh, 'sudo apt update', 'sudo apt install nginx -y');
    expect(run(sh, 'systemctl status nginx')).toMatch(/active \(running\)/);
    expect(run(sh, 'curl localhost')).toMatch(/Welcome to nginx/);
    expect(run(sh, 'ss -tulpn')).toMatch(/0\.0\.0\.0:80/);
    run(sh, 'sudo apt install -y apache2');
    sh.s.services.apache2.active = false;
    expect(run(sh, 'sudo systemctl start apache2')).toMatch(/Address already in use/);
  });

  it('has no internet in host-only mode (apt fails with a hint)', () => {
    const sh = ShellSession.create({ mode: 'host-only' });
    sh.s.sudoCached = true;
    expect(run(sh, 'sudo apt update')).toMatch(/Temporary failure resolving/);
    expect(run(sh, 'ping -c 2 8.8.8.8')).toMatch(/Network is unreachable/);
    expect(run(sh, 'ping -c 1 192.168.56.1')).toMatch(/1 received/);
  });

  it('configures a static IP with netplan', () => {
    const sh = ShellSession.create({ mode: 'bridged' });
    sh.s.sudoCached = true;
    const yaml = 'network:\n  version: 2\n  ethernets:\n    enp0s3:\n      dhcp4: false\n      addresses:\n        - 192.168.1.50/24\n      routes:\n        - to: default\n          via: 192.168.1.1\n      nameservers:\n        addresses: [8.8.8.8, 1.1.1.1]\n';
    sh.editSudo = true;
    expect(sh.saveFromEditor('/etc/netplan/50-cloud-init.yaml', yaml)).toBeUndefined();
    const out = sh.exec('sudo netplan apply');
    expect(out.events).toContain('netplan:static');
    expect(run(sh, 'ip a')).toMatch(/inet 192\.168\.1\.50\/24/);
    expect(run(sh, 'ip r')).toMatch(/default via 192\.168\.1\.1/);
  });

  it('manages users and groups (and warns about usermod -G without -a)', () => {
    const sh = ShellSession.create();
    sh.s.sudoCached = true;
    run(sh, 'sudo useradd -m thabo');
    expect(run(sh, 'ls /home')).toMatch(/thabo/);
    expect(run(sh, 'sudo usermod -G sudo thabo')).toMatch(/REMOVED/);
    run(sh, 'sudo usermod -aG adm thabo');
    expect(run(sh, 'groups thabo')).toMatch(/sudo adm/);
    expect(run(sh, 'grep thabo /etc/group')).toMatch(/sudo:x:27:.*thabo/);
  });

  it('runs scripts only when executable', () => {
    const sh = ShellSession.create();
    // single quotes: $n must NOT be expanded while writing the file (same as real bash)
    run(sh, "echo '#!/bin/bash' > hi.sh", "echo 'for n in 1 2 3; do echo item-$n; done' >> hi.sh");
    expect(run(sh, './hi.sh')).toMatch(/Permission denied/);
    run(sh, 'chmod +x hi.sh');
    expect(run(sh, './hi.sh')).toBe('item-1\nitem-2\nitem-3\n');
    expect(run(sh, 'ls -l hi.sh')).toMatch(/-rwxr-xr-x/);
  });

  it('runs a firewall the safe way', () => {
    const sh = ShellSession.create();
    sh.s.sudoCached = true;
    expect(run(sh, 'ufw status')).toMatch(/need to be root/);
    expect(run(sh, 'sudo ufw enable')).toMatch(/lock you out/);
    run(sh, 'sudo ufw allow ssh', 'sudo ufw allow from 192.168.56.0/24 to any port 80');
    const st = run(sh, 'sudo ufw status');
    expect(st).toMatch(/22\/tcp\s+ALLOW\s+Anywhere/);
    expect(st).toMatch(/80\s+ALLOW\s+192\.168\.56\.0\/24/);
  });
});

describe('Cloud shell', () => {
  it('runs docker containers', () => {
    const sh = ShellSession.create({ profile: 'cloud' });
    expect(run(sh, 'docker run hello-world')).toMatch(/Hello from Docker!/);
    run(sh, 'docker run -d --name web -p 8080:80 nginx');
    expect(run(sh, 'docker ps')).toMatch(/0\.0\.0\.0:8080->80\/tcp\s+web/);
    expect(run(sh, 'curl localhost:8080')).toMatch(/container web/);
    expect(run(sh, 'docker run ngnix')).toMatch(/pull access denied/);
    expect(run(sh, 'docker rm web')).toMatch(/container is running/);
  });

  it('heals Kubernetes deployments and scales them', () => {
    const sh = ShellSession.create({ profile: 'cloud' });
    expect(run(sh, 'kubectl apply -f ~/k8s/web-deployment.yaml')).toMatch(/deployment.apps\/web created/);
    expect(sh.s.k8s!.pods.filter((p) => p.status === 'Running')).toHaveLength(3);
    const victim = sh.s.k8s!.pods[0].name;
    const r = sh.exec(`kubectl delete pod ${victim}`);
    expect(r.events).toContain('k8s:selfheal');
    expect(sh.s.k8s!.pods).toHaveLength(3);
    run(sh, 'kubectl scale deployment web --replicas=6');
    expect(strip(run(sh, 'kubectl get deploy'))).toMatch(/web\s+6\/6/);
    run(sh, 'kubectl set image deployment/web web=ngnix:typo');
    expect(run(sh, 'kubectl get pods')).toMatch(/ImagePullBackOff/);
    run(sh, 'kubectl rollout undo deployment/web');
    expect(run(sh, 'kubectl rollout status deployment/web')).toMatch(/successfully rolled out/);
  });

  it('builds AWS networking and runs Terraform', () => {
    const sh = ShellSession.create({ profile: 'cloud' });
    const vpc = JSON.parse(run(sh, 'aws ec2 create-vpc --cidr-block 10.0.0.0/16')).Vpc.VpcId;
    expect(run(sh, `aws ec2 create-subnet --vpc-id ${vpc} --cidr-block 192.168.1.0/24`)).toMatch(/InvalidSubnet.Range/);
    expect(JSON.parse(run(sh, `aws ec2 create-subnet --vpc-id ${vpc} --cidr-block 10.0.1.0/24`)).Subnet.CidrBlock).toBe('10.0.1.0/24');
    run(sh, 'cd ~/terraform-demo');
    expect(run(sh, 'terraform plan')).toMatch(/terraform init/);
    run(sh, 'terraform init');
    expect(run(sh, 'terraform apply -auto-approve')).toMatch(/Apply complete! Resources: 3 added/);
  });

  it('runs an HPC batch job through Slurm', () => {
    const sh = ShellSession.create({ profile: 'hpc' });
    expect(run(sh, 'sbatch ~/jobs/hello_mpi.sh')).toMatch(/Submitted batch job 4100231/);
    expect(run(sh, 'squeue')).toMatch(/hello_mp/);
    run(sh, 'pwd', 'pwd', 'pwd', 'pwd');
    expect(run(sh, 'cat hello-4100231.out')).toMatch(/rank 7 of 8/);
    expect(run(sh, 'mpirun -np 4 ./hello')).toMatch(/module load openmpi/);
  });
});
