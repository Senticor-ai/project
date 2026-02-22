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
    ├── local/              # Local dev (k3s/k3d)
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

Target: k3s / k3d on Rancher Desktop.

### Prerequisites

Create a k3d cluster (if not already done):

```bash
k3d cluster create project -p "8080:80@loadbalancer"
```

### Build and load images

From repo root:

```bash
docker build -f backend/Dockerfile -t project-backend:local .
docker build -f frontend/Dockerfile -t project-frontend:local .
k3d image import project-backend:local project-frontend:local -c project
```

For k3s (containerd):

```bash
docker save project-backend:local | sudo k3s ctr images import -
docker save project-frontend:local | sudo k3s ctr images import -
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
- Exposes Prometheus metrics: backend API on `:8000/metrics`, worker on `:9090/metrics`, push-worker on `:9091/metrics`, watch-worker on `:9092/metrics`

### Ops-managed resources

This overlay intentionally does **not** include:

- `Namespace`
- `Ingress`
- `Secret` manifests
- RBAC (`Role`, `RoleBinding`, `ClusterRole`, `ClusterRoleBinding`)
- `NetworkPolicy`

Ops provides these resources when onboarding the tenant.

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
| `GCPE_GITLAB_TOKEN` | `gitlab-ci-exporter` token |

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
