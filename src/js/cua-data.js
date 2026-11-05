// Cua Driver contracts, pinned to trycua/cua libs/cua-driver (docs/action-result-contract.md, Cua Driver 0.15).
// The window and element fixture is synthetic: no driver is connected and nothing is ever dispatched from the card.
export const CUA_SOURCE = { repo: 'https://github.com/trycua/cua', path: 'libs/cua-driver/docs/action-result-contract.md', revision: 'c93ecbcb5' };
export const EFFECTS = ['confirmed', 'partial', 'unverifiable', 'suspected_noop', 'refused'];
export const ROUTES = ['accessibility', 'synthetic_events', 'global_input', 'dom', 'trusted_input'];
export const MODES = ['background', 'foreground', 'not_applicable', 'unknown'];
export const ESCALATION = ['pixel', 'foreground', 'page', 'session'];

export const CUA_EXAMPLE = {
  permission_mode: 'standard',
  windows: [
    { pid: 4120, window_id: 41, app: 'Calculator', title: 'Calculator', on_screen: true },
    { pid: 5310, window_id: 52, app: 'TextEdit', title: 'notes.txt', on_screen: true },
    { pid: 5310, window_id: 53, app: 'TextEdit', title: 'Untitled', on_screen: false }
  ],
  // get_window_state for window 41: element tokens are what actions target, never coordinates.
  state: {
    41: [
      { token: 'e:41:7', role: 'button', label: '7' }, { token: 'e:41:plus', role: 'button', label: 'Add' },
      { token: 'e:41:eq', role: 'button', label: 'Equals' }, { token: 'e:41:disp', role: 'static_text', label: 'Display', value: '0' }
    ],
    52: [
      { token: 'e:52:body', role: 'text_area', label: 'Document body', value: '' },
      { token: 'e:52:save', role: 'menu_item', label: 'File ▸ Save' }
    ]
  }
};

// Which tools fit an element role (a subset of the contract's action-result tools).
export const toolsFor = (role) => role === 'text_area' ? ['type_text', 'set_value', 'click'] : role === 'menu_item' ? ['invoke_menu'] : role === 'static_text' ? [] : ['click', 'double_click'];

/** Build the exact MCP call the agent would make. PID-only targets are refused by the driver when the PID owns several windows. */
export function callFor(win, el, tool, text) {
  const args = { pid: win.pid, window_id: win.window_id, element_token: el.token };
  if (tool === 'type_text' || tool === 'set_value') args[tool === 'type_text' ? 'text' : 'value'] = String(text ?? '');
  return { tool, args };
}

/** Check an ActionResult against the contract's invariants. Returns a list of violations (empty = valid). */
export function violations(r) {
  const v = [];
  if (!r || typeof r !== 'object') return ['not an object'];
  if (!EFFECTS.includes(r.effect)) v.push('effect is required and must be one of ' + EFFECTS.join(', '));
  if (!ROUTES.includes(r.route) && r.effect !== 'refused') v.push('route is required');
  if (r.delivery && !MODES.includes(r.delivery.mode)) v.push('unknown delivery.mode');
  const ev = Array.isArray(r.evidence) ? r.evidence : [];
  if (r.effect === 'confirmed' && !ev.length) v.push('confirmed needs readback or window_change evidence');
  if (r.effect === 'partial' && !Number.isFinite(r.delivery?.delivered_count)) v.push('partial needs delivery.delivered_count');
  if (r.effect === 'refused' && (ev.length || r.delivery)) v.push('refused has neither delivery nor evidence');
  if (r.error && r.effect !== 'refused') v.push('error appears only on refused');
  if (r.effect === 'refused' && !r.error?.code) v.push('refused needs error.code');
  if (r.escalation && !ESCALATION.includes(r.escalation.target)) v.push('unknown escalation.target');
  return v;
}

export const RESULT_EXAMPLES = {
  confirmed: { effect: 'confirmed', route: 'accessibility', delivery: { mode: 'background' }, evidence: [{ kind: 'value_readback', detail: 'Display read back as 7' }], summary: "Pressed button '7' (delivery_mode=background)" },
  refused: { effect: 'refused', route: 'accessibility', error: { code: 'ambiguous_window_target', hint: 'pid 5310 owns 2 windows; call list_windows({pid}) and retry with window_id' } },
  suspected_noop: { effect: 'suspected_noop', route: 'synthetic_events', delivery: { mode: 'background' }, escalation: { target: 'foreground', reason: 'suspected_noop' }, summary: 'Click delivered; no state change observed' }
};
