#!/usr/bin/env bash
cd "$(dirname "$0")/../backend"
exec uv run uvicorn app.main:app --reload --host 127.0.0.1 --port "${VITE_BACKEND_PORT:-8000}"
