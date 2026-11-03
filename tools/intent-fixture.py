#!/usr/bin/env python3
"""Build src/data/intent-fixture.json for the intent cards (kinds-i.js) from private inputs.

    python3 tools/intent-fixture.py --contract <contract.pending.json> --live <live-state.json> \
        --z0-summary <z0int receipt summary --json> --z0-status <z0int status --json> \
        --z0-os <z0int os-context stats --json> --decisions <decisions.jsonl> \
        --flow <flow_predictions.jsonl> > src/data/intent-fixture.json

Every output field is built from an allowlist. Paths become neutral labels (‹receipt.json›), the
owner's fork becomes "fork", citations keep only their kind (observed / claimed), app and window
targets in flow predictions are dropped (families only). Upstream refs stay: they are public.
"""
import argparse, collections, datetime as dt, json, re, sys

PUBLIC_REPOS = {"pingdotgg/t3code", "NousResearch/hermes-agent"}
PROVIDERS = {"groq", "cerebras", "openrouter", "openai-codex", "xai-oauth", "cursor", "anthropic", "google", "kerdoios_plan", "paid-api", "local_mb"}
MODELS = {"openai/gpt-oss-20b", "grok-4.7", "gpt-6.1-sol", "gpt-6-luna", "qwen-coder", "qwen-3.8-27b", "composer-2.5", "frontier-codex", "openrouter/free", "nvidia/nemotron-3-super-120b-a12b:free", "mb"}
CAPS = re.compile(r"^(intelligence|coding|codex)\.[a-z_]+$")


def neutral(s: str) -> str:
    """Strip private paths and handles from a sentence-level string."""
    s = re.sub(r"/(?:mnt|home|workspace)/\S*?([\w.-]+\.(?:json|txt|md))\b", r"‹\1›", s)
    s = re.sub(r"/(?:mnt|home|workspace)/\S+", "‹path›", s)
    s = re.sub(r"\bkvnloo/", "fork/", s)
    s = re.sub(r"\bgroot\b", "the host", s)
    return s


def contract_part(c, live):
    b = c["plan"]["bindings"]
    tk = next(k for k, v in b.items() if k.startswith("task.") and isinstance(v, dict) and "text" in v)
    t = b[tk]
    acc = b[t["acceptance"]]
    m = re.search(r"jq -e '(.+?)' ", acc["cmd"])
    clauses = [x.strip() for x in re.split(r"\band\b", m.group(1))] if m else []
    pre = []
    for pid in t["preconditions"]:
        p = b[pid]
        ref = p.get("target")
        if p["type"] == "pr_state":
            if p["repo"] not in PUBLIC_REPOS:
                continue
            key = f"{p['repo']}#{p['number']}"
            lv = live["pre"].get(key, {})
            pre.append({"type": "pr_state", "ref": key, "head": p["head_sha"][:10], "want": p["state"], "observed": lv.get("state"), "observedHead": (lv.get("head") or "")[:10], "claim": neutral(p["claim"])})
        else:
            pre.append({"type": p["type"], "ref": ref if ref == "fleet-build" else "‹check›", "cmd": neutral(p.get("cmd", "")), "want": "exit 0", "observed": live["pre"].get(ref), "claim": neutral(p["claim"])})
    src = next(iter(b["sources"].values()))
    comp = b["compiler"]
    facts = [{"text": neutral(a["claim"]), "evidence": sorted({x["evidence_kind"] for x in a["citations"]}), "n": len(a["citations"])} for a in t["assumptions"]]
    slices = []
    for s in comp["delegation_plan"]:
        if "slice" in s:
            sid = s["slice"].split()[0]
            lv = live["slices"].get(sid, {})
            slices.append({"id": sid, "title": s["slice"][len(sid) + 1:], "repo": neutral(s.get("repo", "")) or None, "branch": s.get("branch"), "base": s.get("base"), "after": s.get("after", []), "work": neutral(s["work"]), "check": neutral(s["check"]), "state": lv.get("state", "not-started"), "head": (lv.get("head") or "")[:10] or None, "note": lv.get("note")})
        elif "deferred" in s:
            slices.append({"id": "later", "deferred": True, "work": neutral(s["deferred"])})
        elif "out_of_scope" in s:
            slices.append({"id": "out", "out": True, "work": neutral(s["out_of_scope"])})
    return {
        "spec": c["specVersion"], "revision": c["revision"], "protocol": c["policies"]["protocol"], "topology": c["policies"]["kinds"][0],
        "termination": c["constraints"]["termination"]["on"],
        "approval": b["approval"]["status"], "contractHash": b["approval"]["contractHash"], "sourceHash": b["approval"]["sourceHash"],
        "askedAt": t["askedAt"][:16] + "Z",
        "sentences": [{"text": x["text"].strip(), "cls": x["classification"], "reason": x.get("reason")} for x in src["sentences"]],
        "task": {"status": t["status"], "interpretation": neutral(t["interpretation"]), "target": "‹receipt.json›", "executor": "self + T3 delegate_task workers in fork worktrees"},
        "acceptance": {"type": acc["type"], "clauses": clauses, "receipt": "missing" if live["slices"].get("P1", {}).get("receipt") == "missing" else "present"},
        "pre": pre, "facts": facts,
        "conflicts": [neutral(x["claim"]) for x in t.get("conflicts", [])],
        "slices": slices, "checkedAt": live["checked_at"],
    }


