FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend

# WeasyPrint system dependencies (pango, cairo, gobject for PDF rendering)
# libmagic for MIME type detection (python-magic)
RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends \
       libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
       libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.5.29 /uv /uvx /bin/

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/ ./

ENV PATH="/app/backend/.venv/bin:${PATH}"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
