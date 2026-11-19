/**
 * kubectl simulator.
 * Analogy: Kubernetes is a restaurant manager. You tell the manager WHAT you want
 * ("always keep 3 waiters on the floor") - the desired state - and the manager keeps
 * fixing reality to match it. A Deployment is that instruction; Pods are the waiters;
 * a Service is the single phone number customers call no matter which waiter answers.
 */
import { parseYamlDocs, yget, type Yaml } from '../shell/yaml.js';
import { imageKnown } from './docker.js';
import { type Handler, type K8sDeployment, type K8sPod, type K8sState, age, fail, ok, parseFlags, shortId, table } from './types.js';

export function createCluster(name = 'routerunner-cluster'): K8sState {
  return {
    cluster: name,
    currentNs: 'default',
    nodes: [
      { name: 'control-plane', role: 'control-plane', status: 'Ready', schedulable: false, cpu: 2, memGi: 4 },
      { name: 'worker-1', role: 'worker', status: 'Ready', schedulable: true, cpu: 4, memGi: 8 },
      { name: 'worker-2', role: 'worker', status: 'Ready', schedulable: true, cpu: 4, memGi: 8 },
      { name: 'worker-3', role: 'worker', status: 'Ready', schedulable: true, cpu: 4, memGi: 8 },
    ],
    namespaces: ['default', 'kube-system', 'kube-public', 'kube-node-lease'],
    deployments: [],
    pods: [],
    services: [{ name: 'kubernetes', ns: 'default', type: 'ClusterIP', selector: '', port: 443, targetPort: 6443, clusterIp: '10.96.0.1' }],
    configmaps: [],
    secrets: [],
    hpas: [],
    ingresses: [],
    events: [],
    seq: 1,
  };
}

function podName(k: K8sState, dep: string): string {
  k.seq++;
  return `${dep}-${shortId(k.seq * 11, 10).replace(/[^a-z0-9]/g, 'a')}-${shortId(k.seq * 7, 5)}`;
}

function pickNode(k: K8sState): string | undefined {
  const ready = k.nodes.filter((n) => n.status === 'Ready' && n.schedulable);
  if (!ready.length) return undefined;
  const load = (n: string) => k.pods.filter((p) => p.node === n).length;
  return ready.sort((a, b) => load(a.name) - load(b.name))[0].name;
}

/** The controller loop: make actual pods match each deployment's desired replicas. */
export function reconcile(k: K8sState) {
  for (const d of k.deployments) {
    const mine = k.pods.filter((p) => p.owner === d.name && p.ns === d.ns);
    const ref = d.image.includes(':') ? d.image : `${d.image}:latest`;
    const healthyImage = imageKnown(d.image) || !!k.registry?.includes(ref);
    // replace pods that run an old image (rolling update)
    for (const p of mine) if (p.image !== d.image) k.pods = k.pods.filter((x) => x !== p);
    let current = k.pods.filter((p) => p.owner === d.name && p.ns === d.ns);
    while (current.length < d.replicas) {
      const node = pickNode(k);
      const pod: K8sPod = {
        name: podName(k, d.name),
        ns: d.ns,
        app: d.name,
        owner: d.name,
        node: node ?? '<none>',
        status: !node ? 'Pending' : healthyImage ? 'Running' : 'ImagePullBackOff',
        restarts: 0,
        image: d.image,
        ip: `10.244.${node ? node.slice(-1) : 0}.${(k.seq % 250) + 2}`,
        age: Date.now(),
      };
      k.pods.push(pod);
      k.events.push(`Normal   Scheduled   pod/${pod.name}   Successfully assigned ${d.ns}/${pod.name} to ${pod.node}`);
      if (!healthyImage) k.events.push(`Warning  Failed      pod/${pod.name}   Failed to pull image "${d.image}": not found`);
      current = k.pods.filter((p) => p.owner === d.name && p.ns === d.ns);
    }
    if (current.length > d.replicas) {
      const extra = current.slice(d.replicas);
      k.pods = k.pods.filter((p) => !extra.includes(p));
    }
  }
  // pods on dead nodes get rescheduled
  for (const p of k.pods) {
    const n = k.nodes.find((x) => x.name === p.node);
    if (p.owner && (!n || n.status !== 'Ready')) {
      const node = pickNode(k);
      p.node = node ?? '<none>';
      p.status = node ? (imageKnown(p.image) ? 'Running' : 'ImagePullBackOff') : 'Pending';
    }
  }
}

