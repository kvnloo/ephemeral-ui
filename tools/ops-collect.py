#!/usr/bin/env python3
"""Ops boards collector: one read-only pass over the owner's real ops sources -> one JSON snapshot.

    python3 tools/ops-collect.py --out out/ops-live.json            # private, local boards
    python3 tools/ops-collect.py --from out/ops-live.json --public src/data/ops-fixture.json \
        --deny-out out/ops-deny.json                                # sanitized, public site

Every source is opened read-only (sqlite `mode=ro`, HTTP GET, `kubectl get/top`, /proc reads).
A source that is missing or fails becomes `sources[<name>] = {"ok": false, "error": ...}` and its
board renders that as "not measured" instead of zeros. Shape: `ops-snapshot.v0` (see
src/js/ops-data.js, which is the only reader).
"""
import argparse, glob, hashlib, json, os, re, sqlite3, subprocess, time, urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

H = Path.home()
NOW = time.time()
DAY = 86400
SRC = {}  # source name -> {"ok", "path"/"url", "rows", "error"}


def ok(name, where, rows):
    SRC[name] = {"ok": True, "where": where, "rows": rows}


def fail(name, where, err):
    SRC[name] = {"ok": False, "where": where, "error": str(err)[:200]}


def ro(path):
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10)
    con.execute("PRAGMA query_only=1")
    con.execute("PRAGMA cache_size=-16000")
    return con


def iso_ms(s):
    if not s:
        return None
    try:
        return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return None


def sh(cmd, timeout=30):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=True).stdout


def get(url, timeout=90):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read())


# ---------------------------------------------------------------- burn-pace (subscription lanes)
def burn():
    path = H / ".z0int/state/posture/burn-pace.jsonl"
    try:
        rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    except Exception as e:  # noqa: BLE001
        fail("burn-pace", str(path), e)
        return None
    live = None
    try:
        live = json.loads(sh(["burn-pace", "--json"], timeout=90))
    except Exception as e:  # noqa: BLE001
        SRC["burn-pace-live"] = {"ok": False, "where": "burn-pace --json", "error": str(e)[:200]}
    if live:
        SRC["burn-pace-live"] = {"ok": True, "where": "burn-pace --json", "rows": 1}
        if not rows or rows[-1].get("at") != live.get("at"):
            rows.append(live)
    ok("burn-pace", str(path), len(rows))
    last = rows[-1]
    lanes = []
    for k, v in last.get("lanes", {}).items():
        if k == "github" or not isinstance(v, dict) or "weekly_used_pct" not in v:
            continue
        lanes.append({"id": k, "used": v.get("weekly_used_pct"), "hoursToReset": v.get("hours_to_reset"),
                      "pace": v.get("pace_ratio"), "band": v.get("band"), "sustainable": v.get("sustainable_pct_per_h"),
                      "observed": v.get("observed_pct_per_h"), "nextHour": v.get("pct_budget_next_hour"),
                      "maxAgents": v.get("max_workflow_agents"), "offload": v.get("offload")})
    hist = defaultdict(list)
    cut = NOW - 14 * DAY
    for r in rows:
        t = iso_ms(r.get("at"))
        if not t or t / 1000 < cut:
            continue
        for k, v in (r.get("lanes") or {}).items():
            if isinstance(v, dict) and "weekly_used_pct" in v:
                hist[k].append([t, v.get("weekly_used_pct"), v.get("pace_ratio"), v.get("band")])
    gh = last.get("lanes", {}).get("github") or {}
    z = last.get("z0_factory") or {}
    return {"at": iso_ms(last.get("at")), "posture": {"posture": z.get("posture"), "action": z.get("action"), "avoid": z.get("avoid", []), "prefer": z.get("prefer", []), "offload": z.get("offload_targets", [])},
            "lanes": lanes, "history": dict(hist), "freeLane": last.get("free_lane"),
            "github": {"remaining": gh.get("core", {}).get("remaining"), "limit": gh.get("core", {}).get("limit"), "minutesToReset": gh.get("core", {}).get("minutes_to_reset"), "pace": gh.get("pace_ratio"), "band": gh.get("band")}}


# ---------------------------------------------------------------- Hermes /stats server (:3858)
def stats3858(rng="7d"):
    base = "http://127.0.0.1:3858/api/stats"
    out = {}
    for ep in ("overview", "model-dashboard", "tools", "providers"):
        try:
            out[ep] = get(f"{base}/{ep}?range={rng}", timeout=180)
        except Exception as e:  # noqa: BLE001
            fail(f"stats:{ep}", f"{base}/{ep}", e)
            out[ep] = None
    if any(out.values()):
        ok("stats-3858", base, sum(1 for v in out.values() if v))
    return out


# ---------------------------------------------------------------- AgentsView (all harnesses, both hosts)
AV = H / ".agentsview/sessions.db"


