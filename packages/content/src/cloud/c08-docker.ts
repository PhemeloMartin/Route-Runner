import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c08 | Containers and Docker | 8
@sources LFS250 Kubernetes and Cloud Native Essentials (container fundamentals); Docker documentation concepts
@story
"It works on my machine!" the Marketplace developer shouts, as the site crashes on the server. Lindiwe laughs: "Then we'll ship your machine." She means containers - the app, its libraries and settings packed into one box that runs the same everywhere.
@lab cloud:docker-first | Cloud Mission 1 - Your First Containers

=== lesson c08-1 | Containers vs VMs, Images and Registries | 20
@analogy Shipping containers changed world trade: any crane, ship, truck or train can move the same standard box without caring what's inside. Docker containers do that for software - any Linux server, laptop or cloud can run the same image.
@objectives
- Explain containers, images, layers and registries
- Compare containers with VMs
- Explain namespaces and cgroups at a high level
@body
A **container** is an isolated process (or group of processes) on a Linux host. Isolation comes from kernel features: **namespaces** (own view of processes, network, filesystem, hostname) and **cgroups** (limits on CPU/RAM). Containers **share the host kernel** - no guest OS - so they start in seconds and use MBs, not GBs.

An **image** is a read-only template made of **layers** (base OS layer, then your packages, then your code). A container is a running instance of an image with a thin writable layer on top. When the container is deleted, that writable layer is gone - **containers are ephemeral**; persistent data goes in **volumes**.

**Registries** store images: Docker Hub, Amazon **ECR**, GitHub Container Registry. Image names: [[registry/repository:tag]], e.g. [[nginx:1.27]], [[routerunner/web:latest]]. Pin versions (avoid :latest in production) and scan images for vulnerabilities.

**VM vs container:** VM = hardware virtualization, full OS each, strongest isolation. Container = OS-level virtualization, shared kernel, lightest and fastest. In practice they're combined: containers run *inside* cloud VMs.
@terms
- Container :: Isolated process sharing the host kernel, created from an image
- Image :: Read-only, layered template for containers
- Registry :: Server storing images (Docker Hub, ECR)
- Namespaces :: Kernel feature isolating what a container can see
- cgroups :: Kernel feature limiting a container's CPU and memory
- Volume :: Persistent storage that outlives a container
@pro
- "Containers are ephemeral - anything that must survive goes into a volume or an external service."
@quiz
? What do containers share with the host?
+ The kernel
- Nothing
- A full guest OS
- The BIOS
> No guest OS.
? Which kernel feature limits a container's CPU and memory?
- Namespaces
+ cgroups
- SELinux
- iptables
> Control groups.
? What happens to data written inside a container (no volume) when it's removed?
+ It is lost
- It moves to the image
- It is backed up to S3
- It moves to the host's /home
> Writable layer is deleted.

=== lesson c08-2 | Running Containers: docker run, ps, logs, exec | 25
@analogy docker run is pressing "play" on a recipe: get the ingredients (pull the image), set up a kitchen (container), connect the serving hatch (-p ports) and start cooking.
@objectives
- Run detached containers with names, ports, env vars and volumes
- Inspect, debug and clean up containers
@body
~~~
docker run hello-world                           # pull + run + print + exit
docker run -d --name web -p 8080:80 nginx:1.27   # detached, named, host 8080 -> container 80
docker ps          # running        docker ps -a     # including stopped
docker logs web    # stdout/stderr  docker logs -f web
docker exec -it web sh                           # a shell INSIDE the container
docker stop web && docker rm web                 # stop then remove (or rm -f)
docker images      # local images   docker rmi nginx:1.27
docker run -d -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:16
~~~
**-p HOST:CONTAINER** publishes a port - "port is already allocated" means another container already uses that host port. **-e** sets environment variables (configuration). **-v name:/path** mounts a volume.

**Networking:** containers on the default **bridge** network get 172.17.x.x addresses behind NAT on the host's **docker0** interface (you saw it in [[ip a]]). User-defined networks give containers DNS by name. **--network host** shares the host's network stack.

