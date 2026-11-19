import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c05 | Cloud Computing Concepts | 5
@sources Big Data: Cloud Computing for Big Data (NBDF lecture slides & journal); NIST SP 800-145 definition of cloud computing; AWS Cloud Practitioner exam guide
@story
The Marketplace owner asks: "Should I buy a R120,000 server or 'use the cloud'? My cousin says the cloud is cheaper. My accountant says it's more expensive." Phemelo smiles - both can be right. This chapter gives him the words to explain why.

=== lesson c05-1 | What the Cloud Really Is: NIST's Five Characteristics | 20
@analogy Owning servers is like owning a car: big upfront cost, insurance, maintenance - and it sits idle most of the day. The cloud is like e-hailing (Uber/Bolt): no upfront cost, pay per trip, scale up to a minibus when you need one. Great - unless you drive all day every day.
@objectives
- Define cloud computing using the NIST characteristics
- Compare CapEx and OpEx
- Explain elasticity vs scalability
@body
**NIST's five essential characteristics:**
1. **On-demand self-service** - provision resources yourself, in minutes, no human at the provider
2. **Broad network access** - reachable over the network from any device
3. **Resource pooling** - the provider's hardware is shared by many customers (multi-tenancy)
4. **Rapid elasticity** - scale out and in automatically with demand
5. **Measured service** - you pay for what you use (per second, per GB, per request)

**Money:** traditional IT is **CapEx** (capital expenditure - buy servers up front, depreciate over years). Cloud is **OpEx** (operational expenditure - a monthly bill). Cloud wins for spiky, uncertain or fast-growing workloads; steady 24/7 workloads can be cheaper on-premises or with reserved pricing.

**Scalability** = the ability to grow. **Vertical scaling** (scale up) = a bigger server; **horizontal scaling** (scale out) = more servers behind a load balancer. **Elasticity** = scaling out *and back in* automatically (Black Friday traffic, then quiet January).

**High availability** - designing so a single failure doesn't stop the service (multiple servers, multiple data centres). **Fault tolerance** - zero interruption even during failure. **Disaster recovery** - getting back after a major event.
@terms
- On-demand self-service :: Provision resources yourself without contacting the provider
- Resource pooling :: Shared provider infrastructure serving many tenants
- Rapid elasticity :: Automatically scaling resources up and down with demand
- Measured service :: Pay-per-use metering
- CapEx vs OpEx :: Upfront capital purchase vs ongoing operating cost
- Horizontal scaling :: Adding more instances (scale out)
- Vertical scaling :: Making one instance bigger (scale up)
@pro
- "Elasticity means scaling out under load AND back in afterwards, so we stop paying for idle capacity."
@quiz
? Paying monthly for cloud servers instead of buying hardware is...
- CapEx
+ OpEx
- Depreciation
- A one-time cost
> Operating expenditure.
? Adding more web servers behind a load balancer is...
+ horizontal scaling
- vertical scaling
- resource pooling
- measured service
> Adding more servers is horizontal scaling (scale out); a bigger server is vertical scaling (scale up).
? Which NIST characteristic describes many customers sharing the provider's hardware?
- Measured service
+ Resource pooling
- Broad network access
- On-demand self-service
> Multi-tenancy.

=== lesson c05-2 | IaaS, PaaS, SaaS and the Shared Responsibility Model | 25
@analogy Pizza as a service: homemade (on-premises: you do everything), take-and-bake (IaaS: they give you the base, you cook), delivery (PaaS: you just choose toppings and eat), dining out (SaaS: you just eat).
@objectives
- Compare IaaS, PaaS, SaaS (and FaaS) with examples
- Explain the shared responsibility model
- Compare public, private, hybrid and multi-cloud
@body
| Model | You manage | Provider manages | Examples |
|---|---|---|---|
| **IaaS** | OS, runtime, apps, data | hardware, virtualization, network | AWS EC2, Azure VMs |
| **PaaS** | apps and data | + OS, runtime, scaling | AWS Elastic Beanstalk, Azure App Service, Heroku |
| **SaaS** | your data and users | everything else | Microsoft 365, Gmail, Salesforce |
| **FaaS / serverless** | function code | everything incl. scaling to zero | AWS Lambda, Azure Functions |

**Shared responsibility model:** the provider secures **"of" the cloud** (data centres, hardware, hypervisor, global network); you secure **"in" the cloud** (your data, IAM users and permissions, OS patching on IaaS, security groups, encryption choices). Most cloud breaches are customer misconfigurations - a public S3 bucket, an over-permissive security group, leaked access keys.