def agentsview(days=14):
    res = {}
    since = datetime.fromtimestamp(NOW - days * DAY, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    try:
        con = ro(AV)
    except Exception as e:  # noqa: BLE001
        fail("agentsview", str(AV), e)
        return res
    try:
        # model mix per harness per UTC day (assistant messages that carry a model)
        rows = con.execute(
            """SELECT substr(m.timestamp,1,10) d, s.agent, m.model, count(*), sum(m.output_tokens)
               FROM messages m JOIN sessions s ON s.id=m.session_id
               WHERE m.timestamp>=? AND m.role='assistant' AND m.model NOT IN ('','<synthetic>')
               GROUP BY 1,2,3""", (since,)).fetchall()
        res["modelDays"] = [{"day": d, "harness": a, "model": m, "msgs": n, "out": o or 0} for d, a, m, n, o in rows]
        # sessions: context pressure, compactions, tool failure signals, outcome, last activity
        rows = con.execute(
            """SELECT id, agent, machine, coalesce(session_name, display_name, substr(first_message,1,80)), started_at,
                      ended_at, message_count, user_message_count, compaction_count, mid_task_compaction_count,
                      context_pressure_max, peak_context_tokens, tool_failure_signal_count, tool_retry_count,
                      consecutive_failure_max, outcome, ended_with_role, final_failure_streak, health_grade,
                      total_output_tokens, relationship_type, is_automated
               FROM sessions WHERE coalesce(ended_at, started_at) >= ? AND message_count > 2""", (since,)).fetchall()
        keys = ["id", "agent", "machine", "title", "started", "ended", "msgs", "userMsgs", "compactions", "midTask",
                "pressure", "peak", "toolFail", "toolRetry", "failMax", "outcome", "lastRole", "failStreak", "grade",
                "out", "rel", "auto"]
        res["sessions"] = [dict(zip(keys, r)) for r in rows]
        cut48 = datetime.fromtimestamp(NOW - 2 * DAY, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        for x in res["sessions"]:
            if x["rel"] in ("", "continuation") and (x["ended"] or x["started"] or "") >= cut48 and (not x["title"] or x["title"].startswith(("T3 Code interaction mode", "<"))):
                x["title"] = first_ask(con, x["id"]) or x["title"]
        # tool results that errored vs completed, per harness and tool (last 7 days)
        since7 = datetime.fromtimestamp(NOW - 7 * DAY, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        rows = con.execute(
            """SELECT s.agent, coalesce(tc.tool_name,'?'), r.status, count(*)
               FROM tool_result_events r JOIN sessions s ON s.id=r.session_id
               LEFT JOIN tool_calls tc ON tc.session_id=r.session_id AND tc.tool_use_id=r.tool_use_id
               WHERE r.timestamp>=? AND r.source='tool_execution' GROUP BY 1,2,3""", (since7,)).fetchall()
        res["toolResults"] = [{"harness": a, "tool": t, "status": s, "n": n} for a, t, s, n in rows]
        # delegate / turn failures the client reported back into the chat ("[failed]: Internal error")
        rows = con.execute(
            """SELECT m.timestamp, s.agent, m.session_id, substr(m.content,1,400) FROM messages m JOIN sessions s ON s.id=m.session_id
               WHERE m.timestamp>=? AND m.role='user' AND m.content LIKE 'Delegated task %' AND m.content LIKE '%[failed]%'""",
            (since,)).fetchall()
        res["delegateFailures"] = [{"t": iso_ms(t), "harness": a, "session": sid, "text": txt} for t, a, sid, txt in rows]
        # per-session message cadence for the newest top-level sessions: gaps for the "why slow" split
        top = con.execute(
            """SELECT id FROM sessions WHERE relationship_type='' AND is_automated=0 AND message_count BETWEEN 12 AND 4000
               AND coalesce(ended_at, started_at) >= ? ORDER BY coalesce(ended_at, started_at) DESC LIMIT 40""",
            (datetime.fromtimestamp(NOW - 2 * DAY, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),)).fetchall()
        slow = []
        for (sid,) in top:
            ms = con.execute("SELECT role, timestamp, has_tool_use FROM messages WHERE session_id=? ORDER BY ordinal", (sid,)).fetchall()
            slow.append({"id": sid, **slow_split([[r, iso_ms(t), tu] for r, t, tu in ms if t])})
        res["slow"] = slow
        ok("agentsview", str(AV), sum(len(v) for v in res.values() if isinstance(v, (list, dict))))
    except Exception as e:  # noqa: BLE001
        fail("agentsview", str(AV), e)
    finally:
        con.close()
    return res


STALL_MS = 10 * 60_000
T3_WRAP = re.compile(r"<(t3_code_instructions|runtime_info|pull_request_linking|sibling-sessions|owner-corrections|standing-rule-check)>.*?</\1>", re.S)


def unwrap(c):
    return re.sub(r"\s+", " ", re.sub(r"</?user_request>", " ", T3_WRAP.sub(" ", c or ""))).strip()


def first_ask(con, sid):
    """The owner's first real words in a session (T3 wraps every turn in instruction blocks)."""
    for (c,) in con.execute("SELECT content FROM messages WHERE session_id=? AND role='user' ORDER BY ordinal LIMIT 6", (sid,)):
        t = unwrap(c)
        if t and not t.startswith(("<", "[")):
            return t[:90]
    return None


def slow_split(ms):
    """Wall time of one session split by what each gap between messages was spent on.

    AgentsView keeps tool results inside the assistant message, so a gap that ends at an assistant
    message after an assistant tool call is tool run + next model call ("working"); a gap that ends
    at a user message is the agent waiting on the owner; the gap from a user message to the first
    reply is "reply". Working gaps over 10 min are stalls (a hung tool, a sleep-poll, a dead child).
    """
    acc = {"working": 0, "reply": 0, "waiting": 0}
    stalls, steps = [], []
    for (r0, t0, tu0), (r1, t1, _) in zip(ms, ms[1:]):
        g = max(0, (t1 or 0) - (t0 or 0))
        if r1 == "user":
            acc["waiting"] += g
        elif r0 == "user":
            acc["reply"] += g
        else:
            acc["working"] += g
            steps.append(g)
            if g >= STALL_MS:
                stalls.append([t0, g])
    steps.sort()
    q = lambda p: steps[min(len(steps) - 1, int(p * len(steps)))] if steps else None  # noqa: E731
    return {"start": ms[0][1] if ms else None, "end": ms[-1][1] if ms else None, "msgs": len(ms), **acc,
            "stepP50": q(0.5), "stepP95": q(0.95), "stalls": stalls[:12]}


# ---------------------------------------------------------------- Hermes live sessions (state.db, read-only)
def hermes_live(hours=48):
    """Liveness from Hermes' own state.db (AgentsView syncs on a timer and can lag by an hour)."""
    out, cut = [], NOW - hours * 3600
    dbs = sorted(glob.glob(str(H / ".hermes/profiles/*/state.db")))
    for db in dbs:
        prof = Path(db).parent.name
        try:
            con = ro(db)
            rows = con.execute(
                """SELECT s.id, s.source, coalesce(s.title, s.display_name), s.model, s.started_at, s.ended_at, s.end_reason, s.message_count, s.tool_call_count,
                          (SELECT max(timestamp) FROM messages m WHERE m.session_id=s.id),
                          (SELECT role FROM messages m WHERE m.session_id=s.id ORDER BY m.id DESC LIMIT 1)
                   FROM sessions s WHERE s.parent_session_id IS NULL AND s.started_at >= ? AND s.source != 'cron'""", (cut,)).fetchall()
            for sid, srcn, title, model, st, en, why, n, tools, last, role in rows:
                if (not title or title.startswith("T3 Code interaction mode")) and (last or st) >= NOW - 2 * DAY:
                    for (c,) in con.execute("SELECT content FROM messages WHERE session_id=? AND role='user' ORDER BY id LIMIT 4", (sid,)):
                        t = unwrap(c)
                        if t and not t.startswith(("<", "[")):
                            title = t[:90]
                            break
                out.append({"id": sid, "agent": "hermes", "profile": prof, "source": srcn, "title": title, "model": model, "startMs": int(st * 1000),
                            "endMs": int((last or en or st) * 1000), "closedMs": int(en * 1000) if en else None, "endReason": why, "msgs": n, "tools": tools, "lastRole": role})
            con.close()
        except Exception as e:  # noqa: BLE001
            SRC.setdefault("hermes state.db", {"ok": False, "where": db, "error": str(e)[:200]})
    if out:
        ok("hermes state.db", f"{len(dbs)} profiles' state.db (read-only)", len(out))
    return sorted(out, key=lambda r: -r["endMs"])[:90]


def hermes_model_days(days=14):
    """Assistant turns per UTC day per model from every profile's state.db (AgentsView has no model for Hermes)."""
    acc = Counter()
    for db in glob.glob(str(H / ".hermes/profiles/*/state.db")):
        try:
            con = ro(db)
            for d, m, n in con.execute("""SELECT date(m.timestamp,'unixepoch'), s.model, count(*) FROM messages m JOIN sessions s ON s.id=m.session_id
                                          WHERE m.timestamp > ? AND m.role='assistant' GROUP BY 1,2""", (NOW - days * DAY,)):
                acc[(d, m or "unknown")] += n
            con.close()
        except Exception:  # noqa: BLE001
            pass
    return [{"day": d, "harness": "hermes", "model": m, "msgs": n, "out": 0} for (d, m), n in acc.items()]


# ---------------------------------------------------------------- host memory, OOM, PSI, GPU
def host():
    out = {}
    try:
        mi = {l.split(":")[0]: int(l.split()[1]) for l in Path("/proc/meminfo").read_text().splitlines()}
        out["mem"] = {"totalMb": mi["MemTotal"] // 1024, "availMb": mi["MemAvailable"] // 1024,
                      "swapTotalMb": mi["SwapTotal"] // 1024, "swapUsedMb": (mi["SwapTotal"] - mi["SwapFree"]) // 1024}
        psi = {}
        for k in ("memory", "cpu", "io"):
            line = Path(f"/proc/pressure/{k}").read_text().splitlines()
            some = dict(x.split("=") for x in line[0].split()[1:])
            full = dict(x.split("=") for x in line[1].split()[1:]) if len(line) > 1 else {}
            psi[k] = {"some10": float(some["avg10"]), "some300": float(some["avg300"]), "full10": float(full.get("avg10", 0))}
        out["psi"] = psi
        ok("proc", "/proc/meminfo, /proc/pressure", 4)
    except Exception as e:  # noqa: BLE001
        fail("proc", "/proc", e)
    cg = glob.glob(f"/sys/fs/cgroup/user.slice/user-{os.getuid()}.slice/user@{os.getuid()}.service/agent.slice")
    if cg:
        try:
            ev = dict(l.split() for l in Path(cg[0], "memory.events").read_text().splitlines())
            cur = int(Path(cg[0], "memory.current").read_text())
            mx = Path(cg[0], "memory.max").read_text().strip()
            out["agentSlice"] = {k: int(v) for k, v in ev.items()} | {"currentMb": cur >> 20, "maxMb": None if mx == "max" else int(mx) >> 20}
            ok("cgroup", "agent.slice memory.events", 1)
        except Exception as e:  # noqa: BLE001
            fail("cgroup", cg[0], e)
    else:
        fail("cgroup", "agent.slice", "no agent.slice cgroup")
    try:
        g = sh(["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits"]).strip().split(", ")
        out["gpu"] = {"util": int(g[0]), "memUsedMb": int(g[1]), "memTotalMb": int(g[2]), "tempC": int(g[3])}
        ok("nvidia-smi", "nvidia-smi", 1)
    except Exception as e:  # noqa: BLE001
        fail("nvidia-smi", "nvidia-smi", e)
    return out


def kills(days=14):
    path = H / ".local/state/agent-oom/kills.jsonl"
    try:
        rows = []
        cut = NOW - days * DAY
        for l in path.read_text().splitlines():
            try:
                r = json.loads(l)
            except ValueError:
                continue
            if r.get("ts", 0) >= cut:
                rows.append({"t": int(r["ts"] * 1000), "comm": r.get("comm"), "anonMb": r.get("anon_mb"), "adj": r.get("oom_score_adj"), "cls": r.get("class")})
        ok("agent-oom kills", str(path), len(rows))
        return rows
    except Exception as e:  # noqa: BLE001
        fail("agent-oom kills", str(path), e)
        return []


def journal(hours=48):
    pat = re.compile(r"(Failed with result|Main process exited, code=killed|oom-kill|A process of this unit has been killed by the OOM killer)")
    try:
        txt = sh(["journalctl", "--user", "--since", f"-{hours}h", "--no-pager", "-o", "short-unix", "-q"], timeout=40)
    except Exception as e:  # noqa: BLE001
        fail("journal --user", "journalctl --user", e)
        return []
    out, acp = [], []
    acp_pat = re.compile(r"Started \[systemd-run\] .*\bhermes\b.* acp\.?$")
    for l in txt.splitlines():
        m = re.match(r"(\d+\.\d+) \S+ (\S+?)(?:\[\d+\])?: (.*)", l)
        if not m:
            continue
        t = int(float(m.group(1)) * 1000)
        if acp_pat.search(m.group(3)):
            acp.append(t)
            continue
        if not pat.search(l) and "process exited, code=killed, status=9/KILL" not in l:
            continue
        unit = re.match(r"([\w@.\-]+\.(?:service|scope|slice|timer)):", m.group(3))
        # status=9/KILL from systemd: the unit got SIGKILL. agent-oom-guard did not log it, so it is most
        # likely the kernel's cgroup OOM killer (agent.slice memory.events oom_kill counts these, untimed).
        what = "oom" if "OOM" in l or "oom" in l else "sigkill" if "status=9/KILL" in l else "failed" if "Failed" in l else "killed"
        out.append({"t": t, "unit": unit.group(1) if unit else m.group(2), "what": what})
    # A Hermes ACP process started within 5 s after a SIGKILL is a respawn: the client lost its agent.
    # (Clients start short-lived ACP probes every few seconds, so a wider window over-counts.)
    sk = sorted(j["t"] for j in out if j["what"] == "sigkill")
    for t in acp:
        if any(0 <= t - s <= 5_000 for s in sk):
            out.append({"t": t, "unit": "hermes-acp", "what": "acp-respawn"})
    ok("journal --user", "journalctl --user (failed/killed units, ACP respawns after SIGKILL)", len(out))
    return out


# ---------------------------------------------------------------- k3s + fleet-build
def k3s():
    env = os.environ | {"KUBECONFIG": str(H / ".kube/k3s.yaml")}
    out = {}

    def kj(*a):
        return json.loads(subprocess.run(["kubectl", *a, "-o", "json"], capture_output=True, text=True, timeout=30, check=True, env=env).stdout)
    try:
        nodes = kj("get", "nodes")["items"]
        top = {}
        try:
            for l in subprocess.run(["kubectl", "top", "nodes", "--no-headers"], capture_output=True, text=True, timeout=30, check=True, env=env).stdout.splitlines():
                p = l.split()
                top[p[0]] = {"cpuM": int(p[1].rstrip("m")), "cpuPct": int(p[2].rstrip("%")), "memMi": int(p[3].rstrip("Mi")), "memPct": int(p[4].rstrip("%"))}
        except Exception as e:  # noqa: BLE001
            fail("metrics-server", "kubectl top nodes", e)
        out["nodes"] = []
        for n in nodes:
            name = n["metadata"]["name"]
            cond = {c["type"]: c["status"] for c in n["status"].get("conditions", [])}
            out["nodes"].append({"id": name, "ready": cond.get("Ready") == "True", "pressure": [k for k in ("MemoryPressure", "DiskPressure", "PIDPressure") if cond.get(k) == "True"],
                                 "cordoned": bool(n["spec"].get("unschedulable")), "cpu": n["status"]["capacity"].get("cpu"), "gpu": n["status"]["capacity"].get("nvidia.com/gpu"), **top.get(name, {})})
        pods = kj("get", "pods", "-A")["items"]
        out["pods"] = [{"ns": p["metadata"]["namespace"], "node": p["spec"].get("nodeName"), "phase": p["status"].get("phase"),
                        "restarts": sum(c.get("restartCount", 0) for c in p["status"].get("containerStatuses", []) or [])} for p in pods]
        try:
            cq = kj("get", "clusterqueues")["items"]
            out["queues"] = [{"id": q["metadata"]["name"], "cohort": q["spec"].get("cohort"), "pending": q.get("status", {}).get("pendingWorkloads", 0), "admitted": q.get("status", {}).get("admittedWorkloads", 0)} for q in cq]
        except Exception as e:  # noqa: BLE001
            fail("kueue", "kubectl get clusterqueues", e)
        ok("k3s", "kubectl (KUBECONFIG=~/.kube/k3s.yaml)", len(out["nodes"]) + len(out["pods"]))
    except Exception as e:  # noqa: BLE001
        fail("k3s", "kubectl", e)
    return out


def fleet_runs(days=14):
    d = Path("$DATA/host-offload/home_kvn_.local_state_fleet_runs")
    out, cut = [], NOW - days * DAY
    try:
        for f in d.glob("*.log"):
            st = f.stat()
            if st.st_mtime < cut:
                continue
            m = re.match(r"(?:(\d{8}-\d{6})-[0-9a-f]+|fleet-[a-z]+-[0-9a-f]+)-(.+)\.log$", f.name)
            if not m:
                continue
            node = m.group(2)
            t0 = datetime.strptime(m.group(1), "%Y%m%d-%H%M%S").timestamp() if m.group(1) else None
            cls = None
            rec = f.with_name(f.name.replace(f"-{node}.log", ".json"))
            if rec.exists():
                try:
                    j = json.loads(rec.read_text())
                    cls = j.get("class")
                    t0 = t0 or rec.stat().st_mtime
                except ValueError:
                    pass
            with f.open("rb") as fh:
                fh.seek(max(0, st.st_size - 400))
                tail = fh.read().decode("utf8", "replace")
            ex = re.findall(r"# exit (\d+)", tail)
            out.append({"t": int((t0 or st.st_mtime) * 1000), "end": int(st.st_mtime * 1000), "node": node, "cls": cls, "exit": int(ex[-1]) if ex else None})
        ok("fleet-build runs", str(d), len(out))
    except Exception as e:  # noqa: BLE001
        fail("fleet-build runs", str(d), e)
    return sorted(out, key=lambda r: r["t"])


# ---------------------------------------------------------------- z0int dispatch ledger (lanes)
def dispatch():
    p = H / ".z0int/state/dispatch/ledger.sqlite"
    try:
        con = ro(p)
        rows = con.execute("SELECT ts, lane, kind, status, schema_valid, seconds, usd FROM outcomes").fetchall()
        con.close()
        ok("dispatch ledger", str(p), len(rows))
        return [{"t": int((ts or 0) * 1000), "lane": lane, "kind": kind, "status": st, "valid": sv, "secs": s, "usd": u} for ts, lane, kind, st, sv, s, u in rows]
    except Exception as e:  # noqa: BLE001
        fail("dispatch ledger", str(p), e)
        return []


# ---------------------------------------------------------------- assemble
GAPS = [
    {"metric": "TTFT and tokens/s per Hermes request", "why": "Hermes records usage per session and model; /stats shows avgTtft = null", "owner": "tokenomics", "board": "routing"},
    {"metric": "Tool-call latency (p50/p95) for Hermes", "why": "/stats tools rows carry calls/errors/sizes, no durations", "owner": "tokenomics", "board": "tools"},
    {"metric": "Per-request success/failure for Hermes", "why": "failedRequests is always 0: rows are session usage, not requests", "owner": "tokenomics", "board": "tokens"},
    {"metric": "Claude and Codex weekly pace once a window hits 100%", "why": "burn-pace reports band=unknown, pace=null at 100%; no reset-relative projection", "owner": "z0intelligence", "board": "burn"},
    {"metric": "Hermes model per message in AgentsView", "why": "AgentsView rows for hermes sessions have no model; the board reads each profile's state.db instead, so other consumers of AgentsView still miss it", "owner": "z0intelligence", "board": "models"},
    {"metric": "Tokens / cost per verified task", "why": "no verifier outcomes are joined to usage yet (outcome tiers exist in the spec)", "owner": "tokenomics", "board": "tokens"},
    {"metric": "Free-lane quota remaining (opencode, agy)", "why": "no probe; quota exhaustion is only seen as an error string", "owner": "kerdoios", "board": "routing"},
    {"metric": "Per-pod memory and GPU share in k3s", "why": "metrics-server gives node totals; no per-workload GPU accounting", "owner": "kerdoios", "board": "fleet"},
]


def compact(snap):
    """Aggregate the raw pulls into what the boards draw, so a snapshot fits one html_render page."""
    av = snap.get("av", {})
    now = snap["capturedAt"]
    ss = av.get("sessions", [])
    top = [s for s in ss if s.get("rel") in ("", "continuation")]
    for s in ss:
        s["startMs"], s["endMs"] = iso_ms(s.get("started")), iso_ms(s.get("ended") or s.get("started"))
    ctx = sorted([s for s in top if (s.get("compactions") or 0) > 0 or (s.get("pressure") or 0) >= 0.6], key=lambda s: -(s["endMs"] or 0))[:160]
    keep_ctx = ["id", "agent", "machine", "title", "startMs", "endMs", "msgs", "compactions", "midTask", "pressure", "peak", "outcome"]
    per_agent = defaultdict(lambda: {"sessions": 0, "compactions": 0, "midTask": 0, "withData": 0, "toolFail": 0, "toolRetry": 0, "subagents": 0})
    for s in ss:
        a = per_agent[s["agent"]]
        if s.get("rel") == "subagent":
            a["subagents"] += 1
            continue
        a["sessions"] += 1
        a["compactions"] += s.get("compactions") or 0
        a["midTask"] += s.get("midTask") or 0
        a["withData"] += 1 if s.get("pressure") is not None else 0
        a["toolFail"] += s.get("toolFail") or 0
        a["toolRetry"] += s.get("toolRetry") or 0
    recent = sorted([s for s in top if (s["endMs"] or 0) >= now - 2 * DAY * 1000], key=lambda s: -(s["endMs"] or 0))
    seen_h = Counter()
    alive = [s for s in recent if (seen_h.update([s["agent"]]) or seen_h[s["agent"]] <= 30)][:72]
    snap["avLastMs"] = max((s["endMs"] or 0) for s in ss) if ss else None
    keep_alive = ["id", "agent", "machine", "title", "startMs", "endMs", "msgs", "userMsgs", "outcome", "lastRole", "failStreak", "toolFail", "grade"]
    av["context"] = [{k: s.get(k) for k in keep_ctx} for s in ctx]
    av["alive"] = [{k: s.get(k) for k in keep_alive} for s in alive]
    av["perAgent"] = dict(per_agent)
    st = snap.get("stats") or {}
    snap["stats"] = {
        "overview": st.get("overview") and {k: st["overview"].get(k) for k in ("overall", "byAgentType", "timeSeries")},
        "model-dashboard": st.get("model-dashboard") and {k: st["model-dashboard"].get(k, []) for k in ("byModel", "modelSeries")},
        "tools": st.get("tools") and {"byTool": st["tools"].get("byTool", [])},
        "providers": st.get("providers") and {"providers": st["providers"].get("providers", [])},
    }
    meta = {s["id"]: s for s in ss}
    for x in av.get("slow", []):
        m = meta.get(x["id"], {})
        x["title"], x["agent"], x["machine"] = m.get("title"), m.get("agent"), m.get("machine")
    av.pop("sessions", None)
    # OOM kills: hourly buckets by class for 14 days, plus the last 48 h one by one
    hb = defaultdict(lambda: defaultdict(int))
    for k in snap.get("kills", []):
        hb[k["t"] // 3_600_000 * 3_600_000][k["cls"] or "unknown"] += 1
    snap["killsHourly"] = [[t, dict(v)] for t, v in sorted(hb.items())]
    # last 48 h at one-minute grain per class: enough to line kills up against a failed turn
    kb = {}
    for k in snap.get("kills", []):
        if k["t"] < now - 2 * DAY * 1000:
            continue
        key = (k["t"] // 60_000, k["cls"])
        x = kb.setdefault(key, {"t": k["t"], "cls": k["cls"], "n": 0, "anonMb": 0, "comm": k["comm"], "top": -1})
        x["n"] += 1
        x["anonMb"] += k["anonMb"] or 0
        if (k["anonMb"] or 0) > x["top"]:
            x["top"], x["comm"] = k["anonMb"] or 0, k["comm"]
    snap["kills"] = [{kk: v for kk, v in x.items() if kk != "top"} for x in sorted(kb.values(), key=lambda x: x["t"])]
    # fleet-build: per day per node outcomes, plus the newest 80 runs
    db = defaultdict(lambda: Counter())
    for r in snap.get("runs", []):
        o = "ok" if r["exit"] == 0 else "held" if r["exit"] == 75 else "unknown" if r["exit"] is None else "failed"
        db[(r["t"] // (DAY * 1000) * DAY * 1000, r["node"])][o] += 1
    snap["runsDaily"] = [{"day": d, "node": n, **dict(c)} for (d, n), c in sorted(db.items())]
    snap["runs"] = snap.get("runs", [])[-80:]
    # failed / killed user units: counts per unit, plus the newest 120
    uc = Counter((j["unit"], j["what"]) for j in snap.get("journal", []))
    snap["journalUnits"] = [{"unit": u, "what": w, "n": n} for (u, w), n in uc.most_common(40)]
    jb = {}
    for j in snap.get("journal", []):
        # SIGKILLs and ACP respawns keep 5-min buckets: their exact minute is what a cause chain needs
        k = (j["t"] // (300_000 if j["what"] in ("sigkill", "acp-respawn") else 1_800_000), j["unit"], j["what"])
        jb.setdefault(k, {"t": j["t"], "unit": j["unit"], "what": j["what"], "n": 0})["n"] += 1
    snap["journal"] = sorted(jb.values(), key=lambda j: j["t"])
    # dispatch ledger: per-lane outcome and job-time quantiles (the board's whole need)
    lanes = {}
    for r in snap.get("dispatch", []):
        if not r["lane"]:
            continue
        x = lanes.setdefault(r["lane"], {"lane": r["lane"], "n": 0, "ok": 0, "rl": 0, "secs": [], "usd": 0.0, "kinds": set(), "last": 0})
        x["n"] += 1
        x["ok"] += r["status"] == "ok"
        x["rl"] += "rate" in (r["status"] or "")
        if r["secs"] is not None:
            x["secs"].append(r["secs"])
        x["usd"] += r["usd"] or 0
        x["kinds"].add(r["kind"] or "?")
        x["last"] = max(x["last"], r["t"])
    def qtl(xs, p):
        xs = sorted(xs)
        return xs[min(len(xs) - 1, int(p * len(xs)))] if xs else None
    snap["dispatch"] = [{"lane": x["lane"], "n": x["n"], "ok": x["ok"], "rl": x["rl"], "p50": qtl(x["secs"], .5), "p95": qtl(x["secs"], .95), "usd": round(x["usd"], 4), "kinds": sorted(x["kinds"]), "last": x["last"]} for x in lanes.values()]
    return snap


def collect():
    s = stats3858("7d")
    snap = {"v": 0, "schema": "ops-snapshot.v0", "provenance": "live-local", "capturedAt": int(NOW * 1000),
            "burn": burn(), "stats": s, "av": agentsview(), "host": host(), "kills": kills(), "journal": journal(),
            "k3s": k3s(), "runs": fleet_runs(), "dispatch": dispatch(), "hermesLive": hermes_live(), "gaps": GAPS}
    snap["av"]["modelDays"] = [r for r in snap["av"].get("modelDays", []) if r["harness"] != "hermes"] + hermes_model_days()
    snap["sources"] = SRC
    return compact(snap)


# ---------------------------------------------------------------- public sanitizer
HOSTS = {"groot": "desktop", "mbp": "laptop", "galaxy-s22plus": "phone-a", "omarchy-phone": "phone-b", "boat": "cloud-box", "local": "desktop"}
NS_OK = {"kube-system", "kueue-system", "factory", "lanes", "phones"}
TOOLS_OK = {"terminal", "read_file", "write_file", "patch", "search_files", "web_search", "web_extract", "execute_code", "delegate_task", "todo",
            "skill_view", "skill_manage", "skills_list", "memory", "clarify", "vision_analyze", "browser_navigate", "process", "session_search",
            "Bash", "Read", "Edit", "Write", "Grep", "Glob", "Task", "TodoWrite", "WebFetch", "WebSearch", "MultiEdit", "NotebookEdit",
            "bash", "read", "edit", "write", "grep", "find", "ls", "apply_patch", "shell", "exec_command", "update_plan", "view_image", "?"}
COMM_OK = {"nvidia-smi", "python3", "python", "node", "node-MainThread", "chrome", "chromium", "bun", "java", "esbuild", "rg", "git", "uv", "cargo", "rustc", "ffmpeg", "blender", "llama-server", "deno", "go"}
HARNESS_OK = {"hermes", "omp", "claude", "codex", "opencode", "antigravity-cli", "grok", "chatgpt", "cursor", "cursor-ide", "kimi", "pi", "gemini", "omo", "deepseek-harness"}
MODEL_RE = re.compile(r"^(claude|gpt|gemini|grok|deepseek|glm|nvidia|nemotron|kimi|qwen|llama|mistral|o\d|GPT-OSS|Gemini|Claude)[\w .()\-/:]*$")
LANES_OK = {"claude", "codex", "claude2", "claude3", "nous", "grok"}
UNITS_OK = {"xdg-desktop-portal-gtk", "xdg-desktop-portal", "systemd", "pipewire", "wireplumber", "dbus", "gnome-keyring-daemon", "app-flatpak", "hermes-acp"}


def sanitize(snap, deny):
    def hid(x, p="s"):
        return f"{p}-{hashlib.sha256(str(x).encode()).hexdigest()[:6]}"

    def host_of(x):
        return HOSTS.get(x, "node-" + hid(x, "h")[2:5]) if x else None

    def keep(s, ok, alt):
        if s in ok:
            return s
        if isinstance(s, str) and len(s) >= 6:
            deny.add(s)
        return alt

    def model(m):
        return m if isinstance(m, str) and MODEL_RE.match(m) else keep(m, set(), "custom-model")

    def unit_alias(u):
        if not u:
            return "unit"
        base = u.split("@")[0]
        return base if base.split(".")[0] in UNITS_OK else "unit-" + hid(u, "u")[2:5] + "." + u.rsplit(".", 1)[-1]

    av = snap.get("av", {})
    pub_owner = {"z0intelligence": "intelligence"}
    out = {"v": 0, "schema": "ops-snapshot.v0", "provenance": "sanitized-snapshot", "capturedAt": snap["capturedAt"],
           "gaps": [{**g, "owner": pub_owner.get(g["owner"], g["owner"])} for g in snap["gaps"]]}
    b = snap.get("burn")
    if b:
        out["burn"] = {**b, "lanes": [l for l in b["lanes"] if l["id"] in LANES_OK], "history": {k: v for k, v in b["history"].items() if k in LANES_OK},
                       "posture": {**b["posture"], "action": "ration frontier pools" if b["posture"].get("action") else None}, "freeLane": "free lane"}
    st = snap.get("stats") or {}
    s2 = {}
    if st.get("overview"):
        s2["overview"] = {"overall": st["overview"]["overall"], "byAgentType": st["overview"].get("byAgentType", []), "timeSeries": st["overview"].get("timeSeries", [])}
    if st.get("model-dashboard"):
        md = st["model-dashboard"]
        s2["model-dashboard"] = {k: [{**r, "model": model(r.get("model"))} for r in md.get(k, [])] for k in ("byModel", "modelSeries")}
    if st.get("tools"):
        s2["tools"] = {"byTool": [{**r, "tool": keep(r["tool"], TOOLS_OK, "custom-" + hid(r["tool"], "t")[2:6])} for r in st["tools"].get("byTool", [])]}
    if st.get("providers"):
        s2["providers"] = {"providers": st["providers"].get("providers", [])}
    out["stats"] = s2
    sess_ids = {}

    def sid(x):
        if x not in sess_ids:
            sess_ids[x] = hid(x)
            if isinstance(x, str) and len(x) >= 6:
                deny.add(x)
        return sess_ids[x]
    a2: dict = {"modelDays": [{**r, "harness": keep(r["harness"], HARNESS_OK, "other"), "model": model(r["model"])} for r in av.get("modelDays", [])]}
    def sess(r):
        if r.get("title") and len(r["title"]) >= 6:
            deny.add(r["title"])
        m = r.get("machine") or "local"
        return {**r, "id": sid(r["id"]), "machine": host_of(m if m in HOSTS else "local"), "agent": keep(r.get("agent") or "other", HARNESS_OK, "other"),
                "title": f"{keep(r.get('agent') or 'agent', HARNESS_OK, 'agent')} session {sid(r['id'])[2:]}"}
    a2["context"] = [sess(r) for r in av.get("context", [])]
    a2["alive"] = [sess(r) for r in av.get("alive", [])]
    a2["perAgent"] = {keep(k, HARNESS_OK, "other"): v for k, v in av.get("perAgent", {}).items()}
    a2["toolResults"] = [{**r, "harness": keep(r["harness"], HARNESS_OK, "other"), "tool": keep(r["tool"], TOOLS_OK, "custom-" + hid(r["tool"], "t")[2:6])} for r in av.get("toolResults", [])]
    a2["delegateFailures"] = []
    for r in av.get("delegateFailures", []):
        deny.add(r["text"][:300])
        err = re.search(r"\[failed\]:?\s*([A-Za-z ]{3,40})", r["text"])
        a2["delegateFailures"].append({"t": r["t"], "harness": keep(r["harness"], HARNESS_OK, "other"), "session": sid(r["session"]), "text": f"delegated task failed: {err.group(1).strip() if err else 'error'}"})
    a2["slow"] = [sess(r) for r in av.get("slow", [])]
    out["av"] = a2
    out["host"] = snap.get("host", {})
    out["avLastMs"] = snap.get("avLastMs")
    out["hermesLive"] = [{**sess(r), "profile": "profile-" + hid(r["profile"], "p")[2:5], "model": model(r.get("model")) if r.get("model") else None} for r in snap.get("hermesLive", [])]
    out["kills"] = [{**k, "comm": keep(k["comm"], COMM_OK, "proc")} for k in snap.get("kills", [])]
    out["killsHourly"] = snap.get("killsHourly", [])
    out["journalUnits"] = []
    for j in snap.get("journalUnits", []):
        if j["unit"] and len(j["unit"]) >= 6 and unit_alias(j["unit"]) != j["unit"].split("@")[0]:
            deny.add(j["unit"])
        out["journalUnits"].append({**j, "unit": unit_alias(j["unit"])})
    out["journal"] = [{**j, "unit": unit_alias(j["unit"])} for j in snap.get("journal", [])]
    out["runsDaily"] = [{**r, "node": host_of(r["node"])} for r in snap.get("runsDaily", [])]
    for j in snap.get("journal", []):
        if j["unit"] and len(j["unit"]) >= 6 and unit_alias(j["unit"]) != j["unit"].split("@")[0]:
            deny.add(j["unit"])
    k = snap.get("k3s", {})
    out["k3s"] = {"nodes": [{**n, "id": host_of(n["id"])} for n in k.get("nodes", [])],
                  "pods": [{**p, "ns": p["ns"] if p["ns"] in NS_OK else "app-" + hid(p["ns"], "n")[2:5], "node": host_of(p["node"])} for p in k.get("pods", [])],
                  "queues": [{**q, "id": q["id"] if q["id"] in NS_OK | {"bench-lanes"} else "queue-" + hid(q["id"], "q")[2:5], "cohort": "lanes" if q.get("cohort") else None} for q in k.get("queues", [])]}
    for p in k.get("pods", []):
        if p["ns"] not in NS_OK and len(p["ns"]) >= 6:
            deny.add(p["ns"])
    out["runs"] = [{**r, "node": host_of(r["node"])} for r in snap.get("runs", [])]
    out["dispatch"] = [{**d, "lane": re.sub(r"[^\w.\-:/ ]", "", d["lane"])[:40], "kinds": [re.sub(r"[^\w\-]", "", k)[:30] for k in d["kinds"]]} for d in snap.get("dispatch", [])]
    out["sources"] = {n: {"ok": v["ok"], "rows": v.get("rows")} for n, v in snap.get("sources", {}).items()}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out")
    ap.add_argument("--from", dest="src")
    ap.add_argument("--public")
    ap.add_argument("--deny-out")
    a = ap.parse_args()
    snap = json.loads(Path(a.src).read_text()) if a.src else collect()
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(json.dumps(snap, separators=(",", ":")))
        print(json.dumps({"out": a.out, "bytes": Path(a.out).stat().st_size, "sources": {k: (v["ok"], v.get("rows"), v.get("error")) for k, v in snap["sources"].items()}}, indent=1))
    if a.public:
        deny = set()
        pub = sanitize(snap, deny)
        Path(a.public).write_text(json.dumps(pub, separators=(",", ":")))
        if a.deny_out:
            Path(a.deny_out).write_text(json.dumps(sorted(x for x in deny if 8 <= len(x) <= 400)))
        print(json.dumps({"public": a.public, "bytes": Path(a.public).stat().st_size, "denylist": len(deny)}))


if __name__ == "__main__":
    main()
