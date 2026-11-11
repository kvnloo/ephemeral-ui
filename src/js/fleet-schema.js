// The browser validator and published JSON Schema share this definition.
export const FLEET_ACTIONS = Object.freeze({
  'fleet-hosts': Object.freeze(['open-chat', 'nudge', 'open-pod']),
  'fleet-portfolio': Object.freeze(['open-task', 'set-next']),
  'fleet-factory': Object.freeze(['queue-fix', 'open-node'])
});
const str = { type: 'string', maxLength: 200 };
const num = { type: 'number', minimum: 0 };
const bool = { type: 'boolean' };
const choice = (...values) => ({ type: 'string', enum: values, maxLength: 200 });
const arr = (items, maxItems = 512) => ({ type: 'array', items, maxItems });
const obj = (properties, optional = []) => ({ type: 'object', properties, required: Object.keys(properties).filter(k => !optional.includes(k)), additionalProperties: false });
const tuple = (...prefixItems) => ({ type: 'array', prefixItems, minItems: prefixItems.length, maxItems: prefixItems.length, items: false });
const ref = name => ({ $ref: `#/$defs/${name}` });
const horizon = choice('now', 'next', 'later');
const at = { ...str, format: 'date-time' };
const defs = {
  agent: obj({ id: str, name: str, state: choice('working', 'blocked', 'idle', 'offline'), line: str, age: str, model: str }),
  host: obj({ id: str, label: str, role: str, online: bool, phone: bool,
    gauges: obj(Object.fromEntries(['cpu', 'mem', 'swap', 'disk', 'gpu'].map(k => [k, { type: ['number', 'null'], minimum: 0, maximum: 100 }]))),
    k3s: { anyOf: [{ type: 'null' }, obj({ node: str, version: str, pods: arr(tuple(str, str, str, { type: 'integer', minimum: 0 }, str)) })] },
    harnesses: arr(obj({ kind: str, agents: arr(ref('agent')) })) }, ['phone']),
  task: obj({ id: str, label: str, status: choice('done', 'active', 'next', 'blocked'), defect: bool, url: str }, ['defect', 'url']),
  feature: obj({ id: str, label: str, horizon, uses: arr(str), owns: arr(str), tasks: arr(ref('task')) }, ['uses', 'owns']),
  product: obj({ id: str, label: str, horizon, features: arr(ref('feature')) }),
  portfolio: obj({ label: str, lead: str, products: arr(ref('product')), shared: arr(obj({ id: str, label: str, owner: str })) }),
  node: obj({ id: str, col: { type: 'integer', minimum: 0, maximum: 3 }, label: str, kind: choice('chat', 'subagent', 'host', 'repo'), state: choice('idle', 'live', 'needs-you', 'failing', 'done'), reason: str, action: str, url: str }, ['reason', 'action', 'url']),
  'fleet-hosts': obj({ at, hosts: arr(ref('host'), 64) }),
  'fleet-portfolio': obj({ at, portfolios: { type: 'object', maxProperties: 512, propertyNames: str, additionalProperties: ref('portfolio') } }),
  'fleet-factory': obj({ at, stats: obj({ queue: num, depth: num, sendsHour: num, capHour: num, posted: num, verifyPass: { ...num, maximum: 1 } }), nodes: arr(ref('node')), edges: arr(tuple(str, str, choice('delegated', 'touched', 'hosted', 'workspace'), bool)) })
};
export const FLEET_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'fleet.v0 card',
  oneOf: Object.entries({ 'fleet-hosts': 'k3s', 'fleet-portfolio': 'dash', 'fleet-factory': 'aodl' }).map(([kind, app]) => ({
    ...obj({ kind: { const: kind }, app: { const: app }, data: ref(kind), demo: { const: true } }, ['demo']),
    'x-actions': FLEET_ACTIONS[kind]
  })), $defs: defs
};

// Only the schema vocabulary used above is needed at the card boundary.
function inspect(schema, value, path, errors) {
  if (errors.length >= 12) return;
  if (schema.$ref) return inspect(defs[schema.$ref.split('/').at(-1)], value, path, errors);
  if (schema.anyOf) {
    if (!schema.anyOf.some(s => { const e = []; inspect(s, value, path, e); return !e.length; })) errors.push(`${path}: invalid value`);
    return;
  }
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = [].concat(schema.type || []);
  if (types.length && !types.some(t => t === type || t === 'integer' && Number.isInteger(value))) { errors.push(`${path}: expected ${types.join(' or ')}`); return; }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: expected ${schema.enum.join(', ')}`);
  if (type === 'string') {
    if ([...value].length > schema.maxLength) errors.push(`${path}: string exceeds ${schema.maxLength} characters`);
    if (schema.format === 'date-time' && !validDate(value)) errors.push(`${path}: expected ISO8601 timestamp`);
  }
  if (type === 'number' && (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)) errors.push(`${path}: number out of range`);
  if (type === 'array') {
    if (value.length > schema.maxItems || value.length < schema.minItems) { errors.push(`${path}: invalid array length`); return; }
    value.forEach((v, i) => { const s = schema.prefixItems?.[i] ?? schema.items; if (s && typeof s === 'object') inspect(s, v, `${path}[${i}]`, errors); });
  }
  if (type === 'object') {
    const keys = Object.keys(value);
    if (keys.length > schema.maxProperties) { errors.push(`${path}: too many entries`); return; }
    for (const k of schema.required || []) if (!Object.hasOwn(value, k)) errors.push(`${path}.${k}: required`);
    for (const k of keys) {
      if (schema.propertyNames) inspect(schema.propertyNames, k, `${path} key`, errors);
      if (Object.hasOwn(schema.properties || {}, k)) inspect(schema.properties[k], value[k], `${path}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}.${k}: unknown field`);
      else if (schema.additionalProperties) inspect(schema.additionalProperties, value[k], `${path}.${k}`, errors);
    }
  }
}
function validDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!m || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second, zoneHour = 0, zoneMinute = 0] = m.map(v => Number(v ?? 0));
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour <= 23 && minute <= 59 && second <= 59 && zoneHour <= 23 && zoneMinute <= 59;
}
export function validateFleet(kind, data) {
  const errors = [];
  if (!Object.hasOwn(FLEET_ACTIONS, kind)) errors.push('Unknown fleet kind');
  else inspect(defs[kind], data, 'data', errors);
  return { ok: !errors.length, errors };
}
