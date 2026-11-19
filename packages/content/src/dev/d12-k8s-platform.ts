import { chapter } from '../dsl.js';

export default chapter`
@chapter dev.d12 | Kubernetes Deep Dive 2: Networking, Storage, Helm and GitOps | 12
@sources kubernetes.io docs - Services, Ingress, Gateway API, NetworkPolicy, Persistent Volumes, RBAC; Kubernetes blog (Nov 2025) on the retirement of the community ingress-nginx controller; helm.sh docs (charts, values, releases, rollback); Argo CD and Flux documentation; CNCF certification pages (KCNA, CKAD, CKA, CKS)
@story
Three more clients want apps like Kasi Market. Copy-pasting YAML for each one is already causing mistakes. Phemelo's mentor at the hosting company says: "Package it with Helm, let Git drive the cluster with GitOps, lock the network down, and you're running a platform - not just an app." This chapter connects your Network Engineer stream (ports, DNS, firewalls) to Kubernetes.
@lab dev:helm-ship | Kubernetes Mission - ship the Todo API with Helm, scale, break and roll back

=== lesson d12-1 | Kubernetes Networking: Services, DNS, Ingress, Gateway API and NetworkPolicy | 30
@analogy Pods are workers whose desk numbers change every day. A Service is the department's fixed extension number - call it and someone from the department answers. Ingress / Gateway is the building's reception desk that reads the visitor's request ("api.kasimarket.co.za/orders") and sends them to the right department. NetworkPolicy is the access-card system on internal doors.
@objectives
- Explain pod networking, Services and cluster DNS
- Route external HTTP(S) traffic with Ingress or Gateway API and TLS
- Restrict traffic between pods with NetworkPolicy
@body
**The rules of Kubernetes networking**: every pod gets its own IP; all pods can reach all pods (no NAT) unless policies say otherwise; a **CNI plugin** (Calico, Cilium, Azure CNI) implements this.

**Services** give a stable virtual IP and **DNS name** to a changing set of pods selected by labels:
- From the same namespace: [[http://todo-api]]; from another: [[http://todo-api.shop.svc.cluster.local]] (CoreDNS answers).
- Types: **ClusterIP** (internal, default), **NodePort** (port 30000-32767 on every node), **LoadBalancer** (cloud load balancer with a public IP), **headless** (clusterIP: None - DNS returns pod IPs, used by StatefulSets).
- kube-proxy (or eBPF in Cilium) programs the rules that spread traffic across healthy, **Ready** endpoints - which is why readiness probes matter.

**Ingress** - one public entry point doing HTTP routing and TLS termination for many Services:
~~~
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kasimarket
  annotations: { cert-manager.io/cluster-issuer: letsencrypt }   # free automatic TLS certificates
spec:
  ingressClassName: nginx
  tls: [{ hosts: [api.kasimarket.co.za], secretName: api-tls }]
  rules:
    - host: api.kasimarket.co.za
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: todo-api, port: { number: 8080 } } }
~~~
An Ingress needs an **Ingress controller** (Traefik, HAProxy, cloud gateways...). Note: the Kubernetes project announced in November 2025 that the widely used community **ingress-nginx** controller would be retired (best-effort maintenance only until March 2026) - new platforms are moving to the **Gateway API** (GatewayClass, Gateway, HTTPRoute), the more expressive, role-oriented successor to Ingress that supports traffic splitting for canaries.

**NetworkPolicy** = firewall rules for pods (you configured ACLs on Cisco routers - same idea, label-based). Default-deny, then allow only what's needed:
~~~
kind: NetworkPolicy
metadata: { name: db-allow-api-only }
spec:
  podSelector: { matchLabels: { app: postgres } }
  policyTypes: [Ingress]
  ingress:
    - from: [{ podSelector: { matchLabels: { app: todo-api } } }]
      ports: [{ port: 5432 }]
~~~
Policies only work if the CNI enforces them (Calico/Cilium do; some basic setups don't).
@terms
- CNI plugin :: Network plugin that gives pods IPs and connectivity (Calico, Cilium)
- Service DNS :: Stable name like todo-api.shop.svc.cluster.local resolved by CoreDNS
- Headless Service :: Service without a virtual IP; DNS returns individual pod IPs
- Ingress :: HTTP(S) routing rules from outside the cluster to Services
- Ingress controller :: The proxy that implements Ingress rules (e.g. Traefik)
- Gateway API :: Newer, more expressive successor to Ingress (Gateway, HTTPRoute)
- cert-manager :: Automates TLS certificates (e.g. from Let's Encrypt) in Kubernetes
- NetworkPolicy :: Label-based firewall rules controlling pod-to-pod traffic
@pro
- "Services give stable DNS names; Ingress or Gateway API handles host-based routing and TLS at the edge."
- "Namespaces start default-deny, and NetworkPolicies allow only the flows we need - like ACLs for pods."
@interview The API pods are Running but the Ingress returns 503. How do you troubleshoot? :: 503 from the ingress means it has no healthy backends. I'd check the Service selector matches the pod labels (kubectl get endpoints or endpointslices for the service - empty means mismatch), that the pods are Ready (a failing readiness probe removes them), that the Service port and targetPort match the container port 8080, and that the Ingress backend references the right Service name and port. Then check the ingress controller logs.
@quiz
? From a pod in another namespace, which name reaches Service todo-api in namespace shop?
+ todo-api.shop.svc.cluster.local
- shop.todo-api.local
- todo-api.default
- 127.0.0.1:8080
> service.namespace.svc.cluster.local
? kubectl get endpoints todo-api shows no addresses. Most likely cause?
+ The Service selector doesn't match the pods' labels (or no pods are Ready)
- The Ingress has no TLS
- The cluster has no nodes
- CoreDNS is too fast
> Endpoints are built from label selection + readiness.
? Which newer API is the expressive successor to Ingress?
- NodePort
+ Gateway API (Gateway + HTTPRoute)
- NetworkPolicy
- CronJob
> Role-oriented, supports traffic splitting.
? A NetworkPolicy allows only app=todo-api pods to reach postgres on 5432. Which networking concept does this resemble most?
+ An access control list (ACL) on a router or firewall
- DHCP
- NAT
- STP
> Label-based allow rules for pod traffic.

=== lesson d12-2 | Storage and Security: PVs, PVCs, StorageClasses and RBAC | 25
@analogy A PersistentVolumeClaim is a tenant's request: "I need a 10 GB storeroom, fast flooring". The StorageClass is the property company's catalogue of storeroom types, and dynamic provisioning means they build one on demand. RBAC is the key cabinet: each person and robot gets only the keys their job needs.
@objectives
- Request storage with PVCs and StorageClasses
- Explain access modes and reclaim policies
- Apply RBAC with ServiceAccounts, Roles and RoleBindings, plus pod security basics
@body
**Storage** - containers are ephemeral; data that must survive restarts goes on a volume:
- **PersistentVolume (PV)** - a piece of storage (Azure Disk, AWS EBS, NFS).
- **PersistentVolumeClaim (PVC)** - a pod's request for storage (size + access mode).
- **StorageClass** - describes a type (managed-premium, gp3) and provisions PVs **dynamically** when a PVC asks.
~~~
kind: PersistentVolumeClaim
metadata: { name: pgdata }
spec:
  accessModes: [ReadWriteOnce]       # one node at a time (disks); ReadWriteMany needs file storage (NFS/Azure Files)
  storageClassName: managed-csi
  resources: { requests: { storage: 20Gi } }
~~~
- **Reclaim policy**: **Delete** (default for dynamic - deleting the PVC deletes the disk!) or **Retain**. For production databases, use Retain and **backups** (Velero, database-native backups). A PVC is not a backup.

**RBAC** - who may do what to which resources:
~~~
kind: Role                      # namespaced permissions
metadata: { name: deployer, namespace: shop }
rules:
  - apiGroups: [apps]
    resources: [deployments]
    verbs: [get, list, update, patch]
---
kind: RoleBinding
metadata: { name: ci-deployer, namespace: shop }
subjects: [{ kind: ServiceAccount, name: github-actions, namespace: shop }]
roleRef: { kind: Role, name: deployer, apiGroup: rbac.authorization.k8s.io }
~~~
- **Role/RoleBinding** = one namespace; **ClusterRole/ClusterRoleBinding** = cluster-wide.
- Humans authenticate via the cloud's identity (Entra ID, IAM); workloads use **ServiceAccounts**. Test with [[kubectl auth can-i delete pods -n shop --as=...]].
- **Least privilege**: the CI pipeline can update Deployments in its namespace - it does not need cluster-admin.

**Pod security** essentials: run as non-root, read-only root filesystem, drop Linux capabilities, no privileged containers - enforced per namespace with **Pod Security Admission** (restricted / baseline / privileged). Scan images, sign them (Sigstore cosign) and pull only from trusted registries. That's CKS (security specialist) territory.
@terms
- PersistentVolume :: A piece of cluster storage backed by a disk or file share
- PersistentVolumeClaim :: A request for storage that a pod mounts
- StorageClass :: A storage type that provisions volumes dynamically
- Access mode :: ReadWriteOnce (one node), ReadOnlyMany, ReadWriteMany (many nodes)
- Reclaim policy :: Delete or Retain the volume when its claim is deleted
- RBAC :: Role-based access control for the Kubernetes API
- ServiceAccount :: Identity used by pods and automation inside the cluster
- RoleBinding :: Grants a Role's permissions to users, groups or ServiceAccounts
- Pod Security Admission :: Enforces restricted/baseline/privileged pod security per namespace
@pro
- "A PVC is not a backup - production volumes use Retain plus scheduled backups."
- "Our pipeline's ServiceAccount can patch Deployments in one namespace, nothing more."
@interview How would you give a CI/CD pipeline permission to deploy to Kubernetes securely? :: Create a dedicated ServiceAccount (or federated workload identity from GitHub OIDC to the cloud, so no long-lived keys) in the target namespace, a Role allowing only the verbs and resources the deployment needs - for example get, list, patch and update on Deployments, Services and ConfigMaps - and a RoleBinding. Verify with kubectl auth can-i, store any credentials as protected environment secrets, and audit its activity. Never give CI cluster-admin.
@lab dev:helm-ship
@quiz
? A PVC with storageClass reclaimPolicy Delete is deleted. What happens to the data?
+ The underlying disk is deleted too
- It moves to another namespace
- Kubernetes backs it up automatically
- Nothing
> Use Retain and real backups for important data.
? Which access mode lets pods on many nodes write to the same volume?
- ReadWriteOnce
+ ReadWriteMany (requires file storage like NFS/Azure Files)
- ReadOnlyMany
- WriteOnce
> Block disks are usually ReadWriteOnce.
? Which object grants a Role's permissions to a ServiceAccount?
- ConfigMap
+ RoleBinding
- NetworkPolicy
- StorageClass
> Bindings connect subjects to roles.
? Which command checks whether an identity may delete pods in namespace shop?
+ kubectl auth can-i delete pods -n shop --as=<user>
- kubectl get rbac
- kubectl describe can
- helm lint
> auth can-i tests RBAC decisions.

=== lesson d12-3 | Helm, GitOps and Becoming a Platform Engineer | 30
@analogy Helm is a recipe book with blanks: the recipe (chart) says "bake a cake with ___ eggs", and each bakery fills in its own number (values) - same recipe, many cakes, each batch numbered (revision) so you can go back to yesterday's batch. GitOps is a head chef who checks the recipe book in Git every few minutes and fixes any cake that doesn't match it.
@objectives
- Explain charts, values, releases and revisions
- Install, upgrade, inspect and roll back releases
- Describe GitOps with Argo CD/Flux and the certification path
@body
**Helm** is the package manager for Kubernetes.
- **Chart** - a folder: Chart.yaml (name, version, appVersion), values.yaml (defaults), templates/ (YAML with Go templating like [[{{ .Values.replicaCount }}]]).
- **Values** - per-environment settings: [[--set replicaCount=4]] or [[-f values-prod.yaml]].
- **Release** - an installed instance of a chart with a name; every change is a numbered **revision**.
~~~
helm repo add bitnami https://charts.bitnami.com/bitnami && helm repo update
helm install todo ./charts/todo-api -n shop --create-namespace
helm upgrade todo ./charts/todo-api --set image.tag=1.3 --reuse-values
helm list -n shop
helm history todo -n shop
helm rollback todo 2 -n shop          # back to revision 2
helm template todo ./charts/todo-api  # render YAML locally - great for reviews
helm upgrade --install todo ./charts/todo-api -f values-prod.yaml   # idempotent - perfect for CI
~~~
Keep **values files per environment** in Git (values-staging.yaml, values-prod.yaml); never put secrets in values files - reference Secrets created by External Secrets instead. (Helm 4 arrived in late 2025; these core commands work the same in Helm 3 and 4.) **Kustomize** (built into kubectl -k) is the template-free alternative: a base plus overlays - you used it in this game's own deploy/k8s folder.

**GitOps** - Git is the single source of truth for what runs in the cluster:
1. Developers change values/manifests through a PR (reviewed, audited).
2. **Argo CD** or **Flux**, running *inside* the cluster, **pulls** from Git and applies changes.
3. It continuously compares Git with the cluster and fixes **drift** (someone ran kubectl edit at midnight? it's reverted).
4. Rollback = git revert.
Pull-based GitOps means CI never needs cluster credentials - CI builds and pushes the image and updates the tag in the config repo; Argo CD deploys it.

**Platform engineering**: an internal platform team gives developers paved roads - golden-path templates, CI/CD, Kubernetes, observability and security built in - so product teams ship features without becoming Kubernetes experts (tools like Backstage provide the developer portal).

**Certifications** (performance-based, hands-on in a real terminal - like the labs in this game): **KCNA** (you did LFS250 - foundations), **CKAD** (application developer - this chapter and the last), **CKA** (administrator - clusters, networking, troubleshooting), **CKS** (security). Plus **GitHub Actions** and **GitHub Foundations** certifications for the CI/CD side.
@terms
- Helm chart :: A package of templated Kubernetes manifests plus default values
- values.yaml :: Default configuration for a chart, overridden per environment
- Release :: A named installation of a chart in a cluster
- Revision :: A numbered version of a release, created by each install/upgrade/rollback
- helm rollback :: Restore a release to an earlier revision
- Kustomize :: Template-free customisation of YAML with bases and overlays
- GitOps :: Operating the cluster from Git using a pull-based reconciler
- Argo CD / Flux :: GitOps controllers that sync clusters with Git and fix drift
- Drift :: Differences between what Git declares and what actually runs
- Platform engineering :: Building internal self-service platforms with paved roads for developers
@pro
- "Helm packages the app; values files per environment live in Git; Argo CD keeps the cluster in sync."
- "With pull-based GitOps our CI never holds cluster-admin credentials."
@interview A bad release is live in production. Using Helm and GitOps, how do you roll back? :: With plain Helm, helm history shows the revisions and helm rollback to the last good one restores the previous values and image tag immediately, and kubectl rollout status confirms the pods are Ready. In a GitOps setup the source of truth is Git, so the proper rollback is git revert of the commit that changed the image tag or values; Argo CD syncs the cluster back. Then a blameless post-mortem and a test that would have caught the issue.
@lab dev:helm-ship
@quiz
? What is a Helm release?
+ A named, installed instance of a chart in a cluster, with numbered revisions
- A GitHub release page
- A Docker image tag
- A Kubernetes node
> helm install todo ./chart creates release "todo".
? You ran helm upgrade and the new pods are failing. Fastest Helm way back?
- helm uninstall then reinstall from memory
+ helm rollback <release> <good-revision>
- kubectl delete namespace
- helm repo update
> Revisions make rollback one command.
? In GitOps, what happens if someone changes a Deployment directly with kubectl edit?
+ The GitOps controller detects drift and reverts it to what Git declares
- The change becomes the new source of truth
- Git is updated automatically
- Nothing ever
> Git wins.
? Which Kubernetes certification focuses on application developers?
- KCNA
+ CKAD
- CKS
- CCNA
> Certified Kubernetes Application Developer.

=== boss
? The Ingress returns 503 and kubectl get endpoints shows none. First thing to check?
+ That the Service selector matches the pod labels and the pods are Ready
- The TLS certificate's colour
- The number of Helm repos
- The node's hostname
> No endpoints = no backends.
?? Which keep a Kubernetes platform secure? (choose all)
+ Least-privilege RBAC for ServiceAccounts
+ Default-deny NetworkPolicies
+ Pod Security Admission with the restricted profile
- Giving CI cluster-admin to save time
> Least privilege everywhere.
? Where should environment-specific Helm values (not secrets) live?
+ In Git, e.g. values-staging.yaml and values-prod.yaml
- Only in someone's terminal history
- Inside the container image
- In the Ingress annotations
> Reviewed, versioned configuration.
? Which statement about PVCs is true?
- A PVC is a backup
+ With reclaimPolicy Delete, deleting the PVC deletes the volume
- PVCs only work with Deployments
- PVCs are cluster-wide objects
> Plan backups separately.
? helm upgrade --install is useful in CI because:
+ It installs the release if missing or upgrades it if present - idempotent
- It skips templates
- It deletes old revisions
- It needs no cluster
> Same command for first and later deploys.
`;
