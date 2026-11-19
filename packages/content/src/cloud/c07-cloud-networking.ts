import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c07 | Cloud Networking: VPCs, Subnets, Security Groups and DNS | 7
@sources AWS VPC documentation concepts; your Network Engineer stream (subnetting, routing, NAT, ACLs) - the same skills, in the cloud
@story
"Here's the secret most cloud engineers learn the hard way," says Lindiwe. "Cloud networking IS networking. CIDR blocks, route tables, NAT, firewalls - it's your CCNA knowledge with a web console. You already have a head start."
@lab cloud:aws-vpc | Cloud Mission 3 - Build a VPC in Cape Town

=== lesson c07-1 | VPCs, Subnets, Route Tables and Gateways | 30
@analogy A VPC is your own fenced estate inside AWS's city. Subnets are streets inside the estate. The Internet Gateway is the estate's main gate. Public streets have a road to the gate; private streets don't - their residents use a guarded side exit (NAT gateway) to go out, but nobody can come in that way.
@objectives
- Design a VPC with public and private subnets across two AZs
- Explain route tables, Internet Gateways and NAT gateways
- Connect VPCs and on-premises networks
@body
A **VPC (Virtual Private Cloud)** is an isolated private network you define with a **CIDR block** (/16 to /28), e.g. **10.20.0.0/16**. Plan it with your subnetting skills - and **don't overlap** with on-prem or other VPCs you'll connect later.

**Subnets** live in exactly **one AZ**. AWS reserves **5 addresses** per subnet (network, router .1, DNS .2, future .3, broadcast) - a /24 gives 251 usable.

A **public subnet** has a route **0.0.0.0/0 -> Internet Gateway (IGW)**; instances there can get public IPs. A **private subnet** has no route to the IGW; outbound internet (for updates) goes **0.0.0.0/0 -> NAT Gateway** (which sits in a public subnet) - that's PAT, exactly as on a Cisco edge router.

**Classic 3-tier layout across two AZs:**
| Tier | AZ a | AZ b | Route to internet |
|---|---|---|---|
| Public (ALB, NAT GW, bastion) | 10.20.1.0/24 | 10.20.2.0/24 | IGW |
| Private app (EC2/EKS) | 10.20.11.0/24 | 10.20.12.0/24 | NAT GW |
| Private data (RDS) | 10.20.21.0/24 | 10.20.22.0/24 | none |

**Route tables** - every subnet is associated with one; the **local** route (VPC CIDR) is always there. Longest-prefix match applies, just like a router.

**Connecting networks:** **VPC peering** (one-to-one, non-transitive), **Transit Gateway** (hub-and-spoke for many VPCs), **Site-to-Site VPN** (IPsec over the internet to your office router), **Direct Connect** (private dedicated fibre link). **VPC endpoints** let private subnets reach S3/DynamoDB without the internet.
@terms
- VPC :: Virtual Private Cloud - your isolated network in AWS
- Public subnet :: Subnet whose route table sends 0.0.0.0/0 to an Internet Gateway
- Private subnet :: Subnet with no direct route to the Internet Gateway
- Internet Gateway :: Lets a VPC communicate with the internet
- NAT Gateway :: Lets private-subnet instances make outbound internet connections (PAT)
- Transit Gateway :: Hub that connects many VPCs and on-prem networks
- Direct Connect :: Dedicated private link from your data centre to AWS
@pro
- "Databases go in private subnets with no internet route; app servers reach out through a NAT gateway."
@interview Design a basic, highly available VPC for a web application. :: A /16 VPC across two AZs. Two public subnets for the Application Load Balancer and NAT gateways, two private app subnets for the EC2 Auto Scaling group, and two private data subnets for RDS Multi-AZ. Public route tables point 0.0.0.0/0 to the Internet Gateway; private app subnets point to a NAT gateway in their AZ; the data subnets have no internet route. Security groups chain ALB -> app -> database.
@quiz
? What makes a subnet "public" in AWS?
+ Its route table has 0.0.0.0/0 pointing to an Internet Gateway
- It has a /24 mask
- It is in us-east-1
- It contains a database
> The route defines it.
? Private EC2 instances need to download updates without being reachable from the internet. Use...
+ a NAT Gateway in a public subnet
- an Internet Gateway route directly
- VPC peering
- a public IP on each instance
> Outbound-only via PAT.
?= How many usable IPs does AWS give you in a /24 subnet?
= 251
> 256 - 5 reserved.

