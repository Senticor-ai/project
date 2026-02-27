# Kubernetes Manifests

Kustomize base/overlay structure for deploying project to Kubernetes.

## Structure

```
k8s/
├── base/                   # Shared resource definitions
│   ├── kustomization.yaml
│   ├── backend.yaml        # API Deployment + Service (includes init containers)
│   ├── worker.yaml         # Outbox worker Deployment (imports, search indexing)
│   ├── push-worker.yaml    # Push notification worker Deployment
│   ├── frontend.yaml       # Deployment + Service
│   ├── postgres.yaml       # StatefulSet + Service
│   └── pvc-backend-files.yaml
└── overlays/
    ├── local/              # Local dev (Rancher Desktop k3s)
    │   ├── kustomization.yaml
    │   ├── namespace.yaml
    │   ├── configmap.yaml
    │   ├── secret.yaml
    │   └── ingress.yaml
    └── production/         # Production (Flux tenant on senticor000)
        ├── kustomization.yaml
        ├── configmap.yaml
        ├── secret.yaml             # reference only (ops-managed secret contract)
        ├── secret-pubsub-sa.yaml   # reference only (ops-managed secret contract)
        ├── ingress.yaml            # reference only (ops-managed ingress)
        └── patches/
            ├── backend.yaml
            ├── worker.yaml
            ├── push-worker.yaml
            ├── frontend.yaml
            ├── storybook.yaml
            ├── postgres.yaml
            ├── backend-pubsub.yaml  # PubSub SA volume mount
            ├── worker-pubsub.yaml   # PubSub SA volume mount
            └── watch-worker-pubsub.yaml  # PubSub SA volume mount
```

## Base

The base defines core workloads without namespace, resource limits, or
environment-specific configuration. Images default to local builds
(`project-backend:local`, `project-frontend:local`) with
`imagePullPolicy: IfNotPresent`.

The backend API Deployment includes two init containers:

1. **wait-for-postgres** — polls `pg_isready` until the database is available
2. **db-init** — runs `uv run python -m app.db_init` (`alembic upgrade head`)

This eliminates the need for a separate Job resource. Init containers run on
every pod start, which is safe because Alembic applies only pending revisions.

Both worker Deployments (`worker`, `push-worker`) use the same backend image
with a different `command:`. Each worker exposes a health/metrics HTTP sidecar:

| Worker       | Health port | Command |
|--------------|-------------|---------|
| worker       | 9090        | `python -m app.worker --loop` |
| push-worker  | 9091        | `python -m app.push_worker --loop` |

The sidecar provides:
- `GET /health` — 200 if polling loop is alive, 503 if stuck
- `GET /metrics` — Prometheus format (batches, events, duration, up gauge)

Both overlays provide their own ConfigMap (`app-config`) as a resource since
environment values differ completely between local and production.

## Local Overlay

Target: Rancher Desktop with Kubernetes (k3s) enabled.

If you prefer the faster host-process dev loop (`npm run dev`), use
`ansible-playbook infra/local-dev-bootstrap.yml` instead of this full overlay.
That playbook bootstraps Postgres + OpenClaw image only.

### Prerequisites

Ensure Rancher Desktop is running with:

```bash
kubectl config use-context rancher-desktop
kubectl get nodes
```

### Build local images (containerd/nerdctl)

From repo root:

```bash
nerdctl build -f backend/Dockerfile -t project-backend:local .
nerdctl build -f frontend/Dockerfile -t project-frontend:local .
nerdctl build -f frontend/Dockerfile.storybook -t project-storybook:local .
nerdctl build -f openclaw/Dockerfile.alpha -t project-openclaw-alpha:dev .
```

### Deploy

```bash
kubectl apply -k infra/k8s/overlays/local
```

Database initialization happens automatically via init containers —
no separate job step needed.

### Access

Port-forward:

```bash
kubectl -n project port-forward svc/frontend 8080:80
```

