# Local Infrastructure (Rancher Desktop)

This repo expects Postgres and Apache Jena Fuseki to run locally via Rancher Desktop.

## Start Services

From the repo root:

```
docker compose -f infra/docker-compose.yml up -d
```

Ensure `POSTGRES_PASSWORD` and `FUSEKI_ADMIN_PASSWORD` are set in your environment or `.env`.
Defaults are set to `changeme` for local dev if not provided.

If your Rancher Desktop is set to containerd, you can use `nerdctl` instead:

```
nerdctl compose -f infra/docker-compose.yml up -d
```

## Verify

- Postgres: `localhost:5432`
- Fuseki UI: `http://localhost:3030`
- Meilisearch: `http://localhost:7700`

After Fuseki starts, create a dataset named `todo` (or set `FUSEKI_DATASET` to match your dataset name).
