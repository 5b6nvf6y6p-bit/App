#!/usr/bin/env python3
from pathlib import Path

STORE = Path("android/app/capwrapp-upload.p12")
SNIPPET = Path("android/app/capwrapp-signing.gradle")
MARKER = "capwrapp-signing.gradle"

SNIPPET.write_text("""android {
    signingConfigs {
        capwrapp {
            def storePath = System.getenv("CAPWRAPP_ANDROID_KEYSTORE_FILE")
            if (storePath == null || storePath.isEmpty()) {
                storePath = new File(project.projectDir, "capwrapp-upload.p12").absolutePath
            }
            storeFile file(storePath)
            storePassword System.getenv("CAPWRAPP_ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("CAPWRAPP_ANDROID_KEY_ALIAS")
            keyPassword System.getenv("CAPWRAPP_ANDROID_KEY_PASSWORD") ?: System.getenv("CAPWRAPP_ANDROID_KEYSTORE_PASSWORD")
            storeType System.getenv("CAPWRAPP_ANDROID_KEYSTORE_TYPE") ?: "PKCS12"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.capwrapp
        }
    }
}
""")

def ensure_apply(path: Path, line: str) -> None:
    if not path.exists():
        return
    text = path.read_text()
    if MARKER in text:
        return
    path.write_text(text.rstrip() + "\n\n" + line + "\n")
    print(f"Applied CapWrapp signing in {path}")

ensure_apply(Path("android/app/build.gradle"), 'apply from: "capwrapp-signing.gradle"')
ensure_apply(Path("android/app/build.gradle.kts"), 'apply(from = "capwrapp-signing.gradle")')
if not STORE.exists():
    raise SystemExit("Missing android/app/capwrapp-upload.p12 — decode the CapWrapp keystore first.")
print("CapWrapp Android signing is wired to the upload keystore.")
