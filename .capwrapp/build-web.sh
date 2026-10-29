#!/usr/bin/env bash
set -euo pipefail

run_build() {
  export CAPWRAPP_NATIVE="${CAPWRAPP_NATIVE:-1}"
  if [ ! -f package.json ]; then
    echo "No package.json" >&2
    exit 1
  fi
  start_stack=0
  for f in vite.config.ts vite.config.js vite.config.mts vite.config.mjs package.json; do
    [ -f "$f" ] || continue
    if grep -qE '@lovable.dev/vite-tanstack-config|@tanstack/react-start|"@tanstack/start"|tanstackStart' "$f"; then
      start_stack=1
      break
    fi
  done
  script="build"
  if [ "$start_stack" -eq 1 ]; then
    export MOBILE_BUILD="${MOBILE_BUILD:-1}"
    echo "CapWrapp: MOBILE_BUILD=$MOBILE_BUILD (Lovable / TanStack Start)"
    if grep -q '"build:mobile"' package.json; then
      script="build:mobile"
      echo "CapWrapp: using package.json script build:mobile"
    fi
  fi
  if ! grep -q ""$script"" package.json; then
    echo "No $script script in package.json" >&2
    exit 1
  fi
  if [ -f pnpm-lock.yaml ]; then
    pnpm run "$script"
  elif [ -f yarn.lock ]; then
    yarn "$script"
  elif [ -f bun.lock ] || [ -f bun.lockb ]; then
    bun run "$script"
  else
    npm run "$script"
  fi
}

echo "CapWrapp: patching Vite for a static Capacitor shell (TanStack Start / Lovable Nitro)"
set +e
node .capwrapp/prepare-native-web-build.mjs
patch_status=$?
set -e
if [ "$patch_status" -eq 0 ]; then
  echo "CapWrapp: Vite config patched for this job only."
elif [ "$patch_status" -eq 2 ]; then
  echo "CapWrapp: no Vite patch applied."
else
  echo "CapWrapp Vite patcher failed (exit $patch_status). Refusing to continue with an unpatched SSR/worker build." >&2
  exit 1
fi
run_build
if python3 .capwrapp/ensure-web-assets.py; then
  exit 0
fi

echo "This toolchain did not emit a static index.html. CapWrapp auto-patches TanStack Start / Lovable Nitro configs when that is this repo." >&2
exit 1
