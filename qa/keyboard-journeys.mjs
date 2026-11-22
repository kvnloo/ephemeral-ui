// Keyboard journeys for the kinds lifted from B to A (EU-024). Each journey mounts one catalog
// fixture in isolation (same page as qa/chromium.mjs), drives it with real Chromium keyboard input
// only, and asserts the typed eui:intent the agent receives. Run: QA_URL=<origin of src/> node qa/keyboard-journeys.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { catalog as generated } from "../tools/qa-inventory.mjs";

const base = process.env.QA_URL;
assert.ok(base, "QA_URL must point at the static server serving src/");
const entries = new Map(generated.kinds.map((k) => [k.kind, k]));

const J = {
  async trace(p) {
    await p.focus("#fixture canvas.os-cv");
    await p.keyboard.press("ArrowRight");
    const e = await p.intent("select");
    assert.match(e.entities.span, /^main:/); assert.ok(e.entities.track && e.entities.session);
    assert.ok(await p.locator("#fixture .os-drawer").count(), "span drawer opened");
    await p.keyboard.press("Escape");
    assert.equal(await p.locator("#fixture .os-drawer").count(), 0, "Escape closes the drawer");
    return `select span ${e.entities.span}`;
  },
  async "trace-tools"(p) {
    const row = p.getByRole("button", { name: "read spans" });
    await row.focus(); await p.keyboard.press("Enter");
    const e = await p.intent("focus_tool"); assert.equal(e.entities.tool, "read");
    assert.equal(await p.getByRole("button", { name: "read spans" }).getAttribute("aria-expanded"), "true");
    assert.equal(await p.evaluate(() => document.activeElement?.getAttribute("aria-label")), "read spans", "focus kept on the row");
    await p.keyboard.press("Tab"); await p.keyboard.press("Enter");
    const s = await p.intent("select"); assert.ok(s.entities.span);
    return `focus_tool read → select span ${s.entities.span}`;
  },
  async "trace-errors"(p) {
    await p.getByRole("tab", { name: "Spans", exact: true }).focus(); await p.keyboard.press("Enter");
    const sig = p.locator("#fixture .os-rowbtn[aria-expanded]").first();
    await sig.focus(); await p.keyboard.press("Enter");
    const e = await p.intent("focus_error");
    await p.keyboard.press("Tab"); await p.keyboard.press("Enter");
    const s = await p.intent("select"); assert.ok(s.entities.span);
    return `focus_error "${e.entities.error}" → select span ${s.entities.span}`;
  },
  async "infra-architecture"(p) {
    await p.getByRole("button", { name: "Cloud Run" }).focus(); await p.keyboard.press("Enter");
    const e = await p.intent("select"); assert.match(e.entities.service, /run/i);
    await p.getByRole("button", { name: "Ask agent about Cloud Run" }).focus(); await p.keyboard.press("Enter");
    const a = await p.intent("ask_service"); assert.ok(a.entities.edge.length);
    await p.waitForSelector("#fixture .lp-line.agent.done");
    return `select ${e.entities.node} → ask_service (${a.entities.edge.length} edges, ack shown)`;
  },
  async "infra-cluster"(p) {
    await p.locator("#fixture summary").first().focus(); await p.keyboard.press("Enter");
    const e = await p.intent("select"); assert.match(e.entities.workload, /\//);
    await p.getByRole("button", { name: /^Ask agent about/ }).first().focus(); await p.keyboard.press("Enter");
    const a = await p.intent("ask_workload"); assert.equal(a.entities.workload, e.entities.workload);
    return `select ${e.entities.workload} → ask_workload`;
  },
  async "infra-iac"(p) {
    await p.getByRole("button", { name: "Destructive only" }).focus(); await p.keyboard.press("Enter");
    const f = await p.intent("filter"); assert.ok(f.entities.change.length >= 1);
    await p.keyboard.press("Tab"); await p.keyboard.press("Enter");
    const r = await p.intent("review_changes"); assert.deepEqual(r.entities.change, f.entities.change);
    return `filter → review_changes ${r.entities.change.join(", ")}`;
  },
  async "infra-models"(p) {
    await p.getByRole("button", { name: "4 / GGUF" }).focus(); await p.keyboard.press("Enter");
    const e = await p.intent("select"); assert.equal(e.entities.stage, "gguf");
    await p.getByRole("button", { name: "Ask agent to plan GGUF checks" }).focus(); await p.keyboard.press("Enter");
    await p.intent("plan_stage");
    return "select gguf → plan_stage";
  },
  async timeline(p) {
    await p.getByRole("button", { name: /^Intro clip/ }).focus();
    await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight"); await p.keyboard.press("Enter");
    const m = await p.intent("mark"); assert.equal(m.entities.clip, "um… pause");
    await p.getByRole("button", { name: "Cut 1 marked" }).focus(); await p.keyboard.press("Enter");
    const c = await p.intent("ripple_delete"); assert.deepEqual(c.entities.clip, ["um… pause"]);
    assert.equal(await p.locator('#fixture [data-clip="um… pause"]').count(), 0);
    await p.getByRole("button", { name: "Undo", exact: true }).focus(); await p.keyboard.press("Enter");
    assert.equal(await p.locator('#fixture [data-clip="um… pause"]').count(), 1, "Undo restores the clip");
    return "mark um… pause → ripple_delete → Undo restored";
  },
  async review(p) {
    await p.getByRole("application", { name: "Annotate frame" }).focus();
    for (const k of ["ArrowRight", "ArrowRight", "ArrowUp", "Enter"]) await p.keyboard.press(k);
    const m = await p.intent("mark"); assert.equal(m.entities.region, "58%,43%");
    await p.getByRole("button", { name: "Send to agent" }).focus(); await p.keyboard.press("Enter");
    const r = await p.intent("request_revision"); assert.deepEqual(r.entities.mark, [m.entities.mark]);
    return `mark ${m.entities.mark} at ${m.entities.region} → request_revision`;
  },
  async cad(p) {
    await p.getByRole("application", { name: "Drafting viewport" }).focus();
    await p.keyboard.press("Enter");
    for (let i = 0; i < 4; i++) await p.keyboard.press("Shift+ArrowRight");
    await p.keyboard.press("Enter"); await p.keyboard.press("Escape");
    const read = await p.locator("#fixture .cad-read").innerText();
    assert.match(read, /^1 wall · 4\.00 m drafted$/, read);
    await p.getByRole("textbox", { name: "Command line" }).fill("@0,2");
    await p.getByRole("textbox", { name: "Command line" }).press("Enter");
    await p.getByRole("textbox", { name: "Command line" }).fill("@-2,0");
    await p.getByRole("textbox", { name: "Command line" }).press("Enter");
    await p.getByRole("button", { name: "Send draft to agent" }).focus(); await p.keyboard.press("Enter");
    const d = await p.intent("use_draft"); assert.equal(d.entities.wall.length, 2);
    return `${read} → command line → use_draft (${d.entities.wall.length} walls)`;
  },
  async board(p) {
    await p.getByRole("button", { name: "Rectangle" }).focus(); await p.keyboard.press("Enter");
    await p.getByRole("application", { name: "Whiteboard" }).focus();
    await p.keyboard.press("Enter"); for (let i = 0; i < 3; i++) await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter");
    const d = await p.intent("draw"); assert.match(d.entities.shape, /^rectangle-/);
    await p.getByRole("button", { name: "Sticky note" }).focus(); await p.keyboard.press("Enter");
    await p.getByRole("application", { name: "Whiteboard" }).focus(); await p.keyboard.press("Enter");
    const n = await p.intent("annotate");
    return `draw ${d.entities.shape} → annotate "${n.entities.note}"`;
  },
  async daw(p) {
    const note = p.getByRole("button", { name: "A3, bar 1 beat 1" });
    await note.focus(); await p.keyboard.press("ArrowUp");
    const e = await p.intent("edit_note"); assert.match(e.entities.note, /A♯3@0/);
    await p.keyboard.press("Delete");
    const del = await p.intent("edit_note", 2); assert.match(del.label, /^Delete/);
    await p.getByRole("button", { name: "Drums 1" }).focus(); await p.keyboard.press("Delete");
    const c = await p.intent("clear_clip"); assert.equal(c.entities.clip, "Drums 1");
    assert.ok(await p.getByRole("button", { name: "Empty Drums slot 1" }).count());
    return "transpose A3→A♯3 → delete note → clear_clip Drums 1";
  },
  async sandbox(p) {
    await p.getByRole("radio", { name: /^fork-b/ }).focus(); await p.keyboard.press("ArrowDown");
    const s = await p.intent("select"); assert.equal(s.entities.fork, "fork-c");
    await p.getByRole("button", { name: "Hold to keep fork-c" }).focus(); await p.keyboard.down("Enter"); await p.waitForTimeout(1200); await p.keyboard.up("Enter");
    const k = await p.intent("keep_fork"); assert.equal(k.entities.keep, "fork-c"); assert.deepEqual(k.entities.stop, ["fork-a", "fork-b"]);
    assert.deepEqual(JSON.parse(k.text).evidence, { build_s: 33, tests: "40/42", fastest: "fork-b" });
    return "select fork-c → keep_fork { keep: fork-c, stop: [fork-a, fork-b], evidence }";
  },
  async twin(p) {
    await p.getByRole("button", { name: "Ask about law dock_battery" }).focus(); await p.keyboard.press("Enter");
    const l = await p.intent("select"); assert.equal(l.entities.law, "dock_battery");
    await p.getByRole("button", { name: /Hold to deploy policy v4/ }).focus(); await p.keyboard.down("Enter"); await p.waitForTimeout(1200); await p.keyboard.up("Enter");
    const d = await p.intent("deploy_policy"); assert.equal(d.entities.target, "twin"); assert.equal(JSON.parse(d.text).policy, "v4");
    await p.getByRole("button", { name: "Roll back to v3" }).focus(); await p.keyboard.press("Enter");
    const r = await p.intent("rollback_policy"); assert.equal(r.entities.policy, "v3");
    return "select law → deploy_policy v4 (twin) → rollback_policy v3";
  },
  async sculpt(p) {
    await p.getByRole("button", { name: "Inflate" }).focus(); await p.keyboard.press("Enter");
    await p.getByRole("button", { name: "Stroke chin" }).focus(); await p.keyboard.press("Enter");
    const s = await p.intent("stroke"); assert.deepEqual(s.entities, { brush: "Inflate", region: "chin" });
    await p.waitForSelector("#fixture .lp-undo");
    return "Inflate on chin (undoable)";
  },
  async trigger(p) {
    await p.getByRole("button", { name: "Walk into trigger" }).focus(); await p.keyboard.press("Enter");
    const e = await p.intent("trigger_fired", 1, 9000); assert.equal(e.entities.trigger, "TriggerBox");
    return `walk → trigger_fired #${e.entities.count}`;
  },
  async globe(p) {
    await p.getByRole("radio", { name: "UAL837 SFO→HND" }).focus(); await p.keyboard.press("ArrowRight"); await p.keyboard.press("Enter");
    const e = await p.intent("select"); assert.deepEqual(e.entities, { flight: "BAW178", from: "JFK", to: "LHR" });
    await p.getByRole("button", { name: "Export CZML" }).focus(); await p.keyboard.press("Enter");
    const x = await p.intent("export_czml"); assert.equal(x.entities.flight, "BAW178");
    return "select BAW178 → export_czml BAW178";
  },
  async gen3d(p) {
    await p.getByRole("button", { name: "Variant 3" }).focus(); await p.keyboard.press("Enter");
    await p.intent("select");
    await p.getByRole("button", { name: "Request .glb" }).focus(); await p.keyboard.press("Enter");
    const e = await p.intent("request_glb"); assert.equal(e.entities.variant, 3);
    await p.waitForFunction(() => /No file has been delivered/.test(document.querySelector("#fixture .lp-line.agent.done")?.innerText || ""));
    return "variant 3 → request_glb (ack: no file delivered yet)";
  },
  async sim(p) {
    await p.waitForTimeout(400);
    await p.getByRole("button", { name: "Save checkpoint" }).focus(); await p.keyboard.press("Enter");
    const c = await p.intent("checkpoint");
    await p.getByRole("button", { name: "Export ckpt-1" }).focus(); await p.keyboard.press("Enter");
    const e = await p.intent("export_policy"); assert.equal(e.entities.checkpoint, "ckpt-1"); assert.equal(JSON.parse(e.text).step, c.entities.step);
    return `checkpoint ckpt-1 (step ${c.entities.step}) → export_policy`;
  },
};

const failures = [];
let ok = 0;
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const html = await fetch(base).then((r) => r.text());
  const css = [...html.matchAll(/<link rel="stylesheet" href="([^":]+\.css)"[^>]*>/g)].map(([tag]) => tag);
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.route("**/*", (route) => (route.request().url().startsWith(base + "/") ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.setDefaultTimeout(3000);
    let errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.route(base + "/__qa", (r) => r.fulfill({ contentType: "text/html", body: '<!doctype html><meta charset="utf-8">' + css.join("") + '<main id="fixture" style="margin:12px;max-width:720px"></main>' }));
    await page.goto(base + "/__qa");
    await page.evaluate(async () => {
      const [{ loadThemes }, { loadApps, catalog }, { rng }] = await Promise.all([import("/js/themes.js"), import("/js/shell.js"), import("/js/motion.js")]);
      await Promise.all([loadThemes(), loadApps()]);
      window.mount = async (entry, fixture) => {
        const mod = await import("/" + entry.module.replace(/^src\//, ""));
        const { app, input } = fixture.card;
        const c = mod[entry.export][entry.kind].make(catalog.byId[app] || { id: app, name: app }, rng(fixture.seed || entry.kind), input);
        await c.done;
        document.querySelector("#fixture").replaceChildren(c.el);
      };
      document.addEventListener("eui:intent", (e) => window.intents.push(e.detail), true);
    });
    /** Wait for the n-th intent with this action since mount; returns its detail. */
    page.intent = async (action, n = 1, timeout = 3000) => {
      const h = await page.waitForFunction(([a, k]) => window.intents.filter((d) => d.action === a)[k - 1], [action, n], { timeout });
      return h.jsonValue();
    };
    for (const [kind, run] of Object.entries(J)) {
      if (process.env.QA_KIND && !new RegExp(process.env.QA_KIND).test(kind)) continue;
      const entry = entries.get(kind);
      errors = [];
      try {
        await page.evaluate(([e, f]) => { window.intents = []; return window.mount(e, f); }, [entry, entry.fixtures[0]]);
        const what = await run(page);
        assert.deepEqual(errors, [], "page errors");
        ok++;
        console.log(`PASS ${kind} ${width}px · ${entry.fixtures[0].id} · ${what}`);
      } catch (e) {
        failures.push(`${kind} ${width}px: ${e.message.split("\n")[0]}`);
      }
    }
    await context.close();
  }
} finally { await browser.close(); }
if (failures.length) console.error(failures.join("\n"));
console.log(`${ok} keyboard journeys passed, ${failures.length} failures`);
process.exitCode = failures.length ? 1 : 0;