function ns(k: K8sState, flags: Record<string, string | true>): string {
  if (flags.A || flags['all-namespaces']) return '*';
  return typeof flags.n === 'string' ? flags.n : typeof flags.namespace === 'string' ? flags.namespace : k.currentNs;
}

const KIND: Record<string, string> = {
  po: 'pods', pod: 'pods', pods: 'pods',
  deploy: 'deployments', deployment: 'deployments', deployments: 'deployments',
  svc: 'services', service: 'services', services: 'services',
  no: 'nodes', node: 'nodes', nodes: 'nodes',
  ns: 'namespaces', namespace: 'namespaces', namespaces: 'namespaces',
  cm: 'configmaps', configmap: 'configmaps', configmaps: 'configmaps',
  secret: 'secrets', secrets: 'secrets',
  hpa: 'hpa', horizontalpodautoscaler: 'hpa',
  ing: 'ingress', ingress: 'ingress', ingresses: 'ingress',
  rs: 'replicasets', replicaset: 'replicasets', replicasets: 'replicasets',
  all: 'all', events: 'events', ev: 'events',
};

function getPods(k: K8sState, n: string, wide: boolean, label?: string) {
  const pods = k.pods.filter((p) => (n === '*' || p.ns === n) && (!label || `app=${p.app}` === label));
  if (!pods.length) return n === '*' ? 'No resources found\n' : `No resources found in ${n} namespace.\n`;
  const head = [...(n === '*' ? ['NAMESPACE'] : []), 'NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', ...(wide ? ['IP', 'NODE'] : [])];
  return table([head, ...pods.map((p) => [...(n === '*' ? [p.ns] : []), p.name, p.status === 'Running' ? '1/1' : '0/1', p.status, String(p.restarts), age(p.age), ...(wide ? [p.ip, p.node] : [])])]);
}

function getDeployments(k: K8sState, n: string) {
  const ds = k.deployments.filter((d) => n === '*' || d.ns === n);
  if (!ds.length) return `No resources found in ${n} namespace.\n`;
  return table([['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'], ...ds.map((d) => {
    const ready = k.pods.filter((p) => p.owner === d.name && p.ns === d.ns && p.status === 'Running').length;
    return [d.name, `${ready}/${d.replicas}`, String(d.replicas), String(ready), age(d.created)];
  })]);
}

function getServices(k: K8sState, n: string) {
  const ss = k.services.filter((s) => n === '*' || s.ns === n);
  return table([['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'], ...ss.map((s) => [s.name, s.type, s.clusterIp, s.externalIp ?? (s.type === 'LoadBalancer' ? '<pending>' : '<none>'), `${s.port}${s.nodePort ? ':' + s.nodePort : ''}/TCP`, '5m'])]);
}

function createDeployment(k: K8sState, name: string, image: string, replicas: number, n: string, port?: number): string | undefined {
  if (k.deployments.some((d) => d.name === name && d.ns === n)) return `error: failed to create deployment: deployments.apps "${name}" already exists`;
  if (!k.namespaces.includes(n)) return `error: failed to create deployment: namespaces "${n}" not found`;
  k.deployments.push({ name, ns: n, image, replicas, revision: 1, history: [image], port, created: Date.now() });
  reconcile(k);
  return undefined;
}

function expose(k: K8sState, dep: K8sDeployment, port: number, targetPort: number, type: 'ClusterIP' | 'NodePort' | 'LoadBalancer', name = dep.name) {
  k.services = k.services.filter((s) => !(s.name === name && s.ns === dep.ns));
  k.seq++;
  k.services.push({
    name,
    ns: dep.ns,
    type,
    selector: dep.name,
    port,
    targetPort,
    nodePort: type === 'ClusterIP' ? undefined : 30000 + (k.seq * 37) % 2767,
    clusterIp: `10.96.${(k.seq * 13) % 250}.${(k.seq * 29) % 250}`,
    externalIp: type === 'LoadBalancer' ? `102.65.${(k.seq * 7) % 250}.${(k.seq * 11) % 250}` : undefined,
  });
}

