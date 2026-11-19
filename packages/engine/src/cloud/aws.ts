/**
 * AWS CLI simulator (v2 style JSON output). Region defaults to af-south-1 (Cape Town).
 * Analogy: a VPC is your own fenced estate inside AWS's city; subnets are streets in
 * the estate; an Internet Gateway is the estate's front gate; Security Groups are the
 * bouncers standing at each house's door.
 */
import { inNetwork, isIPv4, parseCidr, prefixToMask } from '../net/ip.js';
import { type AwsState, type Handler, fail, ok, parseFlags, shortId } from './types.js';

export function createAws(): AwsState {
  return {
    account: '123456789012',
    region: 'af-south-1',
    user: 'phemelo-admin',
    vpcs: [{ id: 'vpc-0default1', cidr: '172.31.0.0/16', isDefault: true, name: 'default' }],
    subnets: [
      { id: 'subnet-0def1a', vpc: 'vpc-0default1', cidr: '172.31.0.0/20', az: 'af-south-1a', public: true },
      { id: 'subnet-0def1b', vpc: 'vpc-0default1', cidr: '172.31.16.0/20', az: 'af-south-1b', public: true },
    ],
    igws: [{ id: 'igw-0default', vpc: 'vpc-0default1' }],
    routeTables: [{ id: 'rtb-0main', vpc: 'vpc-0default1', routes: [{ dest: '172.31.0.0/16', target: 'local' }, { dest: '0.0.0.0/0', target: 'igw-0default' }], subnets: [] }],
    sgs: [{ id: 'sg-0default', name: 'default', vpc: 'vpc-0default1', description: 'default VPC security group', ingress: [] }],
    instances: [],
    buckets: [],
    iamUsers: ['phemelo-admin'],
    seq: 1,
  };
}

const AMIS: Record<string, string> = { 'ami-0ubuntu2404': 'Ubuntu Server 24.04 LTS', 'ami-0amzn2023': 'Amazon Linux 2023', 'ami-0win2022': 'Windows Server 2022' };
const TYPES = ['t3.micro', 't3.small', 't3.medium', 'm5.large', 'c5.xlarge', 'g4dn.xlarge', 'hpc6a.48xlarge'];

const j = (o: unknown) => ok(JSON.stringify(o, null, 4) + '\n');

