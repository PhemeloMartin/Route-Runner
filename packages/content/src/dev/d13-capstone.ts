import { chapter } from '../dsl.js';

export default chapter`
@chapter dev.d13 | Capstone: Ship Kasi Market End to End | 13
@sources Every chapter of this stream; Microsoft Learn and docs.flutter.dev architecture guides; The Twelve-Factor App (12factor.net); Google SRE workbook; your own Route Runner repository as a real portfolio example
@story
Graduation project. Lindiwe's Kasi Market goes live for real: a Flutter app on Android and the web, an ASP.NET Core API with PostgreSQL, a CI/CD pipeline, and Kubernetes running it all with Helm and GitOps. You'll design it, explain it like an architect, and package it into a portfolio and interview story that gets you hired - as an app developer, a .NET developer or a DevOps/platform engineer.
@lab dev:aspnet-api
@lab dev:flutter-first
@lab dev:ci-pipeline
@lab dev:helm-ship

=== lesson d13-1 | The Architecture: From Tap to Database and Back | 30
@analogy A good architecture diagram is a taxi-route map of the city: where every passenger (request) gets on, which roads (networks) and stops (services) it passes, where the traffic lights (security) are, and where the CCTV (observability) is mounted. If you can draw it and narrate a journey, you understand the system.
@objectives
- Draw and explain the full Kasi Market architecture
- Trace one order through every layer
- Justify technology choices with trade-offs
@body
~~~
 Customer phone (Flutter, Android)        Staff laptop (Flutter web)
        │  HTTPS + JWT                            │  HTTPS + JWT (CORS)
        ▼                                         ▼
 ┌─────────────────── DNS: api.kasimarket.co.za ───────────────────┐
 │  Cloud region: Azure South Africa North (Johannesburg)          │
 │  ┌───────────── Kubernetes (AKS) ───────────────────────────┐   │
 │  │ Gateway/Ingress + TLS (cert-manager)                     │   │
 │  │      │                                                   │   │
 │  │      ▼                                                   │   │
 │  │  todo-api Deployment (3-12 pods, HPA)  ──► Worker (SMS)  │   │
 │  │      │ EF Core          NetworkPolicy: only api -> db    │   │
 │  └──────┼───────────────────────────────────────────────────┘   │
 │         ▼                                                       │
 │  Managed PostgreSQL (backups, private endpoint)                 │
 │  Key Vault (secrets) · Container registry · Monitor/Grafana     │
 └─────────────────────────────────────────────────────────────────┘
 GitHub: PR ─► Actions (build, test, scan) ─► image:sha ─► config repo ─► Argo CD syncs
~~~
**Trace one order:**
1. Customer taps *Place order*; the Flutter form validates, the repository saves it to the local **outbox** (offline-first) and sends POST /orders with a JWT and an **idempotency key**.
2. DNS resolves the API name; TLS is terminated at the gateway; the request is routed to a **Ready** pod.
3. ASP.NET Core middleware: exception handler -> rate limiting -> CORS (web only) -> **authentication** -> **authorization**; model binding validates the DTO (400 with ProblemDetails if bad).
4. The endpoint loads the customer (ownership check - no BOLA), saves the order through EF Core in a transaction, writes an "OrderPlaced" message for the SMS worker, logs a structured event and returns **201 Created**.
5. OpenTelemetry records a trace across API -> database; metrics update the RED dashboard; the SLO burn rate stays green.
6. The app marks the outbox entry as synced and the UI rebuilds from state.

**Choices and trade-offs** (interviewers love these):
- *Flutter vs native* - one team, one codebase, fast UI work; cost: app size and occasional platform-channel work.
- *Minimal APIs* - less ceremony; controllers are fine too in big teams.
- *Managed PostgreSQL vs in-cluster StatefulSet* - pay a bit more, sleep at night (backups, patching handled).
- *Kubernetes vs Azure App Service* - with one API, App Service is simpler and cheaper; Kubernetes pays off with several services and clients. Honest answer: *start simple, grow into Kubernetes*.
@terms
- Architecture diagram :: Picture of components, data flows, boundaries and responsibilities
- Request journey :: The path one request takes through every layer and back
- Managed service :: Cloud-run component (database, cache) where the provider handles operations
- Private endpoint :: Reaching a cloud service over a private network address, not the internet
- Worker service :: Background process handling queued jobs (SMS, emails, reports)
- Trade-off :: Benefit gained at a cost - the core of architecture decisions
- Twelve-Factor App :: Principles for cloud-ready apps: config in env, stateless processes, logs as streams
@pro
- "Let me trace one order from the tap in the Flutter app to the PostgreSQL row and back."
- "We started on App Service and moved to Kubernetes when we had several services - start simple, scale deliberately."
@interview Design the system for a township marketplace app used by 50 000 customers. :: I'd start from the user journeys and constraints - cheap Android phones, expensive data, load-shedding - so a Flutter app that is offline-first with small paginated payloads. Behind it an ASP.NET Core API, stateless and containerised, with JWT auth, ownership checks and rate limiting, backed by managed PostgreSQL with backups in a South African region for latency and POPIA. A worker handles SMS and payments asynchronously. CI/CD on GitHub Actions builds, tests and scans, then deploys through staging to production with canaries; observability via OpenTelemetry with SLOs on ordering. Start on a PaaS, move to Kubernetes with Helm and GitOps when the number of services justifies it.
@quiz
? In the order journey, where should the check "does this order belong to the caller?" happen?
- In the Flutter app only
+ In the API, using the user id from the validated token
- In the Ingress
- In the database backup
> Server-side ownership checks prevent BOLA.
? Why does the app send an idempotency key with POST /orders?
+ So a retry after a dropped connection doesn't create a duplicate order
- To compress the request
- To bypass validation
- To choose the database
> Safe retries on flaky networks.
? With only one small API and no ops team, the simplest hosting choice is usually:
- A self-managed Kubernetes cluster on bare metal
+ A PaaS such as Azure App Service, moving to Kubernetes when needs grow
- Copying files with FTP
- Running it on a developer laptop
> Start simple; adopt Kubernetes when it pays off.
?? Which belong in the Kasi Market production design? (choose all)
+ TLS at the gateway and HTTPS everywhere
+ Secrets in Key Vault, injected at run time
+ Managed PostgreSQL with automated backups
- The database password in the Flutter app's source code
> Never ship secrets to clients.

=== lesson d13-2 | Build Plan, Definition of Done and Your Portfolio | 25
@analogy A portfolio is the showroom of a car dealer. Customers don't read the engineering manuals - they open the doors, start the engine and take a test drive. Your GitHub repo, live demo and README are the showroom; recruiters spend about a minute there, so the first impression must start the engine.
@objectives
- Plan the capstone in vertical slices with a Definition of Done
- Assemble a portfolio repository recruiters can evaluate in minutes
- Map skills to roles and certifications in South Africa
@body
**Build it in vertical slices** (each one usable end to end), not layer by layer:
1. *Slice 1* - list products: API GET /products (EF Core + SQLite) -> Flutter list screen -> tests -> CI.
2. *Slice 2* - place order with validation and 201 Created; offline outbox.
3. *Slice 3* - login with JWT, ownership checks, rate limiting.
4. *Slice 4* - Dockerfile, Helm chart, deploy to a kind/AKS cluster, health probes, HPA.
5. *Slice 5* - observability (OpenTelemetry, dashboards, one SLO), GitOps with Argo CD.

**Definition of Done** for every slice: code reviewed in a PR, unit + integration tests green in CI, no new security findings, deployed to staging automatically, README updated, demo recorded.

**Portfolio checklist** (your Route Runner repo already shows many of these!):
- A README with a one-paragraph pitch, a **screenshot or GIF**, an architecture diagram and "how to run it in one command".
- A **green CI badge**, tests, a Dockerfile, Helm chart or Kubernetes manifests.
- Clean commit history and PRs (even solo - show the workflow).
- A **live demo** (Flutter web build, a hosted API) and an APK or Play internal-testing link.
- A short **ADR** folder (Architecture Decision Records: "We chose PostgreSQL because...") - it shows senior thinking.
- No secrets in the history (run gitleaks before you share).

**Roles in South Africa** this stream prepares you for: *Junior Flutter / Mobile Developer*, *Junior .NET Developer* (banks, insurers, retailers and consultancies in Johannesburg, Cape Town and Durban use .NET heavily), *DevOps / Cloud Engineer*, *Platform Engineer*. Many companies hire graduates through learnerships and graduate programmes - your portfolio is the differentiator.

**Certification path** (pick by target role): GitHub Foundations -> GitHub Actions; KCNA (done via LFS250) -> **CKAD** -> CKA -> CKS; Microsoft Azure certifications such as AZ-900 (fundamentals) and the Azure developer/DevOps associate exams (check Microsoft Learn for current exam codes - they change). Flutter has no official certification; published apps are your proof.
@terms
- Vertical slice :: A small feature built through every layer, usable end to end
- Definition of Done :: Agreed checklist a piece of work must meet to count as finished
- ADR :: Architecture Decision Record - short document explaining a significant decision
- CI badge :: README image showing the current pipeline status
- Learnership :: South African structured work-and-learn programme, often a graduate entry route
- Demo :: A live or recorded walk-through that proves the software works
@pro
- "I build in vertical slices, and nothing is done until it's tested, reviewed and deployed by the pipeline."
- "My README lets a reviewer understand, run and judge the project in five minutes."
@interview Tell me about a project you're proud of. :: Use STAR: Situation - a township marketplace needed ordering that works on cheap phones and bad networks. Task - I built the Flutter app, the ASP.NET Core API and the delivery pipeline. Action - offline-first app with an outbox and idempotent API, EF Core with migrations, JWT auth with ownership checks, GitHub Actions running tests and scans, a Docker image deployed with Helm to Kubernetes with probes, autoscaling and OpenTelemetry. Result - green pipeline on every PR, rollbacks in one command, and I can show the repo, the live demo and the dashboards.
@quiz
? Which plan delivers value soonest and reduces risk?
+ Vertical slices that each work end to end
- Build the whole database first, then the whole API, then the whole app
- Write all tests at the end
- Deploy once at the end of the year
> Slices give working software early and feedback often.
? What is an ADR?
+ A short record of an architecture decision and its reasons
- An Android Debug Report
- A Docker registry
- A type of Kubernetes probe
> Architecture Decision Record.
? What should a recruiter see first in your repository?
+ A clear README with screenshot/demo, architecture and one-command setup
- 400 commits named "update"
- The node_modules folder
- An empty repo with a promise
> First impressions in under a minute.
? Which certification matches the Kubernetes skills of the last two chapters for a developer?
+ CKAD
- CCNA
- AZ-900 only
- KCNA only
> Certified Kubernetes Application Developer - hands-on.

=== boss
? A request reaches a pod that is Running but not Ready. What happens?
+ It doesn't - not-Ready pods are removed from Service endpoints
- It is processed normally
- The pod restarts
- The Ingress caches it
> Readiness gates traffic.
? Customers on 3G complain the order list takes ages. Which combination helps most?
+ Pagination + projection to DTOs + offline cache on the phone
- Bigger Kubernetes nodes only
- Removing TLS
- Returning the full database
> Small payloads and local caching.
?? Which belong in the Definition of Done? (choose all)
+ Reviewed in a PR
+ Tests green in CI
+ Deployed to staging by the pipeline
- "Works on my machine"
> Done means shippable.
? The interviewer asks "why Kubernetes?" for one tiny API. Best answer?
+ It may be overkill - start with a PaaS and move when multiple services and teams justify it
- Kubernetes is always required
- Because it's on my CV
- To avoid writing tests
> Show judgement, not hype.
? What proves your Flutter skills best, given there's no official certification?
+ Published apps and a public repository with tests and CI
- A screenshot of hello world
- Watching tutorials
- A certificate from an unrelated course
> Evidence beats claims.
`;