function applyDoc(k: K8sState, doc: Yaml, out: string[]): string | undefined {
  const kind = String(yget(doc, 'kind') ?? '');
  const name = String(yget(doc, 'metadata.name') ?? '');
  const n = String(yget(doc, 'metadata.namespace') ?? k.currentNs);
  if (!kind || !name) return 'error: error validating data: [apiVersion not set, kind not set] (every manifest needs apiVersion, kind and metadata.name)';
  switch (kind) {
    case 'Namespace':
      if (!k.namespaces.includes(name)) k.namespaces.push(name);
      out.push(`namespace/${name} created`);
      return;
    case 'Deployment': {
      const containers = yget(doc, 'spec.template.spec.containers');
      const c = Array.isArray(containers) ? containers[0] : undefined;
      const image = String(yget(c ?? null, 'image') ?? '');
      if (!image) return 'error: spec.template.spec.containers[0].image is required';
      const replicas = Number(yget(doc, 'spec.replicas') ?? 1);
      const portsY = yget(c ?? null, 'ports');
      const port = Array.isArray(portsY) ? Number(yget(portsY[0], 'containerPort')) : undefined;
      const sel = yget(doc, 'spec.selector.matchLabels.app');
      const lbl = yget(doc, 'spec.template.metadata.labels.app');
      if (sel !== undefined && lbl !== undefined && sel !== lbl) return `The Deployment "${name}" is invalid: spec.template.metadata.labels: Invalid value: {"app":"${lbl}"}: \`selector\` does not match template \`labels\``;
      const existing = k.deployments.find((d) => d.name === name && d.ns === n);
      if (existing) {
        const changed = existing.image !== image || existing.replicas !== replicas;
        if (existing.image !== image) {
          existing.image = image;
          existing.revision++;
          existing.history.push(image);
        }
        existing.replicas = replicas;
        reconcile(k);
        out.push(`deployment.apps/${name} ${changed ? 'configured' : 'unchanged'}`);
      } else {
        if (!k.namespaces.includes(n)) return `Error from server (NotFound): namespaces "${n}" not found`;
        createDeployment(k, name, image, replicas, n, port);
        out.push(`deployment.apps/${name} created`);
      }
      return;
    }
    case 'Service': {
      const app = String(yget(doc, 'spec.selector.app') ?? name);
      const ports = yget(doc, 'spec.ports');
      const p0 = Array.isArray(ports) ? ports[0] : null;
      const type = String(yget(doc, 'spec.type') ?? 'ClusterIP') as 'ClusterIP';
      const dep = k.deployments.find((d) => d.name === app && d.ns === n) ?? { name: app, ns: n } as K8sDeployment;
      expose(k, dep, Number(yget(p0, 'port') ?? 80), Number(yget(p0, 'targetPort') ?? yget(p0, 'port') ?? 80), type, name);
      out.push(`service/${name} created`);
      return;
    }
    case 'ConfigMap': {
      const data = (yget(doc, 'data') ?? {}) as Record<string, string>;
      k.configmaps = k.configmaps.filter((c) => !(c.name === name && c.ns === n));
      k.configmaps.push({ name, ns: n, data });
      out.push(`configmap/${name} created`);
      return;
    }
    case 'Secret': {
      const data = (yget(doc, 'data') ?? yget(doc, 'stringData') ?? {}) as Record<string, string>;
      k.secrets.push({ name, ns: n, keys: Object.keys(data) });
      out.push(`secret/${name} created`);
      return;
    }
    case 'Ingress':
      k.ingresses.push({ name, ns: n, host: String(yget(doc, 'spec.rules') ? 'app.routerunner.lab' : '*'), service: name });
      out.push(`ingress.networking.k8s.io/${name} created`);
      return;
    default:
      return `error: resource mapping not found for name: "${name}" namespace: "" from "file": no matches for kind "${kind}" (the simulator supports Namespace, Deployment, Service, ConfigMap, Secret, Ingress)`;
  }
}

