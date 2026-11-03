"""Host themes for the Ephemeral UI site, resolved to sRGB hex at build time.

Sources (read, not guessed):
- T3 Code: apps/web/src/index.css `:root` and `@variant dark`, kvnloo/t3code 54e9bb96 (2026-11-03),
  Tailwind 4.3.3 theme.css for the zinc/neutral/status ramps.
- Hermes desktop: apps/desktop/src/themes/presets.ts and styles.css (radius-scalar 0.2),
  kvnloo/hermes-agent 1afe076d. Dumped to JSON with node (see README).
Usage: python3 tools/themes.py <hermes-themes.json> > src/data/themes.json
"""
import json
import math
import re
import sys


def oklch(l, c, h):
    l = l / 100 if l > 1 else l
    a, b = c * math.cos(math.radians(h)), c * math.sin(math.radians(h))
    l_ = l + 0.3963377774 * a + 0.2158037573 * b
    m_ = l - 0.1055613458 * a - 0.0638541728 * b
    s_ = l - 0.0894841775 * a - 1.2914855480 * b
    lc, mc, sc = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc
    g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc
    bb = -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc

    def enc(x):
        x = max(0.0, min(1.0, x))
        return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    return tuple(round(enc(v) * 255) for v in (r, g, bb))


def hx(rgb, alpha=None):
    s = "#" + "".join(f"{v:02x}" for v in rgb)
    return s if alpha is None else s + f"{round(alpha * 255):02x}"


def parse(c):
    c = c.strip()
    if c.startswith("#"):
        c = c[1:]
        if len(c) == 3:
            c = "".join(ch * 2 for ch in c)
        rgb = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
        return rgb, (int(c[6:8], 16) / 255 if len(c) == 8 else 1.0)
    if c == "transparent":
        return (0, 0, 0), 0.0
    m = re.fullmatch(r"color-mix\(in srgb, (.+?) (\d+)%, (.+)\)", c)
    if m:
        (a, aa), p, (b, ba) = parse(m.group(1)), int(m.group(2)) / 100, parse(m.group(3))
        al = aa * p + ba * (1 - p)
        if al == 0:
            return (0, 0, 0), 0.0
        rgb = tuple(round((x * aa * p + y * ba * (1 - p)) / al) for x, y in zip(a, b))
        return rgb, al
    raise ValueError(c)


def res(c):
    rgb, a = parse(c)
    return hx(rgb, None if a >= 0.999 else a)


TW = {k: hx(oklch(*v)) for k, v in {
    "zinc-25": (99.2, 0, 0), "zinc-50": (98.5, 0, 0), "zinc-100": (96.7, 0.001, 286.375), "zinc-200": (92, 0.004, 286.32),
    "zinc-300": (87.1, 0.006, 286.286), "zinc-500": (55.2, 0.016, 285.938), "zinc-800": (27.4, 0.006, 286.033),
    "zinc-900": (21, 0.006, 285.885), "neutral-100": (97, 0, 0), "neutral-400": (70.8, 0, 0), "neutral-950": (14.5, 0, 0),
    "red-500": (63.7, 0.237, 25.331), "red-400": (70.4, 0.191, 22.216), "red-700": (50.5, 0.213, 27.518),
    "emerald-500": (69.6, 0.17, 162.48), "emerald-400": (76.5, 0.177, 163.223), "emerald-700": (50.8, 0.118, 165.612),
    "amber-500": (76.9, 0.188, 70.08), "amber-400": (82.8, 0.189, 84.429), "amber-700": (55.5, 0.163, 48.998),
    "t3-primary": (48.8, 0.217, 264), "t3-primary-dark": (57.1, 0.21, 264),
}.items()}

T3_SANS = '-apple-system, BlinkMacSystemFont, "Inter Variable", Inter, "Segoe UI", system-ui, sans-serif'
T3_MONO = 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace'


