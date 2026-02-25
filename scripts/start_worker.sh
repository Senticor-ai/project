#!/usr/bin/env bash
cd "$(dirname "$0")/../backend"
# Reduce noisy DB statement logs in background worker loops.
export LOG_DB_QUERIES="${LOG_DB_QUERIES:-0}"
exec uv run --python 3.12 python -m app.worker --loop
