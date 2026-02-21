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
    └── production/         # Production (Harbor registry)
        ├── kustomization.yaml
        ├── configmap.yaml
        ├── secret.yaml             # SOPS-encrypted app secrets
        ├── secret-pubsub-sa.yaml   # SOPS-encrypted GCP service account
        ├── ingress.yaml
        └── patches/
            ├── backend.yaml
            ├── worker.yaml
            ├── push-worker.yaml
            ├── frontend.yaml
            ├── storybook.yaml
            ├── postgres.yaml
            ├── backend-pubsub.yaml  # PubSub SA volume mount
            └── worker-pubsub.yaml   # PubSub SA volume mount
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

Target: shared cluster with Harbor registry.

The production overlay:

- Switches images to Harbor registry via Kustomize `images` transformer
- Adds resource requests/limits via strategic merge patches
- Sets `imagePullPolicy: Always` for application images
- Provides production ConfigMap (HTTPS CORS, CSRF enabled, JSON logging, OTEL)
- Exposes Prometheus metrics: backend API on `:8000/metrics`, worker on `:9090/metrics`, push-worker on `:9091/metrics`, watch-worker on `:9092/metrics`

Namespace is managed by ops. Secrets are SOPS-encrypted in version control and auto-deployed by Flux.

### Secret management (SOPS + age)

Production secrets are encrypted with [SOPS](https://github.com/getsops/sops) using [age](https://github.com/FiloSottile/age). Flux decrypts them automatically on the cluster.

**Two secret files:**

| File | Secret name | Contents |
|------|-------------|----------|
| `secret.yaml` | `app-secrets` | Env vars (DB password, JWT, OAuth, VAPID, API keys) |
| `secret-pubsub-sa.yaml` | `pubsub-sa` | GCP service account JSON for Gmail Pub/Sub |

The `pubsub-sa` secret is volume-mounted at `/etc/gcp/pubsub-sa.json` on backend, worker, and watch-worker pods.

**Prerequisites:**

```bash
brew install sops age
```

**To edit secrets** (requires the age private key from 1Password):

```bash
# Set SOPS_AGE_KEY_FILE to point to your private key
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt

# Edit in-place (opens decrypted in $EDITOR, re-encrypts on save)
sops infra/k8s/overlays/production/secret.yaml

# Or decrypt to stdout for inspection
sops --decrypt infra/k8s/overlays/production/secret.yaml
```

**To add a new secret file:**

```bash
# 1. Create plaintext YAML
# 2. Encrypt in-place (uses .sops.yaml creation_rules)
sops --encrypt --in-place infra/k8s/overlays/production/my-new-secret.yaml
# 3. Add to kustomization.yaml resources list
# 4. Commit and push — Flux auto-deploys within 5 minutes
```

**Key reference:**

| Key | Description | How to generate |
|-----|-------------|-----------------|
| `POSTGRES_PASSWORD` | PostgreSQL password | — |
| `JWT_SECRET` | Internal token signing | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `GMAIL_CLIENT_ID` | Google OAuth client ID | [Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials) |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret | Same as above |
| `GMAIL_STATE_SECRET` | OAuth CSRF state signing | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `ENCRYPTION_KEY` | Fernet key for token encryption | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `VAPID_PUBLIC_KEY` | Web Push public key | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Web Push private key | Same as above |
| `OPENROUTER_API_KEY` | LLM API key | [OpenRouter dashboard](https://openrouter.ai/keys) |

Full setup guide: Storybook > Engineering > Email Integration (`?path=/docs/engineering-email-integration--docs`).

### Verify rendered manifests

```bash
kubectl kustomize infra/k8s/overlays/production
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
