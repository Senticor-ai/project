#!/usr/bin/env bash
cd "$(dirname "$0")/../frontend"
exec npx storybook dev -p 6006 --no-open
