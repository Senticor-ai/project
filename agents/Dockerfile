FROM python:3.12-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/agents

COPY --from=ghcr.io/astral-sh/uv:0.5.29 /uv /uvx /bin/

COPY agents/pyproject.toml agents/uv.lock ./
RUN uv sync --frozen --no-dev

COPY agents/ ./

RUN adduser -D -u 1000 appuser

ENV PATH="/app/agents/.venv/bin:${PATH}" \
    HOME=/app/agents \
    HAYSTACK_TELEMETRY_ENABLED="false"

USER appuser

EXPOSE 8002

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8002"]
