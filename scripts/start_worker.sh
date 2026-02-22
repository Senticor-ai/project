#!/usr/bin/env bash
cd "$(dirname "$0")/../backend"
exec uv run --python 3.12 python -m app.worker --loop
