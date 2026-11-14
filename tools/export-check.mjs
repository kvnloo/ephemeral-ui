// Run an exported card document's inline script in linkedom and report mounted cards + errors.
//   EUI_DOM_MODULE=<linkedom>/worker.js node tools/export-check.mjs <file.html> [--expect N]
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const { parseHTML } = await import((process.env.EUI_DOM_MODULE ? pathToFileURL(process.env.EUI_DOM_MODULE).href : 'linkedom'));
const file = process.argv[2], ei = process.argv.indexOf("--expect"), expect = ei > 0 ? +process.argv[ei + 1] : null;
const html = fs.readFileSync(file, "utf8");
const script = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
const { document, window } = parseHTML(html.replace(/<script>[\s\S]*<\/script>/, ""));
const errors = [];
const storage = { getItem() { throw Error("SecurityError: opaque origin"); }, setItem() { throw Error("SecurityError: opaque origin"); } }; // sandboxed iframe behaviour
Object.assign(globalThis, { document, window, localStorage: storage, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout, IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} }, ResizeObserver: class { observe() {} disconnect() {} }, MutationObserver: window.MutationObserver || class { observe() {} disconnect() {} }, getComputedStyle: () => ({ getPropertyValue: () => "" }), CustomEvent: window.CustomEvent, Event: window.Event, HTMLElement: window.HTMLElement, addEventListener: () => {}, removeEventListener: () => {} }); // window-level listeners (theme, keys) exist in every browser frame
globalThis.fetch = undefined; // the export must not need the network
// linkedom lacks Web Animations and canvas; stub them so the check covers card logic, not paint.
const El = window.HTMLElement.prototype.__proto__;
El.animate ??= function () { const a = { finished: Promise.resolve(), cancel() {}, pause() {}, play() {}, finish() {}, currentTime: 0, onfinish: null }; setTimeout(() => a.onfinish?.(), 0); return a; };
El.getAnimations ??= () => [];
El.getBoundingClientRect ??= () => ({ x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 200, width: 320, height: 200 });
const ctx = new Proxy({}, { get: (t, k) => (k === "measureText" ? () => ({ width: 10 }) : k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
window.HTMLCanvasElement && (window.HTMLCanvasElement.prototype.getContext = () => ctx);
process.on("unhandledRejection", (e) => errors.push(String(e?.message || e)));
const origError = console.error; console.error = (...a) => errors.push(a.map(String).join(" "));
try { new Function(script)(); } catch (e) { errors.push("throw: " + e.message); }
for (let i = 0; i < 100 && document.documentElement.dataset.ready !== "1"; i++) await new Promise((r) => setTimeout(r, 20));
await new Promise((r) => setTimeout(r, 300));
const cards = document.querySelectorAll("#cards .eu-card").length, failed = [...document.querySelectorAll(".xc-note")].filter((n) => n.textContent.startsWith("Card failed")).map((n) => n.textContent);
const text = document.getElementById("cards").textContent;
const res = { file, ready: document.documentElement.dataset.ready === "1", cards, failed, errors: errors.slice(0, 5), hasUndefined: /\bundefined\b|\bNaN\b/.test(text), theme: document.documentElement.dataset.host + "/" + document.documentElement.dataset.scheme };
console.error = origError; console.log(JSON.stringify(res));
process.exit(res.ready && !failed.length && !errors.length && (expect == null || cards === expect) ? 0 : 1);
