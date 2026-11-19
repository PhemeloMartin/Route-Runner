import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c10 | DevOps, CI/CD, Infrastructure as Code and Observability | 10
@sources Software Engineering module (SDLC); this project's own GitHub Actions pipeline, Dockerfile and Kubernetes manifests; HashiCorp Terraform Associate objectives
@story
"How did this game get built and shipped?" Phemelo asks. Lindiwe points to the Route Runner repository: a pipeline tests every change, builds a container image and could deploy it to Kubernetes automatically. "That's DevOps. Not a job title - a way of working where everything is code, everything is automated, and everything is measured."
@lab cloud:iac | Cloud Mission 4 - Terraform + Ansible

=== lesson c10-1 | DevOps, Git and CI/CD Pipelines | 25
@analogy CI/CD is a car factory assembly line. Every part (code change) goes through the same automatic inspection stations (tests, security scans) before it's bolted on (merged) and the car drives off the line (deployed). No hand-built cars, no surprises.
@objectives
- Explain DevOps culture and the DORA metrics
- Use the Git workflow: branch, commit, pull request, merge
- Describe a CI/CD pipeline's stages
@body
**DevOps** joins development and operations: small frequent changes, automation, shared ownership and fast feedback. **DORA metrics** measure it: deployment frequency, lead time for changes, change failure rate, time to restore service.

**Git** - version control for everything (code, configs, infrastructure, even this course):
~~~
git clone https://github.com/PhemeloMartin/Route-Runner.git
git checkout -b feature/new-lab      # work on a branch
git add . && git commit -m "Add HSRP lab"
git push -u origin feature/new-lab   # then open a Pull Request for review
~~~
**CI (Continuous Integration)** - every push triggers: install -> lint -> **test** -> build -> security scan. Broken builds are fixed immediately.
**CD (Continuous Delivery/Deployment)** - the tested artefact (a container image) is released to staging and then production automatically (deployment) or with one approval click (delivery).

Tools: **GitHub Actions** (used by this project - see [[.github/workflows/ci.yml]]), GitLab CI, Jenkins, Azure DevOps. Deployment strategies: rolling, **blue-green** (switch traffic between two identical environments), **canary** (send 5% of users to the new version first).

**Never put secrets in Git** - use the CI system's secret store or a vault.
@terms
- DevOps :: Culture and practices uniting development and operations through automation and collaboration
- Continuous Integration :: Automatically building and testing every change
- Continuous Delivery/Deployment :: Automatically releasing tested changes to environments
- Pull request :: A proposed change reviewed before merging
- Blue-green deployment :: Two identical environments; switch traffic to the new one instantly
- Canary release :: Releasing to a small percentage of users first
@pro
- "Every pull request runs the pipeline - tests, build, scan - before anything reaches main."
@quiz
? Which practice automatically tests every code change when it is pushed?
+ Continuous Integration
- Blue-green deployment
- Manual QA
- Waterfall
> Continuous Integration builds and tests every push automatically, so broken code is caught within minutes.
? Sending 5% of traffic to a new version first is a...
- blue-green deployment
+ canary release
- rollback
- hotfix
> A canary release sends a small share of users to the new version first - like a canary in a coal mine.
? Where should an API key used by the pipeline be stored?
+ In the CI system's encrypted secrets store
- In the Git repository
- In the README
- In the Docker image
> Never in Git.

=== lesson c10-2 | Infrastructure as Code: Terraform and Ansible | 25
@analogy Clicking around a cloud console is like building a house without plans - nobody can rebuild it exactly. Infrastructure as Code is the architect's blueprint: version-controlled, reviewable, and you can build the same house again tomorrow in another city.
@objectives
- Explain IaC benefits and declarative vs procedural tools
- Use the Terraform workflow and understand state
- Use Ansible for configuration management
@body
**Infrastructure as Code (IaC):** infrastructure defined in files, stored in Git, reviewed, tested and applied automatically. Benefits: repeatable environments (dev = prod), no drift, audit history, disaster recovery by re-applying.

**Terraform** (HashiCorp, HCL language, **declarative**, multi-cloud):
~~~
provider "aws" {
  region = "af-south-1"
}
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}
resource "aws_instance" "web" {
  ami           = "ami-0ubuntu2404"
  instance_type = "t3.micro"
}
~~~
Workflow: [[terraform init]] (download providers) -> [[terraform fmt]]/[[terraform validate]] -> [[terraform plan]] (preview: + create, ~ change, - destroy) -> [[terraform apply]] -> [[terraform destroy]]. Terraform keeps a **state file** mapping code to real resources - store it remotely (S3 + locking) for teams, and never edit it by hand. Other IaC: AWS CloudFormation/CDK, Pulumi, Bicep.

