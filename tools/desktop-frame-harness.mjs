#!/usr/bin/env node
// Reproduce Hermes desktop's artifact frame (apps/desktop/src/app/chat/right-rail/preview-artifact.tsx):
// <iframe sandbox="allow-scripts" srcdoc=composeArtifactHtml(content)> with colorScheme light on bg-white,
// at a right-rail width. Writes a harness page; the caller opens it in Chromium and reads window.__frame.
// usage: node desktop-frame-harness.mjs <export.html> <out-harness.html> [railWidthPx=520]
import { readFileSync, writeFileSync } from "node:fs";

const [src, out, width = "520"] = process.argv.slice(2);
const content = readFileSync(src, "utf8");
// composeArtifactHtml: full documents pass through untouched.
const doc = /<html[\s>]|<!doctype\s+html/i.test(content) ? content : `<!doctype html><html><body>${content}</body></html>`;
const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>hermes-desktop artifact frame</title>
<style>html,body{margin:0;height:100%;background:#f4f4f5}#rail{width:${Number(width)}px;height:100vh;margin-left:auto;border-left:1px solid #ddd}</style>
<div id="rail"><iframe id="f" class="block size-full border-0 bg-white" sandbox="allow-scripts" title="artifact"
 style="display:block;width:100%;height:100%;border:0;background:#fff;color-scheme:light" srcdoc="${esc(doc)}"></iframe></div>
<script>
// The sandboxed frame is opaque-origin: the parent cannot read its DOM. The export reports through
// postMessage only if it chooses to; we just record load + any message for the check.
window.__frame = { loaded: false, messages: [] };
document.getElementById("f").addEventListener("load", () => { window.__frame.loaded = true; });
addEventListener("message", e => window.__frame.messages.push(e.data));
</script>`);
console.log(JSON.stringify({ out, bytes: doc.length, width: Number(width) }));