=== lesson c07-2 | Security Groups, NACLs, DNS and CDN | 25
@analogy Security groups are bouncers at each house's door who remember who they let out, so the reply can come back in. NACLs are the boom gate at the street entrance that checks every car in BOTH directions and remembers nothing.
@objectives
- Compare security groups (stateful) and NACLs (stateless)
- Design least-privilege security group chains
- Explain Route 53 and CloudFront
@body
| | **Security Group** | **Network ACL** |
|---|---|---|
| Applies to | instance / ENI | subnet |
| State | **stateful** (return traffic auto-allowed) | **stateless** (allow both directions, incl. ephemeral ports 1024-65535) |
| Rules | **allow only** | allow AND deny, numbered, first match wins |
| Default | deny all inbound, allow all outbound | default NACL allows all |

**Security group chaining** - instead of IP ranges, reference other security groups:
- ALB-SG: allow 443 from 0.0.0.0/0
- APP-SG: allow 8080 **from ALB-SG**
- DB-SG: allow 5432 **from APP-SG**
- SSH (22) only from your office IP/32 or, better, no SSH at all (use AWS Systems Manager Session Manager).

**Route 53** - AWS DNS: hosted zones, records (A, AAAA, CNAME, **alias**), health checks and routing policies (failover, latency, weighted, geolocation).
**CloudFront** - CDN that caches content at edge locations near users (Johannesburg/Cape Town edges for SA users), plus TLS and DDoS protection (AWS Shield, WAF).
@terms
- Security group :: Stateful, allow-only virtual firewall on an instance's network interface
- NACL :: Stateless subnet-level firewall with ordered allow/deny rules
- Stateful :: Remembers connections so return traffic is automatically allowed
- Security group chaining :: Allowing traffic from another security group instead of an IP range
- Route 53 :: AWS managed DNS service
- CloudFront :: AWS content delivery network (CDN)
@pro
- "Security groups are stateful and allow-only; NACLs are stateless and need rules in both directions."
@quiz
? Which is stateful?
+ Security group
- Network ACL
- Route table
- Internet Gateway
> Return traffic is allowed automatically.
? Which can explicitly DENY a specific IP address?
- Security group
+ Network ACL
- IAM role
- S3 bucket policy only
> SGs only allow.
? The database should accept connections only from the app servers. Best rule?
+ DB-SG allows 5432 from APP-SG
- DB-SG allows 5432 from 0.0.0.0/0
- Make the DB public
- Use a NACL allowing everything
> Chain security groups.

=== boss
? A VPC is 10.0.0.0/16. Which subnet is valid inside it?
+ 10.0.5.0/24
- 10.1.5.0/24
- 192.168.0.0/24
- 10.0.0.0/8
> Must sit inside the VPC CIDR.
? Instances in a private subnet can't reach the internet for updates. What's missing?
+ A route 0.0.0.0/0 to a NAT gateway
- An Internet Gateway in the private subnet
- A bigger instance type
- Route 53
> Outbound via NAT.
? Why must VPC CIDRs not overlap with your office network?
+ Routing over VPN/Direct Connect breaks with overlapping ranges
- AWS charges more
- DNS won't work
- Overlap is required
> Same as on-prem routing.
? NACL rules are evaluated...
+ in number order, first match wins
- all together, most permissive wins
- only for outbound traffic
- by security group name
> Like an ACL.
? Which service caches content close to users?
+ CloudFront
- Route 53
- NAT Gateway
- Transit Gateway
> CloudFront is AWS's content delivery network: it caches content at edge locations near your users.
`;
