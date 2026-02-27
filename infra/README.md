# Local Infrastructure (Rancher Desktop)

Default local dev mode uses Kubernetes only for infrastructure (Postgres),
while app services run on host via `npm run dev`.

## Default: Postgres Infrastructure Only

From the repo root:

```bash
kubectl config use-context rancher-desktop
npm run dev:bootstrap
```

Requires `ansible-playbook`, `kubectl`, and `nerdctl` on your PATH.

Run app services from repo root:

```bash
npm run dev
```

`npm run dev` auto-starts a `kubectl port-forward` process for Postgres
(`svc/postgres -> localhost:5432`) when needed, then runs migrations before
bringing up app services.

## Optional: Full Local Kubernetes Stack

For running frontend/backend/workers/storybook inside k8s, use:

```bash
kubectl apply -k infra/k8s/overlays/local
kubectl -n project port-forward svc/frontend 8080:80
```

## Verify

- Namespace exists: `kubectl get ns project`
- Workloads healthy: `kubectl -n project get pods`
- Postgres reachable: `psql -h localhost -p 5432 -U project -d project -c "select 1;"`

See [`infra/k8s/README.md`](k8s/README.md) for full local/production manifest
documentation and operational contracts.
