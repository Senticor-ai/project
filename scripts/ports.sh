#!/usr/bin/env bash
# Central port computation — source this file, don't execute directly.
# All ports derive from PORT_OFFSET (default 0, set in .env).
#
# Port map (offset=0):
#   Service            Dev    E2E
#   Frontend (Vite)    5173   5174
#   Backend (uvicorn)  8000   8001
#   Agents             8002   8003
#   Storybook          6006   —
#   Worker health      9090   9094
#   Push worker health 9091   9095
#   Gmail watch health 9092   —
#   PostgreSQL         5432   5432 (shared instance, separate DBs)

PORT_OFFSET="${PORT_OFFSET:-0}"

# Dev ports
DEV_FRONTEND_PORT=$((5173 + PORT_OFFSET))
DEV_BACKEND_PORT=$((8000 + PORT_OFFSET))
DEV_AGENTS_PORT=$((8002 + PORT_OFFSET))
DEV_STORYBOOK_PORT=$((6006 + PORT_OFFSET))
DEV_WORKER_HEALTH_PORT=$((9090 + PORT_OFFSET))
DEV_PUSH_WORKER_HEALTH_PORT=$((9091 + PORT_OFFSET))
DEV_GMAIL_WATCH_WORKER_HEALTH_PORT=$((9092 + PORT_OFFSET))

# E2E ports (offset from dev within the same band)
E2E_FRONTEND_PORT=$((5174 + PORT_OFFSET))
E2E_BACKEND_PORT=$((8001 + PORT_OFFSET))
E2E_AGENTS_PORT=$((8003 + PORT_OFFSET))
E2E_WORKER_HEALTH_PORT=$((9094 + PORT_OFFSET))
E2E_PUSH_WORKER_HEALTH_PORT=$((9095 + PORT_OFFSET))