**Ansible** - **configuration management** (agentless, SSH, YAML playbooks, **idempotent**: running it twice changes nothing the second time). Terraform *creates* the servers; Ansible *configures* what's inside them (packages, files, users) - and also configures **network devices** (CCNA v2.0).
~~~
- name: Web servers
  hosts: web
  become: true
  tasks:
    - name: Install nginx
      apt: { name: nginx, state: present }
    - name: Ensure nginx is running
      service: { name: nginx, state: started, enabled: true }
~~~
@terms
- Infrastructure as Code :: Managing infrastructure through version-controlled definition files
- Declarative :: Describe the end state; the tool works out the steps
- Terraform state :: File mapping Terraform resources to real-world objects
- terraform plan :: Shows what will change before applying
- Idempotent :: Running the same automation repeatedly gives the same result
- Configuration drift :: Real systems slowly diverging from their documented configuration
@pro
- "I always read terraform plan before apply - it's the change review for infrastructure."
@quiz
? Which Terraform command previews changes without making them?
- init
+ plan
- apply
- destroy
> terraform plan shows exactly what will be created, changed or destroyed - without touching anything.
? Ansible connects to Linux servers using...
+ SSH, with no agent installed
- a Puppet agent
- RDP
- SNMP
> Ansible needs no agent: it logs in over SSH and runs its modules, then leaves.
? What does "idempotent" mean?
+ Running it again makes no further changes once the state is reached
- It runs only once ever
- It is always destructive
- It needs root
> Safe to re-run.

=== lesson c10-3 | Observability: Metrics, Logs and Traces | 20
@analogy Observability is the dashboard, black box and GPS tracker of a car. Metrics are the dashboard gauges (speed, fuel), logs are the black-box recordings of events, traces follow one journey from start to finish across every road.
@objectives
- Explain the three pillars of observability
- Use Prometheus/Grafana concepts and alerting
- Define SLIs, SLOs and error budgets
@body
- **Metrics** - numbers over time (CPU %, requests/s, error rate, latency). **Prometheus** scrapes [[/metrics]] endpoints (Route Runner exposes one: try it!) and **Grafana** draws dashboards. Cloud: CloudWatch, Azure Monitor.
- **Logs** - timestamped events. Centralise them (ELK/OpenSearch, Loki, CloudWatch Logs) so you can search across servers.
- **Traces** - follow a single request through many microservices (OpenTelemetry, Jaeger) to find where time is spent.

**The golden signals:** latency, traffic, errors, saturation.

**SRE terms:** **SLI** (indicator - e.g. % of requests under 300 ms), **SLO** (objective - 99.9% of them each month), **SLA** (contract with penalties), **error budget** (the 0.1% you're "allowed" to fail - spend it on releasing faster; if it's used up, freeze changes and fix reliability).

**Alerting:** alert on symptoms users feel (error rate, latency), route to on-call with clear runbooks, avoid alert fatigue. Remember Network Chapter 17: AI-based baselines can catch anomalies static thresholds miss.
@terms
- Observability :: Understanding a system's internal state from its outputs: metrics, logs, traces
- Prometheus :: Open-source metrics system that scrapes /metrics endpoints
- Grafana :: Dashboard and visualisation tool
- SLO :: Service Level Objective - a reliability target
- Error budget :: Allowed unreliability within an SLO
- Golden signals :: Latency, traffic, errors, saturation
@pro
- "We alert on user-facing symptoms like error rate and latency, measured against our SLOs."
@quiz
? Which tool scrapes metrics from /metrics endpoints?
+ Prometheus
- Terraform
- Ansible
- Git
> Pull-based metrics.
? An SLO of 99.9% availability per 30 days allows roughly how much downtime?
+ About 43 minutes
- About 4 hours
- About 7 days
- Zero
> 0.1% of 43,200 minutes.
? Following one request across many microservices is...
- a metric
- a log
+ a trace
- an alert
> Distributed tracing.

=== boss
? Terraform is primarily used to...
+ provision infrastructure declaratively
- write application code
- monitor CPU usage
- replace Git
> IaC provisioning.
? A change broke production. Which DORA metric measures how fast you recover?
+ Time to restore service
- Deployment frequency
- Lead time
- Code coverage
> Time to restore service (MTTR) measures how quickly you recover from a failure.
? Where should Terraform state be kept for a team?
+ In a remote backend with locking (e.g. S3)
- On one engineer's laptop
- In a public GitHub repo
- In the Docker image
> Shared and locked.
? Which pair is the classic split of responsibilities?
+ Terraform creates servers; Ansible configures them
- Ansible creates servers; Terraform configures them
- Git deploys; Prometheus builds
- Grafana provisions; Jenkins monitors
> Provisioning vs configuration.
? Which is one of the four golden signals?
+ Saturation
- Colour
- Hostname
- Uptime of the CI server
> Latency, traffic, errors, saturation.
`;
