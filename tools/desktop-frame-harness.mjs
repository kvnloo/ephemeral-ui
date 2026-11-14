#!/usr/bin/env node
// Reproduce a host's HTML frame so an export can be checked in a real engine.
//  desktop (default): Hermes desktop's artifact frame (apps/desktop/src/app/chat/right-rail/preview-artifact.tsx):
//    <iframe sandbox="allow-scripts" srcdoc=composeArtifactHtml(content)> with colorScheme light on bg-white,
//    at a right-rail width. The caller opens it in Chromium and reads window.__frame.
//  --host hermex [--scheme dark|light]: Hermex's inline HTML report (uzairansaruzi/hermex #1645,
//    HermesMobile/Features/Chat/HTMLReport.swift HTMLReportTheme @ 18529ca): the page string with the
//    app theme as zero-specificity :where() defaults and 8 CSS variables in <style id="hermex-theme">,
//    injected before the page's own styles (WKUserScript at document start). Open in Playwright WebKit
//    (WKWebView's engine) at 402 px (iPhone 17) and run overflow.mjs against it.
// usage: node desktop-frame-harness.mjs <export.html> <out-harness.html> [railWidthPx=520] [--host hermex] [--scheme dark]
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv.splice(i, 2)[1]; };
const host = opt("host", "desktop"), scheme = opt("scheme", "dark");
const [src, out, width = "520"] = argv;
const content = readFileSync(src, "utf8");
// composeArtifactHtml: full documents pass through untouched.
const doc = /<html[\s>]|<!doctype\s+html/i.test(content) ? content : `<!doctype html><html><body>${content}</body></html>`;

if (host === "hermex") {
  // Hermex's default palette, resolved (canvas, text, surface, textSecondary, separator, accent).
  const p = scheme === "dark"
    ? { bg: "#000000", fg: "#f2f2f7", card: "#1c1c1e", mfg: "#98989f", border: "#38383a", primary: "#ff8a3d" }
    : { bg: "#ffffff", fg: "#000000", card: "#f2f2f7", mfg: "#6c6c70", border: "#c6c6c8", primary: "#e8660c" };
  const css = `:where(:root){--background:${p.bg};--foreground:${p.fg};--card:${p.card};--muted-foreground:${p.mfg};--border:${p.border};--primary:${p.primary};--font-sans:-apple-system,system-ui,sans-serif;--font-mono:ui-monospace,Menlo,monospace;color-scheme:${scheme};background:var(--background);color:var(--foreground);font-family:var(--font-sans);font-size:17px;-webkit-text-size-adjust:100%}:where(body){margin:0}:where(a){color:var(--primary)}:where(code,kbd,pre,samp){font-family:var(--font-mono)}`;
  // The WKWebView is transparent (isOpaque=false) over the transcript canvas; paint that canvas behind the page.
  const canvas = `<style id="hermex-canvas">html:root{background:${p.bg}!important}</style>`;
  const page = doc.replace(/<head[^>]*>|<html[^>]*>/i, (m) => `${m}<style id="hermex-theme">${css}</style>${canvas}`);
  writeFileSync(out, page);
  console.log(JSON.stringify({ out, host, scheme, bytes: page.length, inlineLimit: 5 * 1024 * 1024, fits: page.length <= 5 * 1024 * 1024 }));
  process.exit(0);
}

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
