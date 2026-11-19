# Route Runner

**A 3D learning game that trains one person - Phemelo - to become a Network Engineer (CCNA), a Cloud Engineer, an App & DevOps Engineer (Flutter, ASP.NET Core, CI/CD, Kubernetes) and a disciplined Forex Trader.** Walk a smooth, realistically lit island, enter buildings, take lessons, fight chapter bosses, configure simulated Cisco routers, administer Linux servers, build and call ASP.NET Core APIs, create Flutter apps, run GitHub Actions pipelines, ship with Helm to Kubernetes, build server racks, and practise trading on real market data. It runs completely offline and saves your progress after every action.

![stack](https://img.shields.io/badge/TypeScript-strict-3178c6) ![tests](https://img.shields.io/badge/tests-69%20passing-22c55e) ![offline](https://img.shields.io/badge/works-offline-0ea5e9) ![ccna](https://img.shields.io/badge/CCNA-v2.0%20aligned-1d4ed8)

---

## Play it (Windows)

```cmd
git clone https://github.com/PhemeloMartin/Route-Runner.git
cd Route-Runner
setup.cmd          :: once, needs internet: installs, builds, downloads market data, registers the command
play.cmd           :: every day after that - works offline
```

After setup you can type `route-runner play` in **any** cmd window. Other commands:

| Command | What it does |
|---|---|
| `route-runner play` | starts the local game server and opens the game in your browser |
| `route-runner status` | your level, streak and today's quest - right in the terminal |
| `route-runner backup` | copies your save database to the current folder |
| `route-runner where` | shows where the save file lives (`%LOCALAPPDATA%\RouteRunner`) |

Requirements: Node.js 20+ (LTS) and a modern browser. No database server, no Docker and no C++ build tools are needed.

**Controls:** `W A S D` walk · `Shift` run · `Space` jump · drag the mouse to look · wheel to zoom · `E` enters the building in front of you · `Esc` closes a window.

**Graphics:** the world uses physically based lighting, soft shadows, a sky that follows real South African time, reflective glass and water, wind-blown grass and trees, and (on High/Ultra) a bloom glow on lights. **Auto** picks a level for your graphics chip (Medium on laptops with built-in Intel/AMD graphics) and steps down by itself if the frame rate drops; change it in Phemelo's Room -> Settings. Add `?time=20` to the URL to preview night, or `?gfx=low` to force a level.

---

## What's inside

| Building | What you learn and do |
|---|---|
| 🌐 **Network Academy** | 20 chapters (59 lessons) from "how a computer works" to CCNA v2.0: OSI, Ethernet, IOS, IPv4, subnetting/VLSM, IPv6, TCP/UDP, VLANs, STP/EtherChannel, static routing and OSPF, wireless, DHCP/DNS/NAT/HSRP/QoS, security and ACLs, AI and automation, data centres, troubleshooting |
| 🔌 **Packet Lab** | 3D lab bench of routers, switches and PCs. Click ports to cable them, then configure real **Cisco IOS commands** (modes, abbreviations, `?` help). Covers VLANs, trunks, router-on-a-stick, static routes, OSPF, DHCP and relay, NAT/PAT, ACLs, HSRP, STP, EtherChannel and SSH. 15 missions, including troubleshooting tickets and a capstone, plus a sandbox |
| 📱 **App Studio** | **App & DevOps Engineer** stream - 13 chapters (37 lessons, 214 questions): C# and Dart foundations, Git and pull requests, **Flutter** (widgets, layout, state with Provider/Riverpod/BLoC, go_router, forms, APIs, offline-first, testing, Play Store), **ASP.NET Core on .NET 10** (minimal APIs and controllers, DI, middleware, config, **EF Core** and migrations, JWT auth, OWASP, testing, health checks), **DevOps** (DORA, GitHub Actions, DevSecOps, Docker, deployment strategies, IaC, OpenTelemetry, SLOs) and a **Kubernetes deep dive** (probes, resources, HPA, Secrets, StatefulSets, Ingress/Gateway API, NetworkPolicy, RBAC, Helm, GitOps) ending in a full-system capstone |
| 🧑‍💻 **Dev Studio** | A developer terminal with simulated **`dotnet`** (new/build/run/test/add package/ef migrations/publish - running APIs answer `curl`, including POST/PUT/DELETE), **`flutter`/`dart`** (create, pub add, analyze, test, run with a phone preview, build apk), **`helm`** (repos, install/upgrade/rollback on the simulated cluster) and **`act`** (runs your GitHub Actions workflow - every `run:` step really executes). 5 missions: first API, EF Core database, Kasi Market Flutter app, green pipeline, ship with Helm |
| ☁️ **Cloud Tower** | 12 chapters (34 lessons): Linux, virtualization, cloud concepts, AWS (IAM, EC2, S3, VPC), Docker, Kubernetes, DevOps/CI/CD/IaC/observability, HPC, security and cost, career |
| 🐧 **Server Room** | Ubuntu 24.04 shell simulator: files, permissions, users, apt, systemd, netplan, UFW, SSH keys, scripts and pipes. Includes a **VirtualBox-style VM Manager** with NAT, bridged, host-only and internal modes, plus snapshots |
| ☸️ **CloudShell** | Simulated `docker`, `kubectl`, `aws` (af-south-1), `terraform` and `ansible`, plus a **3D Kubernetes cluster view**: watch pods heal and reschedule when you crash a node |
| 🧮 **Supercomputer** | HPC login node: Slurm (`sbatch`, `squeue`, `sinfo`), environment modules, MPI and GPUs |
| 🗄️ **Data Centre** | 3D 42U rack builder graded on best practice, with a hot/cold-aisle airflow and temperature view |
| 🖥️ **PC Workshop** | 3D PC assembly where every part explains itself, followed by a POST/boot sequence and case airflow |
| 🧵 **Cable Bench** | Crimp RJ45 to T568A/B and choose the right cable for each job |
| 📈 **Trading Floor** | 10-chapter forex course (29 lessons) for absolute beginners. **Real ECB exchange rates** for 13 pairs including USD/ZAR, candlestick charts with SMA/RSI/S-R/patterns, **bar replay**, a demo account with stop-loss and take-profit, risk-first order ticket, trade journal, calculators, and a session clock in SAST |
| 🎓 **Exam Hall** | CCNA mock exams weighted by the **v2.0 blueprint** domains, endless subnetting/binary/IPv6/port/forex-maths drills, and spaced-repetition flashcards (985 cards, SM-2) |
| 🏠 **Phemelo's Room** | Character customisation, ranks per stream, streak heatmap, achievements, settings, save export/import |

Learning loop: **lesson** (plain English with an analogy, key terms, "say it like a pro" lines with read-aloud, and an interview question to practise speaking) -> **quiz** -> **lab** -> **boss battle** -> **flashcards and drills** -> **mock exams**. Every step earns XP, and a daily quest plus streak keep you coming back.

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser["Browser - React 18 + Three.js (React Three Fiber)"]
    W[3D world & HUD] --> P[Panels: lessons, labs, trading, exams]
    P --> E["@route-runner/engine<br/>IOS - packet sim - Linux shell<br/>Docker/K8s/AWS/Terraform/Slurm<br/>dotnet/Flutter/Helm/act<br/>forex maths - SRS - drills"]
    P --> C["@route-runner/content<br/>159 lessons - 810 questions<br/>31 labs - hardware data"]
  end
  P -- "REST /api (JSON)" --> S["Fastify server<br/>Zod validation"]
  S --> G[Game service: XP ledger, achievements,<br/>streaks, SRS, labs, saves]
  S --> M[Market service]
  G --> D[("SQLite (sql.js / WASM)<br/>atomic writes + daily backups")]
  M --> D
  M -. "when online" .-> F[(ECB rates via frankfurter.dev)]
  S --> O["/healthz /readyz /metrics"]
```

- **The simulators run in the browser** as pure TypeScript, so labs respond instantly and work offline. The server persists lab state as JSON.
- **The content is code**: lessons are written in a small text format (`packages/content/src/dsl.ts`) and parsed into typed objects. Tests check that every lesson, question and lab link is complete.
- See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for design decisions and the database model, and **[docs/STUDY-PLAN.md](docs/STUDY-PLAN.md)** for the 13-week plan.

### Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere | one language, shared types between client, server, engines and content |
| 3D | three.js, @react-three/fiber, drei | declarative 3D in React; every model is procedural, so no asset downloads are needed offline |
| UI state | React 18, Zustand | small and predictable |
| Charts | TradingView lightweight-charts | an industry-standard financial charting library |
| API | Fastify 5, Zod | fast, schema-validated input, easy to test with `inject()` |
| Database | SQLite via sql.js (WebAssembly) | embedded, ACID, zero-install, and no native compiler needed on Windows |
| Tests | Vitest (60 tests) | engine scenarios, API integration, curriculum integrity |
| Build | Vite (client), esbuild (server bundle), npm workspaces | fast builds |
| Ops | Docker multi-stage (non-root, healthcheck), docker-compose, Kubernetes + Kustomize, GitHub Actions | production-style delivery |
| Observability | `/healthz`, `/readyz`, Prometheus `/metrics`, structured logs (pino) | probes and scraping out of the box |

---

## Develop

```bash
npm install
npm run dev          # server on :7420 (tsx watch) + Vite on :5173 with an /api proxy
npm test             # 60 tests
npm run typecheck    # all four projects
npm run build        # production client + bundled server
npm run market:seed  # refresh data/seed/market.json with the latest ECB rates
npm run content:check
```

Repository layout:

```
apps/client        React + R3F game (world/, panels/, ui/)
apps/server        Fastify API, SQLite data layer + migrations, market & game services
packages/engine    simulators: net/ ios/ host/ shell/ cloud/ forex/ learning/
packages/content   curriculum (network/ cloud/ forex/), labs, achievements, DSL parser
bin/route-runner.mjs   command-line launcher
deploy/k8s         Kubernetes manifests (kubectl apply -k deploy/k8s)
data/seed          bundled real market data for offline play
```

## Run in a container or on Kubernetes

```bash
docker compose up -d                       # http://localhost:7420, data in a named volume
kubectl apply -k deploy/k8s                # namespace, PVC, Deployment (probes, limits, non-root), Service, Ingress, NetworkPolicy
```

The save game is one SQLite file, so the Deployment runs **one replica with `strategy: Recreate`** on a ReadWriteOnce volume. A multi-user version would swap the data layer for PostgreSQL; the repository layer is isolated in `apps/server/src/services` to make that change straightforward.

## Honesty notes

- The network, Linux and cloud tools are **simulators** built to teach real commands and real behaviour, not full emulators. Confirm anything important on real gear or a VM; the VMware Workstation installer and Ubuntu ISO you already own are ideal.
- CCNA v1.1 is available until 2 Feb 2027 and v2.0 starts 3 Feb 2027. Check Cisco's official exam-topics PDF before booking.
- Market data is real (ECB reference rates, one fix per day), but candles are built from daily fixes, so a broker's intraday highs and lows will differ.
- **The forex content is education, not financial advice.** Trade demo first, and only ever use an FSCA-authorised broker with money you can afford to lose.

## License

MIT © Phemelo Martin Mashome