**Deployment models:**
- **Public cloud** - AWS, Azure, Google Cloud (shared, pay-per-use). AWS (Cape Town, af-south-1) and Microsoft Azure (Johannesburg and Cape Town) have South African regions - important for **POPIA** data-residency and low latency.
- **Private cloud** - dedicated to one organisation (on-prem OpenStack/VMware).
- **Hybrid** - on-prem + public cloud connected (VPN/Direct Connect).
- **Multi-cloud** - more than one public provider.
@terms
- IaaS :: Infrastructure as a Service - rent VMs, storage and networks
- PaaS :: Platform as a Service - deploy code; provider runs the OS and runtime
- SaaS :: Software as a Service - a finished application you use
- Serverless (FaaS) :: Run functions without managing servers; pay per execution
- Shared responsibility model :: Provider secures the cloud itself; customer secures what they put in it
- Hybrid cloud :: On-premises and public cloud working together
- POPIA :: South Africa's Protection of Personal Information Act
@pro
- "Under shared responsibility, AWS secures the infrastructure; we're responsible for IAM, data, and configuration."
@interview A client says "we moved to AWS, so security is Amazon's problem now". How do you respond? :: Politely correct it with the shared responsibility model. AWS secures the physical data centres, hardware and core services, but the client is responsible for everything they configure: IAM users and permissions, MFA, security groups, encryption, patching their EC2 instances, and their data. Most cloud breaches come from customer misconfiguration, not from AWS.
@quiz
? Gmail is an example of...
- IaaS
- PaaS
+ SaaS
- FaaS
> A finished application.
? In IaaS, who patches the guest operating system?
+ The customer
- The provider
- Nobody
- The hypervisor
> You manage the OS in IaaS.
? An S3 bucket is accidentally made public. Whose responsibility was that?
+ The customer's
- AWS's
- The ISP's
- Nobody's
> Configuration is in-the-cloud = customer.

=== lesson c05-3 | Regions, Availability Zones and Cloud Pricing | 20
@analogy A region is a city; availability zones are separate suburbs in that city, each with its own power substation and water supply. Spreading your servers across suburbs means one suburb's blackout doesn't take you down.
@objectives
- Explain regions, availability zones and edge locations
- Design for high availability across AZs
- Compare on-demand, reserved/savings and spot pricing
@body
- **Region** - a geographic area with multiple data centres (e.g. **af-south-1 Cape Town**, eu-west-1 Ireland, us-east-1 N. Virginia). Choose for latency, data-residency law and price.
- **Availability Zone (AZ)** - one or more isolated data centres within a region, with independent power, cooling and networking, connected by low-latency links. Deploy across **at least two AZs** for high availability.
- **Edge locations** - CDN points of presence (CloudFront) close to users for caching.

**Pricing models:**
| Model | Discount | Good for |
|---|---|---|
| On-demand | none | unpredictable, short-term |
| Reserved / Savings Plans (1-3 yr) | up to ~72% | steady 24/7 workloads |
| Spot | up to ~90% | interruptible batch jobs, HPC, CI |

Also: **data transfer OUT** to the internet costs money (in is usually free), storage classes are cheaper the less often you access data, and idle resources still cost money - **tag** everything and set **budgets/alerts**. Cost management is a core cloud-engineer skill (**FinOps**).
@terms
- Region :: Geographic area containing multiple availability zones
- Availability Zone :: Isolated data centre(s) within a region with independent power and networking
- Edge location :: CDN cache site close to end users
- Spot instance :: Spare capacity at a big discount that can be reclaimed with short notice
- Reserved instance / Savings Plan :: Commitment-based discount for steady usage
- FinOps :: Practice of managing and optimising cloud spend
@pro
- "For high availability I spread instances across at least two availability zones behind a load balancer."
@quiz
? What protects an application from the failure of one data centre in a region?
+ Deploying across multiple Availability Zones
- Using a bigger instance
- Using spot instances
- Using one AZ with RAID
> Each Availability Zone has independent power and networking, so running in two or more AZs survives one failing.
? Which pricing is best for an interruptible overnight batch job?
- On-demand
- 3-year reserved
+ Spot
- Dedicated host
> Cheap, can be interrupted.
? Which AWS region is in Cape Town?
+ af-south-1
- eu-west-1
- us-east-1
- ap-south-1
> Opened 2020.

=== boss
? Which is NOT one of NIST's five characteristics?
- Rapid elasticity
- Measured service
+ Guaranteed lowest cost
- Resource pooling
> Cloud is not always cheaper.
? A company runs some systems on-prem and some in Azure, connected by VPN. This is...
+ Hybrid cloud
- Public cloud only
- Private cloud only
- SaaS
> Mixed environments.
? AWS Lambda is an example of...
+ Serverless / FaaS
- IaaS
- SaaS
- A private cloud
> Functions as a Service.
? Why might a South African bank choose af-south-1?
+ Lower latency and data-residency/POPIA requirements
- It is the only AWS region
- It is always cheapest
- Spot instances only exist there
> Location matters.
? Which usually costs money in AWS?
+ Data transfer OUT to the internet
- Data transfer IN from the internet
- Creating an IAM user
- Viewing the console
> Egress is charged.
`;
