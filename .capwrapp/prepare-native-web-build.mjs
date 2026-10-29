#!/usr/bin/env node
import fs from 'node:fs'

function stripComments(text) {
  var out = ""
  var i = 0
  while (i < text.length) {
    if (text[i] === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i)
      if (i < 0) return out
      continue
    }
    if (text[i] === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2)
      if (i < 0) return out
      i += 2
      continue
    }
    var q = text[i]
    if (q === "'" || q === '"' || q.charCodeAt(0) === 96) {
      out += text[i++]
      while (i < text.length && text[i] !== q) {
        if (text[i] === "\\") {
          out += text[i]
          i++
          if (i < text.length) out += text[i++]
          continue
        }
        out += text[i++]
      }
      if (i < text.length) out += text[i++]
      continue
    }
    out += text[i++]
  }
  return out
}

function alreadySpa(text) {
  return /spa\s*:\s*\{[\s\S]{0,800}?enabled\s*:\s*true/.test(stripComments(text))
}

function matchingBrace(text, openIdx) {
  var depth = 0
  var quote = ""
  var i = openIdx
  while (i < text.length) {
    var ch = text[i]
    if (quote) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) quote = ""
      i++
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      i++
      continue
    }
    if (ch.charCodeAt(0) === 96) {
      quote = ch
      i++
      continue
    }
    if (ch === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i)
      if (i < 0) return -1
      continue
    }
    if (ch === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2)
      if (i < 0) return -1
      i += 2
      continue
    }
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

function skipSpace(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++
  return i
}

function skipStringOrComment(text, i) {
  if (i >= text.length) return i
  if (text[i] === "/" && text[i + 1] === "/") {
    var nl = text.indexOf("\n", i)
    return nl < 0 ? text.length : nl + 1
  }
  if (text[i] === "/" && text[i + 1] === "*") {
    var end = text.indexOf("*/", i + 2)
    return end < 0 ? text.length : end + 2
  }
  var q = text[i]
  if (q === "'" || q === '"' || q.charCodeAt(0) === 96) {
    i++
    while (i < text.length && text[i] !== q) {
      if (text[i] === "\\") i += 2
      else i++
    }
    return i < text.length ? i + 1 : text.length
  }
  return i
}

