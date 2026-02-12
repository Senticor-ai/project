#!/usr/bin/env bash
cd "$(dirname "$0")/../backend"
exec uv run python -m app.email.watch_worker --loop
