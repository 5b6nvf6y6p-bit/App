#!/usr/bin/env bash
set -euo pipefail

pack() {
  mkdir -p .capwrapp/payload
  if [ -d ios ]; then
    tar -cf .capwrapp/payload/ios.tar ios
  fi
  if [ -d android ]; then
    tar -cf .capwrapp/payload/android.tar android
  fi
  if [ -d ios/App ]; then
    if [ ! -f ios/App/App/public/index.html ] && [ ! -f ios/App/public/index.html ]; then
      echo "npx cap sync did not copy web assets into ios (missing public/index.html)." >&2
      echo "Those files are gitignored, so Xcode fails the archive if they never make it to the macOS job." >&2
      ls -la ios/App/App 2>/dev/null || ls -la ios/App || true
      exit 1
    fi
  fi
  if [ -d android/app ]; then
    if [ ! -f android/app/src/main/assets/public/index.html ]; then
      echo "npx cap sync did not copy web assets into android (missing assets/public/index.html)." >&2
      exit 1
    fi
  fi
  echo "Packed native trees for the GitHub artifact (includes gitignored Capacitor copies)."
}

unpack_ios() {
  if [ -f .capwrapp/payload/ios.tar ]; then
    rm -rf ios
    tar -xf .capwrapp/payload/ios.tar
    echo "Restored ios/ from CapWrapp payload."
  fi
  if [ -d ios/App ] && [ ! -f ios/App/App/public/index.html ] && [ ! -f ios/App/public/index.html ]; then
    echo "ios tree is missing public/index.html after restore." >&2
    exit 1
  fi
}

unpack_android() {
  if [ -f .capwrapp/payload/android.tar ]; then
    rm -rf android
    tar -xf .capwrapp/payload/android.tar
    echo "Restored android/ from CapWrapp payload."
  fi
}

assert_android() {
  python3 - <<'PY'
import pathlib
import re
import sys

missing = []
for name in (
    "android/capacitor.settings.gradle",
    "android/settings.gradle",
    "android/capacitor.settings.gradle.kts",
    "android/settings.gradle.kts",
):
    path = pathlib.Path(name)
    if not path.exists():
        continue
    text = path.read_text()
    for match in re.finditer(r"""(?:File|file)\(\s*["']([^"']+)["']""", text):
        target = (path.parent / match.group(1)).resolve()
        if not target.exists():
            missing.append(str(target))
if missing:
    print(
        "Gradle cannot resolve Capacitor Android libraries (project :capacitor-android lives under node_modules):",
        file=sys.stderr,
    )
    for row in missing:
        print(f"  missing {row}", file=sys.stderr)
    sys.exit(1)
print("Android Gradle Capacitor project dirs are present.")
PY
}

case "${1:-}" in
  pack) pack ;;
  unpack-ios) unpack_ios ;;
  unpack-android) unpack_android ;;
  assert-android) assert_android ;;
  *)
    echo "Usage: keep-native.sh pack|unpack-ios|unpack-android|assert-android" >&2
    exit 1
    ;;
esac