**Permissions on Linux:** the Docker daemon is root-equivalent - users must be in the **docker** group (or use sudo). Treat docker group membership like admin access.
@terms
- docker run -d :: Start a container detached (in the background)
- -p 8080:80 :: Publish container port 80 on host port 8080
- docker exec -it :: Run an interactive command inside a running container
- docker logs :: Show a container's output
- docker0 :: The host bridge interface for the default container network
@pro
- "With -p 8080:80, users hit the host on 8080 and Docker forwards to port 80 inside the container."
@quiz
?= Which flag runs a container in the background?
= -d | --detach
> Detached mode.
? You need a shell inside a running container named web. Command?
+ docker exec -it web sh
- docker run web sh
- docker attach nginx
- docker ssh web
> exec runs inside an existing container.
? "Bind for 0.0.0.0:8080 failed: port is already allocated" means...
+ another container or process already uses host port 8080
- the image doesn't exist
- Docker isn't installed
- the container port is wrong
> Pick another host port or stop the other one.

=== lesson c08-3 | Dockerfiles and Docker Compose | 25
@analogy A Dockerfile is a recipe card; docker build bakes the cake (image); docker compose is the menu for a whole dinner - starter, main and dessert containers started together, in the right order.
@objectives
- Write a Dockerfile and build/tag/push an image
- Use docker compose for multi-container apps
- Apply image best practices
@body
~~~
# Dockerfile
FROM node:20-alpine            # base image (small)
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev          # each RUN creates a layer
COPY . .
USER node                      # don't run as root
EXPOSE 8080
CMD ["node", "server.js"]
~~~
[[docker build -t phemelo/site:1.0 .]] -> [[docker push phemelo/site:1.0]].
Order instructions from least- to most-frequently changing so the **build cache** is reused. **Multi-stage builds** compile in a big image and copy only the result into a tiny runtime image (this project's own Dockerfile does exactly that!).

**docker compose** - define a whole app in YAML:
~~~
services:
  web:
    image: nginx
    ports: ["8080:80"]
    depends_on: [cache]
  cache:
    image: redis
~~~
[[docker compose up -d]], [[docker compose ps]], [[docker compose logs]], [[docker compose down]].

**Best practices:** small base images (alpine/distroless), pin versions, run as non-root, one process per container, no secrets baked into images, scan images (Trivy), use .dockerignore.
@terms
- Dockerfile :: Text recipe of instructions to build an image
- Layer cache :: Reusing unchanged layers to speed up builds
- Multi-stage build :: Building in one stage and copying only artefacts into a small final image
- docker compose :: Tool to define and run multi-container apps from YAML
- .dockerignore :: Excludes files from the build context
@pro
- "I use multi-stage builds and a non-root user so production images are small and safer."
@quiz
? Which Dockerfile instruction sets the starting image?
+ FROM
- RUN
- CMD
- EXPOSE
> Always first.
? Which command starts every service in docker-compose.yml in the background?
+ docker compose up -d
- docker run compose
- docker start all
- docker build -d
> "docker compose up -d" creates and starts every service in the file, in the background.
? Why put "COPY package.json" and "RUN npm ci" BEFORE "COPY . ."?
+ So dependency layers are cached and reused when only code changes
- It's required syntax
- To make the image larger
- To run as root
> Layer cache.

=== boss
? Which statement is TRUE about containers vs VMs?
+ Containers share the host kernel and start faster
- Containers each include a full OS
- VMs are always lighter
- Containers need a hypervisor
> OS-level virtualization.
? Where should a database container's data live?
+ In a volume
- In the container's writable layer
- In the image
- In /tmp
> Survives container replacement.
? What does "docker run -p 80:8080 app" do?
+ Maps host port 80 to container port 8080
- Maps host 8080 to container 80
- Opens port 80 inside only
- Runs two containers
> HOST:CONTAINER.
? Which is a container image best practice?
+ Run the app as a non-root user
- Bake passwords into the image
- Always use :latest in production
- Install every tool "just in case"
> Least privilege, small images.
? Which AWS service stores private container images?
+ ECR
- EBS
- EFS
- Route 53
> Elastic Container Registry.
`;
