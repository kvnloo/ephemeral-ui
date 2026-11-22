// Cloud / Kubernetes / IaC kinds (src/js/kinds-infra.js): the graph validator and Mermaid export, the plan
// summary, the --program input path, and (with EUI_BROWSER_URL) a Chromium pass over the site's infra section:
// edit a hybrid AWS + GCP + K3s graph, check every drawn edge joins its two boxes, export Mermaid/JSON, and
// read the K3s/kind cluster and Terraform/OpenTofu plan views.
//
//   node --test tools/infra.test.mjs
//   python3 -m http.server 8765 --directory src &
//   EUI_BROWSER_URL=http://127.0.0.1:8765 PLAYWRIGHT_FROM=<dir with playwright>/package.json node --test tools/infra.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { SERVICES, ARCHITECTURES, CLUSTERS, IAC, validateGraph, toMermaid, planSummary } from "../src/js/infra-data.js";

const hybrid = () => structuredClone(ARCHITECTURES.find((g) => g.id === "hybrid"));
const catalog = JSON.parse(fs.readFileSync(new URL("../catalog/catalog.json", import.meta.url), "utf8"));

test("the examples cover AWS, GCP, Lambda GPU Cloud, NVIDIA Brev, K3s, kind and IaC, and all validate", () => {
  const providers = new Set(ARCHITECTURES.flatMap((g) => g.nodes.map((n) => SERVICES[n.service].provider)));
  for (const p of ["AWS", "GCP", "Lambda GPU Cloud", "NVIDIA", "Local", "IaC"]) assert.ok(providers.has(p), p);
  const services = new Set(ARCHITECTURES.flatMap((g) => g.nodes.map((n) => n.service)));
  for (const s of ["aws-lambda", "gcp-run", "lambda", "brev", "k3s", "kind", "terraform", "helm", "argocd"]) assert.ok(services.has(s), s);
  for (const g of ARCHITECTURES) assert.equal(validateGraph(g).edges.length, g.edges.length, g.id);
  assert.deepEqual(Object.keys(CLUSTERS), ["k3s", "kind", "eks", "gke"]);
  assert.ok(["terraform", "opentofu", "pulumi", "ansible", "helm", "argocd"].every((t) => IAC[t]));
});

test("validateGraph rejects bad graphs atomically", () => {
  const bad = {
    "duplicate id": (g) => { g.nodes[1].id = g.nodes[0].id; },
    "unknown service": (g) => { g.nodes[0].service = "mainframe"; },
    "dangling edge": (g) => { g.edges[0].to = "nope"; },
    "self edge": (g) => { g.edges[0].to = g.edges[0].from; },
    "empty label": (g) => { g.edges[0].label = " "; },
    "no nodes": (g) => { g.nodes = []; g.edges = []; },
    "wrong version": (g) => { g.v = 1; },
  };
  for (const [name, spoil] of Object.entries(bad)) { const g = hybrid(); spoil(g); assert.throws(() => validateGraph(g), Error, name); }
  assert.equal(validateGraph({ ...hybrid(), extra: 1 }).extra, undefined, "unknown keys are dropped");
});