function configObjectOpenAfterCall(text, afterParen) {
  var i = skipSpace(text, afterParen)
  if (text[i] === "{") {
    var close = matchingBrace(text, i)
    if (close >= 0 && /^\s*\)\s*=>/.test(text.slice(close + 1, close + 40))) {
      var arrow = /=>\s*\(\s*\{/.exec(text.slice(close + 1))
      if (!arrow) return -1
      return close + 1 + arrow.index + arrow[0].length - 1
    }
    return i
  }
  var arrow = /=>\s*\(\s*\{/.exec(text.slice(i))
  if (arrow) return i + arrow.index + arrow[0].length - 1
  return -1
}

function lovableConfigOpen(text) {
  var fallback = -1
  var i = 0
  while (i < text.length) {
    var skipped = skipStringOrComment(text, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    if (text.slice(i, i + 12) === "defineConfig") {
      var m = /^defineConfig\s*\(/.exec(text.slice(i))
      if (m) {
        var open = configObjectOpenAfterCall(text, i + m[0].length)
        if (open >= 0) {
          if (/export\s+default\s+$/.test(text.slice(Math.max(0, i - 24), i))) return open
          if (fallback < 0) fallback = open
        }
        i += m[0].length
        continue
      }
    }
    i++
  }
  return fallback
}

function findTanstackStartObjectOpen(text) {
  var i = 0
  while (i < text.length) {
    var skipped = skipStringOrComment(text, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    if (text.slice(i, i + 13) === "tanstackStart") {
      var m = /^tanstackStart\s*:\s*\{/.exec(text.slice(i))
      if (m) return i + m[0].length - 1
    }
    i++
  }
  return -1
}

function hasUnconditionalRootSpa(text, startOpen) {
  var close = matchingBrace(text, startOpen)
  if (close < 0) return false
  var depth = 0
  var i = startOpen
  while (i < close) {
    var skipped = skipStringOrComment(text, i)
    if (skipped !== i) {
      i = skipped
      continue
    }
    if (text[i] === "{") {
      depth++
      i++
      continue
    }
    if (text[i] === "}") {
      depth--
      i++
      continue
    }
    if (depth === 1 && text[i] === "." && text[i + 1] === "." && text[i + 2] === ".") {
      i += 3
      continue
    }
    if (depth === 1 && /^spa\s*:\s*\{/.test(text.slice(i, i + 40))) {
      return /enabled\s*:\s*true/.test(text.slice(i, i + 400))
    }
    i++
  }
  return false
}

function replaceObjectOrTrue(text, name) {
  var searchFrom = 0
  var prefix = name + ": false"
  while (searchFrom < text.length) {
    var idx = text.slice(searchFrom).search(new RegExp("\\b" + name + "\\s*:\\s*"))
    if (idx < 0) return text
    var abs = searchFrom + idx
    var vs = abs + text.slice(abs).match(new RegExp("^" + name + "\\s*:\\s*"))[0].length
    if (text.slice(vs, vs + 5) === "false") {
      searchFrom = vs + 5
      continue
    }
    var end = -1
    if (text[vs] === "{") {
      var close = matchingBrace(text, vs)
      if (close < 0) return text
      end = close + 1
    } else if (text.slice(vs, vs + 4) === "true") {
      end = vs + 4
    } else {
      searchFrom = vs
      continue
    }
    text = text.slice(0, abs) + prefix + text.slice(end)
    searchFrom = abs + prefix.length
  }
  return text
}

function afterOpenStartsWith(text, open, prefixRe) {
  return prefixRe.test(text.slice(open + 1).replace(/^[\s\n\r]+/, ""))
}

function forceLovableStaticFlags(text) {
  var next = replaceObjectOrTrue(replaceObjectOrTrue(text, "nitro"), "cloudflare")
  var open = lovableConfigOpen(next)
  if (open < 0) return { text: next, changed: next !== text }
  var flags = " nitro: false, cloudflare: false,"
  if (!afterOpenStartsWith(next, open, /^nitro\s*:\s*false\b/)) {
    next = next.slice(0, open + 1) + flags + next.slice(open + 1)
  } else if (!/\bcloudflare\s*:\s*false\b/.test(next)) {
    next = next.replace(/nitro\s*:\s*false/, "nitro: false, cloudflare: false")
  }
  var neutralized = next.replace(/(^|[\s,\[])nitro\s*\(\s*\{/g, "$1false && nitro({")
  return { text: neutralized, changed: neutralized !== text }
}

var SPA =
  'spa: { enabled: true, prerender: { outputPath: "index.html", failOnError: false, retryCount: 2 } }'
var PRERENDER = "prerender: { failOnError: false, crawlLinks: false, retryCount: 2 }"
var STATIC_EMPTY =
  "defineConfig({ nitro: false, cloudflare: false, tanstackStart: { " + SPA + ", " + PRERENDER + " } })"

function isStartStack(text) {
  var code = stripComments(text)
  return (
    code.indexOf("@lovable.dev/vite-tanstack-config") !== -1 ||
    code.indexOf("@tanstack/react-start") !== -1 ||
    code.indexOf("@tanstack/start") !== -1 ||
    code.indexOf("tanstackStart") !== -1
  )
}

function forcePrerenderFailOpen(text) {
  var next = text.replace(/prerender\s*:\s*\{/g, function (match, offset) {
    var around = text.slice(offset, offset + 280)
    if (/failOnError\s*:\s*false/.test(around)) return match
    return "prerender: { failOnError: false, "
  })
  return { text: next, changed: next !== text }
}

function patchViteConfigForNative(text) {
  var reasons = []
  var next = text
  var lovable = text.indexOf("@lovable.dev/vite-tanstack-config") !== -1
  if (!isStartStack(text)) {
    return { text: text, changed: false, reason: "no change" }
  }

  var startOpen = findTanstackStartObjectOpen(next)
  var spaLive = startOpen >= 0 && hasUnconditionalRootSpa(next, startOpen)
  if (!spaLive && !alreadySpa(next)) {
    var empty = lovable ? next.replace(/defineConfig\(\s*\)/, STATIC_EMPTY) : next
    if (empty !== next) {
      next = empty
      reasons.push("enabled SPA prerender on empty defineConfig()")
    } else if (startOpen >= 0) {
      next = next.slice(0, startOpen + 1) + " " + SPA + ", " + PRERENDER + "," + next.slice(startOpen + 1)
      reasons.push("injected spa into tanstackStart options")
    } else if (lovable && lovableConfigOpen(next) >= 0) {
      var open = lovableConfigOpen(next)
      next = next.slice(0, open + 1) + " tanstackStart: { " + SPA + ", " + PRERENDER + " }," + next.slice(open + 1)
      reasons.push("added tanstackStart spa options")
    } else if (next.indexOf("tanstackStart()") !== -1) {
      next = next.replace("tanstackStart()", "tanstackStart({ " + SPA + ", " + PRERENDER + " })")
      reasons.push("enabled SPA on tanstackStart()")
    } else if (/tanstackStart\(\s*\{/.test(next)) {
      next = next.replace(/tanstackStart\(\s*\{/, "tanstackStart({ " + SPA + ", " + PRERENDER + ", ")
      reasons.push("injected spa into tanstackStart()")
    }
  } else if (lovable && startOpen >= 0 && !spaLive) {
    next = next.slice(0, startOpen + 1) + " " + SPA + ", " + PRERENDER + "," + next.slice(startOpen + 1)
    reasons.push("injected spa into tanstackStart options (was behind a runtime condition)")
  }

  var slashPath = next.replace(/outputPath\s*:\s*(['"])\/index\.html\1/g, 'outputPath: "index.html"')
  if (slashPath !== next) {
    next = slashPath
    reasons.push("normalized prerender outputPath to index.html")
  }

  var failOpen = forcePrerenderFailOpen(next)
  if (failOpen.changed) {
    next = failOpen.text
    reasons.push("prerender continues if / returns 500")
  }

  if (lovable) {
    var flags = forceLovableStaticFlags(next)
    if (flags.changed) {
      next = flags.text
      reasons.push("disabled Cloudflare/Nitro worker for the Capacitor bundle")
    }
  }

  return {
    text: next,
    changed: next !== text,
    reason: reasons.join("; ") || "no change",
  }
}

const NAMES = ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"]

function load() {
  for (const name of NAMES) {
    if (fs.existsSync(name)) return { path: name, text: fs.readFileSync(name, "utf8") }
  }
  return null
}

const file = load()
if (!file) {
  console.log("No Vite config at repo root; leaving the project build as-is.")
  process.exit(2)
}
console.log("CapWrapp native web patch reading " + file.path + " (" + file.text.length + " bytes)")
if (file.text.indexOf("@lovable.dev/vite-tanstack-config") !== -1) {
  console.log("Detected @lovable.dev/vite-tanstack-config")
}
if (file.text.indexOf("tanstackStart") !== -1) console.log("Detected tanstackStart")
if (/\bnitro\s*:/.test(file.text)) console.log("Found a nitro key in the Vite config")
if (/\bcloudflare\s*:/.test(file.text)) console.log("Found a cloudflare key in the Vite config")
console.log("--- " + file.path + " before patch ---")
console.log(file.text)
console.log("--- end " + file.path + " before patch ---")
const result = patchViteConfigForNative(file.text)
if (!result.changed) {
  console.log("No Capacitor static patch for this Vite config (already SPA, or not a TanStack Start / Lovable stack).")
  process.exit(2)
}
fs.writeFileSync(file.path, result.text)
console.log("Patched " + file.path + " for this Capacitor store build: " + result.reason)
console.log("--- " + file.path + " after patch (CI-only, not committed) ---")
console.log(result.text)
console.log("--- end " + file.path + " after patch ---")
