#!/usr/bin/env bash
set -euo pipefail
if [ -z "${REPORT_URL:-}" ] || [ -z "${REPORT_TOKEN:-}" ]; then
  echo "No CapWrapp report URL; expecting secrets already in the environment."
  exit 0
fi
python3 - <<'PY'
import json, os, urllib.request, urllib.parse
base = os.environ["REPORT_URL"].rstrip("/")
token = os.environ["REPORT_TOKEN"]
job = os.environ.get("GITHUB_JOB", "").strip()
params = {"vars": "1"}
if job:
  params["platform"] = job
query = f"?{urllib.parse.urlencode(params)}"
req = urllib.request.Request(
  f"{base}/nativeRunSecrets{query}",
  headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
)
with urllib.request.urlopen(req, timeout=30) as res:
  data = json.loads(res.read().decode())
env_path = os.environ["GITHUB_ENV"]
env = data.get("env") or {}
app_env = data.get("appEnv") or {}
# Not secrets (like the next Play versionCode). Masking "58" would hide every 58 in the log.
plain = data.get("vars") or {}

def mask(value):
  text = str(value)
  if len(text) < 2 or "\n" in text or "\r" in text or "%" in text:
    return
  print(f"::add-mask::{text}")

def write_env(fh, key, value):
  fh.write(f"{key}<<CAPWRAPP_EOF\n{value}\nCAPWRAPP_EOF\n")

with open(env_path, "a", encoding="utf-8") as fh:
  for key, value in env.items():
    mask(value)
    write_env(fh, key, value)
  for key, value in app_env.items():
    mask(value)
    write_env(fh, key, value)
  for key, value in plain.items():
    write_env(fh, key, value)

if app_env:
  lines = [f"{key}={json.dumps(str(value))}" for key, value in app_env.items()]
  text = "\n".join(lines) + "\n"
  for name in (".env.production.local", ".env.local"):
    with open(name, "w", encoding="utf-8") as fh:
      fh.write(text)
  print(f"Loaded CapWrapp store secrets and {len(app_env)} app environment variables.")
else:
  print("Loaded CapWrapp store secrets.")
PY
