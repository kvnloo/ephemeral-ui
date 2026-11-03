// Make a self-contained in-thread preview from the actual card modules (no server or private data).
// node tools/intent-inline.mjs <output.html> ; pass that document to T3 html_preview/html_render.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
const root = path.resolve(import.meta.dirname, "..");
const out = process.argv[2]; if (!out) throw Error("output.html required");
const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "intent-inline-"));
const entry = `import { KINDS_I } from ${JSON.stringify(root + "/src/js/kinds-i.js")};
import { state } from ${JSON.stringify(root + "/src/js/themes.js")};
state.base={bg:'#151518',card:'#1c1c20',mutedFg:'#96969e',scheme:'dark'};
const d=${fs.readFileSync(root + "/src/data/intent-snapshot.json", "utf8")};
const groups=[['Declare',['intent-declare','intent-contract']],['Operate',['intent-work','intent-proof']],['Understand',['intel-decisions','intel-value','intel-context','intel-health']]];
const out=document.querySelector('#cards'),nav=document.querySelector('#kits');
async function pick(i){out.replaceChildren();[...nav.children].forEach((b,j)=>b.setAttribute('aria-selected',i===j?'true':'false'));for(const kind of groups[i][1]){const name=kind.startsWith('intel')?'z0intelligence':kind==='intent-declare'?'Ripple':'AODL';const c=KINDS_I[kind].make({id:kind,name,hex:null},null,d,{onReview:r=>{document.querySelector('#callback').textContent='Review request only · approval remains pending · r'+r.revision;}});c.el.style.setProperty('--a','var(--h-mutedFg)');const cell=document.createElement('div');cell.className='ik-cell';const seen=document.createElement('button');seen.className='inline-seen';seen.textContent='Seen';let collapsed=false;seen.onclick=()=>{collapsed=!collapsed;c.el.hidden=collapsed;seen.textContent=collapsed?'Reopen · '+name+' · view receipt':'Seen';};cell.append(seen,c.el);out.append(cell);await c.done;}}
groups.forEach(([name],i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.textContent='0'+(i+1)+' / '+name;b.onclick=()=>pick(i);nav.append(b);});pick(0);`;
fs.writeFileSync(dir + "/entry.js", entry);
const bundle = execFileSync("esbuild", [dir + "/entry.js", "--bundle", "--format=iife", "--minify", "--log-level=error"], { encoding: "utf8" });
const css = fs.readFileSync(root + "/src/styles.css", "utf8") + fs.readFileSync(root + "/src/intent.css", "utf8");
const tokens = `:root{--h-bg:var(--background);--h-fg:var(--foreground);--h-card:var(--card);--h-card-solid:var(--card);--h-mutedFg:var(--muted-foreground);--h-muted:var(--muted);--h-border:var(--border);--h-primary:var(--primary);--h-primaryFg:var(--primary-foreground);--h-success:var(--success);--h-warning:var(--warning);--h-danger:var(--destructive);--h-font:var(--font-sans);--h-mono:var(--font-mono);--r:var(--radius);--rl:var(--radius);--pad:16px;--soft:var(--secondary);--soft2:var(--muted)}html,body{background:none!important;padding:0!important;margin:0!important;min-width:0!important}body{font:13px var(--font-sans);color:var(--foreground)}.inline-seen{background:none;border:0;color:var(--muted-foreground);font:10px var(--font-mono);cursor:pointer;display:block;margin:0 0 8px auto}.ic-card[hidden]{display:none}.eu-card{width:100%;max-width:none}.ik-grid{align-items:start}#callback{color:var(--warning);font:11px var(--font-mono);margin:12px 0}.inline-caption{color:var(--muted-foreground);font:11px/1.6 var(--font-sans);margin:14px 0 0}.ik-kits{margin-top:0}`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}\n${tokens}</style></head><body><nav id="kits" class="ik-kits" role="tablist" aria-label="Ripple intent kits"></nav><div id="cards" class="ik-grid"></div><div id="callback" role="status"></div><p class="inline-caption">Interactive kit prototypes · real sanitized snapshots, not live connections. Review requests never approve. The site version also composes the existing OMP trace waterfall and tools; no cross-source trace identity is implied.</p><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>`;
fs.writeFileSync(out, html); console.log(`${out} · ${Buffer.byteLength(html)} bytes`);
fs.rmSync(dir, { recursive: true });
