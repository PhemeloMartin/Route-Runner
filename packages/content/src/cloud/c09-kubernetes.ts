import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c09 | Kubernetes: Orchestrating Containers | 9
@sources LFS158 Introduction to Kubernetes and LFS250 Kubernetes & Cloud Native Essentials (your certificates); KCNA exam domains
@story
The Marketplace site now runs in 20 containers across 3 servers. A server dies at 2 a.m. and nobody notices - because Kubernetes moved its containers to the other servers in seconds. "That," says Lindiwe, "is why every big company runs Kubernetes. You've done the LFS158 course; now let's make it stick by doing it."
@lab cloud:k8s-deploy | Cloud Mission 2 - Deploy, Break, Heal, Scale (with the 3D cluster view)

=== lesson c09-1 | Architecture: Control Plane, Nodes and Desired State | 25
@analogy Kubernetes is a restaurant manager. You don't tell each waiter what to do - you write "always have 3 waiters on the floor" on the board (desired state). The manager constantly compares the board with reality and fixes any difference: someone goes home sick, the manager calls in a replacement.
@objectives
- Name the control-plane and worker-node components
- Explain declarative desired state and the reconciliation loop
- Explain why Kubernetes heals itself
@body
A **cluster** = a **control plane** + **worker nodes**.

**Control plane:**
- **kube-apiserver** - the front door; everything (kubectl, other components) talks to it via REST
- **etcd** - distributed key-value database holding the entire cluster state (back it up!)
- **kube-scheduler** - picks a node for each new pod (resources, affinity, taints)
- **kube-controller-manager** - runs controllers (Deployment, ReplicaSet, Node...) that reconcile actual -> desired state
- cloud-controller-manager - talks to AWS/Azure for load balancers and disks

**Every worker node:**
- **kubelet** - agent that starts/stops containers as instructed and reports health
- **container runtime** - containerd / CRI-O (Docker images still run)
- **kube-proxy** - programs networking rules for Services

**Declarative model:** you submit YAML describing *what* you want (3 replicas of nginx:1.27); controllers loop forever making it true. Delete a pod -> the ReplicaSet controller notices 2 != 3 and creates a new one: **self-healing**. A node dies -> its pods are rescheduled elsewhere.

