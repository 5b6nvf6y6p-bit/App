#!/usr/bin/env python3
import json, os, re, shutil, sys

CANDIDATES = [
    ".output/public",
    ".vercel/output/static",
    "dist/client",
    "build/client",
    "dist",
    "build",
    "www",
    "out",
]
SKIP = {
    ".git", "node_modules", "ios", "android", ".capwrapp", ".github", ".wrangler",
    ".next", "coverage", "cypress", "playwright-report", "test-results",
    "storybook-static", "docs",
}
ALLOW_DOT = {".output", ".vercel"}
PREFERRED_HTML = ("index.html", "_shell.html", "shell.html", "200.html")
SKIP_HTML = {"404.html", "500.html", "error.html"}
TICK = chr(96)
QUOTE = "['\"%s]" % TICK

def read(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""

def normalize(value):
    value = value.strip()
    if value.startswith("./"):
        value = value[2:]
    return value.rstrip("/")

def parse_field(source, field):
    if not source.strip():
        return ""
    try:
        parsed = json.loads(source)
        value = parsed.get(field)
        if isinstance(value, str):
            return normalize(value)
    except json.JSONDecodeError:
        pass
    pattern = r"\b" + re.escape(field) + r"\s*:\s*" + QUOTE + "([^'\"" + TICK + "]+)" + QUOTE
    match = re.search(pattern, source)
    return normalize(match.group(1)) if match else ""

def capacitor_web_dir():
    for name in ("capacitor.config.json", "capacitor.config.ts", "capacitor.config.js"):
        found = parse_field(read(name), "webDir")
        if found:
            return found
    return "dist"

def vite_out_dir():
    for name in ("vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"):
        found = parse_field(read(name), "outDir")
        if found:
            return found
    return ""

def has_index(path):
    return os.path.isfile(os.path.join(path, "index.html"))

def promote_shell(folder):
    if not os.path.isdir(folder) or has_index(folder):
        return has_index(folder)
    for name in PREFERRED_HTML:
        if name == "index.html":
            continue
        src = os.path.join(folder, name)
        if os.path.isfile(src):
            shutil.copy(src, os.path.join(folder, "index.html"))
            print("Copied %s -> %s/index.html so Capacitor has an entry file." % (name, folder))
            return True
    htmls = sorted(
        name
        for name in os.listdir(folder)
        if name.endswith(".html") and name not in SKIP_HTML
    )
    if htmls:
        shutil.copy(os.path.join(folder, htmls[0]), os.path.join(folder, "index.html"))
        print("Copied %s -> %s/index.html so Capacitor has an entry file." % (htmls[0], folder))
        return True
    return write_spa_index(folder)

def write_spa_index(folder):
    if has_index(folder):
        return True
    assets = os.path.join(folder, "assets")
    if not os.path.isdir(assets):
        return False
    names = os.listdir(assets)
    js = None
    for prefix in ("index", "entry", "client", "main", "app"):
        hits = sorted(
            name
            for name in names
            if name.endswith(".js")
            and not name.endswith(".map")
            and (name == prefix + ".js" or name.startswith(prefix + "-"))
        )
        if hits:
            js = hits[0]
            break
    if not js:
        return False
    js_path = os.path.join(assets, js)
    try:
        with open(js_path, encoding="utf-8", errors="ignore") as fh:
            chunk = fh.read(512 * 1024)
        if "$_TSR" in chunk:
            print(
                "Refusing to invent index.html for a TanStack Start / Lovable client (missing window.$_TSR shell).",
                file=sys.stderr,
            )
            return False
    except OSError:
        return False
    css = sorted(name for name in names if name.endswith(".css") and not name.endswith(".map"))
    lines = [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "  <head>",
        '    <meta charset="UTF-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '    <meta name="robots" content="noindex, nofollow" />',
    ]
    for name in css:
        lines.append('    <link rel="stylesheet" href="./assets/%s">' % name)
    lines.extend(["  </head>", "  <body>"])
    lines.append('    <script type="module" src="./assets/%s"></script>' % js)
    lines.extend(["  </body>", "</html>", ""])
    with open(os.path.join(folder, "index.html"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print("Wrote %s/index.html from client assets so Capacitor has an entry file." % folder)
    return True

def dirs_with_index():
    for name in CANDIDATES:
        promote_shell(name)
    hits = []
    for name in CANDIDATES:
        if has_index(name):
            hits.append(name)
    for root, dirnames, filenames in os.walk("."):
        dirnames[:] = [
            name
            for name in dirnames
            if name not in SKIP and (not name.startswith(".") or name in ALLOW_DOT)
        ]
        rel = os.path.relpath(root, ".")
        depth = 0 if rel == "." else rel.count(os.sep) + 1
        if depth > 4:
            dirnames[:] = []
            continue
        if "index.html" in filenames and rel != ".":
            path = rel.replace(os.sep, "/")
            if path not in hits:
                hits.append(path)
    return hits

def pick(web_dir, vite_out, found):
    has = {normalize(item) for item in found}
    want = normalize(web_dir) or "dist"
    if want in has:
        return want
    preferred = [item for item in [normalize(vite_out)] + CANDIDATES if item]
    for item in preferred:
        if item in has:
            return item
    nested = sorted(
        [item for item in has if any(item == name or item.endswith("/" + name) for name in preferred)],
        key=lambda item: (item.count("/"), len(item)),
    )
    if nested:
        return nested[0]
    leftover = sorted(has, key=len)
    return leftover[0] if leftover else None

def ssr_hint():
    hints = []
    if os.path.isdir(".output/server") or os.path.isfile(".output/nitro.json"):
        hints.append(
            "This looks like a Nitro / TanStack Start worker build. Capacitor needs a static HTML shell, not a server bundle."
        )
    if os.path.isdir(".next") and not has_index("out"):
        hints.append("This looks like Next.js without a static export (out/index.html).")
    if os.path.isdir(".nuxt") or os.path.isfile("nuxt.config.ts") or os.path.isfile("nuxt.config.js"):
        hints.append("This looks like Nuxt SSR. Use a static preset or ssr: false for a store binary.")
    return hints

def main():
    web_dir = capacitor_web_dir()
    vite_out = vite_out_dir()
    promote_shell(web_dir)
    for name in CANDIDATES:
        promote_shell(name)
    found = dirs_with_index()
    if has_index(web_dir):
        print("Web assets ready at %s/" % web_dir)
        return 0
    source = pick(web_dir, vite_out, found)
    if not source:
        print("Web build finished but Capacitor could not find %s/index.html." % web_dir, file=sys.stderr)
        print("capacitor.config webDir is %r." % web_dir, file=sys.stderr)
        print(
            "Capacitor copies a static folder with index.html into the app. "
            "Vite SPA/PWA, Base44, and most Cursor/Claude Vite apps already emit dist/. "
            "SSR workers (default Lovable TanStack Start/Nitro, Next without output: 'export') do not.",
            file=sys.stderr,
        )
        for hint in ssr_hint():
            print(hint, file=sys.stderr)
        print("Folders with index.html: %s" % (", ".join(found) or "(none)"), file=sys.stderr)
        return 1
    if os.path.abspath(source) == os.path.abspath(web_dir):
        print("Web assets ready at %s/" % web_dir)
        return 0
    if os.path.exists(web_dir):
        shutil.rmtree(web_dir)
    shutil.copytree(source, web_dir)
    print("Copied %s/ -> %s/ so it matches capacitor.config webDir." % (source, web_dir))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
