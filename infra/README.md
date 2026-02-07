# Local Infrastructure (Rancher Desktop)

Postgres runs locally via Docker Compose. Fuseki and Meilisearch are optional
services behind the `optional` profile — they are not needed for basic
development and are excluded from CI.

## Start Services

From the repo root:

```
docker compose -f infra/docker-compose.yml up -d
```

This starts **Postgres only**. To also start optional services:

```
docker compose -f infra/docker-compose.yml --profile optional up -d
```

Ensure `POSTGRES_PASSWORD` is set in your environment or `.env`.
Default is `changeme` for local dev if not provided.

If your Rancher Desktop is set to containerd, you can use `nerdctl` instead:

```
nerdctl compose -f infra/docker-compose.yml up -d
```

## Verify

- Postgres: `localhost:5432`
- Fuseki UI: `http://localhost:3030` (optional profile)
- Meilisearch: `http://localhost:7700` (optional profile)

After Fuseki starts, create a dataset named `todo` (or set `FUSEKI_DATASET` to match your dataset name).
Set `FUSEKI_ENABLED=true` in `.env` to activate the Fuseki projection in the worker.
