"""Real-phone check of the GEV contacts card on a focus-safe S22 virtual display (never display 0).
Reuses chatgpt-driver/focus_safe/fsdisplay.FocusSafe, same pattern as phone-parallel-20261105/play_check.py."""
import json, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, "$ZER0/data/operations/chatgpt-driver/focus_safe")
from fsdisplay import FocusSafe, resolve  # noqa: E402

OUT = Path("$ZER0/products/launch-videos/pretotypes/ephemeral-ui/out/gev-qual/s22")
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
rec = {"url": URL, "device": DEV, "before": owner_focus(), "steps": []}
try:
    with FocusSafe(DEV, name="gev-card-check", keep_awake=True) as fs:
        rec["display"] = fs.id; rec["size"] = [fs.w, fs.h]
        fs.sh(f"am start --display {fs.id} -f 0x18000000 -a android.intent.action.VIEW -d '{URL}?t={int(time.time())}#app=god-s-eye-view' com.android.chrome")
        fs.check_focus(); time.sleep(12)
        probe = "JSON.stringify({hash: location.hash, drawer: !document.getElementById('drawer').hidden, gev: !!document.querySelector('.k-gev-contacts'), blips: document.querySelectorAll('.gc-scope .blip').length, w: innerWidth})"
        rec["cdp_open"] = subprocess.run(["python3", str(Path(__file__).with_name("cdp_eval.py")), ":18802/", probe], capture_output=True, text=True, timeout=30).stdout.strip()
        rec["steps"].append({"open": fs.screenshot(str(OUT / "01-open.png")), "texts": [t for t in fs.texts() if re.search("DEMO|CONTACTS|SYNTHETIC|Ask agent", t)][:20]})
        for i in range(6):
            rows = [n for n in fs.tree().iter() if (n.get("text") or n.get("content-desc") or "").startswith("DEMO214") and box(n)[3] < fs.h * 0.9 and box(n)[1] > fs.h * 0.1]
            if rows: break
            fs.sh(f"input -d {fs.id} swipe {fs.w//2} {int(fs.h*.8)} {fs.w//2} {int(fs.h*.35)} 400"); time.sleep(1.2)
        rec["swipes"] = i
        if rows:
            n = sorted(rows, key=lambda n: box(n)[2]-box(n)[0])[-1]; rec["row"] = n.get("bounds")
            fs.tap(*FocusSafe.center(n)); time.sleep(1.5)
        rec["steps"].append({"tap_row": fs.screenshot(str(OUT / "02-select.png")), "texts": [t for t in fs.texts() if re.search("DEMO214|abc003|A321|11,300|Ask agent", t)][:12]})
        for j in range(5):
            btn = [n for n in fs.tree().iter() if (n.get("text") or "") == "Ask agent to track" and box(n)[3] < fs.h * 0.88]
            if btn: break
            fs.sh(f"input -d {fs.id} swipe {fs.w//2} {int(fs.h*.75)} {fs.w//2} {int(fs.h*.5)} 400"); time.sleep(1.2)
        rec["btn"] = btn and btn[0].get("bounds")
        if btn:
            fs.tap(*FocusSafe.center(btn[0])); time.sleep(1.2)
        rec["steps"].append({"track": fs.screenshot(str(OUT / "03-track.png")), "texts": [t for t in fs.texts() if re.search("unconfirmed|Ask agent", t)][:5]})
        rec["cdp_end"] = subprocess.run(["python3", str(Path(__file__).with_name("cdp_eval.py")), ":18802/", "JSON.stringify({sel: document.querySelector('.gc-contact[aria-pressed=true] b')?.textContent, scopeSel: document.querySelector('.gc-scope .blip.sel text')?.textContent, btn: document.querySelector('.k-gev-contacts .eu-f button')?.textContent, summary: document.querySelector('.k-gev-contacts')?.summary})"], capture_output=True, text=True, timeout=30).stdout.strip()
        fs.check_focus()
        rec["focus_ok"] = True
except Exception as e:  # noqa: BLE001
    rec["error"] = f"{type(e).__name__}: {e}"
rec["after"] = owner_focus()
(OUT / "receipt.json").write_text(json.dumps(rec, indent=1, default=str))
print(json.dumps(rec, indent=1, default=str)[:3000])