def z0_part(summary, status, osx, decisions_path, flow_path):
    by_day = collections.defaultdict(collections.Counter)
    prov = collections.Counter(); execm = collections.Counter(); st = collections.Counter(); caps = collections.Counter()
    conf = []; last = 0; n = 0
    for line in open(decisions_path):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        n += 1
        ts = d.get("ts") or 0
        last = max(last, ts)
        route = d.get("route") or "orchestration"
        by_day[dt.datetime.fromtimestamp(ts, dt.UTC).date().isoformat()][route] += 1
        p, m = d.get("provider"), d.get("model")
        if p:
            prov[(p if p in PROVIDERS else "custom", m if m in MODELS else (None if m is None else "custom"))] += 1
        execm[d.get("execution") or "unknown"] += 1
        st[(d.get("extra") or {}).get("status") or "none"] += 1
        c = d.get("capability_id") or ""
        caps[c if CAPS.match(c) else "custom"] += 1
        if isinstance(d.get("confidence"), (int, float)):
            conf.append(d["confidence"])
    days = sorted(by_day)[-21:]
    fam = collections.Counter(); fday = collections.Counter(); committed = 0; hit = 0; judged = 0; fn = 0; flast = None
    for line in open(flow_path):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        fn += 1
        dist = d.get("distribution") or []
        if dist:
            fam[dist[0].get("family") or "other"] += 1
        if (d.get("commit") or {}).get("committed"):
            committed += 1
        a = d.get("actual") or {}
        if a.get("family") and dist:
            judged += 1
            hit += a.get("family") == dist[0].get("family")
        t = d.get("timestamp") or d.get("created_at") or d.get("ts") or d.get("predicted_at")
        if isinstance(t, (int, float)):
            day = dt.datetime.fromtimestamp(t, dt.UTC).date().isoformat(); fday[day] += 1; flast = max(flast or day, day)
        elif isinstance(t, str):
            fday[t[:10]] += 1; flast = max(flast or t[:10], t[:10])
    backends = []
    for bk in status.get("backends_list", []):
        backends.append(bk)
    return {
        "tokenomics": {k: summary[k] for k in ("rows", "frontier_tokens_avoided_est", "baseline_tokens_sum", "measured_frontier_tokens_sum", "actual_tokens_saved", "rows_with_baseline_and_measured", "rows_with_outcome", "verified_tasks", "tokens_per_verified_task")} | {"by_tier": summary["by_tier"], "by_capability": {k: v for k, v in summary["by_capability"].items() if CAPS.match(k)}},
        "decisions": {"rows": n, "last": dt.datetime.fromtimestamp(last, dt.UTC).isoformat()[:16] + "Z", "days": [{"day": d, **by_day[d]} for d in days], "providers": [{"provider": p, "model": m, "n": c} for (p, m), c in prov.most_common(10)], "execution": dict(execm.most_common()), "status": dict(st.most_common(8)), "capabilities": dict(caps.most_common(8)), "confidence": [sum(1 for x in conf if i / 10 <= x < (i + 1) / 10 or (i == 9 and x == 1)) for i in range(10)]},
        "context": {"live": osx["live"], "imported": {k: osx["imported"][k] for k in ("episodes", "shadow", "horizons", "routines", "automation_utility", "automation_receipts")}, "operators": osx["imported"].get("operator_histogram", {}), "flow": {"rows": fn, "top1": dict(fam.most_common(6)), "committed": committed, "judged": judged, "hit": hit, "last": flast, "days": [{"day": d, "n": fday[d]} for d in sorted(fday)[-21:]]}},
        "doctor": {"ok": status["ok"], "gpu": status["hardware"].get("gpu_name"), "vram": status["hardware"].get("vram_gb"), "omp": status["omp"], "backends": status["backends"], "unresolved": [re.sub(r"→.*", "", u).strip() for u in status.get("unresolved", [])], "evolutionLab": {"found": status["evolution_lab"]["found"], "importable": status["evolution_lab"]["importable"]}, "kerdoios": {"found": status["kerdoios"]["found"], "importable": status["kerdoios"]["importable"]}},
    }


def main():
    ap = argparse.ArgumentParser()
    for a in ("contract", "live", "z0-summary", "z0-status", "z0-os", "z0-backends", "decisions", "flow"):
        ap.add_argument("--" + a, required=True)
    o = ap.parse_args()
    J = lambda p: json.load(open(p))
    status = J(o.z0_status)
    status["backends"] = [{"id": b["id"], "kind": b["kind"], "local": b["local"], "ready": b["ready"], "why": re.sub(r":.*", "", b.get("detail") or "")} for b in J(o.z0_backends)["backends"]]
    out = {"v": 0, "contract": contract_part(J(o.contract), J(o.live)), "z0": z0_part(J(o.z0_summary), status, J(o.z0_os), o.decisions, o.flow)}
    json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
