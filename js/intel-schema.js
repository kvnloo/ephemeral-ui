// The browser boundary and published JSON Schema share this definition.
export const INTEL_ACTIONS = Object.freeze(['tab', 'open-climb', 'open-skill', 'open-failure', 'refresh']);
const str = { type: 'string', maxLength: 200 };
const num = { type: 'number' };
const minute = { ...num, minimum: 0 };
const count = { type: 'integer', minimum: 0 };
const choice = (...values) => ({ ...str, enum: values });
const arr = (items, maxItems) => ({ type: 'array', items, ...(maxItems === undefined ? {} : { maxItems }) });
const obj = (properties, optional = []) => ({ type: 'object', properties, required: Object.keys(properties).filter(k => !optional.includes(k)), additionalProperties: false });
const ref = name => ({ $ref: `#/$defs/${name}` });
const defs = {
  climb: obj({ id: str, label: str, metric: str, points: arr(num, 64), best: num, unit: str }, ['unit']),
  route: obj({ skill: str, hits: count, corrected: count }),
  layer: obj({ level: choice('L0', 'L1', 'L2', 'L3', 'L4', 'L5'), name: str, size: str, fresh: str, stale: { type: 'boolean' } }),
  failure: obj({ sig: str, source: str, spark: { ...str, maxLength: 14, pattern: '^[01]*$' }, count, status: choice('open', 'fixed', 'law') }),
  span: { type: 'array', prefixItems: [minute, minute, choice('m', 't', 'e')], minItems: 3, maxItems: 3, items: false, 'x-orderedMinutes': true },
  track: obj({ lane: str, spans: arr(ref('span'), 200) }),
  'intel-suite': { ...obj({ at: { ...str, format: 'date-time' }, tab: { type: 'integer', minimum: 0, maximum: 4 }, climbs: arr(ref('climb')), routes: arr(ref('route'), 12), memory: arr(ref('layer')), failures: arr(ref('failure'), 12), trace: arr(ref('track')), notes: arr(str) }, ['tab']), 'x-maxTotalSpans': 200 }
};
export const INTEL_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'intel.v0 card',
  $comment: 'validateIntel additionally enforces the x-maxTotalSpans aggregate and x-orderedMinutes ordering. Standard JSON Schema validators do not evaluate these annotations.',
  ...obj({ kind: { const: 'intel-suite' }, app: { const: 'glide' }, data: ref('intel-suite'), demo: { const: true } }, ['demo']),
  'x-actions': INTEL_ACTIONS, $defs: defs
};

function validDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!m || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, min, sec, zh = 0, zm = 0] = m.map(v => Number(v ?? 0));
  const end = new Date(0); end.setUTCFullYear(year, month, 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= end.getUTCDate() && hour <= 23 && min <= 59 && sec <= 59 && zh <= 23 && zm <= 59;
}

// Only the vocabulary above, plus the two documented aggregate/order invariants.
function inspect(schema, value, path, errors) {
  if (errors.length >= 12) return;
  if (schema.$ref) return inspect(defs[schema.$ref.split('/').at(-1)], value, path, errors);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type !== type && !(schema.type === 'integer' && Number.isInteger(value))) {
    errors.push(`${path}: expected ${schema.type}`); return;
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: expected ${schema.enum.join(', ')}`);
  if (type === 'string') {
    if ([...value].length > schema.maxLength) errors.push(`${path}: string exceeds ${schema.maxLength} characters`);
    if (schema.format === 'date-time' && !validDate(value)) errors.push(`${path}: expected ISO8601 timestamp`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: expected only 0/1`);
  }
  if (type === 'number' && (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)) errors.push(`${path}: number out of range`);
  if (type === 'array') {
    if (value.length > schema.maxItems || value.length < schema.minItems) { errors.push(`${path}: invalid array length`); return; }
    value.forEach((v, i) => inspect(schema.prefixItems?.[i] ?? schema.items, v, `${path}[${i}]`, errors));
    if (schema['x-orderedMinutes'] && value[1] < value[0]) errors.push(`${path}: end precedes start`);
  }
  if (type === 'object') {
    for (const key of schema.required) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required`);
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(schema.properties, key)) inspect(schema.properties[key], value[key], `${path}.${key}`, errors);
      else errors.push(`${path}.${key}: unknown field`);
    }
    if (schema['x-maxTotalSpans'] && Array.isArray(value.trace)) {
      const total = value.trace.reduce((n, t) => n + (Array.isArray(t?.spans) ? t.spans.length : 0), 0);
      if (total > schema['x-maxTotalSpans']) errors.push(`${path}.trace: exceeds 200 spans total`);
    }
  }
}
export function validateIntel(data) {
  const errors = [];
  inspect(defs['intel-suite'], data, 'data', errors);
  return { ok: !errors.length, errors };
}