export const kubectl: Handler = (ctx, args) => {
  const k = (ctx.s.k8s ??= createCluster());
  const [verb, ...rest] = args;
  const { flags, pos } = parseFlags(rest);
  const n = ns(k, flags);
  const resolveKind = (s: string | undefined) => (s ? KIND[s.split('/')[0].toLowerCase()] : undefined);
  const nameOf = (s: string | undefined, i = 1) => (s?.includes('/') ? s.split('/')[1] : pos[i]);
  switch (verb) {
    case undefined:
    case 'help':
      return ok('kubectl controls the Kubernetes cluster manager.\n\nBasic Commands:\n  create     Create a resource from a file or from stdin\n  expose     Expose a deployment as a new Kubernetes service\n  run        Run a particular image on the cluster\n  get        Display one or many resources\n  describe   Show details of a specific resource\n  delete     Delete resources\n  apply      Apply a configuration to a resource by file name\n  scale      Set a new size for a deployment\n  rollout    Manage the rollout of a resource\n  logs       Print the logs for a container in a pod\n  top        Display resource (CPU/memory) usage\n  cordon / drain / uncordon   Node maintenance\n');
    case 'version':
      return ok('Client Version: v1.31.2\nKustomize Version: v5.4.2\nServer Version: v1.31.1\n');
    case 'cluster-info':
      return ok(`Kubernetes control plane is running at https://127.0.0.1:6443\nCoreDNS is running at https://127.0.0.1:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy\n`);
    case 'config':
      if (pos[0] === 'current-context') return ok(`${k.cluster}\n`);
      if (pos[0] === 'get-contexts') return ok(table([['CURRENT', 'NAME', 'CLUSTER', 'AUTHINFO', 'NAMESPACE'], ['*', k.cluster, k.cluster, 'phemelo', k.currentNs]]));
      if (pos[0] === 'set-context' && typeof flags.namespace === 'string') {
        k.currentNs = flags.namespace;
        return ok(`Context "${k.cluster}" modified.\n`);
      }
      return fail('error: unknown config subcommand');
    case 'get': {
      const kind = resolveKind(pos[0]);
      const wide = flags.o === 'wide';
      const label = typeof flags.l === 'string' ? flags.l : undefined;
      if (flags.o === 'yaml' && kind === 'deployments') {
        const d = k.deployments.find((x) => x.name === nameOf(pos[0]));
        if (!d) return fail(`Error from server (NotFound): deployments.apps "${nameOf(pos[0])}" not found`);
        return ok(`apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${d.name}\n  namespace: ${d.ns}\nspec:\n  replicas: ${d.replicas}\n  selector:\n    matchLabels:\n      app: ${d.name}\n  template:\n    metadata:\n      labels:\n        app: ${d.name}\n    spec:\n      containers:\n      - name: ${d.name}\n        image: ${d.image}\n`);
      }
      switch (kind) {
        case 'pods':
          return ok(getPods(k, n, wide, label));
        case 'deployments':
          return ok(getDeployments(k, n));
        case 'services':
          return ok(getServices(k, n));
        case 'nodes':
          return ok(table([['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION', ...(wide ? ['INTERNAL-IP', 'OS-IMAGE'] : [])], ...k.nodes.map((x, i) => [x.name, x.status + (x.schedulable || x.role === 'control-plane' ? '' : ',SchedulingDisabled'), x.role === 'control-plane' ? 'control-plane' : '<none>', '12d', 'v1.31.1', ...(wide ? [`172.18.0.${i + 2}`, 'Ubuntu 24.04.1 LTS'] : [])])]));
        case 'namespaces':
          return ok(table([['NAME', 'STATUS', 'AGE'], ...k.namespaces.map((x) => [x, 'Active', '12d'])]));
        case 'configmaps':
          return ok(table([['NAME', 'DATA', 'AGE'], ['kube-root-ca.crt', '1', '12d'], ...k.configmaps.filter((c) => n === '*' || c.ns === n).map((c) => [c.name, String(Object.keys(c.data).length), '1m'])]));
        case 'secrets':
          return ok(table([['NAME', 'TYPE', 'DATA', 'AGE'], ...k.secrets.filter((c) => n === '*' || c.ns === n).map((c) => [c.name, 'Opaque', String(c.keys.length), '1m'])]));
        case 'hpa':
          return ok(table([['NAME', 'REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS'], ...k.hpas.map((h) => [h.name, `Deployment/${h.target}`, `cpu: 12%/${h.cpu}%`, String(h.min), String(h.max), String(k.deployments.find((d) => d.name === h.target)?.replicas ?? 0)])]));
        case 'ingress':
          return ok(table([['NAME', 'CLASS', 'HOSTS', 'ADDRESS', 'PORTS'], ...k.ingresses.map((g) => [g.name, 'nginx', g.host, '102.65.10.20', '80'])]));
        case 'replicasets':
          return ok(table([['NAME', 'DESIRED', 'CURRENT', 'READY'], ...k.deployments.map((d) => [`${d.name}-${shortId(d.revision * 17, 10)}`, String(d.replicas), String(d.replicas), String(k.pods.filter((p) => p.owner === d.name && p.status === 'Running').length)])]));
        case 'events':
          return ok(['LAST SEEN   TYPE     REASON      OBJECT   MESSAGE', ...k.events.slice(-15).map((e) => `10s         ${e}`)].join('\n') + '\n');
        case 'all':
          return ok(getPods(k, n, false) + '\n' + getServices(k, n) + '\n' + getDeployments(k, n));
        default:
          return fail(`error: the server doesn't have a resource type "${pos[0] ?? ''}"`);
      }
    }
    case 'create': {
      if (pos[0] === 'deployment' || pos[0] === 'deploy') {
        const name = pos[1];
        const image = typeof flags.image === 'string' ? flags.image : undefined;
        if (!name || !image) return fail('error: required flag(s) "image" not set\nUsage: kubectl create deployment NAME --image=nginx [--replicas=3]');
        const e = createDeployment(k, name, image, Number(flags.replicas ?? 1), n, flags.port ? Number(flags.port) : undefined);
        if (e) return fail(e);
        ctx.emit('k8s:deploy');
        return ok(`deployment.apps/${name} created\n`);
      }
      if (pos[0] === 'namespace' || pos[0] === 'ns') {
        if (k.namespaces.includes(pos[1])) return fail(`Error from server (AlreadyExists): namespaces "${pos[1]}" already exists`);
        k.namespaces.push(pos[1]);
        return ok(`namespace/${pos[1]} created\n`);
      }
      if (pos[0] === 'configmap' || pos[0] === 'cm') {
        const lit = rest.filter((a) => a.startsWith('--from-literal=')).map((a) => a.slice(15).split('='));
        k.configmaps.push({ name: pos[1], ns: n, data: Object.fromEntries(lit) });
        return ok(`configmap/${pos[1]} created\n`);
      }
      if (pos[0] === 'secret') {
        const lit = rest.filter((a) => a.startsWith('--from-literal=')).map((a) => a.slice(15).split('=')[0]);
        k.secrets.push({ name: pos[2] ?? pos[1], ns: n, keys: lit });
        return ok(`secret/${pos[2] ?? pos[1]} created\n`);
      }
      if (typeof flags.f === 'string') return kubectl(ctx, ['apply', '-f', flags.f], '');
      return fail('error: Unexpected args. Try: kubectl create deployment web --image=nginx');
    }
    case 'run': {
      const name = pos[0];
      const image = typeof flags.image === 'string' ? flags.image : undefined;
      if (!name || !image) return fail('Usage: kubectl run NAME --image=IMAGE');
      const node = pickNode(k);
      k.pods.push({ name, ns: n, app: name, node: node ?? '<none>', status: imageKnown(image) ? 'Running' : 'ImagePullBackOff', restarts: 0, image, ip: `10.244.9.${k.pods.length + 3}`, age: Date.now() });
      return ok(`pod/${name} created\n`);
    }
    case 'apply': {
      const f = typeof flags.f === 'string' ? flags.f : undefined;
      if (!f) return fail('error: must specify one of -f and -k');
      const text = ctx.read(ctx.abs(f));
      if (text === undefined) return fail(`error: the path "${f}" does not exist`);
      let docs: Yaml[];
      try {
        docs = parseYamlDocs(text);
      } catch (e) {
        return fail(`error: error parsing ${f}: ${(e as Error).message}`);
      }
      const out: string[] = [];
      for (const d of docs) {
        const e = applyDoc(k, d, out);
        if (e) return { out: out.join('\n') + (out.length ? '\n' : ''), err: e, code: 1 };
      }
      ctx.emit('k8s:apply');
      return ok(out.join('\n') + '\n');
    }
    case 'expose': {
      const name = nameOf(pos[0]);
      const d = k.deployments.find((x) => x.name === name && x.ns === n);
      if (!d) return fail(`Error from server (NotFound): deployments.apps "${name}" not found`);
      const port = Number(flags.port ?? d.port ?? 80);
      expose(k, d, port, Number(flags['target-port'] ?? port), (flags.type as 'NodePort') ?? 'ClusterIP');
      ctx.emit('k8s:expose');
      return ok(`service/${d.name} exposed\n`);
    }
    case 'scale': {
      const name = nameOf(pos[0]);
      const d = k.deployments.find((x) => x.name === name && x.ns === n);
      if (!d) return fail(`Error from server (NotFound): deployments.apps "${name}" not found`);
      if (flags.replicas === undefined) return fail('error: required flag(s) "replicas" not set');
      d.replicas = Number(flags.replicas);
      reconcile(k);
      ctx.emit(`k8s:scale:${d.replicas}`);
      return ok(`deployment.apps/${d.name} scaled\n`);
    }
    case 'set': {
      if (pos[0] !== 'image') return fail('Usage: kubectl set image deployment/NAME CONTAINER=IMAGE');
      const name = nameOf(pos[1], 2);
      const d = k.deployments.find((x) => x.name === name && x.ns === n);
      if (!d) return fail(`Error from server (NotFound): deployments.apps "${name}" not found`);
      const img = pos[pos.length - 1].split('=')[1];
      d.image = img;
      d.revision++;
      d.history.push(img);
      reconcile(k);
      return ok(`deployment.apps/${d.name} image updated\n`);
    }
    case 'rollout': {
      const sub = pos[0];
      const name = nameOf(pos[1], 2);
      const d = k.deployments.find((x) => x.name === name && x.ns === n);
      if (!d) return fail(`Error from server (NotFound): deployments.apps "${name}" not found`);
      if (sub === 'status') {
        const bad = k.pods.some((p) => p.owner === d.name && p.status !== 'Running');
        return bad ? fail(`Waiting for deployment "${d.name}" rollout to finish: 0 of ${d.replicas} updated replicas are available...\n[Route Runner hint] Run "kubectl get pods" then "kubectl describe pod <name>" to see why.`) : ok(`deployment "${d.name}" successfully rolled out\n`);
      }
      if (sub === 'history') return ok(`deployment.apps/${d.name}\nREVISION  CHANGE-CAUSE\n${d.history.map((h, i) => `${i + 1}         image=${h}`).join('\n')}\n`);
      if (sub === 'undo') {
        if (d.history.length < 2) return fail('error: no rollout history found');
        d.history.pop();
        d.image = d.history[d.history.length - 1];
        d.revision++;
        reconcile(k);
        ctx.emit('k8s:rollback');
        return ok(`deployment.apps/${d.name} rolled back\n`);
      }
      if (sub === 'restart') {
        k.pods = k.pods.filter((p) => p.owner !== d.name);
        reconcile(k);
        return ok(`deployment.apps/${d.name} restarted\n`);
      }
      return fail('Usage: kubectl rollout status|history|undo|restart deployment/NAME');
    }
    case 'delete': {
      const kind = resolveKind(pos[0]);
      const name = nameOf(pos[0]);
      if (kind === 'pods') {
        const p = k.pods.find((x) => x.name === name && x.ns === n);
        if (!p) return fail(`Error from server (NotFound): pods "${name}" not found`);
        k.pods = k.pods.filter((x) => x !== p);
        reconcile(k);
        if (p.owner) ctx.emit('k8s:selfheal');
        return ok(`pod "${name}" deleted\n`);
      }
      if (kind === 'deployments') {
        if (!k.deployments.some((d) => d.name === name && d.ns === n)) return fail(`Error from server (NotFound): deployments.apps "${name}" not found`);
        k.deployments = k.deployments.filter((d) => !(d.name === name && d.ns === n));
        k.pods = k.pods.filter((p) => !(p.owner === name && p.ns === n));
        return ok(`deployment.apps "${name}" deleted\n`);
      }
      if (kind === 'services') {
        k.services = k.services.filter((s) => !(s.name === name && s.ns === n));
        return ok(`service "${name}" deleted\n`);
      }
      if (kind === 'namespaces') {
        if (['default', 'kube-system'].includes(name)) return fail(`Error from server (Forbidden): namespaces "${name}" is forbidden: this namespace may not be deleted`);
        k.namespaces = k.namespaces.filter((x) => x !== name);
        k.deployments = k.deployments.filter((d) => d.ns !== name);
        k.pods = k.pods.filter((p) => p.ns !== name);
        k.services = k.services.filter((s) => s.ns !== name);
        return ok(`namespace "${name}" deleted\n`);
      }
      return fail('error: Usage: kubectl delete pod|deployment|service|namespace NAME');
    }
    case 'describe': {
      const kind = resolveKind(pos[0]);
      const name = nameOf(pos[0]);
      if (kind === 'pods') {
        const p = k.pods.find((x) => x.name === name || x.name.startsWith(name ?? '#'));
        if (!p) return fail(`Error from server (NotFound): pods "${name}" not found`);
        const ev = p.status === 'ImagePullBackOff'
          ? `  Warning  Failed     10s   kubelet  Failed to pull image "${p.image}": rpc error: code = NotFound desc = failed to pull and unpack image "docker.io/library/${p.image}": not found\n  Warning  Failed     10s   kubelet  Error: ImagePullBackOff`
          : `  Normal  Scheduled  30s   default-scheduler  Successfully assigned ${p.ns}/${p.name} to ${p.node}\n  Normal  Pulled     29s   kubelet  Container image "${p.image}" already present on machine\n  Normal  Started    29s   kubelet  Started container`;
        return ok(`Name:             ${p.name}\nNamespace:        ${p.ns}\nNode:             ${p.node}\nLabels:           app=${p.app}\nStatus:           ${p.status === 'Running' ? 'Running' : 'Pending'}\nIP:               ${p.ip}\nControlled By:    ${p.owner ? `ReplicaSet/${p.owner}-${shortId(3, 10)}` : '<none>'}\nContainers:\n  ${p.app}:\n    Image:          ${p.image}\n    State:          ${p.status === 'Running' ? 'Running' : `Waiting\n      Reason:       ${p.status}`}\nEvents:\n  Type    Reason     Age   From     Message\n  ----    ------     ----  ----     -------\n${ev}\n`);
      }
      if (kind === 'deployments') {
        const d = k.deployments.find((x) => x.name === name);
        if (!d) return fail(`Error from server (NotFound): deployments.apps "${name}" not found`);
        return ok(`Name:                   ${d.name}\nNamespace:              ${d.ns}\nSelector:               app=${d.name}\nReplicas:               ${d.replicas} desired | ${d.replicas} updated | ${d.replicas} total\nStrategyType:           RollingUpdate\nRollingUpdateStrategy:  25% max unavailable, 25% max surge\nPod Template:\n  Containers:\n   ${d.name}:\n    Image:        ${d.image}\n`);
      }
      if (kind === 'nodes') {
        const nd = k.nodes.find((x) => x.name === name);
        if (!nd) return fail(`Error from server (NotFound): nodes "${name}" not found`);
        const pods = k.pods.filter((p) => p.node === nd.name);
        return ok(`Name:               ${nd.name}\nRoles:              ${nd.role}\nConditions:\n  Ready   ${nd.status === 'Ready'}\nCapacity:\n  cpu:     ${nd.cpu}\n  memory:  ${nd.memGi}Gi\nNon-terminated Pods: (${pods.length} in total)\n${pods.map((p) => `  ${p.ns}  ${p.name}`).join('\n')}\n`);
      }
      return fail('error: Usage: kubectl describe pod|deployment|node NAME');
    }
    case 'logs': {
      const p = k.pods.find((x) => x.name === pos[0]);
      if (!p) return fail(`Error from server (NotFound): pods "${pos[0]}" not found`);
      if (p.status !== 'Running') return fail(`Error from server (BadRequest): container "${p.app}" in pod "${p.name}" is waiting to start: trying and failing to pull image`);
      return ok(`10.244.0.1 - - [19/Nov/2026:08:00:01 +0000] "GET / HTTP/1.1" 200 615 "-" "kube-probe/1.31"\n10.244.0.1 - - [19/Nov/2026:08:00:11 +0000] "GET / HTTP/1.1" 200 615 "-" "kube-probe/1.31"\n`);
    }
    case 'exec':
      return ok(`[Route Runner] Opened a shell inside ${pos[0]} (simulated). Real usage: kubectl exec -it ${pos[0]} -- /bin/sh\n`);
    case 'port-forward':
      return ok(`Forwarding from 127.0.0.1:${(pos[1] ?? '8080:80').split(':')[0]} -> ${(pos[1] ?? '8080:80').split(':')[1]}\n`);
    case 'top': {
      if (pos[0]?.startsWith('no')) return ok(table([['NAME', 'CPU(cores)', 'CPU%', 'MEMORY(bytes)', 'MEMORY%'], ...k.nodes.map((x, i) => [x.name, `${120 + k.pods.filter((p) => p.node === x.name).length * 45 + i * 7}m`, `${5 + k.pods.filter((p) => p.node === x.name).length * 2}%`, `${900 + i * 80}Mi`, `${11 + i}%`])]));
      return ok(table([['NAME', 'CPU(cores)', 'MEMORY(bytes)'], ...k.pods.filter((p) => p.ns === n && p.status === 'Running').map((p, i) => [p.name, `${2 + (i % 5)}m`, `${8 + (i % 7)}Mi`])]));
    }
    case 'autoscale': {
      const name = nameOf(pos[0]);
      const d = k.deployments.find((x) => x.name === name);
      if (!d) return fail(`Error from server (NotFound): deployments.apps "${name}" not found`);
      const min = Number(flags.min ?? 1);
      d.replicas = Math.max(d.replicas, min);
      reconcile(k);
      k.hpas.push({ name: d.name, ns: d.ns, target: d.name, min, max: Number(flags.max ?? 5), cpu: Number(flags['cpu-percent'] ?? 80) });
      return ok(`horizontalpodautoscaler.autoscaling/${d.name} autoscaled\n`);
    }
    case 'cordon':
    case 'uncordon':
    case 'drain': {
      const nd = k.nodes.find((x) => x.name === pos[0]);
      if (!nd) return fail(`Error from server (NotFound): nodes "${pos[0]}" not found`);
      nd.schedulable = verb === 'uncordon';
      if (verb === 'drain') {
        const evict = k.pods.filter((p) => p.node === nd.name);
        k.pods = k.pods.filter((p) => p.node !== nd.name);
        reconcile(k);
        ctx.emit('k8s:drain');
        return ok(`node/${nd.name} cordoned\n${evict.map((p) => `evicting pod ${p.ns}/${p.name}`).join('\n')}\nnode/${nd.name} drained\n`);
      }
      return ok(`node/${nd.name} ${verb}ed\n`);
    }
    case 'api-resources':
      return ok('NAME          SHORTNAMES   APIVERSION   NAMESPACED   KIND\npods          po           v1           true         Pod\nservices      svc          v1           true         Service\ndeployments   deploy       apps/v1      true         Deployment\nnamespaces    ns           v1           false        Namespace\nconfigmaps    cm           v1           true         ConfigMap\n');
    default:
      return fail(`error: unknown command "${verb}" for "kubectl"\nRun 'kubectl --help' for usage.`);
  }
};

/** Simulate a whole node crashing (used by the 3D cluster view's "chaos" button). */
export function killNode(k: K8sState, node: string) {
  const nd = k.nodes.find((n) => n.name === node);
  if (!nd) return;
  nd.status = 'NotReady';
  k.events.push(`Warning  NodeNotReady  node/${node}  Node ${node} status is now: NodeNotReady`);
  reconcile(k);
}

export function reviveNode(k: K8sState, node: string) {
  const nd = k.nodes.find((n) => n.name === node);
  if (nd) nd.status = 'Ready';
}
