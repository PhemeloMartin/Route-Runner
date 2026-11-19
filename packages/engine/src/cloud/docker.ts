import { parseYaml, yget, type Yaml } from '../shell/yaml.js';
import { type DockerState, type Handler, type ShellCtx, age, fail, ok, parseFlags, shortId, table } from './types.js';

/** Images the simulated registry (Docker Hub) knows about. Anything else -> "pull access denied". */
export const KNOWN_IMAGES: Record<string, { sizeMb: number; port?: number; log: string[] }> = {
  'hello-world': { sizeMb: 0.01, log: ['', 'Hello from Docker!', 'This message shows that your installation appears to be working correctly.', '', 'To generate this message, Docker took the following steps:', ' 1. The Docker client contacted the Docker daemon.', ' 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.', ' 3. The Docker daemon created a new container from that image which runs the', '    executable that produces the output you are currently reading.', ' 4. The Docker daemon streamed that output to the Docker client, which sent it', '    to your terminal.', ''] },
  nginx: { sizeMb: 192, port: 80, log: ['/docker-entrypoint.sh: Configuration complete; ready for start up', '2026/11/19 08:00:00 [notice] 1#1: nginx/1.27.3', '2026/11/19 08:00:00 [notice] 1#1: start worker processes'] },
  httpd: { sizeMb: 148, port: 80, log: ['AH00558: httpd: Could not reliably determine the server\'s fully qualified domain name', '[mpm_event:notice] AH00489: Apache/2.4.62 (Unix) configured -- resuming normal operations'] },
  redis: { sizeMb: 117, port: 6379, log: ['1:M * Ready to accept connections tcp'] },
  postgres: { sizeMb: 435, port: 5432, log: ['database system is ready to accept connections'] },
  mysql: { sizeMb: 586, port: 3306, log: ['[Server] /usr/sbin/mysqld: ready for connections. Version: \'8.4.3\''] },
  mongo: { sizeMb: 855, port: 27017, log: ['{"msg":"Waiting for connections","attr":{"port":27017}}'] },
  alpine: { sizeMb: 7.8, log: [] },
  busybox: { sizeMb: 4.3, log: [] },
  ubuntu: { sizeMb: 78, log: [] },
  python: { sizeMb: 1020, log: [] },
  node: { sizeMb: 1100, port: 3000, log: [] },
  'grafana/grafana': { sizeMb: 470, port: 3000, log: ['HTTP Server Listen address=[::]:3000'] },
  'prom/prometheus': { sizeMb: 290, port: 9090, log: ['Server is ready to receive web requests.'] },
  traefik: { sizeMb: 180, port: 80, log: ['Configuration loaded from flags.'] },
  'routerunner/web': { sizeMb: 145, port: 8080, log: ['Route Runner web listening on :8080'] },
};

export function imageKnown(ref: string): boolean {
  const repo = ref.split(':')[0].replace(/^docker\.io\/(library\/)?/, '');
  return repo in KNOWN_IMAGES;
}

export function emptyDocker(): DockerState {
  return { images: [], containers: [], networks: ['bridge', 'host', 'none'], volumes: [] };
}

function split(ref: string): { repo: string; tag: string } {
  const [repo, tag] = ref.replace(/^docker\.io\/(library\/)?/, '').split(':');
  return { repo, tag: tag ?? 'latest' };
}

function daemonCheck(ctx: ShellCtx): string | undefined {
  if (!ctx.s.packages.includes('docker.io') && !ctx.s.packages.includes('docker-ce'))
    return "Command 'docker' not found, but can be installed with:\nsudo apt install docker.io";
  if (!ctx.s.services.docker?.active) return 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?';
  if (!ctx.sudo && !ctx.isRoot() && !ctx.inGroup('docker'))
    return 'permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/containers/json": dial unix /var/run/docker.sock: connect: permission denied\n[Route Runner hint] Either use sudo, or add yourself to the docker group: sudo usermod -aG docker $USER (then log out and back in).';
  return undefined;
}