Managed Kubernetes (you don't run the control plane): **Amazon EKS**, **Azure AKS**, **Google GKE**. Local learning: minikube, kind, k3s.
@terms
- Control plane :: Components that manage the cluster: API server, etcd, scheduler, controllers
- kube-apiserver :: The cluster's REST front door
- etcd :: Key-value store holding all cluster state
- kube-scheduler :: Assigns pods to nodes
- kubelet :: Node agent that runs pods
- Desired state :: The declared configuration that controllers continuously enforce
- Reconciliation loop :: Controllers comparing actual vs desired state and fixing differences
@pro
- "Kubernetes is declarative: I describe the desired state and controllers reconcile reality towards it."
@quiz
? Which component stores all cluster state?
- kubelet
+ etcd
- kube-proxy
- containerd
> Back up etcd!
? Which component decides which node a new pod runs on?
- kubelet
- etcd
+ kube-scheduler
- kube-proxy
> kube-scheduler picks the best node for each new pod based on resources and constraints.
? You delete one pod of a 3-replica Deployment. What happens?
+ A replacement pod is created automatically
- The Deployment is deleted
- The cluster stops
- Nothing - you must recreate it
> Self-healing.

=== lesson c09-2 | Pods, Deployments, Services and kubectl | 30
@analogy Pods are the waiters; a Deployment is the shift roster that says how many waiters and which uniform (image); a Service is the restaurant's single phone number - customers call one number and any free waiter answers, even as waiters come and go.
@objectives
- Explain pods, ReplicaSets and Deployments
- Expose apps with ClusterIP, NodePort and LoadBalancer Services
- Use the core kubectl commands and read manifests
@body
- **Pod** - smallest unit; one (or a few tightly-coupled) containers sharing an IP and volumes. Pods are mortal - their IPs change.
- **ReplicaSet** - keeps N identical pods running.
- **Deployment** - manages ReplicaSets and **rolling updates/rollbacks**. You almost always create Deployments, not bare pods.
- **Service** - a **stable** virtual IP + DNS name that load-balances to pods matching a **label selector**:
  - **ClusterIP** (default) - internal only
  - **NodePort** - opens a port (30000-32767) on every node
  - **LoadBalancer** - asks the cloud for an external load balancer
- **Ingress** - Layer 7 HTTP routing (host/path) into Services, usually via an ingress controller (nginx, Traefik).

~~~
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web          # must match the selector!
    spec:
      containers:
      - name: web
        image: nginx:1.27
        ports:
        - containerPort: 80
~~~
**kubectl essentials:** [[kubectl apply -f web.yaml]], [[kubectl get pods -o wide]], [[kubectl get deploy,svc]], [[kubectl describe pod NAME]] (Events at the bottom explain problems), [[kubectl logs POD]], [[kubectl exec -it POD -- sh]], [[kubectl scale deploy web --replicas=6]], [[kubectl expose deploy web --port=80 --type=NodePort]], [[kubectl delete -f web.yaml]].
@terms
- Pod :: Smallest deployable unit - one or more containers sharing network and storage
- Deployment :: Manages replicas and rolling updates of pods
- ReplicaSet :: Ensures a specified number of pod replicas are running
- Service :: Stable virtual IP/DNS that load-balances to pods selected by labels
- Label selector :: Key/value matching (app=web) that connects Services and Deployments to pods
- Ingress :: HTTP(S) routing rules into Services
@pro
- "Services find pods by labels, so a Service keeps working while pods are replaced."
@interview A pod is stuck in ImagePullBackOff. How do you troubleshoot? :: kubectl describe pod and read the Events: usually the image name or tag is wrong (a typo like ngnix), the image is private and needs an imagePullSecret, or the node can't reach the registry. I'd fix the image reference with kubectl set image or by editing the manifest and re-applying, then watch kubectl get pods and kubectl rollout status.
@quiz
? Which Service type is reachable only inside the cluster?
+ ClusterIP
- NodePort
- LoadBalancer
- Ingress
> Default internal type.
? How does a Service know which pods to send traffic to?
+ Label selectors
- Pod IP addresses typed by hand
- Node names
- Container images
> app=web style labels.
? A pod shows ImagePullBackOff. First command to investigate?
+ kubectl describe pod NAME
- kubectl delete node
- kubectl scale --replicas=0
- docker build
> Read the Events.
?= Which command scales deployment web to 5 replicas?
= kubectl scale deployment web --replicas=5 | kubectl scale deploy web --replicas=5 | kubectl scale deployment/web --replicas=5
> Declarative alternative: change replicas in YAML and apply.

=== lesson c09-3 | Configuration, Storage, Scaling and Rollouts | 25
@analogy ConfigMaps are the menu board you can change without rebuilding the kitchen. Secrets are the safe for the till PIN. The HPA is a manager who hires extra waiters when the restaurant gets busy.
@objectives
- Use ConfigMaps, Secrets and namespaces
- Use PersistentVolumeClaims for stateful data
- Configure rolling updates, rollbacks, probes and the HPA
@body
- **Namespaces** - virtual clusters to separate teams/environments (dev, staging, prod) and apply quotas.
- **ConfigMap** - non-secret configuration injected as env vars or files.
- **Secret** - sensitive values (base64-encoded, NOT encrypted by default - enable encryption at rest, or use an external secrets manager).
- **PersistentVolume / PersistentVolumeClaim** - storage that outlives pods (EBS volumes on EKS). This project's own Kubernetes manifests use a PVC for the game database.
- **StatefulSet** - for databases needing stable identity/storage; **DaemonSet** - one pod per node (log/monitoring agents); **Job/CronJob** - run-to-completion and scheduled tasks.

**Rolling updates:** [[kubectl set image deploy/web web=nginx:1.28]] replaces pods gradually (maxSurge/maxUnavailable) - zero downtime. [[kubectl rollout status deploy/web]], [[kubectl rollout history]], [[kubectl rollout undo deploy/web]].

**Health probes:** **liveness** (restart if dead), **readiness** (only send traffic when ready), startup. Route Runner's server exposes [[/healthz]] and [[/readyz]] for exactly this.

**Autoscaling:** **HPA** (Horizontal Pod Autoscaler) adds/removes pods based on CPU/memory/custom metrics; **Cluster Autoscaler/Karpenter** adds nodes. **Resource requests/limits** tell the scheduler how much CPU/RAM each pod needs.

**Cloud-native ideas (KCNA):** microservices, immutable infrastructure, observability, GitOps (Argo CD, Flux), service mesh (Istio, Linkerd), CNCF landscape.
@terms
- Namespace :: Logical partition of a cluster
- ConfigMap :: Non-sensitive configuration for pods
- Secret :: Sensitive data for pods (base64, enable encryption at rest)
- PersistentVolumeClaim :: A pod's request for persistent storage
- Rolling update :: Gradually replacing pods with a new version
- Readiness probe :: Check that decides if a pod receives traffic
- HPA :: Horizontal Pod Autoscaler - scales replicas on metrics
@pro
- "If a rollout goes wrong I run kubectl rollout undo and investigate from the previous version."
@quiz
? Which object should hold a database password?
- ConfigMap
+ Secret
- Deployment label
- Namespace
> And enable encryption at rest.
? A new version is broken in production. Fastest recovery?
+ kubectl rollout undo deployment/web
- Delete the cluster
- Scale to zero forever
- Edit etcd directly
> kubectl rollout undo returns the Deployment to its previous working version within seconds.
? Which probe stops traffic going to a pod that isn't ready yet?
- Liveness
+ Readiness
- Startup only
- HPA
> Readiness gates traffic.

=== boss
? Which component runs on every worker node and starts pods?
+ kubelet
- kube-scheduler
- etcd
- kube-apiserver
> The kubelet is the agent on every node that starts pods and reports their health to the control plane.
? A Deployment's selector is app=web but its pod template label is app=website. What happens?
+ The API rejects it - the selector must match the template labels
- It works normally
- Pods are created with no label
- The Service fixes it
> Validation error.
? Which Service type requests an external load balancer from the cloud?
+ LoadBalancer
- ClusterIP
- NodePort
- Headless
> Cloud integration.
? Which object runs one pod on EVERY node (e.g. a log collector)?
+ DaemonSet
- Deployment
- Job
- StatefulSet
> One per node.
? Kubernetes self-healing is achieved by...
+ controllers continuously reconciling actual state to desired state
- engineers restarting pods manually
- etcd deleting nodes
- Docker restarting containers only
> Reconciliation loops.
`;
