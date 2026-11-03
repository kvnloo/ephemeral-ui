// The reel at the top: plays only while on screen, honours reduced motion, sound is opt-in.
const v = document.querySelector(".rl-vid"), b = document.querySelector(".rl-snd");
if (v) {
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  if (still.matches) { v.removeAttribute("autoplay"); v.controls = true; }
  new IntersectionObserver(([en]) => { if (still.matches) return; en.isIntersecting ? v.play().catch(() => {}) : v.pause(); }, { threshold: 0.2 }).observe(v);
  b?.addEventListener("click", () => {
    v.muted = !v.muted;
    if (!v.muted && v.paused) v.play().catch(() => {});
    b.textContent = v.muted ? "Sound off" : "Sound on";
    b.setAttribute("aria-pressed", String(!v.muted));
  });
}
