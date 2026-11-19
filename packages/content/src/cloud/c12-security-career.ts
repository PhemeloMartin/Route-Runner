import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c12 | Cloud Security, Reliability, Cost and Your Career | 12
@sources AWS Well-Architected Framework (6 pillars); Information Security modules (risk, encryption, compliance); POPIA; AWS/Azure/CNCF certification paths
@story
Lindiwe's final briefing before Phemelo's "graduation" from the Cloud Tower: "Anyone can launch a server. Engineers who get hired - and stay hired - make it secure, reliable and affordable, and can prove it. Let's finish with the things interviewers actually ask."

=== lesson c12-1 | The Well-Architected Framework and Cloud Security | 25
@analogy The Well-Architected Framework is a building inspector's checklist: is it safe (security), will it stand in a storm (reliability), is it efficient (performance), affordable (cost), easy to maintain (operations) and kind to the environment (sustainability)?
@objectives
- Name the six Well-Architected pillars
- Apply core cloud security controls
- Explain encryption at rest/in transit and key management
@body
**AWS Well-Architected Framework - six pillars:** Operational Excellence, **Security**, **Reliability**, Performance Efficiency, **Cost Optimization**, Sustainability. (Azure and Google have equivalents.)

**Cloud security essentials:**
- **Identity first** - MFA everywhere, least-privilege IAM, roles not keys, SSO, regular access reviews
- **Network** - private subnets, security groups chained by role, no 0.0.0.0/0 on SSH/RDP/databases, WAF in front of web apps
- **Data** - encryption **at rest** (KMS-managed keys) and **in transit** (TLS 1.2+), S3 Block Public Access, backups in another region/account
- **Detection** - CloudTrail (who did what - API audit log), GuardDuty (threat detection), Config (compliance rules), Security Hub
- **Patching and hardening** - golden images, automated updates
- **Secrets** - Secrets Manager / Parameter Store, never in code or Git

**Compliance in South Africa:** **POPIA** requires safeguarding personal information, breach notification to the Information Regulator and data subjects, and care with cross-border transfers - another reason to choose af-south-1 and to know where your data lives. Global: GDPR, PCI-DSS (card payments), ISO 27001.
@terms
- Well-Architected Framework :: AWS's six-pillar best-practice framework
- Encryption at rest :: Data encrypted on disk/storage
- Encryption in transit :: Data encrypted while moving over networks (TLS)
- KMS :: Key Management Service - creates and controls encryption keys
- CloudTrail :: Logs every API call in an AWS account
- GuardDuty :: AWS managed threat-detection service
@pro
- "CloudTrail answers 'who did what, when' - it's the first thing I check during an incident."
@quiz
? Which AWS service records every API call for auditing?
+ CloudTrail
- CloudFront
- Route 53
- EBS
> Audit trail.
? Which is NOT one of the six Well-Architected pillars?
- Reliability
- Cost Optimization
+ Marketing
- Sustainability
> Six technical pillars.
? Data encrypted while travelling between a browser and a load balancer is...
+ encryption in transit (TLS)
- encryption at rest
- hashing
- compression
> TLS encrypts data while it moves over the network - "in transit". Encryption on disk is "at rest".

=== lesson c12-2 | Reliability, Backups and Disaster Recovery | 20
@analogy RPO is how much homework you can afford to lose (since your last save). RTO is how long until you're back at your desk working again. A good DR plan decides both before the fire, not during it.
@objectives
- Define RPO and RTO
- Compare DR strategies from backup-and-restore to multi-site active/active
- Design for failure
@body
**RPO (Recovery Point Objective)** - maximum acceptable data loss, measured in time (e.g. 15 minutes of transactions).
**RTO (Recovery Time Objective)** - maximum acceptable downtime (e.g. 1 hour).

**DR strategies (cheapest/slowest -> most expensive/fastest):**
| Strategy | RTO/RPO | Idea |
|---|---|---|
| Backup & restore | hours-days | restore from backups into a new region |
| Pilot light | tens of minutes | core (DB replica) always on, rest started on demand |
| Warm standby | minutes | scaled-down full copy running |
| Multi-site active/active | near zero | full capacity in two regions |

**Design for failure** ("everything fails all the time" - Werner Vogels): multi-AZ by default, stateless app servers, health checks + auto-replacement, timeouts and retries, queues to decouple components, and **chaos engineering** (deliberately breaking things - like the "Crash worker" button in the Cluster 3D view).

**Backups:** automated, encrypted, in another account/region, **tested by restoring regularly** - an untested backup is just a hope. Remember 3-2-1 from the Network stream.
@terms
- RPO :: Recovery Point Objective - maximum acceptable data loss (time)
- RTO :: Recovery Time Objective - maximum acceptable downtime
- Pilot light :: DR strategy keeping a minimal core running in the DR region
- Active/active :: Two sites both serving traffic simultaneously
- Chaos engineering :: Intentionally injecting failures to prove resilience
@pro
- "We agree RPO and RTO with the business first; the DR strategy and its cost follow from those numbers."
@quiz
? The business can lose at most 5 minutes of data. Which metric is that?
+ RPO
- RTO
- SLA
- MTBF
> Data loss window.
? Which DR strategy has the LOWEST cost and slowest recovery?
+ Backup and restore
- Pilot light
- Warm standby
- Multi-site active/active
> Cheapest, slowest.
? When is a backup proven to work?
+ After a successful test restore
- When the backup job says "completed"
- When it's encrypted
- Never
> Test restores.

