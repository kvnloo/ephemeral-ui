// Authored examples for the fleet kit (kinds-fleet.js). Shapes follow the sources they port:
//   HOSTS     ← Dash hosts-tree.ts (host → harness → profile → chat) + k3s node/pod rows; herdr's working/blocked/idle states
//   PORTFOLIOS← zerOS WorktreeLadderPanel / _pm spine (product → feature → task) + Taste work.config.json (components with also[] portals)
//   FACTORY   ← Dash shared/orchestra.ts (nodes/edges, states idle|live|needs-you|failing|done; relations delegated|touched|hosted|workspace)
// Sample data only: no host, cluster, queue or repository was read to build these.

export const STATES = { working: "Working", blocked: "Needs you", idle: "Idle", offline: "Offline" };

export const HOSTS = [
  { id: "groot", label: "groot", role: "Workstation · k3s server", online: true,
    gauges: { cpu: 62, mem: 81, swap: 34, disk: 88, gpu: 71 },
    k3s: { node: "Ready", version: "v1.33", pods: [
      ["z0", "litellm", "Running", 0, ""], ["z0", "semantic-router", "Running", 0, ""],
      ["ml", "llama-server", "Running", 3, "OOMKilled 2 h ago"], ["factory", "salvage-verify", "Running", 0, ""],
      ["factory", "next-cards", "Completed", 0, ""], ["obs", "activitywatch", "Running", 1, ""] ] },
    harnesses: [
      { kind: "Hermes", agents: [
        { id: "ayo", name: "ayo", state: "working", line: "verify goal_law_coverage.py → 14/14 laws", age: "now", model: "opus" },
        { id: "clean", name: "clean", state: "working", line: "rendering fleet cards · shot 3/6", age: "1m", model: "opus" },
        { id: "ossfactory", name: "ossfactory", state: "blocked", line: "approve: post wave HOSS-12 upstream (6 comments)", age: "4m", model: "opus" } ] },
      { kind: "omp", agents: [ { id: "omp-1", name: "omp · glide", state: "idle", line: "tests green · waiting for next ask", age: "22m", model: "sonnet" } ] },
      { kind: "Claude Code", agents: [ { id: "cc-1", name: "claude · dash", state: "working", line: "npm test -- hosts-tree (41 passed)", age: "now", model: "opus" } ] } ] },
  { id: "mbp", label: "mbp", role: "Laptop · k3s agent (fleet-build)", online: true,
    gauges: { cpu: 44, mem: 58, swap: 6, disk: 61, gpu: null },
    k3s: { node: "Ready", version: "v1.33", pods: [
      ["fleet", "hoss12-verify-152098", "Running", 0, ""], ["fleet", "hoss12-verify-151582", "Completed", 0, ""],
      ["fleet", "playwright-gate", "Pending", 0, "waiting on CPU quota"] ] },
    harnesses: [
      { kind: "pi + Sol", agents: [ { id: "sol-1", name: "sol · streetiq", state: "working", line: "contract brief 3/5 · cross-section export", age: "2m", model: "sol" } ] },
      { kind: "Codex", agents: [ { id: "codex-1", name: "codex", state: "idle", line: "parked · weekly burn 61 %", age: "1h", model: "gpt" } ] } ] },
  { id: "s25", label: "s25", role: "Phone · virtual-display lanes", online: true, phone: true,
    gauges: { cpu: 38, mem: 72, swap: null, disk: 54, gpu: null },
    k3s: null,
    harnesses: [ { kind: "App lanes", agents: [
      { id: "deepseek", name: "DeepSeek lane", state: "working", line: "source packet 9/25 · read-only analysis", age: "now", model: "deepseek" },
      { id: "chatgpt-vd", name: "ChatGPT lane", state: "idle", line: "phone dozing · lane idle, not broken", age: "18m", model: "gpt" } ] } ] },
  { id: "s22", label: "s22", role: "Phone · ChatGPT sender", online: true, phone: true,
    gauges: { cpu: 91, mem: 94, swap: null, disk: 70, gpu: null },
    k3s: null,
    harnesses: [ { kind: "App lanes", agents: [
      { id: "s22-chatgpt", name: "ChatGPT lane", state: "blocked", line: "System UI not responding · phone out of RAM", age: "6m", model: "gpt" } ] } ] },
  { id: "avrea", label: "avrea", role: "Cloud runner · on demand", online: false,
    gauges: { cpu: null, mem: null, swap: null, disk: null, gpu: null }, k3s: null, harnesses: [] }
];

