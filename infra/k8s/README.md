# k3s First-Pass Local Stack

This folder contains a minimal Kubernetes setup for local end-to-end testing with containers:

- Postgres (StatefulSet + PVC)
- Backend API (Deployment + PVC for uploaded files)
- Frontend (Deployment with Nginx serving SPA and proxying `/api` to backend)
- Ingress (Traefik)
- One-shot DB initialization job

## Simple PVC storage backend on k3s

Use k3s default `local-path` provisioner first.

- It is already bundled with k3s (`StorageClass/local-path`)
- It works well for local/dev and single-node setups
- It is `ReadWriteOnce` and node-local (not shared, not HA)

This minimal setup relies on the default StorageClass (no explicit `storageClassName` in PVCs).

## Optional: create a local k3d cluster

```bash
k3d cluster create terminandoyo -p "8080:80@loadbalancer"
```

## Build images

From repo root:

```bash
docker build -f backend/Dockerfile -t terminandoyo-backend:local .
docker build -f frontend/Dockerfile -t terminandoyo-frontend:local .
```

## Load images into k3s/k3d

### k3d

```bash
k3d image import terminandoyo-backend:local terminandoyo-frontend:local -c <your-cluster-name>
```

### k3s (containerd)

```bash
docker save terminandoyo-backend:local | sudo k3s ctr images import -
docker save terminandoyo-frontend:local | sudo k3s ctr images import -
```

## Deploy baseline resources

```bash
kubectl apply -k infra/k8s/minimal
```

## Initialize database schema (one-time per fresh DB)

```bash
kubectl apply -f infra/k8s/minimal/job-db-init.yaml
kubectl wait --for=condition=complete -n terminandoyo job/db-init --timeout=180s
```

If you need to run it again:

```bash
kubectl delete job -n terminandoyo db-init --ignore-not-found
kubectl apply -f infra/k8s/minimal/job-db-init.yaml
```

## Access app

### Option A (simplest): port-forward frontend service

```bash
kubectl -n terminandoyo port-forward svc/frontend 8080:80
```

Then open: `http://localhost:8080`

### Option B: use ingress

If your local cluster exposes Traefik, use `http://localhost` or your ingress endpoint.

## Run frontend E2E tests against cluster

```bash
cd frontend
E2E_BASE_URL=http://localhost:8080 npm run test:e2e
```

## Quick health checks

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/health/schema
```

## Notes

- Default secret value in `infra/k8s/minimal/secret.yaml` is for local testing only. Change it.
- This first pass does not include Fuseki/Meilisearch workers.
- Backend file uploads are persisted to PVC mounted at `/data/storage`.
