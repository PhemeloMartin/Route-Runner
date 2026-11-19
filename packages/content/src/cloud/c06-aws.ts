import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c06 | AWS Core Services: IAM, Compute, Storage and Databases | 6
@sources AWS Certified Cloud Practitioner (CLF-C02) exam guide; AWS Well-Architected Framework
@story
Lindiwe opens the Cloud Tower's CloudShell, pre-authenticated in Cape Town. "AWS has over 200 services. Relax - 80% of real work uses about ten of them. Learn these ten properly and you can build almost anything."
@lab cloud:aws-vpc | Cloud Mission 3 - Build a VPC in Cape Town

=== lesson c06-1 | IAM - Who Can Do What | 25
@analogy IAM is the access-card system for a huge office tower. Users get cards, teams (groups) get floor access, and some cards are temporary visitor passes (roles). The building owner's master key (root account) stays in the safe.
@objectives
- Explain the root user, IAM users, groups, roles and policies
- Apply least privilege and MFA
- Read a basic IAM policy
@body
- **Root user** - the email that created the account; can do anything (incl. closing it). **Enable MFA, then lock it away**; never use it day to day.
- **IAM users** - people or apps with long-term credentials (password and/or access keys).
- **Groups** - attach permissions to "Developers", "Admins", put users in groups.
- **Roles** - temporary credentials *assumed* by a service or person (an EC2 instance that needs to read S3 gets a role - **no access keys on servers!**).
- **Policies** - JSON documents that **Allow** or **Deny** actions on resources:
~~~
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject"],
    "Resource": "arn:aws:s3:::kmp-invoices/*"
  }]
}
~~~
Evaluation: everything is **implicitly denied**; an explicit **Allow** grants; an explicit **Deny** always wins. Sound familiar? It's an ACL for the cloud.

**Best practice:** MFA everywhere, least privilege, roles instead of access keys, rotate/delete unused keys, never commit keys to Git (bots scan GitHub for them within minutes), use IAM Identity Center (SSO) for people.
@terms
- Root user :: The all-powerful account owner identity - protect with MFA, don't use daily
- IAM user :: An identity with long-term credentials
- IAM role :: Assumable identity with temporary credentials - used by services and federated users
- IAM policy :: JSON document allowing or denying actions on resources
- Explicit deny :: A Deny statement that overrides any Allow
- ARN :: Amazon Resource Name - unique ID of an AWS resource
@pro
- "Applications on EC2 get permissions through an IAM role, never through access keys stored on disk."
@quiz
? What should you do with the AWS root user?
+ Enable MFA and use it only for the few tasks that require it
- Use it daily for convenience
- Share it with the team
- Delete it
> Root can't be deleted - lock it down.
? An EC2 app needs to read an S3 bucket. Best way?
+ Attach an IAM role to the instance
- Store an admin's access keys in a file
- Make the bucket public
- Use the root user's keys
> Temporary, rotated credentials.
? A policy allows s3:* but another attached policy explicitly denies s3:DeleteObject. Can the user delete objects?
- Yes
+ No - explicit deny wins
- Only on weekends
- Only with MFA
> Deny overrides allow.

=== lesson c06-2 | Compute: EC2, Auto Scaling, Load Balancers and Lambda | 25
@analogy EC2 instances are rented kitchens. An Auto Scaling group is a manager who opens more kitchens when the queue grows and closes them when it's quiet. The load balancer is the host at the door sending each customer to a kitchen with space.
@objectives
- Launch EC2 instances: AMI, instance type, key pair, security group, subnet
- Explain Auto Scaling groups and load balancers
- Know when to use Lambda or containers instead
@body
**EC2 (Elastic Compute Cloud)** = virtual machines. Launch choices:
- **AMI** - the image (Ubuntu 24.04, Amazon Linux 2023, Windows Server)
- **Instance type** - family + size: **t3.micro** (burstable, cheap), m5 (general), c5 (compute), r5 (memory), **g4dn/p4** (GPU), **hpc6a** (HPC)
- **Key pair** - SSH key for login
- **Security group** - the instance's stateful firewall
- **Subnet / VPC** - where it lives on the network
- **User data** - a startup script (install nginx at first boot)
- Storage: **EBS** volume (network block disk)

**Auto Scaling group (ASG)** - keeps a min/desired/max number of instances, replaces unhealthy ones, scales on CPU or request count.
**Elastic Load Balancing:** **ALB** (Layer 7 HTTP/HTTPS - path/host routing), **NLB** (Layer 4 TCP/UDP, extreme performance, static IPs). Health checks remove dead instances.

