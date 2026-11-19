import { chapter } from '../dsl.js';

export default chapter`
@chapter dev.d10 | DevOps 2: Containers, Delivery, Infrastructure as Code and Observability | 10
@sources Microsoft Learn - Containerize a .NET app, .NET container images (non-root, chiseled); Docker docs - multi-stage builds and best practices; GitHub Docs - environments and deployment protection rules; Terraform docs; OpenTelemetry docs; Google SRE book (SLIs, SLOs, error budgets); Azure regions (South Africa North / West)
@story
CI is green on every PR. Now Lindiwe wants new features live the same afternoon - without the 11 p.m. "deployment parties". Phemelo packages the API as a container, lets the pipeline deliver it to staging and production with a safe rollout, describes the servers as code, and makes the system observable so problems are spotted before customers phone in.
@lab dev:ci-pipeline

=== lesson d10-1 | Containerising ASP.NET Core and Flutter Web | 25
@analogy A container image is a sealed lunchbox: the meal (your app), the cutlery (runtime and libraries) and the instructions (start command) packed together, so it tastes the same at home, at school and at your aunt's house. A multi-stage build is cooking in a big messy kitchen but packing only the meal - the pots stay behind.
@objectives
- Write a multi-stage Dockerfile for an ASP.NET Core API
- Apply image best practices: small base, non-root, .dockerignore, tags
- Push to a registry and run with environment configuration
@body
~~~
# ---- build stage: the full SDK (compilers, NuGet) ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY TodoApi/TodoApi.csproj TodoApi/
RUN dotnet restore TodoApi/TodoApi.csproj          # cached layer: only reruns if the csproj changes
COPY . .
RUN dotnet publish TodoApi/TodoApi.csproj -c Release -o /app

# ---- runtime stage: small ASP.NET runtime, no SDK ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
USER app                                          # non-root user built into .NET images
EXPOSE 8080                                       # .NET 8+ images listen on 8080 by default
ENTRYPOINT ["dotnet", "TodoApi.dll"]
~~~
~~~
docker build -t ghcr.io/phemelo/todo-api:1.2 .
docker run -p 8080:8080 -e ConnectionStrings__Default="Host=db;..." ghcr.io/phemelo/todo-api:1.2
docker push ghcr.io/phemelo/todo-api:1.2
~~~
**Best practices:**
- **Multi-stage**: build in the SDK image (~880 MB), ship the runtime image (~220 MB). Even smaller: **chiseled** Ubuntu images (no shell, no package manager) - less to attack.
- **Layer caching**: copy the .csproj and restore before copying the rest, so code changes don't re-download every package.
- **.dockerignore** bin/, obj/, .git, secrets - faster builds, no leaked files.
- **Non-root** (USER app) - if the app is hacked, the attacker isn't root in the container.
- **Configuration from the environment** (12-factor): the same image runs in staging and production with different env vars and secrets.
- **Tags**: immutable tags (git SHA or semantic version), not just :latest - otherwise you can't tell what's running or roll back reliably.
- **Registries**: GitHub Container Registry (ghcr.io), Docker Hub, Azure Container Registry, Amazon ECR.

**Flutter web** builds to static files ([[flutter build web]]) - serve them from an nginx container, a CDN or static hosting. Mobile apps aren't containerised; they're shipped through the stores (and built in CI).
@terms
- Container image :: Packaged app plus runtime and dependencies, run identically anywhere
- Multi-stage build :: Dockerfile with a build stage and a smaller final runtime stage
- Base image :: The image a Dockerfile starts FROM (e.g. dotnet/aspnet:10.0)
- Layer caching :: Docker reuses unchanged layers to speed up builds
- .dockerignore :: Files excluded from the build context
- Chiseled image :: Ultra-small Ubuntu-based image without shell or package manager
- Container registry :: Server storing images (ghcr.io, Docker Hub, ACR, ECR)
- Immutable tag :: A tag like a git SHA that always points to the same image
- 12-factor config :: Keeping configuration in the environment, not the image
@pro
- "Our API image is multi-stage, non-root and tagged with the git SHA."
- "One image, many environments - configuration comes from environment variables and secrets."
@interview How would you make a .NET API Docker image smaller and more secure? :: Use a multi-stage build so the SDK stays in the build stage and only the published output goes into the aspnet runtime image, or a chiseled image with no shell or package manager. Order layers so restore is cached, use a .dockerignore, run as the non-root app user, keep secrets out of the image and inject config via environment variables, scan the image with Trivy in CI, and tag it immutably with the commit SHA.
@lab dev:ci-pipeline
@quiz
? Why use a multi-stage Dockerfile for .NET?
+ Build with the big SDK image, ship only the small runtime image
- It makes the code compile faster on phones
- Docker requires two FROM lines
- To run two apps in one container
> Smaller, safer production images.
? Which tag makes rollbacks and audits reliable?
- :latest
+ An immutable tag such as the git commit SHA
- :prod
- No tag at all
> latest moves; a SHA never does.
? On which port do .NET 8+ container images listen by default?
- 80
- 5000
+ 8080
- 443
> The default changed to 8080 so apps can run as non-root.
? What should NOT be baked into the image?
+ Production passwords and connection strings
- The compiled .dll
- The ASP.NET runtime
- The ENTRYPOINT
> Secrets come from the environment at run time.

=== lesson d10-2 | Continuous Delivery: Environments and Deployment Strategies | 25
@analogy Rolling deployment is replacing the tyres on a moving bus one at a time. Blue-green is having a second identical bus ready and moving all passengers across in one step - and back if the new bus smells funny. Canary is letting a few passengers try the new bus first and watching their faces.
@objectives
- Promote releases through dev, staging and production environments
- Compare rolling, blue-green and canary deployments
- Plan rollbacks and use feature flags
@body
**Environments**: dev -> **staging** (production-like, real config, fake data) -> **production**. GitHub **environments** add protection rules: required reviewers, wait timers and environment-specific secrets - so production credentials are only released to approved jobs.
~~~
deploy-prod:
  needs: deploy-staging
  environment: production          # waits for a reviewer's approval in GitHub
  runs-on: ubuntu-latest
  steps:
    - run: helm upgrade --install todo ./charts/todo-api --set image.tag=SHA_FROM_BUILD
~~~
**Deployment strategies:**
| Strategy | How | Pros | Cons |
|---|---|---|---|
| **Recreate** | Stop old, start new | Simple | Downtime |
| **Rolling** | Replace instances a few at a time | No downtime, default in Kubernetes | Old + new run together briefly |
| **Blue-green** | Run new version beside old, switch traffic at once | Instant switch and rollback | Double resources |
| **Canary** | Send e.g. 5% of traffic to new, watch metrics, increase | Real-user testing with small blast radius | Needs good metrics and routing |

**Rollback plan**: because images are immutable and tagged, rollback = redeploy the previous tag ([[helm rollback]], [[kubectl rollout undo]]). Database changes must be backward-compatible (expand/contract from the EF Core chapter) or rollback breaks.

**Feature flags** separate *deploying* code from *releasing* features: ship the new checkout dark, turn it on for staff, then 10% of customers, then everyone - and switch it off in seconds without a deploy.

**Where to run it** (South Africa has local cloud regions - lower latency and easier POPIA conversations): **Azure** South Africa North (Johannesburg) and South Africa West (Cape Town), **AWS** af-south-1 (Cape Town). Options range from **Azure App Service** (just run my container, PaaS) to **Kubernetes** (AKS/EKS) when you have many services.
@terms
- Environment :: A deployment target such as dev, staging or production
- Staging :: Production-like environment for final testing
- Rolling deployment :: Gradually replacing old instances with new ones
- Blue-green deployment :: Two identical environments; switch traffic from blue to green
- Canary release :: Sending a small share of traffic to the new version first
- Rollback :: Returning to the previous known-good version
- Feature flag :: Toggle that enables a feature without redeploying
- Blast radius :: How many users are affected if something goes wrong
- Deployment protection rule :: Approval/wait required before deploying to an environment
@pro
- "We deploy to staging automatically and production after approval, with a canary watching error rates."
- "Deploying and releasing are different: feature flags let us release without redeploying."
@interview How would you release a risky new payment feature with minimal risk? :: Ship the code behind a feature flag so deployment doesn't change behaviour, deploy through staging to production with the flag off, then enable it for staff, then a small canary percentage of customers while watching error rates, latency and payment success on dashboards. Rollback is flipping the flag off; if the deployment itself misbehaves, redeploy the previous image tag. Any database change goes in backward-compatible expand/contract steps.
@quiz
? Which strategy sends 5% of users to the new version first?
- Recreate
- Blue-green
+ Canary
- Big bang
> Small blast radius, watch metrics, then increase.
? What is Kubernetes' default Deployment strategy?
+ Rolling update
- Recreate
- Blue-green
- Canary
> RollingUpdate replaces pods gradually.
? What separates deploying code from releasing a feature?
- A bigger server
+ Feature flags
- The .gitignore
- Hot reload
> Code can be live but switched off.
? Why must database migrations be backward-compatible for safe rollbacks?
+ The previous app version must still work with the new schema
- EF Core can't roll back
- Databases can't change after launch
- It speeds up queries
> Expand/contract keeps both versions working.

=== lesson d10-3 | Infrastructure as Code and Observability: Logs, Metrics, Traces and SLOs | 30
@analogy Infrastructure as code is the architect's blueprint kept in Git - if the building burns down you rebuild it exactly, and every change to the plans is reviewed. Observability is the building's dashboard of meters, CCTV and alarms: metrics tell you something is wrong, traces show where, and logs tell you why.
@objectives
- Explain Infrastructure as Code with Terraform/Bicep
- Describe the three pillars of observability and OpenTelemetry
- Define SLIs, SLOs and error budgets
@body
**Infrastructure as Code (IaC)** - servers, databases, networks and Kubernetes clusters defined in code, reviewed in PRs and applied by pipelines:
~~~
resource "azurerm_resource_group" "kasi" {
  name     = "rg-kasimarket-prod"
  location = "southafricanorth"          # Johannesburg
}
resource "azurerm_postgresql_flexible_server" "db" { ... }
~~~
- **Terraform/OpenTofu** (any cloud, declarative, plan -> apply, state file), **Bicep** (Azure-native), **Pulumi** (real programming languages), **Ansible** (configuring machines). You practised Terraform in the Cloud stream.
- Benefits: repeatable environments (staging = production), review and history, disaster recovery, no "snowflake" servers that only Sipho understands.
- **GitOps** takes it further for Kubernetes: Git is the source of truth and a controller (Argo CD, Flux) keeps the cluster in sync - next chapters.

**Observability** - can you answer *any* question about your system from the outside?
| Signal | Answers | Tools |
|---|---|---|
| **Metrics** | Is something wrong? (request rate, error rate, latency, CPU) | Prometheus + Grafana, Azure Monitor |
| **Logs** | Why? (structured events) | Loki, Elastic, Seq, Application Insights |
| **Traces** | Where? (one request across app -> API -> DB) | Jaeger, Tempo, Application Insights |
**OpenTelemetry** is the open standard for producing all three; ASP.NET Core and EF Core emit telemetry that OpenTelemetry exports to any back end - add it once, switch vendors later.

The **RED method** for every service: **R**ate, **E**rrors, **D**uration (latency percentiles - p95, p99, not just averages).

**SRE language:**
- **SLI** (indicator) - a measurement: % of order requests succeeding in under 500 ms.
- **SLO** (objective) - the target: 99.5% over 30 days.
- **Error budget** - the allowed 0.5% of failure (about 3.6 hours a month). Budget left -> ship features faster; budget burnt -> freeze risky releases and fix reliability.
- **SLA** - the contractual promise to customers, looser than the SLO.
Alert on **symptoms users feel** (error rate, latency) rather than every CPU spike, and give every alert a runbook.
@terms
- Infrastructure as Code :: Defining infrastructure in version-controlled code applied by tools
- Terraform :: Declarative IaC tool with plan/apply and a state file, for any cloud
- Bicep :: Azure's native IaC language
- Observability :: Ability to understand a system's internal state from its outputs
- Metrics / Logs / Traces :: The three pillars: numbers over time, events, request journeys
- OpenTelemetry :: Vendor-neutral standard and SDKs for metrics, logs and traces
- RED method :: Rate, Errors, Duration - key metrics for every service
- SLI / SLO :: Service level indicator (a measurement) / objective (its target)
- Error budget :: The amount of unreliability an SLO allows before changes must slow down
@pro
- "Every environment is created from Terraform in Git - no snowflake servers."
- "We alert on SLO burn rate, not on every CPU spike."
@interview Customers say the app is "slow sometimes". How would observability help you find the cause? :: Start with metrics: the latency percentiles and error rate per endpoint (RED) show which endpoints are slow and when. Then pick a slow request's distributed trace - OpenTelemetry would show the time spent in the API, EF Core queries and external calls, often revealing an N+1 query or a slow dependency. Logs correlated by trace id explain the details. I'd then set an SLO on that journey so we're alerted before customers notice next time.
@quiz
? Which signal best shows WHERE time is spent across app, API and database for one request?
- Metrics
- Logs
+ Distributed traces
- Backups
> Traces follow a request through every hop.
? Your SLO is 99.9% success per month and you've already used the whole error budget. What should the team do?
+ Pause risky releases and prioritise reliability work
- Release faster to catch up
- Delete the SLO
- Turn off monitoring
> The budget balances speed and reliability.
? What is the main benefit of Infrastructure as Code?
+ Repeatable, reviewable, version-controlled environments
- No cloud bill
- No need for testing
- Faster phones
> Rebuild anything from Git.
? Which open standard lets ASP.NET Core export metrics, logs and traces to any vendor?
- JSON
+ OpenTelemetry
- POPIA
- OAuth
> Instrument once, choose the back end later.

=== boss
? A Dockerfile uses FROM dotnet/sdk:10.0 for the final image. What's wrong?
+ The production image contains the whole SDK - bigger and more attack surface than the aspnet runtime image
- Nothing, it's best practice
- SDK images can't run apps
- It won't build
> Use multi-stage: build in sdk, run in aspnet (or chiseled).
? The new release raises error rates for the 5% of users on it. Which strategy limited the damage?
- Recreate
+ Canary
- Big bang
- Manual FTP
> Canaries limit blast radius.
?? Which are observability signals? (choose all)
+ Metrics
+ Logs
+ Traces
- Commit messages
> The three pillars.
? Where should production database credentials for a GitHub Actions deploy job be stored?
+ In the production environment's secrets, released only after approval
- In the Dockerfile
- In appsettings.json in Git
- In the job name
> Environment secrets + protection rules.
? What is an error budget?
- Money set aside for outages
+ The amount of failure an SLO allows in a period
- The number of bugs allowed per developer
- A CI timeout
> 99.5% SLO -> 0.5% budget.
`;