function pull(d: DockerState, ref: string, lines: string[]): boolean {
  const { repo, tag } = split(ref);
  if (d.images.some((i) => i.repo === repo && i.tag === tag)) return true;
  if (!(repo in KNOWN_IMAGES)) return false;
  lines.push(`Unable to find image '${repo}:${tag}' locally`, `${tag}: Pulling from library/${repo}`, `${shortId(repo.length * 7)}: Pull complete`, `Digest: sha256:${shortId(repo.length * 13, 64)}`, `Status: Downloaded newer image for ${repo}:${tag}`);
  d.images.push({ repo, tag, id: shortId(repo.length * 31 + tag.length), sizeMb: KNOWN_IMAGES[repo].sizeMb, created: Date.now() - 86400000 * 12 });
  return true;
}

const NAMES = ['brave_mandela', 'clever_biko', 'eager_sisulu', 'happy_tambo', 'jolly_makeba', 'keen_luthuli', 'quirky_ndlovu', 'vibrant_khumalo'];

export const docker: Handler = (ctx, args) => {
  const problem = daemonCheck(ctx);
  if (problem) return fail(problem, problem.startsWith('Command') ? 127 : 1);
  const d = (ctx.s.docker ??= emptyDocker());
  const [sub, ...rest] = args;
  const { flags, pos } = parseFlags(rest);
  const find = (key: string) => d.containers.find((c) => c.name === key || c.id.startsWith(key));
  switch (sub) {
    case undefined:
    case '--help':
      return ok('Usage:  docker [OPTIONS] COMMAND\n\nCommon Commands:\n  run         Create and run a new container from an image\n  ps          List containers\n  build       Build an image from a Dockerfile\n  pull        Download an image from a registry\n  images      List images\n  logs        Fetch the logs of a container\n  exec        Execute a command in a running container\n  stop/start  Stop or start containers\n  rm / rmi    Remove containers / images\n  compose     Docker Compose (multi-container apps)\n');
    case 'version':
    case '--version':
      return ok('Docker version 27.3.1, build ce12230\n');
    case 'info':
      return ok(`Client: Docker Engine - Community\nServer:\n Containers: ${d.containers.length}\n  Running: ${d.containers.filter((c) => c.status === 'running').length}\n Images: ${d.images.length}\n Server Version: 27.3.1\n Storage Driver: overlay2\n Cgroup Driver: systemd\n Kernel Version: 6.8.0-48-generic\n Operating System: Ubuntu 24.04.3 LTS\n CPUs: ${ctx.s.hw.cpus}\n Total Memory: ${(ctx.s.hw.ramMb / 1024).toFixed(2)}GiB\n`);
    case 'pull': {
      const lines: string[] = [];
      if (!pos[0]) return fail('"docker pull" requires exactly 1 argument.');
      if (!pull(d, pos[0], lines)) return fail(`Error response from daemon: pull access denied for ${pos[0]}, repository does not exist or may require 'docker login'`);
      return ok((lines.length ? lines.filter((l) => !l.startsWith('Unable')).join('\n') : `Status: Image is up to date for ${pos[0]}`) + '\n');
    }
    case 'images':
    case 'image': {
      if (sub === 'image' && pos[0] !== 'ls') return fail('Usage: docker image ls');
      const rows = [['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE']];
      for (const i of d.images) rows.push([i.repo, i.tag, i.id, `${age(i.created)} ago`.replace('d ago', ' days ago'), i.sizeMb < 1 ? '13.3kB' : `${i.sizeMb}MB`]);
      return ok(table(rows));
    }
    case 'run': {
      const ref = pos[0];
      if (!ref) return fail('"docker run" requires at least 1 argument.');
      const lines: string[] = [];
      if (!pull(d, ref, lines)) return fail(`Unable to find image '${ref}' locally\ndocker: Error response from daemon: pull access denied for ${split(ref).repo}, repository does not exist or may require 'docker login'.\n[Route Runner hint] Check the spelling of the image name (e.g. "nginx", not "ngnix").`, 125);
      const name = typeof flags.name === 'string' ? flags.name : NAMES[d.containers.length % NAMES.length] + (d.containers.length >= NAMES.length ? d.containers.length : '');
      if (d.containers.some((c) => c.name === name)) return fail(`docker: Error response from daemon: Conflict. The container name "/${name}" is already in use.`, 125);
      const portSpec = typeof flags.p === 'string' ? flags.p : typeof flags.publish === 'string' ? flags.publish : '';
      if (portSpec) {
        const host = portSpec.split(':')[0];
        const clash = d.containers.find((c) => c.status === 'running' && c.ports.startsWith(`0.0.0.0:${host}->`));
        if (clash) return fail(`docker: Error response from daemon: driver failed programming external connectivity: Bind for 0.0.0.0:${host} failed: port is already allocated.`, 125);
      }
      const { repo } = split(ref);
      const info = KNOWN_IMAGES[repo] ?? { log: [], port: undefined };
      const longRunning = !!info.port && repo !== 'hello-world';
      const id = shortId(d.containers.length * 97 + repo.length + 1, 64);
      const c = {
        id,
        name,
        image: ref,
        status: (longRunning ? 'running' : 'exited') as 'running' | 'exited',
        ports: portSpec ? `0.0.0.0:${portSpec.split(':')[0]}->${portSpec.split(':')[1] ?? portSpec}/tcp` : info.port ? `${info.port}/tcp` : '',
        created: Date.now(),
        command: pos.slice(1).join(' ') || (longRunning ? '"/docker-entrypoint.…"' : '"/hello"'),
        env: typeof flags.e === 'string' ? [flags.e] : [],
        logs: info.log,
      };
      d.containers.push(c);
      ctx.emit(`docker:run:${repo}`);
      if (flags.d || flags.detach) return ok((lines.length ? lines.join('\n') + '\n' : '') + id + '\n');
      return ok([...lines, ...info.log, longRunning ? '[Route Runner] Container running in the foreground. On a real box press Ctrl+C. Tip: use -d to run it in the background.' : ''].join('\n') + '\n');
    }
    case 'ps': {
      const all = !!flags.a || !!flags.all;
      const rows = [['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES']];
      for (const c of d.containers.filter((x) => all || x.status === 'running'))
        rows.push([c.id.slice(0, 12), c.image, c.command, `${age(c.created)} ago`, c.status === 'running' ? `Up ${age(c.created)}` : `Exited (0) ${age(c.created)} ago`, c.ports, c.name]);
      return ok(table(rows));
    }
    case 'stop':
    case 'start':
    case 'restart':
    case 'kill': {
      const out: string[] = [];
      for (const k of pos) {
        const c = find(k);
        if (!c) return fail(`Error response from daemon: No such container: ${k}`);
        c.status = sub === 'stop' || sub === 'kill' ? 'exited' : 'running';
        out.push(k);
      }
      return ok(out.join('\n') + '\n');
    }
    case 'rm': {
      const out: string[] = [];
      for (const k of pos) {
        const c = find(k);
        if (!c) return fail(`Error response from daemon: No such container: ${k}`);
        if (c.status === 'running' && !flags.f) return fail(`Error response from daemon: cannot remove container "/${c.name}": container is running: stop the container before removing or force remove`);
        d.containers = d.containers.filter((x) => x !== c);
        out.push(k);
      }
      return ok(out.join('\n') + '\n');
    }
    case 'rmi': {
      const { repo, tag } = split(pos[0] ?? '');
      const used = d.containers.find((c) => split(c.image).repo === repo);
      if (used && !flags.f) return fail(`Error response from daemon: conflict: unable to remove repository reference "${repo}" (must force) - container ${used.id.slice(0, 12)} is using its referenced image`);
      const before = d.images.length;
      d.images = d.images.filter((i) => !(i.repo === repo && i.tag === tag));
      return before === d.images.length ? fail(`Error response from daemon: No such image: ${repo}:${tag}`) : ok(`Untagged: ${repo}:${tag}\nDeleted: sha256:${shortId(9, 64)}\n`);
    }
    case 'logs': {
      const c = find(pos[0] ?? '');
      if (!c) return fail(`Error response from daemon: No such container: ${pos[0]}`);
      return ok(c.logs.join('\n') + '\n');
    }
    case 'exec': {
      const c = find(pos[0] ?? '');
      if (!c) return fail(`Error response from daemon: No such container: ${pos[0]}`);
      if (c.status !== 'running') return fail(`Error response from daemon: container ${c.id.slice(0, 12)} is not running`);
      const cmd = pos.slice(1).join(' ');
      if (/^(sh|bash|\/bin\/sh|\/bin\/bash)$/.test(cmd)) return ok(`[Route Runner] You are now "inside" ${c.name}. It has its own filesystem, processes and network namespace.\nroot@${c.id.slice(0, 12)}:/# (simulated - type your next command on the host)\n`);
      if (cmd.startsWith('cat /etc/os-release')) return ok('NAME="Debian GNU/Linux"\nVERSION_ID="12"\n');
      if (cmd === 'hostname') return ok(c.id.slice(0, 12) + '\n');
      return ok(`(ran "${cmd}" inside ${c.name})\n`);
    }
    case 'inspect': {
      const c = find(pos[0] ?? '');
      if (!c) return fail(`Error: No such object: ${pos[0]}`);
      return ok(JSON.stringify([{ Id: c.id, Name: '/' + c.name, State: { Status: c.status, Running: c.status === 'running' }, Config: { Image: c.image, Env: c.env }, NetworkSettings: { IPAddress: `172.17.0.${d.containers.indexOf(c) + 2}`, Ports: c.ports } }], null, 2) + '\n');
    }
    case 'build': {
      const tag = typeof flags.t === 'string' ? flags.t : undefined;
      const ctxDir = ctx.abs(pos[0] ?? '.');
      const df = ctx.read(`${ctxDir}/Dockerfile`);
      if (df === undefined) return fail('ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory');
      const steps = df.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      const from = steps.find((l) => /^FROM\s/i.test(l));
      if (!from) return fail('ERROR: failed to solve: no build stage in current context (Dockerfile needs a FROM line)');
      const base = from.split(/\s+/)[1];
      const lines: string[] = [];
      if (!pull(d, base, [])) return fail(`ERROR: failed to solve: ${base}: failed to resolve source metadata: pull access denied`);
      lines.push('[+] Building 4.2s (' + (steps.length + 2) + '/' + (steps.length + 2) + ') FINISHED', ' => [internal] load build definition from Dockerfile', ` => [internal] load metadata for docker.io/library/${base}`);
      steps.forEach((st, k) => lines.push(` => [${k + 1}/${steps.length}] ${st}`));
      const { repo, tag: t } = split(tag ?? `sha256:${shortId(4)}`);
      lines.push(' => exporting to image', ` => => naming to docker.io/library/${repo}:${t}`);
      d.images.push({ repo, tag: t, id: shortId(repo.length * 53, 12), sizeMb: (KNOWN_IMAGES[split(base).repo]?.sizeMb ?? 50) + 12, created: Date.now() });
      ctx.emit('docker:build');
      return ok(lines.join('\n') + '\n');
    }
    case 'network':
      if (pos[0] === 'ls') return ok(table([['NETWORK ID', 'NAME', 'DRIVER', 'SCOPE'], ...d.networks.map((n, k) => [shortId(k + 40), n, n === 'host' ? 'host' : n === 'none' ? 'null' : 'bridge', 'local'])]));
      if (pos[0] === 'create' && pos[1]) {
        d.networks.push(pos[1]);
        return ok(shortId(d.networks.length + 70, 64) + '\n');
      }
      return fail('Usage: docker network ls | create NAME');
    case 'volume':
      if (pos[0] === 'ls') return ok(table([['DRIVER', 'VOLUME NAME'], ...d.volumes.map((v) => ['local', v])]));
      if (pos[0] === 'create' && pos[1]) {
        d.volumes.push(pos[1]);
        return ok(pos[1] + '\n');
      }
      return fail('Usage: docker volume ls | create NAME');
    case 'compose':
      return compose(ctx, d, pos);
    case 'login':
      return ok('Login Succeeded\n');
    case 'push':
      return d.images.some((i) => `${i.repo}:${i.tag}`.startsWith(pos[0] ?? '#')) ? ok(`The push refers to repository [docker.io/${pos[0]}]\nlatest: digest: sha256:${shortId(5, 64)} size: 1570\n`) : fail(`An image does not exist locally with the tag: ${pos[0]}`);
    case 'system':
      return ok('TYPE            TOTAL     ACTIVE    SIZE\nImages          ' + d.images.length + '         ' + d.images.length + '         ' + d.images.reduce((a, i) => a + i.sizeMb, 0).toFixed(0) + 'MB\n');
    default:
      return fail(`docker: '${sub}' is not a docker command.\nSee 'docker --help'`);
  }
};