**Lambda** - serverless functions triggered by events (an upload to S3, an API call, a schedule). No servers, scales to zero, pay per millisecond. Max 15 minutes per run.
**Containers:** ECS/Fargate, or **EKS** (managed Kubernetes - Chapter 9).
@terms
- EC2 :: Elastic Compute Cloud - virtual servers in AWS
- AMI :: Amazon Machine Image - the template an instance boots from
- Instance type :: The CPU/RAM/network size of an instance (e.g. t3.micro)
- Auto Scaling group :: Maintains and scales a fleet of instances automatically
- ALB / NLB :: Application (Layer 7) / Network (Layer 4) load balancer
- Lambda :: AWS serverless function service
- User data :: Script run at an instance's first boot
@pro
- "I put EC2 instances in an Auto Scaling group across two AZs behind an Application Load Balancer."
@quiz
? Which load balancer routes by URL path (e.g. /api vs /images)?
+ Application Load Balancer
- Network Load Balancer
- Classic SNMP balancer
- Route table
> ALB is Layer 7.
? What does an AMI provide?
+ The image (OS and software) an instance boots from
- The firewall rules
- The IP address
- The billing account
> Amazon Machine Image.
? A function should run whenever a file lands in a bucket, a few times a day. Best fit?
+ Lambda
- A large EC2 instance running 24/7
- A dedicated host
- An HPC cluster
> Event-driven, pay per use.

=== lesson c06-3 | Storage and Databases: S3, EBS, EFS, RDS, DynamoDB | 25
@analogy EBS is a hard drive bolted to one VM. EFS is a shared network drive many VMs can open at once. S3 is an infinite warehouse of labelled boxes you fetch over the internet by name.
@objectives
- Compare block, file and object storage
- Use S3 buckets, objects, storage classes and security
- Choose between RDS and DynamoDB
@body
| Type | AWS service | Like... | Attached to |
|---|---|---|---|
| **Block** | **EBS** | a disk | one instance (same AZ) |
| **File** | **EFS** (Linux NFS), FSx | a shared network drive | many instances |
| **Object** | **S3** | a web-accessible warehouse | anything over HTTPS |

**S3:** **buckets** (globally unique names) hold **objects** (files + metadata, up to 5 TB each) addressed by key. **11 nines of durability**. Storage classes: Standard -> Standard-IA (infrequent) -> Glacier (archive, minutes-hours to restore). **Lifecycle rules** move old data to cheaper classes automatically. Security: **Block Public Access ON**, bucket policies, encryption (SSE-S3/SSE-KMS), versioning (recover deleted/overwritten objects). Static websites can be hosted straight from S3 (+ CloudFront CDN).

**Databases:**
- **RDS** - managed relational SQL (MySQL, PostgreSQL, SQL Server, Oracle, **Aurora**). AWS handles backups, patching, **Multi-AZ** standby failover and **read replicas**.
- **DynamoDB** - managed NoSQL key-value/document, single-digit-millisecond at any scale, serverless.
- Also: ElastiCache (Redis), Redshift (data warehouse).

Route Runner itself uses a relational database (SQLite) for your save game - a cloud version would use RDS PostgreSQL.
@terms
- EBS :: Elastic Block Store - network disks for EC2 in one AZ
- EFS :: Elastic File System - shared NFS storage for many instances
- S3 :: Simple Storage Service - object storage with very high durability
- Bucket / object :: Container and stored file in S3
- RDS :: Managed relational database service
- Multi-AZ :: Synchronous standby copy in another AZ for automatic failover
- DynamoDB :: Managed NoSQL key-value database
@pro
- "I'd use RDS Multi-AZ for the transactional database and S3 with lifecycle rules for backups and logs."
@quiz
? Which storage can be mounted by many Linux instances at once?
- EBS
+ EFS
- Instance store only
- Glacier
> Shared file system.
? Which S3 feature lets you recover an overwritten file?
+ Versioning
- Lifecycle to Glacier
- Static hosting
- Requester pays
> Keeps previous versions.
? You need a managed MySQL database with automatic failover. Choose...
+ RDS Multi-AZ
- DynamoDB
- S3
- EBS snapshot
> Relational + standby.

=== boss
? Which identity should an application on EC2 use to access AWS APIs?
+ An IAM role
- The root user
- A hard-coded access key
- An IAM group
> Temporary credentials.
? A website must survive an AZ failure and handle traffic spikes. Which combination?
+ ALB + Auto Scaling group across two AZs
- One large instance with RAID
- Lambda@Edge only
- An NLB in one AZ
> HA + elasticity.
? Which storage is object storage?
+ S3
- EBS
- EFS
- FSx for Windows
> Objects via HTTPS.
? S3 bucket names must be...
+ globally unique across all AWS accounts
- unique per account
- numbers only
- the same as your domain
> Global namespace.
? Which is a NoSQL database?
- Aurora
- RDS PostgreSQL
+ DynamoDB
- RDS SQL Server
> Key-value/document.
`;
