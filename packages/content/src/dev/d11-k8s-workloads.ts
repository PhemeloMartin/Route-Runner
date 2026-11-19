import { chapter } from '../dsl.js';

export default chapter`
@chapter dev.d11 | Kubernetes Deep Dive 1: Running Apps Properly | 11
@sources kubernetes.io docs - Deployments, Pod lifecycle and probes, Resource management, Horizontal Pod Autoscaling, ConfigMaps, Secrets, StatefulSets, DaemonSets, Jobs; CNCF CKAD and CKA curricula; LFS158 / LFS250 (your certificates); the Cloud stream chapter on Kubernetes basics
@story
Kasi Market now has an API, a background worker that sends SMS receipts, a PostgreSQL database and a nightly report job. Lindiwe's IT partner runs a small Kubernetes cluster for several clients. You already know pods, Deployments and Services from the Cloud stream - now you'll run apps the way production teams do: health checks, resource limits, autoscaling, configuration and the right workload type for every job. This is CKAD territory.
@lab dev:helm-ship | Kubernetes Mission - ship the Todo API with Helm, break it, roll it back
@lab k8s3d:k8s-deploy | Cloud Mission - deploy, break, heal, scale (3D cluster view)

=== lesson d11-1 | Deployments in Depth: Rollouts, Probes and Resources | 30
@analogy A Deployment is a shift manager with rules: "always 4 cashiers on duty; when the new uniform arrives, swap one cashier at a time; don't put anyone at a till until they've logged in (readiness); if someone faints, replace them (liveness); and every cashier gets exactly one chair and one till (resources)."
@objectives
- Write a production-grade Deployment with probes and resources
- Perform, watch, pause and undo rollouts
- Explain requests, limits, QoS classes, OOMKilled and CPU throttling
@body
~~~
apiVersion: apps/v1
kind: Deployment
metadata:
  name: todo-api
  labels: { app: todo-api }
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }   # never drop below 3 ready pods
  selector:
    matchLabels: { app: todo-api }
  template:
    metadata:
      labels: { app: todo-api }
    spec:
      containers:
        - name: api
          image: ghcr.io/phemelo/todo-api:1.2
          ports: [{ containerPort: 8080 }]
          env:
            - name: ConnectionStrings__Default
              valueFrom: { secretKeyRef: { name: todo-db, key: connection } }
          readinessProbe:                  # ready for traffic? (DB reachable)
            httpGet: { path: /healthz/ready, port: 8080 }
            periodSeconds: 5
          livenessProbe:                   # still alive? (restart if not)
            httpGet: { path: /healthz/live, port: 8080 }
            initialDelaySeconds: 10
          startupProbe:                    # slow starters: hold other probes until started
            httpGet: { path: /healthz/live, port: 8080 }
            failureThreshold: 30
            periodSeconds: 2
          resources:
            requests: { cpu: 100m, memory: 128Mi }   # what the scheduler reserves
            limits:   { memory: 256Mi }              # hard ceiling
~~~
**Probes:**
- **Readiness** fails -> pod removed from the Service's endpoints (no traffic) but **not restarted**. Use it for "my dependencies aren't reachable yet".
- **Liveness** fails -> kubelet **restarts** the container. Keep it simple (is the process responsive?) - if liveness checks the database, a DB outage restarts every pod in a loop and makes things worse.
- **Startup** protects slow-starting apps from being killed by liveness during boot.

**Resources:**
- **requests** - used by the **scheduler** to place pods; guaranteed share.
- **limits** - enforced at run time: exceed the **memory** limit -> **OOMKilled** (exit code 137) and restart; exceed the **CPU** limit -> **throttled** (slower, not killed). Many teams set memory limits but leave CPU unlimited to avoid throttling.
- **QoS classes**: **Guaranteed** (requests = limits for all), **Burstable** (some requests), **BestEffort** (none - evicted first when a node runs out of memory).
- **100m** CPU = 0.1 of a core; **128Mi** = 128 mebibytes.

**Rollouts:**
~~~
kubectl set image deploy/todo-api api=ghcr.io/phemelo/todo-api:1.3
kubectl rollout status deploy/todo-api      # watch it progress
kubectl rollout history deploy/todo-api
kubectl rollout undo deploy/todo-api        # back to the previous ReplicaSet
~~~
With maxUnavailable: 0 and a readiness probe, a broken image never receives traffic - the rollout simply stalls and you undo it.
@terms
- Readiness probe :: Decides if a pod receives Service traffic; failing does not restart it
- Liveness probe :: Restarts a container that is stuck or dead
- Startup probe :: Gives slow apps time to start before liveness checks begin
- Resource request :: CPU/memory the scheduler reserves for a container
- Resource limit :: Maximum CPU/memory a container may use
- OOMKilled :: Container killed for exceeding its memory limit (exit code 137)
- CPU throttling :: Slowing a container that hits its CPU limit
- QoS class :: Guaranteed, Burstable or BestEffort - eviction priority under pressure
- maxSurge / maxUnavailable :: Rolling-update knobs for extra and missing pods during a rollout
- rollout undo :: Return a Deployment to its previous revision
@pro
- "Readiness controls traffic, liveness controls restarts - and liveness never depends on the database."
- "Every container has requests; memory has a limit; we watch for OOMKilled in alerts."
@interview Pods of your API keep restarting with exit code 137. What's happening and how do you fix it? :: Exit code 137 with reason OOMKilled means the container exceeded its memory limit and the kernel killed it. I'd confirm with kubectl describe pod and the last state, check memory metrics to see real usage, then either fix a leak or unbounded cache in the app or raise the memory limit and request to match measured needs. For .NET I'd also check the GC settings respect container limits, which modern .NET does by default.
@lab dev:helm-ship
@quiz
? Your readiness probe fails because the database is down. What does Kubernetes do?
+ Stops sending Service traffic to the pod but doesn't restart it
- Restarts the container repeatedly
- Deletes the Deployment
- Moves the database
> Readiness controls traffic only.
? A container exceeds its memory limit. Result?
- It is throttled
+ It is OOMKilled and restarted
- Kubernetes adds more memory
- Nothing
> Memory over limit = killed (exit 137). CPU over limit = throttled.
? Which field does the scheduler use to decide where a pod fits?
+ resources.requests
- resources.limits only
- livenessProbe
- labels
> Requests are the reservation used for placement.
?= Which kubectl command returns a Deployment named todo-api to its previous version? (kubectl rollout ...)
= kubectl rollout undo deploy/todo-api | kubectl rollout undo deployment/todo-api | kubectl rollout undo deployment todo-api
> rollout undo switches back to the previous ReplicaSet.

=== lesson d11-2 | Configuration, Secrets and Autoscaling | 25
@analogy ConfigMaps are the notice board in the staff room (opening hours, specials) and Secrets are the safe in the manager's office (the alarm code). The Horizontal Pod Autoscaler is a manager who watches the queue at the tills and calls in more cashiers when it gets long - and sends them home when it's quiet.
@objectives
- Inject ConfigMaps and Secrets as env vars and files
- Explain why Kubernetes Secrets need extra protection
- Configure a Horizontal Pod Autoscaler and explain metrics-server
@body
~~~
kubectl create configmap todo-config --from-literal=Features__NewCheckout=false
kubectl create secret generic todo-db --from-literal=connection='Host=pg;Database=todo;Username=app;Password=...'
~~~
~~~
envFrom:
  - configMapRef: { name: todo-config }      # every key becomes an environment variable
volumeMounts:
  - name: certs
    mountPath: /app/certs                    # or mount as files (updated without restart)
~~~
- ASP.NET Core reads them automatically: env var Features__NewCheckout -> configuration key Features:NewCheckout.
- **Secrets are only base64-encoded, not encrypted**, in the API by default. Protect them: **RBAC** (few people/service accounts may read Secrets), **encryption at rest** for etcd, and ideally an external store (**Azure Key Vault / AWS Secrets Manager / HashiCorp Vault**) via the **External Secrets Operator** or the Secrets Store CSI driver. And never commit Secret YAML with real values to Git - use **Sealed Secrets** or SOPS if you must.
- Changing a ConfigMap doesn't restart pods that use it as env vars - trigger a rollout ([[kubectl rollout restart deploy/todo-api]]) or let Helm add a checksum annotation.

**Horizontal Pod Autoscaler (HPA):**
~~~
kubectl autoscale deploy todo-api --cpu-percent=70 --min=3 --max=12
~~~
- Needs **metrics-server** (CPU/memory metrics) and pods with **CPU requests** (utilisation = usage / request).
- Scales **out** when average CPU > 70% of the request, back **in** slowly to avoid flapping. Custom metrics (requests per second, queue length) via Prometheus Adapter or **KEDA** (event-driven, can scale to zero).
- **Vertical** Pod Autoscaler adjusts requests/limits instead; **Cluster Autoscaler / Karpenter** add **nodes** when pods can't be scheduled. Month-end sales at Kasi Market: HPA adds pods, the cluster autoscaler adds VMs, and both shrink afterwards - you only pay for the peak while it lasts.
@terms
- ConfigMap :: Non-secret configuration stored in Kubernetes and injected into pods
- Secret :: Sensitive values (base64-encoded) injected as env vars or files
- envFrom :: Imports all keys of a ConfigMap/Secret as environment variables
- Encryption at rest :: Encrypting Secret data stored in etcd
- External Secrets Operator :: Syncs secrets from vaults like Azure Key Vault into Kubernetes
- HPA :: Horizontal Pod Autoscaler - changes replica count based on metrics
- metrics-server :: Cluster add-on that provides CPU/memory metrics for autoscaling
- KEDA :: Event-driven autoscaler that can scale on queues and to zero
- Cluster Autoscaler :: Adds or removes nodes when pods can't fit or nodes sit idle
@pro
- "Secrets are base64, not encryption - we use RBAC, etcd encryption and an external vault."
- "HPA scales pods, the cluster autoscaler scales nodes - both need sensible requests."
@interview The HPA shows TARGETS as <unknown> and never scales. What do you check? :: First that metrics-server is installed and working (kubectl top pods returns numbers). Then that the containers have CPU requests, because HPA computes utilisation as a percentage of the request - without requests there's nothing to compare against. I'd also check the HPA targets the right Deployment name and look at kubectl describe hpa for events.
@lab dev:helm-ship
@quiz
? How are Kubernetes Secret values stored in the API by default?
- Encrypted with AES-256
+ Base64-encoded (not encrypted) unless encryption at rest is configured
- Hashed with bcrypt
- They aren't stored
> Base64 is encoding, not security.
? What must pods have for CPU-based HPA to work?
+ CPU requests, and metrics-server installed
- A LoadBalancer Service
- A StatefulSet
- Liveness probes only
> Utilisation = usage / request.
? Env var Payments__ApiKey maps to which ASP.NET Core configuration key?
+ Payments:ApiKey
- Payments.ApiKey
- payments_apikey
- It isn't readable
> Double underscore = section separator.
? Pods can't be scheduled because all nodes are full. Which component adds nodes?
- HPA
- kube-proxy
+ Cluster Autoscaler (or Karpenter)
- metrics-server
> HPA adds pods; the cluster autoscaler adds nodes.

=== lesson d11-3 | The Right Workload: StatefulSets, DaemonSets, Jobs and Debugging | 30
@analogy A Deployment is a pool of identical taxis - any one will do. A StatefulSet is a row of named parking bays (db-0, db-1) where each car always returns to its own bay with its own boot full of luggage (storage). A DaemonSet is one security guard per building. A Job is a cleaner hired for one shift; a CronJob is the cleaner who comes every night at 2 a.m.
@objectives
- Choose Deployment, StatefulSet, DaemonSet, Job or CronJob
- Explain stable identity and per-pod storage in StatefulSets
- Follow a systematic kubectl debugging flow
@body
| Workload | Use it for | Kasi Market example |
|---|---|---|
| **Deployment** | Stateless, interchangeable replicas | Todo API, Flutter web (nginx) |
| **StatefulSet** | Stable names (pod-0, pod-1), stable storage per pod, ordered start/stop | PostgreSQL, Redis, Kafka |
| **DaemonSet** | Exactly one pod per node | Log collector, node monitoring agent |
| **Job** | Run to completion (with retries) | Database migration bundle before a release |
| **CronJob** | Jobs on a schedule | Nightly sales report at 02:00 SAST |
~~~
apiVersion: batch/v1
kind: CronJob
metadata: { name: nightly-report }
spec:
  schedule: "0 0 * * *"            # cron is in the cluster's time zone (often UTC = 02:00 SAST)
  timeZone: "Africa/Johannesburg"  # or set it explicitly
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: report
              image: ghcr.io/phemelo/report-job:1.0
~~~
**Databases on Kubernetes**: possible with StatefulSets and operators (CloudNativePG), but many small teams use a **managed database** (Azure Database for PostgreSQL, Amazon RDS) and keep only stateless apps in the cluster - less to go wrong at 3 a.m.

**Namespaces** separate teams/environments ([[kubectl get pods -n staging]]); combine with **ResourceQuotas** and **LimitRanges** so one team can't starve another.

**The debugging flow** (memorise it - it's half the CKAD exam and every on-call shift):
~~~
kubectl get pods -o wide                    # STATUS: Pending? CrashLoopBackOff? ImagePullBackOff?
kubectl describe pod <pod>                  # Events at the bottom explain most problems
kubectl logs <pod> [-c container] --previous   # logs of the crashed attempt
kubectl exec -it <pod> -- sh                # look inside (if the image has a shell)
kubectl get events --sort-by=.lastTimestamp
kubectl top pods                            # CPU/memory (metrics-server)
~~~
| Status | Usually means |
|---|---|
| **Pending** | No node fits (requests too big, taints, unbound PVC) |
| **ImagePullBackOff** | Wrong image/tag, private registry without imagePullSecret |
| **CrashLoopBackOff** | App starts then exits - read logs --previous (bad config, missing secret) |
| **Running but 0/1 READY** | Readiness probe failing |
| **OOMKilled** | Memory limit exceeded |
@terms
- StatefulSet :: Workload with stable pod names and per-pod persistent storage
- DaemonSet :: Runs one pod on every (or selected) node
- Job :: Runs pods until a task completes successfully
- CronJob :: Creates Jobs on a cron schedule
- Namespace :: Virtual cluster partition for teams or environments
- ResourceQuota :: Limits total resources a namespace may consume
- CrashLoopBackOff :: Container keeps crashing; Kubernetes waits longer between restarts
- ImagePullBackOff :: Kubernetes can't pull the container image
- Operator :: Controller that automates running complex software like databases
@pro
- "Stateless apps are Deployments; databases are StatefulSets or, better for small teams, managed services."
- "My debugging flow is get, describe, logs --previous, exec - the Events usually tell the story."
@interview A pod is in CrashLoopBackOff. Walk me through your troubleshooting. :: kubectl get pods shows the restarts, then kubectl describe pod shows the events, last state and exit code. kubectl logs with --previous shows why the last attempt died - often a missing environment variable or secret, a bad connection string, or the app failing its startup checks. Exit code 137 would point to OOMKilled instead. I fix the cause in the manifest or config, apply, and watch kubectl rollout status until the pods are Ready.
@lab k8s3d:k8s-deploy
@quiz
? Which workload gives each replica a stable name and its own persistent volume?
- Deployment
+ StatefulSet
- DaemonSet
- Job
> db-0 always gets db-0's volume.
? You need a log-collector agent on every node. Which workload?
- Deployment with replicas = nodes
- CronJob
+ DaemonSet
- StatefulSet
> One per node, automatically added to new nodes.
? A pod is in CrashLoopBackOff. Which command shows the logs of the crashed attempt?
+ kubectl logs <pod> --previous
- kubectl get svc
- kubectl top nodes
- kubectl scale
> --previous shows the last terminated container's logs.
? A pod stays Pending with event "0/3 nodes are available: insufficient memory". Cause?
+ Its memory request doesn't fit on any node
- The image tag is wrong
- The liveness probe fails
- The Service has no selector
> Pending = scheduling problem.

=== boss
? Liveness probes call /healthz that checks the database. The database goes down. What happens?
+ Every pod restarts in a loop, making the outage worse
- Traffic stops but pods stay up
- Nothing
- The database restarts
> Dependency checks belong in readiness, not liveness.
? requests.cpu = 100m means:
- 100 cores
+ One tenth of a CPU core reserved
- 100 MB of memory
- 100 milliseconds of runtime
> m = millicores.
?? Which statements about Kubernetes Secrets are true? (choose all)
+ They are base64-encoded, not encrypted, by default
+ RBAC should restrict who can read them
+ External vaults can sync into them via External Secrets Operator
- Committing them to Git is safe because of base64
> Treat them as sensitive data.
? A nightly report must run at 02:00 SAST. Best workload?
- Deployment with a sleep loop
+ CronJob (with timeZone Africa/Johannesburg)
- DaemonSet
- StatefulSet
> Scheduled, run-to-completion.
? HPA shows <unknown> targets. Most likely?
+ No metrics-server or no CPU requests on the pods
- Too many replicas
- The Service type is ClusterIP
- The image is too small
> Utilisation needs metrics and requests.
`;
