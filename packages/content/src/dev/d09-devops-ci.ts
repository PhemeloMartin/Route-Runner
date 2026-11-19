import { chapter } from '../dsl.js';

const $ = '$';

export default chapter`
@chapter dev.d09 | DevOps 1: Culture, Continuous Integration and GitHub Actions | 9
@sources DORA / Google Cloud "Accelerate State of DevOps" reports and dora.dev metrics; Forsgren, Humble & Kim - Accelerate; GitHub Docs - Understanding GitHub Actions, workflow syntax, secrets, environments; nektos/act README; your LFS courses
@story
Every Friday Sipho "deploys" by copying files to the server with FileZilla. Twice this month the app broke and nobody knew which change did it. Lindiwe asks Phemelo: "How do the big companies ship many times a day without breaking things?" The answer is DevOps: a culture plus automation where every change is built, tested and delivered by a pipeline - the same way, every time.
@lab dev:ci-pipeline | DevOps Mission - fix the workflow and turn the pipeline green

=== lesson d09-1 | What DevOps Really Is: Culture, CALMS and the DORA Metrics | 25
@analogy Old-style IT is a relay race where developers throw the baton over a wall to operations and run away. DevOps is a soccer team: everyone shares the same goal (working software for customers), passes constantly, and the scoreboard (metrics) is visible to all.
@objectives
- Define DevOps as culture + practices + tools
- Explain CALMS and the four key DORA metrics
- Describe CI, continuous delivery and continuous deployment
@body
**DevOps** joins development and operations so teams can deliver changes **quickly and reliably**. It is not a job title or a tool you install - it's a way of working, supported by automation.

**CALMS** - the five ingredients:
- **Culture** - shared ownership, blameless post-mortems ("what failed in our system?", not "who failed?").
- **Automation** - builds, tests, infrastructure and deployments done by pipelines, not by hand.
- **Lean** - small batches, limit work in progress, remove waste (waiting, hand-offs).
- **Measurement** - decisions from data (metrics, logs, user analytics).
- **Sharing** - knowledge, tools and on-call duty shared between dev and ops.

**The DORA metrics** (from years of research by Google's DevOps Research and Assessment team) measure delivery performance:
| Metric | Question | Elite teams |
|---|---|---|
| **Deployment frequency** | How often do we deploy to production? | On demand, many times a day |
| **Lead time for changes** | Commit -> running in production? | Less than a day |
| **Change failure rate** | % of deployments causing a failure | Low |
| **Time to restore service** | How fast do we recover from a failure? | Less than an hour |
The research's big finding: **speed and stability go together**. Small, frequent, automated changes are *safer* than big monthly releases.

**The pipeline vocabulary:**
- **Continuous Integration (CI)** - every push is automatically built and tested; main is always green.
- **Continuous Delivery** - every green build *could* go to production at the push of a button (artefact ready, deploy automated).
- **Continuous Deployment** - every green build *does* go to production automatically.
Plus **shift-left**: run tests and security scans as early as possible - a bug caught in a PR costs minutes; in production it costs customers.
@terms
- DevOps :: Culture and practices uniting development and operations to deliver quickly and reliably
- CALMS :: Culture, Automation, Lean, Measurement, Sharing
- DORA metrics :: Deployment frequency, lead time, change failure rate, time to restore
- Lead time for changes :: Time from commit to running in production
- Change failure rate :: Percentage of deployments that cause a failure
- Continuous Integration :: Automatically building and testing every change
- Continuous Delivery :: Every green build is ready to deploy at the push of a button
- Continuous Deployment :: Every green build deploys to production automatically
- Blameless post-mortem :: Incident review focused on system fixes, not blaming people
- Shift-left :: Doing testing and security earlier in the delivery process
@pro
- "We track the four DORA metrics; small, frequent releases improved both our speed and our stability."
- "Our post-mortems are blameless - we fix the system, not the person."
@interview What is the difference between continuous delivery and continuous deployment? :: Both start with continuous integration and an automated pipeline. With continuous delivery every change that passes the pipeline is releasable and production deployment is one manual approval or button press away. With continuous deployment there is no manual gate: every change that passes all automated checks is deployed to production automatically, which demands very strong automated testing and monitoring.
@quiz
? Which is NOT one of the four key DORA metrics?
- Deployment frequency
- Change failure rate
+ Lines of code written per day
- Time to restore service
> DORA measures delivery outcomes, not activity.
? Every green build is automatically released to production. This is:
- Continuous integration only
- Continuous delivery
+ Continuous deployment
- Waterfall
> Deployment = automatic release.
? What does DORA's research say about speed and stability?
+ High performers achieve both - they go together
- You must trade one for the other
- Stability always comes from fewer releases
- Neither can be measured
> Small automated changes are faster AND safer.
? A blameless post-mortem focuses on:
- Finding who to fire
+ Understanding how the system allowed the failure and fixing it
- Hiding the incident from customers
- Writing more documentation only
> Psychological safety leads to honest learning.

=== lesson d09-2 | GitHub Actions: Workflows, Jobs, Steps and Runners | 30
@analogy A workflow is a recipe card pinned in the kitchen. The trigger (on) says when to cook (every new order = every push). Jobs are separate cooks working at the same time on different stoves (runners); steps are the lines of the recipe each cook follows in order. needs: says "don't plate the dessert until the main course is done".
@objectives
- Read and write a GitHub Actions workflow file
- Use triggers, jobs, needs, runners, actions and run steps
- Use secrets, environment variables and matrix builds
@body
Workflows live in **.github/workflows/*.yml** in the repo:
~~~
name: CI
on:
  push:
    branches: [main]
  pull_request:            # every PR gets checked

jobs:
  api:
    runs-on: ubuntu-latest           # a fresh VM (runner) per job
    steps:
      - uses: actions/checkout@v4                      # an ACTION: reusable step
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: 10.0.x
      - name: Build
        run: dotnet build --configuration Release      # a RUN step: shell commands
      - name: Test
        run: dotnet test --no-build --configuration Release

  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
      - run: flutter pub get
        working-directory: mobile
      - run: flutter analyze && flutter test
        working-directory: mobile

  image:
    needs: [api, app]                 # only after BOTH jobs passed
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${$}{{ github.actor }}
          password: ${$}{{ secrets.GITHUB_TOKEN }}
      - run: docker build -t ghcr.io/phemelo/todo-api:${$}{{ github.sha }} . && docker push ghcr.io/phemelo/todo-api:${$}{{ github.sha }}
~~~
Key ideas:
- **on** - triggers: push, pull_request, schedule (cron), workflow_dispatch (manual button), release.
- **Jobs run in parallel** on separate **runners** unless linked with **needs**. Each runner starts clean, so a job must check out code and install tools itself. Pass files between jobs with **artifacts** (upload-artifact / download-artifact).
- **Actions** ([[uses: owner/repo@version]]) are reusable steps from the Marketplace. Pin versions (and for high security, pin to a commit SHA).
- **Expressions** in double curly braces read **contexts**: github.sha, github.ref, secrets.NAME, matrix.x.
- **Secrets** are stored encrypted in repo/org settings and masked in logs. **GITHUB_TOKEN** is created automatically per run; grant it only the **permissions** a job needs.
- **Matrix** builds test many versions at once - for example a strategy.matrix listing dotnet versions 8.0.x and 10.0.x runs the job twice in parallel.
- **Caching** (actions/cache, or built into setup actions) avoids re-downloading NuGet/pub packages - faster pipelines.

**Run it locally**: the open-source tool **act** runs your workflows in Docker on your own PC - perfect for debugging YAML before you push. The Dev Studio lab has it.
@terms
- Workflow :: An automated process defined in YAML under .github/workflows
- Trigger (on) :: Event that starts a workflow: push, pull_request, schedule, manual
- Job :: A set of steps that runs on one runner; jobs run in parallel by default
- Step :: One action (uses) or shell command (run) inside a job
- Runner :: The machine (VM/container) that executes a job, e.g. ubuntu-latest
- Action :: Reusable step referenced as owner/repo@version
- needs :: Makes a job wait for other jobs to succeed
- Secret :: Encrypted value (token, password) available to workflows and masked in logs
- Matrix :: Running a job across combinations such as several SDK versions
- Artifact :: Files saved from a job to download later or pass to another job
@pro
- "Every PR runs the same pipeline: restore, build, analyze, test - main is never red."
- "Jobs get least-privilege GITHUB_TOKEN permissions and actions are pinned to versions."
@interview Your workflow has jobs build, test and deploy. deploy must only run after the others succeed and only on main. How? :: Give deploy needs: [build, test] so it waits for both and is skipped if either fails, and an if condition that github.ref equals refs/heads/main so pull requests never deploy. I'd also put it behind a GitHub environment such as production with required reviewers, so deployment secrets are only released after approval.
@lab dev:ci-pipeline
@quiz
? Where do GitHub Actions workflow files live?
- /workflows in the root
+ .github/workflows/*.yml
- .git/hooks
- Any folder called ci
> GitHub only reads .github/workflows.
? Two jobs have no needs: between them. How do they run?
+ In parallel on separate runners
- One after the other in file order
- On the same runner, sharing files
- Only when manually started
> Use needs: to create order and dependencies.
? Which line runs shell commands in a step?
- uses:
+ run:
- with:
- needs:
> uses = action; run = commands.
? A job fails with "dotnet: command not found" on ubuntu-latest. Most likely fix?
+ Add actions/setup-dotnet with the right dotnet-version before building
- Add needs: dotnet
- Use runs-on: dotnet
- Rename the workflow
> Each runner starts clean; install the SDK version you need (and pin it).

=== lesson d09-3 | Designing a Good Pipeline: Fast Feedback, Quality Gates and Security | 25
@analogy A good pipeline is a factory line with quality inspectors at each station - cheap, quick checks first (is the part the right size?), expensive checks later (crash test). A car that fails at station two never wastes time at station nine, and nothing leaves the factory without passing every inspector.
@objectives
- Order pipeline stages for fast feedback
- Add quality gates: tests, coverage, linting, scanning
- Apply DevSecOps basics to CI
@body
**A typical pipeline for Kasi Market:**
~~~
PR opened ─► restore + build ─► lint/analyze ─► unit tests ─► integration tests ─► security scans
                                                                                        │
merge to main ─► build image once (tag = git SHA) ─► push to registry ─► deploy to staging ─► smoke tests ─► (approval) ─► production
~~~
**Principles:**
- **Fast feedback**: the PR pipeline should finish in under ~10 minutes. Run cheap checks first, cache dependencies, run independent jobs in parallel.
- **Build once, deploy many**: build the Docker image once, tag it with the commit SHA, and promote the *same* image through staging and production. Never rebuild for production - you'd ship something you didn't test.
- **Quality gates** block the merge: build, tests, [[flutter analyze]] / analyzers, code coverage threshold, required review.
- **Flaky tests** (pass/fail randomly) destroy trust in the pipeline - quarantine and fix them fast.
- **Reproducible**: pin SDK versions (global.json for .NET, a Flutter version in CI), use lock files.

**DevSecOps** - security inside the pipeline, not after it:
| Check | Finds | Example tools |
|---|---|---|
| **Secret scanning** | Keys committed by accident | GitHub secret scanning + push protection, gitleaks |
| **Dependency scanning (SCA)** | Packages with known CVEs | Dependabot, dotnet list package --vulnerable |
| **SAST** | Insecure code patterns | CodeQL, SonarQube |
| **Container scanning** | Vulnerable OS packages in images | Trivy, Grype |
| **SBOM** | What's inside your software | Syft, dotnet CycloneDX |
| **DAST** | Running app weaknesses | OWASP ZAP against staging |

**Branch protection + required checks** turn all of this into a rule: no green pipeline, no merge.
@terms
- Pipeline stage :: A step of the delivery process (build, test, scan, deploy)
- Quality gate :: A check that must pass before code can merge or deploy
- Build once, deploy many :: Promote the same tested artefact through every environment
- Flaky test :: A test that passes and fails without code changes
- DevSecOps :: Integrating security checks into the DevOps pipeline
- SAST :: Static analysis of source code for security flaws
- SCA :: Software Composition Analysis - finding vulnerable dependencies
- SBOM :: Software Bill of Materials - inventory of components in a build
- Smoke test :: Quick check that a deployment basically works
@pro
- "We build the image once, tag it with the git SHA and promote that exact image to production."
- "Security runs in the pipeline: secret scanning, Dependabot, CodeQL and Trivy are required checks."
@interview Why should you not rebuild the Docker image separately for production? :: Because then production runs an artefact that was never tested - a dependency or base image may have changed between builds. Building once, tagging with the commit SHA and promoting the same immutable image through staging to production guarantees that what passed the tests is exactly what customers run, and makes rollbacks a matter of redeploying a previous tag.
@quiz
? Which check should run FIRST in a PR pipeline?
+ Fast ones like build and lint
- A 40-minute end-to-end test suite
- Production deployment
- Load testing
> Fail fast and cheap.
? What does "build once, deploy many" mean?
- Build a new image for every environment
+ Promote the same tested artefact (e.g. image tagged with the SHA) through all environments
- Deploy only once per year
- Build on the developer laptop
> Test what you ship, ship what you tested.
? Which tool finds vulnerable OS packages inside a container image?
- CodeQL
+ Trivy
- xUnit
- go_router
> Container image scanning.
?? Which are DevSecOps practices? (choose all)
+ Secret scanning with push protection
+ Dependency (SCA) scanning such as Dependabot
+ SAST such as CodeQL
- Disabling tests to speed up the pipeline
> Security as code, early and automated.

=== boss
? A deploy job must wait for test to pass. Which keyword?
- uses
+ needs
- with
- matrix
> needs: [test]
? Which DORA metric measures how long a commit takes to reach production?
- Deployment frequency
+ Lead time for changes
- Change failure rate
- Mean time between failures
> Lead time.
? Where should the registry password used by a workflow live?
- In the YAML file
+ In GitHub Actions secrets (or use the built-in GITHUB_TOKEN)
- In the README
- In a public gist
> Secrets are encrypted and masked.
? The pipeline randomly fails 1 in 5 runs on the same commit. What is it, and what do you do?
+ A flaky test - quarantine it and fix the cause (timing, shared state)
- Normal behaviour, just re-run forever
- A compiler bug - switch languages
- A sign to remove CI
> Flaky tests destroy trust in the pipeline.
? Every green build automatically goes live. Which practice is this?
- Continuous integration
- Continuous delivery
+ Continuous deployment
- Manual release
> No human gate.
`;