def t3():
    raised = res(f"color-mix(in srgb, {TW['neutral-950']} 97%, #ffffff)")
    light = dict(host="t3", id="t3-light", label="T3 Code", sub="Light", scheme="light",
                 bg=TW["zinc-25"], fg=TW["zinc-900"], card="#ffffff", muted=TW["zinc-50"], mutedFg=TW["zinc-500"],
                 accent=TW["zinc-100"], border=TW["zinc-200"], input=TW["zinc-300"], primary=TW["t3-primary"], primaryFg="#ffffff",
                 sidebar=TW["zinc-50"], sidebarBorder=TW["zinc-200"],
                 message=res(f"color-mix(in srgb, {TW['zinc-200']} 55%, {TW['zinc-100']})"), messageBorder="#00000000",
                 success=TW["emerald-500"], successFg=TW["emerald-700"], warning=TW["amber-500"], danger=TW["red-500"], dangerFg=TW["red-700"],
                 radius=8, font=T3_SANS, mono=T3_MONO, glass=False,
                 shadow="0 1px 2px rgb(0 0 0 / 5%)")
    dark = dict(light, id="t3-dark", sub="Dark", scheme="dark", bg="#000000", fg=TW["neutral-100"], card=raised,
                muted="#ffffff08", mutedFg=TW["neutral-400"], accent="#ffffff0a", border="#ffffff14", input="#ffffff1c",
                primary=TW["t3-primary-dark"], sidebar=raised, sidebarBorder="#ffffff14",
                message=res(f"color-mix(in srgb, {TW['neutral-950']} 92%, #ffffff)"),
                successFg=TW["emerald-400"], dangerFg=TW["red-400"], shadow="0 14px 32px -18px rgb(0 0 0 / 75%)")
    return [light, dark]


def hermes(themes):
    out, seen = [], set()
    for t in themes:
        if t["name"] in seen:
            continue
        seen.add(t["name"])
        typo = t.get("typography") or {}
        for variant, colors in (("light" if t.get("darkColors") else "dark", t["colors"]), ("dark", t.get("darkColors"))):
            if not colors:
                continue
            bgrgb, _ = parse(colors["background"])
            scheme = "light" if sum(bgrgb) / 3 > 140 else "dark"
            label_sub = t["label"] if not t.get("darkColors") else f"{t['label']} {variant}"
            out.append(dict(host="hermes", id=f"hermes-{t['name']}" + ("-dark" if variant == "dark" and t.get("darkColors") else ""),
                            label="Hermes desktop", sub=label_sub, scheme=scheme, note=t.get("description", ""),
                            bg=res(colors["background"]), fg=res(colors["foreground"]), card=res(colors["card"]),
                            muted=res(colors["muted"]), mutedFg=res(colors["mutedForeground"]), accent=res(colors["accent"]),
                            border=res(colors["border"]), input=res(colors["input"]), primary=res(colors["primary"]),
                            primaryFg=res(colors["primaryForeground"]), ring=res(colors.get("ring", colors["primary"])),
                            sidebar=res(colors["sidebarBackground"]), sidebarBorder=res(colors["sidebarBorder"]),
                            message=res(colors["userBubble"]), messageBorder=res(colors["userBubbleBorder"]),
                            success=TW["emerald-500"], successFg=TW["emerald-700"] if scheme == "light" else TW["emerald-400"],
                            warning=TW["amber-500"], danger=res(colors["destructive"]), dangerFg=res(colors["destructive"]),
                            # styles.css pins --radius-scalar to 0.2: radius-lg = 0.75rem * 0.2.
                            radius=2.4, font=typo.get("fontSans") or T3_SANS.replace('"Inter Variable", Inter, ', ""),
                            mono=typo.get("fontMono") or 'Menlo, Monaco, "SF Mono", "Courier Prime", monospace',
                            fontUrl=typo.get("fontUrl"), glass=True,
                            shadow="0 0.125rem 0.25rem -0.125rem #00000012, 0 0.5rem 0.75rem -0.375rem #0000000f, 0 1.25rem 1.75rem -0.875rem #0000000f"))
    return out


if __name__ == "__main__":
    hermes_json = json.load(open(sys.argv[1]))
    json.dump({"sources": {
        "t3": "kvnloo/t3code apps/web/src/index.css @ 54e9bb96 + tailwindcss 4.3.3",
        "hermes": "kvnloo/hermes-agent apps/desktop/src/themes/presets.ts @ 1afe076d",
    }, "themes": t3() + hermes(hermes_json)}, sys.stdout, indent=1)
