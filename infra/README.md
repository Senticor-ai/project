# Local Infrastructure (Rancher Desktop)

Postgres runs locally via Docker Compose. Meilisearch is an optional service
behind the `optional` profile — it is not needed for basic development and is
excluded from CI.

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
- Meilisearch: `http://localhost:7700` (optional profile)