function compose(ctx: ShellCtx, d: DockerState, pos: string[]) {
  const text = ctx.read(ctx.abs('docker-compose.yml')) ?? ctx.read(ctx.abs('compose.yaml'));
  if (text === undefined) return fail('no configuration file provided: not found (create docker-compose.yml in this folder)');
  let y: Yaml;
  try {
    y = parseYaml(text);
  } catch (e) {
    return fail(`yaml: ${(e as Error).message}`);
  }
  const services = (yget(y, 'services') ?? {}) as Record<string, Yaml>;
  const project = ctx.s.cwd.split('/').pop() || 'app';
  const names = Object.keys(services);
  if (pos[0] === 'up') {
    const lines = [`[+] Running ${names.length + 1}/${names.length + 1}`, ` ✔ Network ${project}_default  Created`];
    for (const n of names) {
      const img = String(yget(services[n], 'image') ?? 'nginx');
      if (!pull(d, img, [])) return fail(`Error response from daemon: pull access denied for ${img}`);
      const ports = yget(services[n], 'ports');
      const p = Array.isArray(ports) ? String(ports[0]) : '';
      d.containers = d.containers.filter((c) => c.name !== `${project}-${n}-1`);
      d.containers.push({ id: shortId(n.length * 17 + names.length, 64), name: `${project}-${n}-1`, image: img, status: 'running', ports: p ? `0.0.0.0:${p.split(':')[0]}->${p.split(':')[1]}/tcp` : '', created: Date.now(), command: '"docker-entrypoint"', env: [], logs: KNOWN_IMAGES[split(img).repo]?.log ?? [] });
      lines.push(` ✔ Container ${project}-${n}-1  Started`);
    }
    ctx.emit('compose:up');
    return ok(lines.join('\n') + '\n');
  }
  if (pos[0] === 'down') {
    d.containers = d.containers.filter((c) => !c.name.startsWith(`${project}-`));
    return ok([...names.map((n) => ` ✔ Container ${project}-${n}-1  Removed`), ` ✔ Network ${project}_default  Removed`].join('\n') + '\n');
  }
  if (pos[0] === 'ps') {
    const rows = [['NAME', 'IMAGE', 'SERVICE', 'STATUS', 'PORTS']];
    for (const c of d.containers.filter((x) => x.name.startsWith(`${project}-`))) rows.push([c.name, c.image, c.name.split('-')[1], `Up ${age(c.created)}`, c.ports]);
    return ok(table(rows));
  }
  return fail('Usage: docker compose up -d | down | ps');
}
