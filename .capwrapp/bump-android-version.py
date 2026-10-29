#!/usr/bin/env python3
import os, pathlib, re, time
version = os.environ.get("CAPWRAPP_VERSION") or ""
# CapWrapp sends one above every versionCode Play has seen.
code = os.environ.get("CAPWRAPP_ANDROID_VERSION_CODE", "").strip()
if code.isdigit():
  print(f"versionCode {code} (one above the highest on Google Play)")
else:
  code = str(int(time.time()) % 2_100_000_000)
  print(f"CapWrapp could not read Google Play; using a time-based versionCode {code}")
roots =[pathlib.Path("android/app/build.gradle"), pathlib.Path("android/app/build.gradle.kts"), pathlib.Path("android/variables.gradle")]
changed = False
for path in roots:
  if not path.exists():
    continue
  text = path.read_text()
  orig = text
  if version:
    text = re.sub(r'versionName\s+"[^"]+"', f'versionName "{version}"', text)
    text = re.sub(r'versionName\s+=\s+"[^"]+"', f'versionName = "{version}"', text)
  text = re.sub(r'versionCode\s+\d+', f'versionCode {code}', text)
  text = re.sub(r'versionCode\s+=\s+\d+', f'versionCode = {code}', text)
  if text != orig:
    path.write_text(text)
    changed = True
    print(f"Updated {path}")
if not changed:
  print("No Gradle version fields found to bump")
elif os.environ.get("GITHUB_ENV"):
  # Later report steps send it to CapWrapp, which tags the commit with this build.
  with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as fh:
    fh.write(f"CAPWRAPP_BUILD_NUMBER={code}\n")
