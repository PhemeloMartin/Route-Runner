/** Terraform + Ansible simulators (Infrastructure as Code & configuration management). */
import { parseYamlDocs, yget, type Yaml } from '../shell/yaml.js';
import { createAws } from './aws.js';
import { type Handler, fail, ok, shortId } from './types.js';

interface TfResource {
  type: string;
  name: string;
  attrs: Record<string, string>;
}

export function parseTf(src: string): TfResource[] {
  const out: TfResource[] = [];
  const re = /resource\s+"([\w-]+)"\s+"([\w-]+)"\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const attrs: Record<string, string> = {};
    for (const line of m[3].split('\n')) {
      const am = line.match(/^\s*([\w_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (am) attrs[am[1]] = am[2];
    }
    out.push({ type: m[1], name: m[2], attrs });
  }
  return out;
}

const SUPPORTED = ['aws_vpc', 'aws_subnet', 'aws_instance', 'aws_s3_bucket', 'aws_security_group', 'aws_internet_gateway'];

export const terraform: Handler = (ctx, args) => {
  const tf = (ctx.s.tf ??= { initialized: false, applied: [] });
  const [sub] = args;
  const auto = args.includes('-auto-approve');
  const files = Object.entries(ctx.vfs.get(ctx.s.cwd)?.children ?? {}).filter(([n, f]) => n.endsWith('.tf') && f.type === 'file');
  const src = files.map(([, f]) => f.content ?? '').join('\n');
  if (sub === '-version' || sub === 'version') return ok('Terraform v1.9.8\non linux_amd64\n');
  if (!sub) return ok('Usage: terraform [global options] <subcommand> [args]\n\nMain commands:\n  init          Prepare your working directory for other commands\n  validate      Check whether the configuration is valid\n  plan          Show changes required by the current configuration\n  apply         Create or update infrastructure\n  destroy       Destroy previously-created infrastructure\n');
  if (!files.length && sub !== 'state') return fail('Error: No configuration files\n\nApply requires configuration to be present. (Create main.tf in this folder - try: cd ~/terraform-demo)');
  const resources = parseTf(src);
  if (sub === 'init') {
    tf.initialized = true;
    tf.dir = ctx.s.cwd;
    return ok('\nInitializing the backend...\nInitializing provider plugins...\n- Finding hashicorp/aws versions matching "~> 5.0"...\n- Installing hashicorp/aws v5.75.0...\n- Installed hashicorp/aws v5.75.0 (signed by HashiCorp)\n\nTerraform has been successfully initialized!\n');
  }
  if (!tf.initialized) return fail('│ Error: Inconsistent dependency lock file\n│ \n│ Run "terraform init" first to install the providers.');
  if (sub === 'fmt') return ok(files.map(([n]) => n).join('\n') + '\n');
  if (sub === 'validate') {
    const bad = resources.find((r) => !SUPPORTED.includes(r.type));
    if (bad) return fail(`│ Error: Invalid resource type\n│ The provider hashicorp/aws does not support resource type "${bad.type}".`);
    return ok('Success! The configuration is valid.\n');
  }
  const toCreate = resources.filter((r) => !tf.applied.some((x) => x.type === r.type && x.name === r.name));
  if (sub === 'plan' || sub === 'apply') {
    const lines = ['', 'Terraform used the selected providers to generate the following execution plan.', 'Resource actions are indicated with the following symbols:', '  + create', '', 'Terraform will perform the following actions:', ''];
    for (const r of toCreate) {
      lines.push(`  # ${r.type}.${r.name} will be created`, `  + resource "${r.type}" "${r.name}" {`);
      for (const [k, v] of Object.entries(r.attrs)) lines.push(`      + ${k.padEnd(22)} = "${v}"`);
      lines.push(`      + id                     = (known after apply)`, '    }', '');
    }
    lines.push(`Plan: ${toCreate.length} to add, 0 to change, 0 to destroy.`);
    if (!toCreate.length) return ok('\nNo changes. Your infrastructure matches the configuration.\n');
    if (sub === 'plan') return ok(lines.join('\n') + '\n');
    if (!auto) lines.push('', 'Do you want to perform these actions?', '  Terraform will perform the actions described above.', "  Only 'yes' will be accepted to approve.", '', '  Enter a value: yes (Route Runner auto-approved; real tip: -auto-approve)');
    const a = (ctx.s.aws ??= createAws());
    lines.push('');
    for (const r of toCreate) {
      const id = `${r.type === 'aws_instance' ? 'i' : r.type === 'aws_vpc' ? 'vpc' : r.type === 'aws_subnet' ? 'subnet' : r.type === 'aws_s3_bucket' ? r.attrs.bucket ?? r.name : 'sg'}-0${shortId(++a.seq * 77, 10)}`;
      if (r.type === 'aws_vpc') a.vpcs.push({ id, cidr: r.attrs.cidr_block ?? '10.0.0.0/16', isDefault: false, name: r.name });
      if (r.type === 'aws_subnet') a.subnets.push({ id, vpc: a.vpcs[a.vpcs.length - 1].id, cidr: r.attrs.cidr_block ?? '10.0.1.0/24', az: r.attrs.availability_zone ?? 'af-south-1a', public: r.attrs.map_public_ip_on_launch === 'true', name: r.name });
      if (r.type === 'aws_instance') a.instances.push({ id, type: r.attrs.instance_type ?? 't3.micro', ami: r.attrs.ami ?? 'ami-0ubuntu2404', subnet: a.subnets[a.subnets.length - 1].id, sg: 'sg-0default', state: 'running', privateIp: `10.0.1.${10 + a.instances.length}`, launched: Date.now(), name: r.name });
      if (r.type === 'aws_s3_bucket') a.buckets.push({ name: r.attrs.bucket ?? r.name, created: Date.now(), objects: [] });
      tf.applied.push({ type: r.type, name: r.name, id });
      lines.push(`${r.type}.${r.name}: Creating...`, `${r.type}.${r.name}: Creation complete after 2s [id=${id}]`);
    }
    lines.push('', `Apply complete! Resources: ${toCreate.length} added, 0 changed, 0 destroyed.`);
    ctx.emit('tf:apply');
    return ok(lines.join('\n') + '\n');
  }
  if (sub === 'destroy') {
    const a = (ctx.s.aws ??= createAws());
    const lines = [];
    for (const r of [...tf.applied].reverse()) {
      a.instances = a.instances.filter((i) => i.id !== r.id);
      a.subnets = a.subnets.filter((i) => i.id !== r.id);
      a.vpcs = a.vpcs.filter((i) => i.id !== r.id);
      a.buckets = a.buckets.filter((b) => !r.id.startsWith(b.name));
      lines.push(`${r.type}.${r.name}: Destroying... [id=${r.id}]`, `${r.type}.${r.name}: Destruction complete after 1s`);
    }
    const n = tf.applied.length;
    tf.applied = [];
    lines.push('', `Destroy complete! Resources: ${n} destroyed.`);
    return ok(lines.join('\n') + '\n');
  }
  if (sub === 'state' && args[1] === 'list') return ok(tf.applied.map((r) => `${r.type}.${r.name}`).join('\n') + '\n');
  if (sub === 'output') return ok(tf.applied.length ? `instance_ids = [${tf.applied.filter((r) => r.type === 'aws_instance').map((r) => `"${r.id}"`).join(', ')}]\n` : 'No outputs found.\n');
  return fail(`Terraform has no command named "${sub}".`);
};

function inventoryHosts(src: string): Record<string, string[]> {
  const groups: Record<string, string[]> = { all: [] };
  let cur = 'ungrouped';
  for (const raw of src.split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const g = l.match(/^\[(.+)\]$/);
    if (g) {
      cur = g[1];
      groups[cur] ??= [];
      continue;
    }
    const host = l.split(/\s+/)[0];
    (groups[cur] ??= []).push(host);
    groups.all.push(host);
  }
  return groups;
}

/** ansible / ansible-playbook - CCNA v2.0 lists Ansible under network automation. */
export const ansible: Handler = (ctx, args) => {
  const invFlag = args.indexOf('-i');
  const invPath = invFlag >= 0 ? args[invFlag + 1] : 'inventory.ini';
  const inv = ctx.read(ctx.abs(invPath));
  if (args[0] === '--version') return ok('ansible [core 2.17.5]\n  python version = 3.12.3\n');
  if (inv === undefined) return fail(`[WARNING]: Unable to parse ${invPath} as an inventory source\n[WARNING]: No inventory was parsed, only implicit localhost is available\n[Route Runner hint] Create inventory.ini, e.g.\n[routers]\nR1 ansible_host=192.168.1.1\nR2 ansible_host=192.168.1.2`);
  const groups = inventoryHosts(inv);
  const pattern = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-i' && args[i - 1] !== '-m' && args[i - 1] !== '-a') ?? 'all';
  const hosts = groups[pattern] ?? [];
  if (!hosts.length) return fail(`[WARNING]: Could not match supplied host pattern, ignoring: ${pattern}`);
  const mod = args[args.indexOf('-m') + 1];
  if (mod === 'ping') {
    ctx.emit('ansible:ping');
    return ok(hosts.map((h) => `${h} | SUCCESS => {\n    "changed": false,\n    "ping": "pong"\n}`).join('\n') + '\n');
  }
  return ok(hosts.map((h) => `${h} | CHANGED | rc=0 >>\n(simulated output of ${mod ?? 'command'})`).join('\n') + '\n');
};

export const ansiblePlaybook: Handler = (ctx, args) => {
  const book = args.find((a) => a.endsWith('.yml') || a.endsWith('.yaml'));
  if (!book) return fail('ERROR! You must specify a playbook file to run');
  const src = ctx.read(ctx.abs(book));
  if (src === undefined) return fail(`ERROR! the playbook: ${book} could not be found`);
  const invFlag = args.indexOf('-i');
  const inv = ctx.read(ctx.abs(invFlag >= 0 ? args[invFlag + 1] : 'inventory.ini')) ?? '';
  const groups = inventoryHosts(inv);
  let plays: Yaml[];
  try {
    plays = parseYamlDocs(src).flatMap((d) => (Array.isArray(d) ? d : [d]));
  } catch (e) {
    return fail(`ERROR! We were unable to read either as JSON nor YAML: ${(e as Error).message}`);
  }
  const out: string[] = [];
  const recap: Record<string, { ok: number; changed: number }> = {};
  for (const play of plays) {
    const target = String(yget(play, 'hosts') ?? 'all');
    const hosts = groups[target] ?? (target === 'localhost' ? ['localhost'] : []);
    out.push('', `PLAY [${yget(play, 'name') ?? target}] ${'*'.repeat(40)}`, '', `TASK [Gathering Facts] ${'*'.repeat(40)}`);
    for (const h of hosts) out.push(`ok: [${h}]`);
    const tasks = (yget(play, 'tasks') ?? []) as Yaml[];
    for (const task of Array.isArray(tasks) ? tasks : []) {
      out.push('', `TASK [${yget(task, 'name') ?? 'unnamed task'}] ${'*'.repeat(40)}`);
      for (const h of hosts) {
        const changed = JSON.stringify(task).includes('config') || JSON.stringify(task).includes('state');
        out.push(`${changed ? 'changed' : 'ok'}: [${h}]`);
        recap[h] ??= { ok: 1, changed: 0 };
        recap[h].ok++;
        if (changed) recap[h].changed++;
      }
    }
  }
  out.push('', `PLAY RECAP ${'*'.repeat(40)}`);
  for (const [h, r] of Object.entries(recap)) out.push(`${h.padEnd(26)}: ok=${r.ok}    changed=${r.changed}    unreachable=0    failed=0    skipped=0`);
  ctx.emit('ansible:playbook');
  return ok(out.join('\n') + '\n');
};
