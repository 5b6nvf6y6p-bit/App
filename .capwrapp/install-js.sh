#!/usr/bin/env bash
set -euo pipefail

if [ -f pnpm-lock.yaml ]; then
  npm install -g pnpm
  pnpm install --frozen-lockfile || pnpm install
elif [ -f yarn.lock ]; then
  yarn install --frozen-lockfile || yarn install
elif [ -f bun.lock ] || [ -f bun.lockb ]; then
  npm install -g bun
  bun install
else
  npm ci || npm install
fi
