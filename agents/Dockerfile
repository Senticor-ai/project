FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/agents

COPY --from=ghcr.io/astral-sh/uv:0.5.29 /uv /uvx /bin/

COPY agents/pyproject.toml agents/uv.lock ./
RUN uv sync --frozen --no-dev

COPY agents/ ./

ENV PATH="/app/agents/.venv/bin:${PATH}"

EXPOSE 8002

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8002"]
