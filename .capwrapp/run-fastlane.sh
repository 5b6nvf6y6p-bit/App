#!/usr/bin/env bash
set -euo pipefail
# Fastlane only loads ./fastlane/Fastfile. There is no --fastfile flag.
if [ ! -f .capwrapp/Fastfile ]; then
  echo "Missing .capwrapp/Fastfile" >&2
  exit 1
fi
mkdir -p fastlane
cp .capwrapp/Fastfile fastlane/Fastfile
exec fastlane "$@"