Then open: `http://localhost:8080`

Or use Traefik ingress if your cluster exposes it.

### Health checks

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/health/schema
```

### E2E tests

```bash
cd frontend
E2E_BASE_URL=http://localhost:8080 npm run test:e2e
```

## Production Overlay

Target: `senticor000` Flux tenant for `project.senticor.runs.onstackit.cloud`.

Flux contract for this repo:

- Entrypoint path: `infra/k8s/overlays/production`
- Branch: `main`

The production overlay:

- Switches images to StackIT registry (`registry.onstackit.cloud/senticor/project/*`) via Kustomize `images`
- Adds resource requests/limits via strategic merge patches
- Sets `imagePullPolicy: Always` for application images
- Uses `imagePullSecrets: stackit-registry` for application workloads
- Provides production ConfigMap (HTTPS CORS, CSRF enabled, JSON logging, OTEL)
- Configures OpenClaw runtime as `OPENCLAW_RUNTIME=k8s` with `OPENCLAW_IMAGE` pinned to the same commit SHA lineage as other workloads
- Keeps `DEV_TOOLS_ENABLED: "true"` for this demo tenant so `/settings/developer` actions work
- Exposes Prometheus metrics: backend API on `:8000/metrics`, worker on `:9090/metrics`, push-worker on `:9091/metrics`, watch-worker on `:9092/metrics`

Important: this tenant currently operates as a demo/dev system (destructive tools enabled).

### Ops-managed resources

This overlay intentionally does **not** include:

- `Namespace`
- `Ingress`
- `Secret` manifests
- RBAC (`Role`, `RoleBinding`, `ClusterRole`, `ClusterRoleBinding`)
- `NetworkPolicy`

### OpenClaw Runtime Contract (k8s mode)

OpenClaw runs as per-user Pods created by the backend via Kubernetes API calls.

Exact ServiceAccount:

- `backend-openclaw-runtime` (set on backend Deployment `serviceAccountName`)

Namespace-scoped RBAC required:

- `pods`: `get`, `list`, `create`, `delete`
- `services`: `get`, `list`, `create`, `delete`

Not required by current runtime: `watch`, `patch`, `update`, `pods/status`.

Local overlay includes this Role/RoleBinding; production RBAC is provisioned by ops
in the infrastructure repo and must target `backend-openclaw-runtime`.

Resource naming and labeling contract for runtime-created Pod/Service:

- Name: `openclaw-<user-id>` (DNS-safe, stable per user)
- Labels:
- `app=openclaw`
- `app.kubernetes.io/name=openclaw`
- `app.kubernetes.io/component=runtime`
- `app.kubernetes.io/managed-by=project-backend`
- `openclaw.instance=<resource-name>`
- `copilot.user_id=<user-id>`
- `copilot.managed=true`
- Annotations:
- `project.senticor.ai/runtime=openclaw-k8s`
- `project.senticor.ai/owner-user-id=<user-id>`
- `project.senticor.ai/instance=<resource-name>`

Lifecycle and cleanup guarantees:

- One runtime Pod/Service per user (derived from `user_agent_settings`).
- Deleted on explicit stop/restart and whenever agent settings change.
- Idle containers are reaped every 60s by worker loop using `OPENCLAW_IDLE_TIMEOUT_SECONDS` (default 1800s).
- Orphan strategy: worker loop also lists `app=openclaw,copilot.managed=true` Pod/Service resources and deletes objects that are no longer tracked as `starting`/`running` in DB.

Runtime resource envelope and scale:

- Per OpenClaw Pod (default, env-tunable):
- Requests: `cpu=100m`, `memory=256Mi`
- Limits: `cpu=500m`, `memory=1Gi`
- Max concurrent runtime Pods per tenant: `OPENCLAW_K8S_MAX_CONCURRENT_PODS` (default `8`).
- Max concurrent runtime Pods per user: `1` (stable per-user name + DB state machine).

Deterministic production smoke validation:

```bash
python scripts/smoke-openclaw-prod.py \
  --base-url https://project.senticor.runs.onstackit.cloud \
  --api-key "$E2E_OPENROUTER_API_KEY"
```

Pass criteria:

- `/api/chat/completions` returns `text_delta` and `done` with no stream `error`.
- `/api/agent/status` reports `running` URL on `.svc.cluster.local:18789`.
- `/api/agent/container/stop` transitions status to `stopped` and clears runtime URL.

### Secrets handoff contract (ops)

Application manifests still consume these two secret names by reference:

- `app-secrets` via `envFrom`/`secretKeyRef`
- `pubsub-sa` via volume mount at `/etc/gcp/pubsub-sa.json`

Required keys for `app-secrets`:

| Key | Used by |
|-----|---------|
| `POSTGRES_PASSWORD` | Postgres StatefulSet + backend/worker runtime DB connection |
| `JWT_SECRET` | Backend auth token signing |
| `GMAIL_CLIENT_ID` | Gmail OAuth |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth |
| `GMAIL_STATE_SECRET` | Gmail OAuth state verification |
| `ENCRYPTION_KEY` | Backend token encryption |
| `VAPID_PUBLIC_KEY` | Web push |
| `VAPID_PRIVATE_KEY` | Web push |
| `OPENROUTER_API_KEY` | AI provider integration |

Required key for `pubsub-sa`:

| Key | Format | Used by |
|-----|--------|---------|
| `pubsub-sa.json` | GCP service account JSON | backend/worker/watch-worker Gmail Pub/Sub client |

Full setup guide: Storybook > Engineering > Email Integration (`?path=/docs/engineering-email-integration--docs`).

### Verify rendered manifests

```bash
kubectl kustomize infra/k8s/overlays/production > /tmp/project-production-render.yaml

# Must return no matches (tenant-safe overlay)
rg -n "kind: (Namespace|Ingress|NetworkPolicy|Role|RoleBinding|ClusterRole|ClusterRoleBinding)|^[[:space:]]*namespace:" /tmp/project-production-render.yaml

# Service contract checks
awk 'BEGIN{RS="---";FS="\n"} /kind: Service/ {
  name=""; port=""
  for (i=1;i<=NF;i++) {
    if ($i ~ /^[[:space:]]*name: / && name == "") { sub(/^[[:space:]]*name: /,"",$i); name=$i }
    if ($i ~ /^[[:space:]]*port: / && port == "") { sub(/^[[:space:]]*port: /,"",$i); port=$i }
  }
  if (name == "frontend" || name == "storybook") print name ": " port
}' /tmp/project-production-render.yaml
```

### Resource budget

| Component    | CPU request | Memory request | CPU limit | Memory limit |
|--------------|-------------|----------------|-----------|--------------|
| Frontend     | 50m         | 128Mi          | 200m      | 256Mi        |
| Backend API  | 200m        | 512Mi          | 1000m     | 2Gi          |
| Worker       | 100m        | 256Mi          | 500m      | 1Gi          |
| Push Worker  | 50m         | 128Mi          | 250m      | 512Mi        |
| Watch Worker | 50m         | 128Mi          | 250m      | 512Mi        |
| PostgreSQL   | 200m        | 256Mi          | 500m      | 1Gi          |
| **Total**    | **650m**    | **1408Mi**     | **2700m** | **5.25Gi**   |

## Notes

- The local overlay includes a Secret with a placeholder password — change it for anything beyond throwaway testing.
- ConfigMap is entirely overlay-specific (not patched from base) because local and production values differ completely.
- The `app-secrets` Secret name is standardized across both environments.
- Local overlay scales `watch-worker` to 0 replicas by default.
- PVCs use the default StorageClass (no explicit `storageClassName`). k3s bundles `local-path` provisioner which works for local/single-node setups.
- Meilisearch is an optional service — enable via `MEILI_*` env vars in the ConfigMap.