const T = (id, label, status, extra = {}) => ({ id, label, status, ...extra });
export const PORTFOLIOS = {
  glide: { label: "Glide stack", lead: "Six products that ship as one demo: the agent pane, the cards it grows, the taste it designs with, the films it renders.",
    products: [
      { id: "glide", label: "Glide", horizon: "now", features: [
        { id: "onboard", label: "/glide onboarding", horizon: "now", tasks: [T("g1", "z0int doctor card copy", "done"), T("g2", "corrections memory opt-in", "active")] },
        { id: "cards", label: "Ephemeral cards pane", horizon: "now", uses: ["eui-kit"], tasks: [T("g3", "fleet + factory cards", "active"), T("g4", "receipt chip names the real call", "next", { defect: true })] },
        { id: "factory", label: "Factory pane", horizon: "next", uses: ["aodl-gate", "factory-plugin"], tasks: [T("g5", "graph view of all agents", "active")] } ] },
      { id: "taste", label: "Taste", horizon: "now", features: [
        { id: "atlas", label: "Atlas + briefs", horizon: "now", uses: ["taste-skill"], tasks: [T("t1", "brief --component --md", "done")] },
        { id: "work", label: "Work layer board", horizon: "now", tasks: [T("t2", "stale status draws as stale", "done"), T("t3", "CI chip names the repo", "done")] },
        { id: "pencil", label: "OpenPencil bridge", horizon: "later", tasks: [T("t4", "save + share boards", "next")] } ] },
      { id: "eui", label: "ephemeral-ui", horizon: "now", features: [
        { id: "kit", label: "Card kit", horizon: "now", owns: ["eui-kit"], tasks: [T("e1", "auto-theme from host", "active")] },
        { id: "hosts", label: "Host integrations", horizon: "next", tasks: [T("e2", "Hermes desktop #842", "active"), T("e3", "Dash native cards", "next")] } ] },
      { id: "ffs", label: "fframestudio", horizon: "next", features: [
        { id: "studio", label: "Storyboard studio", horizon: "now", tasks: [T("f1", "v3.2 storyboard sheets", "done")] },
        { id: "plugin", label: "factory plugin", horizon: "next", owns: ["factory-plugin"], tasks: [T("f2", "suggest → AODL review", "blocked")] } ] },
      { id: "z0live", label: "z0live", horizon: "next", features: [
        { id: "voice", label: "Realtime voice", horizon: "next", uses: ["taste-skill"], tasks: [T("z1", "barge-in under 300 ms", "active")] } ] },
      { id: "aodl", label: "AODL", horizon: "later", features: [
        { id: "gate", label: "Intent gate", horizon: "next", owns: ["aodl-gate"], tasks: [T("a1", "contract per factory run", "next")] } ] } ],
    shared: [
      { id: "eui-kit", label: "Card kit", owner: "eui" }, { id: "taste-skill", label: "Taste skill", owner: "taste" },
      { id: "factory-plugin", label: "/factory plugin", owner: "ffs" }, { id: "aodl-gate", label: "AODL gate", owner: "aodl" } ] },
  flow: { label: "Flow engineering", lead: "Street safety products that share one data spine: crashes in, designs out, counts proving the change.",
    products: [
      { id: "streetiq", label: "StreetIQ", horizon: "now", features: [
        { id: "cut", label: "In-sim cross-section", horizon: "now", uses: ["crash-layer", "twin"], tasks: [T("s1", "lane widths on the cut", "done"), T("s2", "liquid-glass chrome", "active")] },
        { id: "export", label: "Council packet export", horizon: "next", tasks: [T("s3", "guideline citations per lane", "next")] } ] },
      { id: "crashiq", label: "CrashIQ", horizon: "now", features: [
        { id: "hin", label: "High-injury network", horizon: "now", owns: ["crash-layer"], tasks: [T("c1", "California SWITRS import", "done"), T("c2", "PA + MD data", "next")] } ] },
      { id: "opsiq", label: "TrafficOpsIQ", horizon: "next", features: [
        { id: "timing", label: "Signal timing review", horizon: "next", uses: ["counts", "twin"], tasks: [T("o1", "ATMS phase III fit", "next")] } ] },
      { id: "demandiq", label: "DemandIQ", horizon: "later", features: [
        { id: "counts", label: "Video counts", horizon: "next", owns: ["counts"], tasks: [T("d1", "near-miss pipeline", "active", { defect: true })] } ] },
      { id: "pilot", label: "Pilot program", horizon: "now", features: [
        { id: "bids", label: "Bid engine", horizon: "now", uses: ["crash-layer"], tasks: [T("p1", "SS4A demo-provider sub-scope", "blocked"), T("p2", "Sourcewell path", "next")] } ] } ],
    shared: [ { id: "crash-layer", label: "Crash data layer", owner: "crashiq" }, { id: "twin", label: "Street twin", owner: "streetiq" }, { id: "counts", label: "Traffic counts", owner: "demandiq" } ] }
};

