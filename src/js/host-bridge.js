// Host bridges for the host matrix: what each agent host would do with a card's eui:intent.
// Pure functions, no DOM, so tools/hosts.test.mjs can check them. The shapes follow each host's
// public contract (see data/hosts.json `sources`); on this site they are simulated, never sent.

const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** One line a host could show or add to the chat for an intent. */
export function describe(intent) {
  return `${intent.label || intent.action} · ${intent.app}/${intent.kind}`;
}

/**
 * Translate a card intent for a host profile. Returns null when the host has no channel back
 * (tier 0), otherwise { channel, message } where message is what the host's bridge carries.
 */
export function translate(profile, intent, { id = 1, nonce = "sim" } = {}) {
  const b = profile.bridge?.id;
  if (!intent || typeof intent !== "object" || profile.tier?.level === 0 || b === "none") return null;
  if (b === "mcp-apps") {
    // MCP Apps 2026-01-26: View -> Host request. Hosts may hold it until the next user message.
    return { channel: "postMessage → host (JSON-RPC)", message: { jsonrpc: "2.0", id, method: "ui/update-model-context", params: { content: [{ type: "text", text: describe(intent) }], structuredContent: { euiIntent: intent } } } };
  }
  if (b === "o8-question") {
    // o8 VisualizationFrame accepts a trimmed string of at most 4000 characters, shown as a proposal.
    return { channel: "postMessage → o8 frame host", message: { type: "o8-visualization:question", nonce, value: short(describe(intent), 4000) } };
  }
  if (b === "tern-host") return { channel: "Glide host intent callback", message: { send: { v: intent.v ?? 0, kind: intent.kind, app: intent.app, action: intent.action, ids: intent.ids || [], entities: intent.entities || {} } } };
  if (b === "t3-native") return { channel: "T3 native catalog event", message: { type: "eui:intent", detail: intent } };
  return null;
}

/** Light/dark theme id a host profile wears for a scheme; falls back to its light theme. */
export const themeFor = (profile, scheme) => profile.themes[scheme] || profile.themes.light;

/** The host profile that owns a theme (theme.host is the profile id). */
export const profileOf = (hosts, theme) => hosts.find((p) => p.id === theme?.host) || null;
