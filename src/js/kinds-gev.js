import { h } from './motion.js';
import { shell } from './shell.js';
import { tell } from './loop.js';
import { GEV_SOURCE, GEV_EXAMPLE, aircraftResult, filterAircraft, reading, areaCentre, polar, rangeFor } from './gev-data.js';
const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids); return n; };

export function gevContactsMake(app, rng, opts = {}) {
  let input = aircraftResult(opts.result || GEV_EXAMPLE), selected = null;
  const example = !opts.result;
  const spec = { kind: 'gev-contacts', app: app.id, source: GEV_SOURCE, provenance: example ? 'synthetic-example' : 'caller-supplied', input, actions: 'intent-only' };
  const list = h('div', { class: 'gc-list', 'aria-label': 'Aircraft contacts' });
  const inspector = h('section', { class: 'gc-inspector', 'aria-label': 'Selected aircraft', 'aria-live': 'polite' });
  const count = h('p', { class: 'gc-count', role: 'status' });
  const meta = h('p', { class: 'gc-meta' });
  const search = h('input', { type: 'search', placeholder: 'Callsign or type', 'aria-label': 'Filter aircraft' });
  const airborne = h('input', { type: 'checkbox', 'aria-label': 'Airborne only' });
  const send = h('button', { type: 'button', class: 'eu-btn primary', disabled: true }, 'Ask agent to track');
  const disclaimer = h('p', { class: 'gc-disclaimer' }, example ? 'SYNTHETIC EXAMPLE · not a live globe' : 'CALLER-SUPPLIED SNAPSHOT · not a live connection');
  // GEV's Contacts roster as a range scope: rings around the area centre, blips by bearing, chevrons by course.
  const scope = s('svg', { class: 'gc-scope', viewBox: '-120 -120 240 240', role: 'img', 'aria-label': 'Contacts by bearing and range' });
  const rangeLbl = h('span', { class: 'gc-range' });
  const body = h('div', { class: 'gc-root' },
    h('div', { class: 'gc-hud' }, h('span', { class: 'gc-tag' }, 'CONTACTS'), rangeLbl, disclaimer),
    h('div', { class: 'gc-scopewrap' }, scope), meta,
    h('div', { class: 'gc-filters' }, search, h('label', {}, airborne, ' Airborne only')), count, list, inspector,
    h('p', { class: 'gc-src' }, 'GEV / aircraft_in_area → contact selection'));
  const el = shell(app, 'gev-contacts', { verb: 'Inspect aircraft contacts', status: example ? 'Example' : 'Snapshot', body, foot: [send], summary: 'No aircraft selected' });
  function intent(action, label, row) {
    tell(el, { action, label, entities: { aircraft: row.id }, text: JSON.stringify({ source: input.data.source, observed_at: input.data.observed_at, freshness: input.data.freshness, aircraft: row }), quiet: true });
  }
  function detail() {
    inspector.replaceChildren(); send.disabled = !selected; send.textContent = 'Ask agent to track';
    el.summary = selected ? `Selected ${selected.callsign || selected.id}; no app action executed` : 'No aircraft selected';
    if (!selected) { inspector.append(h('p', {}, 'Select a contact to inspect its source fields.')); return; }
    inspector.append(h('h3', {}, selected.callsign || selected.id), h('p', {}, `ICAO ${selected.id} · ${selected.type_code || 'Type unavailable'}`),
      h('dl', { class: 'gc-readings' }, ...[['Altitude', reading(selected.altitude_m, 'm')], ['Ground speed', reading(selected.speed_mps, 'm/s')], ['Course', reading(selected.course_deg, '°')], ['Vertical', reading(selected.vertical_rate_mps, 'm/s')], ['Range', reading(selected.distance_km, 'km')], ['Last contact', selected.last_contact || 'Unavailable']].flatMap(([k,v]) => [h('dt', {}, k), h('dd', {}, v)])));
  }
  function pick(row) { selected = row; intent('select_aircraft', `Inspect ${row.callsign || row.id}`, row); render(); }
  // Ring distances sit on the ring where no blip or its label is (checked against each blip's label box).
  function ringLabels(max, xy) {
    const free = (x, y) => xy.every(([bx, by]) => !(x > bx - 14 && x < bx + 50 && y > by - 16 && y < by + 8) && !(x > bx - 50 && x < bx + 14 && y > by - 16 && y < by + 8));
    return [1, 2, 3].map(i => {
      const r = 104 * i / 3;
      for (const a of [135, 225, 45, 315, 160, 200, 20, 340]) {
        const x = Math.sin(a * Math.PI / 180) * r, y = -Math.cos(a * Math.PI / 180) * r;
        if (free(x, y)) return s('text', { class: 'rl', x: x.toFixed(1), y: (y + 2).toFixed(1) }, `${Math.round(max * i / 3)}${i === 3 ? ' km' : ''}`);
      }
      return '';
    });
  }
  function drawScope(rows) {
    const c = areaCentre(input), pts = rows.map(r => [r, polar(c, r)]).filter(([, p]) => p);
    const max = rangeFor(Math.max(1, ...pts.map(([, p]) => p.km))), k = 104 / max;
    rangeLbl.textContent = `${max} KM`;
    scope.replaceChildren(
      ...[1, 2, 3].map(i => s('circle', { class: 'ring', r: 104 * i / 3 })),
      s('path', { class: 'cross', d: 'M-110 0H110M0-110V110' }),
      ...[0, 90, 180, 270].map((d, i) => s('text', { class: 'card', x: Math.sin(d * Math.PI / 180) * 114, y: -Math.cos(d * Math.PI / 180) * 114 + 3 }, 'NESW'[i])),
      ...ringLabels(max, pts.map(([, p]) => [Math.sin(p.brg * Math.PI / 180) * p.km * k, -Math.cos(p.brg * Math.PI / 180) * p.km * k])),
      s('path', { class: 'ctr', d: 'M-4 0H4M0-4V4' }),
      s('g', { class: 'sweep' }, s('path', { d: 'M0 0L0-104A104 104 0 0 1 52-90Z' })),
      ...pts.map(([r, p]) => {
        const x = Math.sin(p.brg * Math.PI / 180) * p.km * k, y = -Math.cos(p.brg * Math.PI / 180) * p.km * k;
        const sel = r.id === selected?.id;
        const g = s('g', { class: `blip${r.on_ground ? ' gnd' : ''}${sel ? ' sel' : ''}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, tabindex: '-1' },
          s('circle', { class: 'hit', r: 12 }),
          r.course_deg == null ? s('rect', { x: -2.5, y: -2.5, width: 5, height: 5 }) : s('path', { d: 'M0-6L4.5 5L0 2.5L-4.5 5Z', transform: `rotate(${r.course_deg})` }),
          sel ? s('path', { class: 'brk', d: 'M-10-6V-10H-6M6-10H10V-6M10 6V10H6M-6 10H-10V6' }) : '',
          s('text', { x: x > 30 ? (sel ? -13 : -9) : (sel ? 13 : 9), y: sel ? -10 : -6, 'text-anchor': x > 30 ? 'end' : 'start' }, r.callsign || r.id));
        g.addEventListener('click', () => pick(r));
        return g;
      }));
  }
  function render() {
    const rows = filterAircraft(input, search.value || '', airborne.checked);
    if (selected && !rows.some(r => r.id === selected.id)) selected = null;
    count.textContent = `${rows.length} visible / ${input.data.returned ?? input.data.rows.length} returned / ${input.data.total ?? input.data.rows.length} matched${input.data.truncated ? ' · source result truncated' : ''}`;
    meta.textContent = `${input.data.source || 'Unknown source'} · ${input.data.freshness || 'unknown freshness'} · observed ${input.data.observed_at || 'unknown'} · ${input.data.coverage || 'unknown coverage'}`;
    list.replaceChildren(...rows.map(row => h('button', { type: 'button', class: 'gc-contact', 'aria-pressed': String(row.id === selected?.id), onclick: () => pick(row) }, h('b', {}, row.callsign || row.id), h('span', {}, `${row.on_ground ? 'On ground' : row.on_ground === false ? 'Airborne' : 'Ground state unknown'} · ${reading(row.altitude_m, 'm')}${row.distance_km != null ? ` · ${row.distance_km} km` : ''}`))));
    if (!rows.length) list.append(h('p', {}, 'No contacts match these filters.'));
    drawScope(rows);
    detail();
  }
  function applyFilter() {
    render();
    const rows = filterAircraft(input, search.value || '', airborne.checked);
    tell(el, { action: 'filter_aircraft', label: `Filter GEV contacts: ${rows.length} visible`, entities: { aircraft: rows.map(row => row.id) }, text: JSON.stringify({ query: search.value || '', airborne_only: Boolean(airborne.checked), visible_ids: rows.map(row => row.id), source: input.data.source, observed_at: input.data.observed_at }), quiet: true });
  }
  search.addEventListener('input', applyFilter); airborne.addEventListener('change', applyFilter);
  send.onclick = () => { if (!selected) return; intent('request_track_aircraft', `Track ${selected.callsign || selected.id} in GEV`, selected); send.textContent = 'Request emitted · execution unconfirmed'; };
  render();
  return { el, spec, play: async () => {}, setResult(result) { const next = aircraftResult(result); input = next; spec.input = next; spec.provenance = 'caller-supplied'; disclaimer.textContent = 'CALLER-SUPPLIED SNAPSHOT · not a live connection'; el.querySelector('.eu-status').textContent = 'Snapshot'; selected = null; render(); } };
}
export const KINDS_GEV = { 'gev-contacts': { label: 'GEV contacts', verb: () => 'Inspect aircraft contacts', make: gevContactsMake } };