test("toMermaid draws one node per service and one labelled arrow per edge, escaping labels", () => {
  const g = hybrid();
  g.edges.push({ from: "n0", to: "n6", label: 'say "hi" <b>' });
  const lines = toMermaid(g).split("\n");
  assert.equal(lines[0], "flowchart LR");
  assert.equal(lines.filter((l) => /^ {2}node\d+\["/.test(l)).length, g.nodes.length);
  const arrows = lines.filter((l) => l.includes("-->"));
  assert.equal(arrows.length, g.edges.length);
  assert.ok(lines.includes('  node0["Edge / Clients"]'));
  assert.ok(arrows.includes('  node3 -->|"pull subscriber"| node4'));
  assert.ok(arrows.includes('  node0 -->|"say &quot;hi&quot; &lt;b&gt;"| node6'));
});

test("planSummary counts delete/replace as destructive", () => {
  assert.deepEqual(planSummary(IAC.terraform.rows), { total: 3, destructive: 1 });
  assert.deepEqual(planSummary(IAC.opentofu.rows), { total: 2, destructive: 1 });
  assert.deepEqual(planSummary(IAC.pulumi.rows), { total: 2, destructive: 0 });
});

test("catalog has architecture (incl. a hybrid input), K3s/kind cluster and Terraform IaC fixtures", () => {
  const by = Object.fromEntries(catalog.kinds.map((k) => [k.kind, k]));
  for (const k of ["infra-architecture", "infra-cluster", "infra-iac", "infra-models"]) { assert.equal(by[k]?.group, "infra", k); assert.equal(by[k].site, true); assert.equal(by[k].programmable, true); }
  const input = by["infra-architecture"].fixtures.find((f) => f.state === "input");
  assert.deepEqual(input.props.input.architecture, validateGraph(hybrid()));
  assert.deepEqual(new Set(input.props.input.architecture.nodes.map((n) => SERVICES[n.service].provider)), new Set(["Edge", "AWS", "GCP", "Local", "Local ML"]));
  assert.deepEqual(by["infra-cluster"].fixtures.map((f) => f.props.input.context), ["k3s", "kind", "eks"]);
  assert.deepEqual(by["infra-iac"].fixtures.map((f) => f.props.input.tool), ["terraform", "opentofu", "pulumi"]);
  assert.equal(by["infra-iac"].fixtures[0].props.input.summary.destructive, 1);
});

test("export-cards --program draws an agent-written architecture and fails closed on a bad one", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eui-infra-")), cli = new URL("./export-cards.mjs", import.meta.url).pathname;
  const fence = (input) => "```ephemeral-ui\n" + JSON.stringify({ kind: "infra-architecture", app: "aws", input }) + "\n```\n";
  try {
    fs.writeFileSync(path.join(dir, "ok.md"), fence(hybrid()));
    execFileSync(process.execPath, [cli, "--program", path.join(dir, "ok.md"), "--out", path.join(dir, "ok.html")], { stdio: "pipe" });
    const html = fs.readFileSync(path.join(dir, "ok.html"), "utf8");
    assert.ok(html.includes("authenticated publish"), "the given graph is in the page");
    const g = hybrid(); g.edges[0].to = "ghost";
    fs.writeFileSync(path.join(dir, "bad.md"), fence(g));
    assert.throws(() => execFileSync(process.execPath, [cli, "--program", path.join(dir, "bad.md"), "--out", path.join(dir, "bad.html")], { stdio: "pipe" }), (e) => /Edges need existing/.test(String(e.stderr)));
    assert.equal(fs.existsSync(path.join(dir, "bad.html")), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Chromium: edit a hybrid graph, check drawn edges and Mermaid/JSON export, K3s/kind and Terraform views", { skip: !process.env.EUI_BROWSER_URL && "set EUI_BROWSER_URL and PLAYWRIGHT_FROM" }, async () => {
  const { createRequire } = await import("node:module");
  const { chromium } = createRequire(process.env.PLAYWRIGHT_FROM)("playwright");
  const browser = await chromium.launch({ ...(process.env.EUI_CHROMIUM ? { executablePath: process.env.EUI_CHROMIUM } : {}), headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`${process.env.EUI_BROWSER_URL}/#infrastructure`);
      const arch = page.locator('#infrastructure .if-cell[data-kind="infra-architecture"]');
      await arch.locator(".if-diagram svg").waitFor();
      assert.deepEqual(await page.$$eval("#infrastructure .if-cell", (c) => c.map((x) => x.dataset.kind)), ["infra-architecture", "infra-cluster", "infra-iac", "infra-models"]);

      // Every edge path starts on its source box and ends on its target box (2 paths per edge: line, head).
      const drawn = () => arch.evaluate((cell) => {
        const svg = cell.querySelector(".if-diagram svg"), box = (id) => { const r = svg.querySelector(`g[data-node="${id}"] rect`); return { x: +r.getAttribute("x"), y: +r.getAttribute("y"), w: +r.getAttribute("width"), h: +r.getAttribute("height") }; };
        const graph = JSON.parse(cell.querySelector('[aria-label="Architecture JSON editor"]').value), paths = [...svg.querySelectorAll("path.if-edge")];
        const on = (b, [x, y]) => x >= b.x - 1 && x <= b.x + b.w + 1 && y >= b.y - 1 && y <= b.y + b.h + 1;
        const miss = graph.edges.filter((e, i) => { const n = paths[2 * i].getAttribute("d").match(/-?\d+(\.\d+)?/g).map(Number); return !on(box(e.from), n.slice(0, 2)) || !on(box(e.to), n.slice(-2)); });
        return { nodes: svg.querySelectorAll("g[data-node]").length, paths: paths.length, graph, miss, visible: paths.every((p) => p.getTotalLength() > 0), list: [...cell.querySelectorAll(".if-edges li span")].map((s) => s.textContent) };
      });
      await arch.locator('select[aria-label="Architecture example"]').selectOption("hybrid");
      let d = await drawn();
      assert.equal(d.graph.title, "Hybrid · AWS + GCP + K3s");
      assert.equal(d.nodes, 7); assert.equal(d.paths, 2 * 6); assert.deepEqual(d.miss, []); assert.ok(d.visible);
      assert.ok(d.list.includes("Pub/Sub → K3s · pull subscriber"));

      // Compose: add NVIDIA Brev, connect K3s → Brev, remove the S3-less artifact sync, then a bad edge is refused.
      await arch.locator("summary", { hasText: "Compose services" }).click();
      await arch.locator('select[aria-label="Add service"]').selectOption("brev");
      await arch.getByRole("button", { name: "Add service", exact: true }).click();
      await arch.locator('select[aria-label="Connection source"]').selectOption("n4");
      await arch.locator('select[aria-label="Connection target"]').selectOption("custom0");
      await arch.locator('input[aria-label="Connection label"]').fill("GPU burst");
      await arch.getByRole("button", { name: "Connect services" }).click();
      d = await drawn();
      assert.equal(d.nodes, 8); assert.equal(d.paths, 2 * 7); assert.deepEqual(d.miss, []);
      assert.ok(d.list.includes("K3s → NVIDIA Brev · GPU burst"));
      await arch.locator(".if-edges li", { hasText: "artifact sync" }).getByRole("button", { name: "Remove connection" }).click();
      d = await drawn();
      assert.equal(d.paths, 2 * 6); assert.equal(d.list.some((t) => t.includes("artifact sync")), false);
      await arch.locator('input[aria-label="Connection label"]').fill("");
      await arch.getByRole("button", { name: "Connect services" }).click();
      assert.match(await arch.locator('p[role="status"]').textContent(), /Edges need/);
      assert.equal((await drawn()).paths, 2 * 6, "a refused edge leaves the diagram untouched");

      // JSON editor: relabel an edge and regenerate; invalid JSON leaves the diagram alone.
      await arch.locator("summary", { hasText: "Generate from architecture JSON" }).click();
      const g = structuredClone(d.graph); g.edges[0].label = "TLS 1.3";
      await arch.locator('[aria-label="Architecture JSON editor"]').fill(JSON.stringify(g));
      await arch.getByRole("button", { name: "Generate diagram" }).click();
      d = await drawn();
      assert.ok(d.list.includes("Clients → API Gateway · TLS 1.3")); assert.deepEqual(d.miss, []);
      await arch.locator('[aria-label="Architecture JSON editor"]').fill('{"v":0,"title":"x","nodes":[],"edges":[]}');
      await arch.getByRole("button", { name: "Generate diagram" }).click();
      assert.match(await arch.locator('p[role="status"]').textContent(), /^Not changed/);
      assert.equal((await drawn()).nodes, 8);

      // Exports match the edited graph.
      const exported = arch.locator('[aria-label="Generated architecture export"]');
      await arch.getByRole("button", { name: "Export Mermaid" }).click();
      const mermaid = await exported.inputValue();
      assert.equal(mermaid, toMermaid(d.graph));
      assert.equal(mermaid.split("\n").filter((l) => l.includes("-->")).length, 6);
      assert.ok(mermaid.includes('-->|"GPU burst"|') && mermaid.includes('["NVIDIA / NVIDIA Brev"]') && mermaid.includes('-->|"TLS 1.3"|'));
      await arch.getByRole("button", { name: "Export JSON" }).click();
      const json = JSON.parse(await exported.inputValue());
      assert.deepEqual(json, validateGraph(d.graph));
      assert.ok(json.nodes.some((n) => n.id === "custom0" && n.service === "brev"));
      assert.deepEqual(await page.evaluate(() => window.__infra.cards[0].spec.input.architecture), json, "the card spec follows the edit");
      await arch.getByRole("button", { name: "Export SVG" }).click();
      const svgText = await exported.inputValue();
      assert.ok(svgText.startsWith("<svg") && (svgText.match(/class="if-edge"/g) || []).length === 12);

      // K3s and kind cluster views.
      const cl = page.locator('#infrastructure .if-cell[data-kind="infra-cluster"]');
      const clusterText = async () => cl.locator(".if-stack").innerText();
      let t = await clusterText();
      assert.ok(t.includes("lab-control") && t.includes("GPU worker") && t.includes("training / unsloth-job · 0/1"));
      await cl.locator('select[aria-label="Cluster context"]').selectOption("kind");
      t = await clusterText();
      assert.ok(t.includes("dev-control-plane") && t.includes("preview / model-stub · 1/1") && t.includes("Runs nodes as containers"));
      assert.equal(t.includes("lab-gpu"), false);
      await cl.locator("details.if-record", { hasText: "model-stub" }).locator("summary").click();
      assert.ok(await cl.getByText("Stub; no model inference").isVisible());
      assert.equal(await page.evaluate(() => window.__infra.cards[1].spec.input.context), "kind");

      // Terraform plan review, destructive filter, then OpenTofu.
      const iac = page.locator('#infrastructure .if-cell[data-kind="infra-iac"]');
      assert.equal(await iac.locator(".if-command").textContent(), "terraform show -json <saved-plan>");
      assert.match(await iac.locator(".if-body > .if-hint").nth(1).textContent(), /^3 example changes · 1 destructive · Saved-plan review; no apply/);
      assert.deepEqual(await iac.locator(".if-stack summary").allTextContents(), ["CREATE / module.api.aws_lambda_function.api", "UPDATE / module.storage.aws_s3_bucket.artifacts", "REPLACE / module.cluster.aws_eks_node_group.gpu"]);
      await iac.getByRole("button", { name: "Destructive only" }).click();
      assert.deepEqual(await iac.locator(".if-stack summary").allTextContents(), ["REPLACE / module.cluster.aws_eks_node_group.gpu"]);
      await iac.locator('select[aria-label="IaC tool"]').selectOption("opentofu");
      assert.deepEqual(await iac.locator(".if-stack summary").allTextContents(), ["DELETE / module.old.aws_s3_bucket.cache"]);
      assert.equal(await iac.locator(".if-command").textContent(), "tofu show -json <saved-plan>");

      // Layout: no infra cell spills past the viewport; the wide diagram scrolls inside its frame.
      assert.deepEqual(await page.$$eval("#infrastructure .if-cell", (c) => c.filter((x) => x.getBoundingClientRect().right > innerWidth + 1).map((x) => x.dataset.kind)), [], `${width}px overflow`);
      if (process.env.EUI_SHOTS) await page.locator("#infrastructure").screenshot({ path: path.join(process.env.EUI_SHOTS, `infra-${width}.png`) });
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
