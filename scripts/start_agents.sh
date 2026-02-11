#!/usr/bin/env bash
cd "$(dirname "$0")/../agents"
exec uv run uvicorn app:app --reload --host 127.0.0.1 --port "${AGENTS_PORT:-8002}"
