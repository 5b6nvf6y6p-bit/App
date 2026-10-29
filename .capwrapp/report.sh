#!/usr/bin/env bash
set -euo pipefail
STEP="${1:-}"
STATUS="${2:-}"
DETAIL="${3:-}"
if [ -z "${REPORT_URL:-}" ] || [ -z "${REPORT_TOKEN:-}" ]; then
  echo "skip report $STEP $STATUS"
  exit 0
fi
if [ -z "$STEP" ] || [ -z "$STATUS" ]; then
  echo "usage: report.sh <step> <status> [detail]" >&2
  exit 1
fi
python3 - "$STEP" "$STATUS" "$DETAIL" <<'PY'
import json, os, sys, urllib.request
step, status, detail = sys.argv[1], sys.argv[2], sys.argv[3]
base = os.environ.get("REPORT_URL", "").rstrip("/")
token = os.environ.get("REPORT_TOKEN", "")
run_id = os.environ.get("GITHUB_RUN_ID", "")
repo = os.environ.get("GITHUB_REPOSITORY", "")
server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
payload = {
  "step": step,
  "status": status,
  "detail": detail,
  "workflow_url": f"{server}/{repo}/actions/runs/{run_id}" if run_id and repo else "",
  "build": os.environ.get("CAPWRAPP_BUILD_NUMBER", ""),
}
req = urllib.request.Request(
  f"{base}/reportNativeRun",
  data=json.dumps(payload).encode(),
  headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
  method="POST",
)
try:
  with urllib.request.urlopen(req, timeout=20) as res:
    res.read()
except Exception as err:
  print(f"report failed: {err}", file=sys.stderr)
PY
