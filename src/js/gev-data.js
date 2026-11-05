// GEV aircraft_in_area result contract, pinned to source 6a2ec46.
// Synthetic fixture, never an observation of Kevin's systems or a live feed.
export const GEV_SOURCE = { repo: 'https://github.com/kvnloo/gods-eye-view', revision: '6a2ec46de1eeb31132c992082485564c85344d2a', path: 'src/tools/queries/aviation.js' };
export const GEV_EXAMPLE = {
  summary: '7 aircraft in example area (data may be stale).',
  data: {
    source: 'synthetic', coverage: 'example area only', view: { center: { lat: 0, lon: 0 } }, observed_at: '2026-01-01T12:00:00Z', freshness: 'stale',
    rows: [
      { id: 'abc001', callsign: 'DEMO101', lat: 0.1, lon: 0.2, altitude_m: 9200, on_ground: false, speed_mps: 230, course_deg: 80, vertical_rate_mps: 0, type_code: 'B738', registration: null, operator: null, origin_country: null, last_contact: '2026-01-01T12:00:00Z', distance_km: 25 },
      { id: 'abc002', callsign: null, lat: 0.3, lon: 0.1, altitude_m: null, on_ground: true, speed_mps: null, course_deg: null, vertical_rate_mps: null, type_code: null, registration: null, operator: null, origin_country: null, last_contact: null, distance_km: 35 },
      { id: 'abc003', callsign: 'DEMO214', lat: -0.42, lon: 0.55, altitude_m: 11300, on_ground: false, speed_mps: 248, course_deg: 305, vertical_rate_mps: 0, type_code: 'A321', registration: null, operator: null, origin_country: null, last_contact: '2026-01-01T11:59:56Z', distance_km: 77 },
      { id: 'abc004', callsign: 'DEMO330', lat: 0.71, lon: -0.38, altitude_m: 3400, on_ground: false, speed_mps: 141, course_deg: 160, vertical_rate_mps: -6.5, type_code: 'E75L', registration: null, operator: null, origin_country: null, last_contact: '2026-01-01T11:59:58Z', distance_km: 89 },
      { id: 'abc005', callsign: 'DEMO407', lat: -0.9, lon: -0.72, altitude_m: 6100, on_ground: false, speed_mps: 190, course_deg: 35, vertical_rate_mps: 8.1, type_code: 'B39M', registration: null, operator: null, origin_country: null, last_contact: '2026-01-01T11:59:51Z', distance_km: 128 },
      { id: 'abc006', callsign: 'DEMO552', lat: 1.35, lon: 0.9, altitude_m: 12200, on_ground: false, speed_mps: 255, course_deg: 220, vertical_rate_mps: 0, type_code: 'B77W', registration: null, operator: null, origin_country: null, last_contact: '2026-01-01T11:59:49Z', distance_km: 180 },
      { id: 'abc007', callsign: 'DEMO618', lat: 0.05, lon: -1.95, altitude_m: 1200, on_ground: false, speed_mps: 72, course_deg: 95, vertical_rate_mps: 2.4, type_code: 'C172', registration: null, operator: null, origin_country: null, last_contact: '2026-01-01T11:59:40Z', distance_km: 217 }
    ], total: 7, returned: 7, truncated: false
  }
};
export function aircraftResult(result) {
  const d = result?.data;
  if (!d || !Array.isArray(d.rows) || d.rows.length > 500) throw new TypeError('Expected GEV aircraft result data.rows (max 500)');
  const ids = new Set();
  for (const row of d.rows) {
    if (!row || typeof row.id !== 'string' || !/^[\w.:\-@#/ ]{1,100}$/.test(row.id) || ids.has(row.id)) throw new TypeError('Aircraft requires unique safe id');
    ids.add(row.id);
    for (const k of ['altitude_m', 'speed_mps', 'course_deg', 'distance_km']) if (row[k] != null && !Number.isFinite(row[k])) throw new TypeError(`Invalid ${k}`);
  }
  return structuredClone(result);
}
export function filterAircraft(result, query = '', airborne = false) {
  return result.data.rows.filter(r => (!airborne || r.on_ground === false) && `${r.id} ${r.callsign || ''} ${r.type_code || ''}`.toLowerCase().includes(query.toLowerCase().trim()));
}
export const reading = (n, unit) => n == null ? 'Unavailable' : `${n.toLocaleString('en-US')} ${unit}`;

// Bearing and range of a contact from the area centre (GEV's view centre when present, else the rows' centroid).
export function areaCentre(result) {
  const v = result.data.view?.center || result.data.view?.target;
  if (v && Number.isFinite(v.lat ?? v.latitude)) return { lat: v.lat ?? v.latitude, lon: v.lon ?? v.longitude };
  const pts = result.data.rows.filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));
  if (!pts.length) return null;
  return { lat: pts.reduce((s, r) => s + r.lat, 0) / pts.length, lon: pts.reduce((s, r) => s + r.lon, 0) / pts.length };
}
export function polar(c, row) {
  if (!c || !Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return null;
  const R = Math.PI / 180, dLon = (row.lon - c.lon) * R, a = c.lat * R, b = row.lat * R;
  const brg = (Math.atan2(Math.sin(dLon) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(dLon)) / R + 360) % 360;
  const km = row.distance_km ?? 6371 * Math.acos(Math.min(1, Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dLon)));
  return { brg, km };
}
export const rangeFor = km => [25, 50, 100, 250, 500, 1000].find(r => r >= km) || Math.ceil(km / 500) * 500;