// Factory: brain → lanes → cards → upstream. Edges carry Dash orchestra relations.
export const FACTORY = {
  stats: { queue: 54, depth: 80, sendsHour: 28, capHour: 30, posted: 17, verifyPass: 0.71 },
  nodes: [
    { id: "brain", col: 0, label: "ayo · brain", kind: "chat", state: "live", reason: "picks next cards every 15 min", action: "next_cards.py" },
    { id: "picker", col: 0, label: "card picker", kind: "subagent", state: "live", reason: "TEK → PRIO → fresh bugs → salvage", action: "hoss_picks" },
    { id: "l-s22", col: 1, label: "S22 · ChatGPT", kind: "host", state: "needs-you", reason: "System UI not responding (out of RAM)", action: "yield phone-compute lanes" },
    { id: "l-s25", col: 1, label: "S25 · DeepSeek", kind: "host", state: "live", reason: "source-packet analysis, read-only" },
    { id: "l-opus", col: 1, label: "Hermes · Opus", kind: "host", state: "live", reason: "core fixes + integration" },
    { id: "l-mbp", col: 1, label: "MBP · k3s verify", kind: "host", state: "live", reason: "red/green on exact SHAs" },
    { id: "l-sol", col: 1, label: "fx · Sol", kind: "host", state: "idle", reason: "bounded support; waiting on brief" },
    { id: "c1", col: 2, label: "HOSS12-TEK-4821", kind: "subagent", state: "live", reason: "reviewing a maintainer PR" },
    { id: "c2", col: 2, label: "HOSS12-SALV-77", kind: "subagent", state: "failing", reason: "green fails: No module named aiohttp", action: "bump ENV_REV, re-judge" },
    { id: "c3", col: 2, label: "HOSS12-PRIO-19", kind: "subagent", state: "done", reason: "UPSTREAM POSTED" },
    { id: "c4", col: 2, label: "GEV-LANE-08", kind: "subagent", state: "live", reason: "draft on fork branch" },
    { id: "c5", col: 2, label: "NEWTON-RC-3", kind: "subagent", state: "needs-you", reason: "skipped in both trees: needs usd-core", action: "rerun with EXTRA=usd-core" },
    { id: "r-hermes", col: 3, label: "hermes-agent", kind: "repo", state: "live" },
    { id: "r-newton", col: 3, label: "newton", kind: "repo", state: "idle" },
    { id: "r-gev", col: 3, label: "gods-eye-view", kind: "repo", state: "live" },
    { id: "r-t3", col: 3, label: "t3code", kind: "repo", state: "idle" } ],
  edges: [
    ["brain", "picker", "delegated", true], ["picker", "l-s22", "delegated", false], ["picker", "l-s25", "delegated", true],
    ["brain", "l-opus", "delegated", true], ["brain", "l-mbp", "delegated", true], ["brain", "l-sol", "delegated", false],
    ["l-opus", "c1", "delegated", true], ["l-mbp", "c2", "delegated", true], ["l-s22", "c3", "delegated", false],
    ["l-s25", "c4", "delegated", true], ["l-mbp", "c5", "delegated", false],
    ["c1", "r-hermes", "touched", true], ["c2", "r-hermes", "touched", true], ["c3", "r-hermes", "touched", false],
    ["c4", "r-gev", "touched", true], ["c5", "r-newton", "touched", false], ["l-sol", "r-t3", "workspace", false] ]
};