export const aws: Handler = (ctx, args) => {
  const a = (ctx.s.aws ??= createAws());
  const [svc, op, ...rest] = args;
  const { flags, pos } = parseFlags(rest);
  const next = (p: string) => `${p}-0${shortId(++a.seq * 101, 10)}`;
  if (!svc || svc === 'help') return ok('usage: aws [options] <command> <subcommand> [<subcommand> ...] [parameters]\nServices in this simulator: sts, configure, ec2, s3, iam\n');
  if (svc === '--version') return ok('aws-cli/2.18.4 Python/3.12.6 Linux/6.8.0 exe/x86_64.ubuntu.24\n');
  if (svc === 'sts' && op === 'get-caller-identity') return j({ UserId: 'AIDAROUTERUNNER0001', Account: a.account, Arn: `arn:aws:iam::${a.account}:user/${a.user}` });
  if (svc === 'configure') {
    if (op === 'list') return ok(`      Name                    Value             Type    Location\n      ----                    -----             ----    --------\n   profile                <not set>             None    None\naccess_key     ****************7XQA shared-credentials-file\nsecret_key     ****************h2Lk shared-credentials-file\n    region               ${a.region}      config-file    ~/.aws/config\n`);
    if (op === 'set' && pos[0] === 'region') {
      a.region = pos[1];
      return ok();
    }
    return ok(`AWS Access Key ID [****************7XQA]: \nAWS Secret Access Key [****************h2Lk]: \nDefault region name [${a.region}]: \nDefault output format [json]: \n[Route Runner] This CloudShell is pre-authenticated. Never paste real keys into chats or code repos!\n`);
  }
  if (svc === 'ec2') {
    switch (op) {
      case 'describe-regions':
        return j({ Regions: ['af-south-1', 'eu-west-1', 'us-east-1', 'ap-southeast-1'].map((r) => ({ RegionName: r, Endpoint: `ec2.${r}.amazonaws.com` })) });
      case 'describe-vpcs':
        return j({ Vpcs: a.vpcs.map((v) => ({ VpcId: v.id, CidrBlock: v.cidr, IsDefault: v.isDefault, State: 'available', Tags: v.name ? [{ Key: 'Name', Value: v.name }] : [] })) });
      case 'create-vpc': {
        const cidr = String(flags['cidr-block'] ?? '');
        const c = parseCidr(cidr);
        if (!c) return fail('An error occurred (InvalidParameterValue): Value for parameter cidrBlock is invalid. Use e.g. --cidr-block 10.0.0.0/16');
        if (c.prefix < 16 || c.prefix > 28) return fail(`An error occurred (InvalidVpc.Range) when calling the CreateVpc operation: The CIDR '${cidr}' is invalid. VPC size must be between /16 and /28.`);
        const v = { id: next('vpc'), cidr, isDefault: false };
        a.vpcs.push(v);
        a.routeTables.push({ id: next('rtb'), vpc: v.id, routes: [{ dest: cidr, target: 'local' }], subnets: [] });
        ctx.emit('aws:vpc');
        return j({ Vpc: { VpcId: v.id, CidrBlock: cidr, State: 'pending', IsDefault: false } });
      }
      case 'create-subnet': {
        const vpc = a.vpcs.find((v) => v.id === flags['vpc-id']);
        if (!vpc) return fail(`An error occurred (InvalidVpcID.NotFound): The vpc ID '${flags['vpc-id']}' does not exist`);
        const sc = parseCidr(String(flags['cidr-block'] ?? ''));
        const vc = parseCidr(vpc.cidr)!;
        if (!sc || sc.prefix < vc.prefix || !inNetwork(sc.ip, vc.ip, prefixToMask(vc.prefix))) return fail(`An error occurred (InvalidSubnet.Range) when calling the CreateSubnet operation: The CIDR '${flags['cidr-block']}' is invalid (it must sit inside the VPC range ${vpc.cidr}).`);
        if (a.subnets.some((s) => s.vpc === vpc.id && (inNetwork(sc.ip, parseCidr(s.cidr)!.ip, prefixToMask(Math.min(sc.prefix, parseCidr(s.cidr)!.prefix))))))
          return fail(`An error occurred (InvalidSubnet.Conflict): The CIDR '${flags['cidr-block']}' conflicts with another subnet`);
        const s = { id: next('subnet'), vpc: vpc.id, cidr: String(flags['cidr-block']), az: String(flags['availability-zone'] ?? `${a.region}a`), public: false };
        a.subnets.push(s);
        ctx.emit('aws:subnet');
        return j({ Subnet: { SubnetId: s.id, VpcId: s.vpc, CidrBlock: s.cidr, AvailabilityZone: s.az, AvailableIpAddressCount: 2 ** (32 - sc.prefix) - 5 } });
      }
      case 'describe-subnets':
        return j({ Subnets: a.subnets.filter((s) => !flags.filters || String(flags.filters).includes(s.vpc)).map((s) => ({ SubnetId: s.id, VpcId: s.vpc, CidrBlock: s.cidr, AvailabilityZone: s.az, MapPublicIpOnLaunch: s.public })) });
      case 'create-internet-gateway': {
        const g = { id: next('igw') };
        a.igws.push(g);
        return j({ InternetGateway: { InternetGatewayId: g.id, Attachments: [] } });
      }
      case 'attach-internet-gateway': {
        const g = a.igws.find((x) => x.id === flags['internet-gateway-id']);
        if (!g) return fail('An error occurred (InvalidInternetGatewayID.NotFound)');
        if (!a.vpcs.some((v) => v.id === flags['vpc-id'])) return fail('An error occurred (InvalidVpcID.NotFound)');
        g.vpc = String(flags['vpc-id']);
        ctx.emit('aws:igw');
        return ok();
      }
      case 'create-route-table': {
        const rt = { id: next('rtb'), vpc: String(flags['vpc-id']), routes: [{ dest: a.vpcs.find((v) => v.id === flags['vpc-id'])?.cidr ?? '', target: 'local' }], subnets: [] as string[] };
        a.routeTables.push(rt);
        return j({ RouteTable: { RouteTableId: rt.id, VpcId: rt.vpc, Routes: rt.routes } });
      }
      case 'create-route': {
        const rt = a.routeTables.find((r) => r.id === flags['route-table-id']);
        if (!rt) return fail('An error occurred (InvalidRouteTableID.NotFound)');
        rt.routes.push({ dest: String(flags['destination-cidr-block']), target: String(flags['gateway-id'] ?? flags['nat-gateway-id']) });
        ctx.emit('aws:route');
        return j({ Return: true });
      }
      case 'associate-route-table': {
        const rt = a.routeTables.find((r) => r.id === flags['route-table-id']);
        const sn = a.subnets.find((s) => s.id === flags['subnet-id']);
        if (!rt || !sn) return fail('An error occurred (InvalidParameterValue)');
        rt.subnets.push(sn.id);
        sn.public = rt.routes.some((r) => r.dest === '0.0.0.0/0' && r.target.startsWith('igw-'));
        return j({ AssociationId: next('rtbassoc') });
      }
      case 'describe-route-tables':
        return j({ RouteTables: a.routeTables.map((r) => ({ RouteTableId: r.id, VpcId: r.vpc, Routes: r.routes.map((x) => ({ DestinationCidrBlock: x.dest, GatewayId: x.target })), Associations: r.subnets.map((s) => ({ SubnetId: s })) })) });
      case 'create-security-group': {
        const sg = { id: next('sg'), name: String(flags['group-name'] ?? 'sg'), vpc: String(flags['vpc-id'] ?? 'vpc-0default1'), description: String(flags.description ?? ''), ingress: [] };
        if (!sg.description) return fail('aws: error: the following arguments are required: --description');
        a.sgs.push(sg);
        return j({ GroupId: sg.id });
      }
      case 'authorize-security-group-ingress': {
        const sg = a.sgs.find((s) => s.id === flags['group-id']);
        if (!sg) return fail(`An error occurred (InvalidGroup.NotFound): The security group '${flags['group-id']}' does not exist`);
        const cidr = String(flags.cidr ?? '0.0.0.0/0');
        sg.ingress.push({ proto: String(flags.protocol ?? 'tcp'), port: String(flags.port ?? 'all'), cidr });
        ctx.emit('aws:sg');
        const warn = cidr === '0.0.0.0/0' && String(flags.port) === '22' ? '\n[Route Runner hint] SSH open to 0.0.0.0/0 means the WHOLE internet can try to log in. Restrict --cidr to your own IP/32.' : '';
        return ok(JSON.stringify({ Return: true, SecurityGroupRules: [{ GroupId: sg.id, IpProtocol: flags.protocol, FromPort: Number(flags.port), CidrIpv4: cidr }] }, null, 4) + warn + '\n');
      }
      case 'describe-security-groups':
        return j({ SecurityGroups: a.sgs.map((s) => ({ GroupId: s.id, GroupName: s.name, VpcId: s.vpc, Description: s.description, IpPermissions: s.ingress.map((r) => ({ IpProtocol: r.proto, FromPort: Number(r.port) || 0, IpRanges: [{ CidrIp: r.cidr }] })) })) });
      case 'run-instances': {
        const ami = String(flags['image-id'] ?? '');
        if (!AMIS[ami]) return fail(`An error occurred (InvalidAMIID.NotFound) when calling the RunInstances operation: The image id '[${ami}]' does not exist\n[Route Runner] Try one of: ${Object.keys(AMIS).join(', ')}`);
        const type = String(flags['instance-type'] ?? 't3.micro');
        if (!TYPES.includes(type)) return fail(`An error occurred (InvalidParameterValue): Invalid value '${type}' for InstanceType. Try: ${TYPES.join(', ')}`);
        const subnet = a.subnets.find((s) => s.id === (flags['subnet-id'] ?? 'subnet-0def1a'));
        if (!subnet) return fail(`An error occurred (InvalidSubnetID.NotFound): The subnet ID '${flags['subnet-id']}' does not exist`);
        const count = Number(flags.count ?? 1);
        const made = [];
        for (let i = 0; i < count; i++) {
          const base = parseCidr(subnet.cidr)!.ip.split('.').map(Number);
          const inst = {
            id: next('i'),
            type,
            ami,
            subnet: subnet.id,
            sg: String(flags['security-group-ids'] ?? 'sg-0default'),
            state: 'running' as const,
            privateIp: `${base[0]}.${base[1]}.${base[2]}.${10 + a.instances.length}`,
            publicIp: subnet.public ? `13.244.${(a.seq * 7) % 250}.${(a.seq * 13) % 250}` : undefined,
            launched: Date.now(),
            name: typeof flags['tag-specifications'] === 'string' ? (flags['tag-specifications'].match(/Value=([^}\]]+)/)?.[1]) : undefined,
          };
          a.instances.push(inst);
          made.push(inst);
        }
        ctx.emit('aws:ec2');
        return j({ Instances: made.map((i) => ({ InstanceId: i.id, InstanceType: i.type, ImageId: i.ami, State: { Code: 0, Name: 'pending' }, SubnetId: i.subnet, PrivateIpAddress: i.privateIp })) });
      }
      case 'describe-instances':
        return j({ Reservations: [{ Instances: a.instances.map((i) => ({ InstanceId: i.id, InstanceType: i.type, ImageId: i.ami, State: { Name: i.state }, PrivateIpAddress: i.privateIp, PublicIpAddress: i.publicIp, SubnetId: i.subnet, SecurityGroups: [{ GroupId: i.sg }], Tags: i.name ? [{ Key: 'Name', Value: i.name }] : [] })) }] });
      case 'stop-instances':
      case 'start-instances':
      case 'terminate-instances': {
        const ids = String(flags['instance-ids'] ?? '').split(/[ ,]/).filter(Boolean);
        const changes = [];
        for (const id of ids) {
          const i = a.instances.find((x) => x.id === id);
          if (!i) return fail(`An error occurred (InvalidInstanceID.NotFound): The instance ID '${id}' does not exist`);
          const prev = i.state;
          i.state = op === 'stop-instances' ? 'stopped' : op === 'start-instances' ? 'running' : 'terminated';
          changes.push({ InstanceId: id, PreviousState: { Name: prev }, CurrentState: { Name: i.state === 'terminated' ? 'shutting-down' : i.state } });
        }
        return j({ [op === 'terminate-instances' ? 'TerminatingInstances' : op === 'stop-instances' ? 'StoppingInstances' : 'StartingInstances']: changes });
      }
      default:
        return fail(`aws: error: argument operation: Invalid choice '${op}'`);
    }
  }
  if (svc === 's3') {
    const target = pos[0] ?? '';
    if (op === 'ls') {
      if (!target) return ok(a.buckets.map((b) => `2026-11-19 08:00:00 ${b.name}`).join('\n') + (a.buckets.length ? '\n' : ''));
      const b = a.buckets.find((x) => `s3://${x.name}`.startsWith(target.replace(/\/$/, '')));
      if (!b) return fail('An error occurred (NoSuchBucket) when calling the ListObjectsV2 operation: The specified bucket does not exist');
      return ok(b.objects.map((o) => `2026-11-19 08:00:00 ${String(o.size).padStart(10)} ${o.key}`).join('\n') + '\n');
    }
    if (op === 'mb') {
      const name = target.replace('s3://', '');
      if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(name)) return fail(`make_bucket failed: s3://${name} An error occurred (InvalidBucketName): Bucket names must be 3-63 lowercase letters, numbers, dots or hyphens`);
      if (a.buckets.some((b) => b.name === name) || ['test', 'backup', 'data'].includes(name)) return fail(`make_bucket failed: s3://${name} An error occurred (BucketAlreadyExists): The requested bucket name is not available. Bucket names are GLOBAL across all AWS accounts.`);
      a.buckets.push({ name, created: Date.now(), objects: [] });
      ctx.emit('aws:s3');
      return ok(`make_bucket: ${name}\n`);
    }
    if (op === 'cp') {
      const [src, dst] = pos;
      if (!dst?.startsWith('s3://')) return fail('Usage: aws s3 cp <localfile> s3://bucket/key');
      const content = ctx.read(ctx.abs(src));
      if (content === undefined) return fail(`The user-provided path ${src} does not exist.`);
      const [bucket, ...key] = dst.replace('s3://', '').split('/');
      const b = a.buckets.find((x) => x.name === bucket);
      if (!b) return fail('upload failed: An error occurred (NoSuchBucket)');
      const k = key.join('/') || src.split('/').pop()!;
      b.objects.push({ key: k, size: content.length });
      return ok(`upload: ${src} to s3://${bucket}/${k}\n`);
    }
    if (op === 'rb') {
      const name = target.replace('s3://', '');
      const b = a.buckets.find((x) => x.name === name);
      if (!b) return fail('remove_bucket failed: NoSuchBucket');
      if (b.objects.length && !flags.force) return fail(`remove_bucket failed: s3://${name} An error occurred (BucketNotEmpty): The bucket you tried to delete is not empty`);
      a.buckets = a.buckets.filter((x) => x !== b);
      return ok(`remove_bucket: ${name}\n`);
    }
    return fail('Usage: aws s3 ls | mb | cp | rb');
  }
  if (svc === 'iam') {
    if (op === 'list-users') return j({ Users: a.iamUsers.map((u) => ({ UserName: u, Arn: `arn:aws:iam::${a.account}:user/${u}` })) });
    if (op === 'create-user') {
      const u = String(flags['user-name'] ?? '');
      a.iamUsers.push(u);
      return j({ User: { UserName: u, Arn: `arn:aws:iam::${a.account}:user/${u}` } });
    }
    return fail('Usage: aws iam list-users | create-user --user-name NAME');
  }
  if (isIPv4(svc)) return fail('aws: error: that is an IP address, not a service');
  return fail(`aws: error: argument command: Invalid choice, valid choices are: sts | configure | ec2 | s3 | iam`);
};
