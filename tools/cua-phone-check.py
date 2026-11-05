"""Real-phone check of the Cua Driver card on a focus-safe S22 virtual display (never display 0).
Reuses chatgpt-driver/focus_safe/fsdisplay.FocusSafe, same pattern as phone-parallel-20261105/play_check.py."""
import json, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, "$ZER0/data/operations/chatgpt-driver/focus_safe")
from fsdisplay import FocusSafe, resolve  # noqa: E402

OUT = Path("$ZER0/products/launch-videos/pretotypes/ephemeral-ui/out/cua-qual/s22")
OUT.mkdir(parents=True, exist_ok=True)
URL = "https://host.tailnet.ts.net:18802/"
DEV = "s22"


def owner_focus():
    s = resolve(DEV)
    out = subprocess.run(["adb", "-s", s, "shell", "dumpsys window | grep -E 'mTopFocusedDisplayId|mCurrentFocus' | head -3"],
                         capture_output=True, text=True, timeout=20).stdout
    return " | ".join(l.strip() for l in out.splitlines())


import re
def box(n): return list(map(int, re.findall(r"\d+", n.get("bounds", "[0,0][0,0]"))))
subprocess.run(["adb", "-s", resolve(DEV), "forward", "tcp:9333", "localabstract:chrome_devtools_remote"], capture_output=True, timeout=20)
import re
def box(n): return list(map(int, re.findall(r"\d+", n.get("bounds", "[0,0][0,0]"))))
T = int(time.time())
rec = {"url": URL, "device": DEV, "before": owner_focus(), "steps": []}
EVAL = str(Path(__file__).with_name("cdp_eval.py"))
def cdp(expr): return subprocess.run(["python3", EVAL, f"t={T}", expr], capture_output=True, text=True, timeout=30).stdout.strip()
def find(fs, pred):
    for i in range(6):
        hit = [n for n in fs.tree().iter() if pred(n.get("text") or n.get("content-desc") or "") and box(n)[3] < fs.h * 0.88 and box(n)[1] > fs.h * 0.08]
        if hit: return hit[0]
        fs.sh(f"input -d {fs.id} swipe {fs.w//2} {int(fs.h*.75)} {fs.w//2} {int(fs.h*.45)} 400"); time.sleep(1.2)
try:
    with FocusSafe(DEV, name="cua-card-check", keep_awake=True) as fs:
        rec["display"] = fs.id
        fs.sh(f"am start --display {fs.id} -f 0x18000000 -a android.intent.action.VIEW -d '{URL}?t={T}#app=cua' com.android.chrome")
        fs.check_focus(); time.sleep(14)
        rec["cdp_open"] = cdp("JSON.stringify({drawer: !document.getElementById('drawer').hidden, card: !!document.querySelector('.k-cua-action')})")
        rec["steps"].append({"open": fs.screenshot(str(OUT / "01-open.png"))})
        n = find(fs, lambda t: t.startswith("TextEdit") or t == "notes.txt")
        rec["win"] = n is not None and n.get("bounds")
        if n is not None: fs.tap(*FocusSafe.center(n)); time.sleep(1.2)
        n = find(fs, lambda t: "Document body" in t)
        rec["el"] = n is not None and n.get("bounds")
        if n is not None: fs.tap(*FocusSafe.center(n)); time.sleep(1.2)
        rec["steps"].append({"element": fs.screenshot(str(OUT / "02-element.png"))})
        n = find(fs, lambda t: t == "refused")
        if n is not None: fs.tap(*FocusSafe.center(n)); time.sleep(1)
        n = find(fs, lambda t: t == "Ask agent to run")
        rec["btn"] = n is not None and n.get("bounds")
        if n is not None: fs.tap(*FocusSafe.center(n)); time.sleep(1.2)
        rec["steps"].append({"run": fs.screenshot(str(OUT / "03-run.png"))})
        rec["cdp_end"] = cdp("JSON.stringify({call: document.querySelector('.k-cua-action .cd-call')?.textContent, result: document.querySelector('.k-cua-action .cd-result')?.textContent, btn: document.querySelector('.k-cua-action .eu-f button')?.textContent, summary: document.querySelector('.k-cua-action')?.summary})")
        fs.check_focus(); rec["focus_ok"] = True
except Exception as e:  # noqa: BLE001
    rec["error"] = f"{type(e).__name__}: {e}"
rec["after"] = owner_focus()
(OUT / "receipt.json").write_text(json.dumps(rec, indent=1, default=str))
print(json.dumps({k: rec.get(k) for k in ["display", "cdp_open", "win", "el", "btn", "cdp_end", "focus_ok", "error", "before", "after"]}, indent=1, default=str))