=== lesson c12-3 | Cost Optimisation and Your Cloud Career Path | 20
@analogy Cloud bills are like electricity with the geyser left on: nothing looks wrong until the bill arrives. Tagging and budgets are the smart meter that shows which room is using the power.
@objectives
- Apply practical cost-optimisation techniques
- Plan a certification and portfolio path to a cloud role
@body
**Cost optimisation (FinOps):** tag every resource (owner, project, environment) -> **budgets and alerts** -> **right-size** (most instances are oversized) -> turn off dev/test at night and weekends -> **Savings Plans/Reserved** for steady load -> **Spot** for batch/CI/HPC -> S3 lifecycle rules -> delete unattached EBS volumes, old snapshots and idle load balancers -> watch data-transfer (egress) costs -> use managed/serverless where it's cheaper overall.

**Your cloud career path (realistic for 2026-2027):**
1. **Foundations** (done in Route Runner): Linux, networking (CCNA), virtualization.
2. **AWS Certified Cloud Practitioner** (or AZ-900) - concepts, pricing, shared responsibility.
3. **AWS Solutions Architect - Associate** (or AZ-104 Azure Administrator) - the most requested cloud cert in job ads.
4. **KCNA** (you completed the LFS250 course that prepares for it!) -> **CKA** (hands-on Kubernetes admin).
5. **Terraform Associate**.
6. **Portfolio** - public GitHub projects matter as much as certs. **Route Runner itself is one**: TypeScript monorepo, SQLite schema with migrations, REST API, Docker multi-stage image, Kubernetes manifests with probes and a PVC, GitHub Actions CI, Prometheus metrics. Be ready to explain every design decision in an interview.

Roles to search for: Junior Cloud Engineer, Cloud Support Associate, DevOps Engineer (junior), Site Reliability Engineer, NOC/Network Engineer with cloud, Platform Engineer.
@terms
- Right-sizing :: Matching instance size to actual usage
- Tagging :: Labelling resources (owner, project, environment) for cost and governance
- Budget alert :: Notification when spend approaches a threshold
- KCNA / CKA :: Kubernetes and Cloud Native Associate / Certified Kubernetes Administrator
@pro
- "I tag everything, set budgets on day one, and right-size based on real CloudWatch metrics."
@interview Tell me about a project you're proud of. :: Route Runner - a 3D learning platform I built to train myself for the CCNA, cloud and trading. It's a TypeScript monorepo: a React and Three.js client, a Fastify API with a normalised SQLite schema and migrations, and simulation engines for Cisco IOS, Linux, Docker, Kubernetes and AWS, covered by automated tests. It's containerised with a multi-stage Dockerfile, has Kubernetes manifests with health probes and a persistent volume, and a GitHub Actions pipeline. I can walk you through any design decision.
@quiz
? Which is the FIRST step to understanding a confusing cloud bill?
+ Tag resources by owner/project and review cost by tag
- Delete random instances
- Move everything to the biggest instance
- Disable billing alerts
> Visibility first.
? Dev servers are used only 08:00-17:00 on weekdays. Easy saving?
+ Schedule them to stop outside working hours
- Buy 3-year reserved instances for them
- Use bigger instances
- Copy them to another region
> Roughly 70% saving.
? Which certification focuses on hands-on Kubernetes administration?
- Cloud Practitioner
- KCNA
+ CKA
- CCNA
> Certified Kubernetes Administrator (performance-based).

=== boss
? Which control would have prevented most public-S3-bucket data leaks?
+ S3 Block Public Access enabled at account level
- A bigger EC2 instance
- More availability zones
- Spot pricing
> Block Public Access is an account-wide guardrail that overrides any bucket setting that would make data public.
? An app must be back online within 15 minutes after a regional outage. Which metric is 15 minutes?
+ RTO
- RPO
- TTL
- SLA penalty
> Recovery time.
? Which pillar of Well-Architected covers patching, IAM and encryption?
+ Security
- Cost Optimization
- Performance Efficiency
- Sustainability
> Security pillar.
? Which pricing option suits an HPC batch run that can tolerate interruptions?
+ Spot instances
- Dedicated hosts
- On-demand only
- 3-year reserved
> Big discount, interruptible.
? Under POPIA, why might a SA company keep personal data in af-south-1?
+ To simplify data-residency and cross-border transfer obligations
- Because other regions are illegal
- Because it's free
- Because POPIA requires AWS
> Know where personal data lives.
`;
