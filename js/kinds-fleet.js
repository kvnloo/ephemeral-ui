// Fleet card boundary. Renderers receive only validated fleet.v0 data.
import { h } from './motion.js';
import { shell } from './shell.js';
import { HOSTS, PORTFOLIOS, FACTORY } from './fleet-data.js';
import { validateFleet, FLEET_ACTIONS } from './fleet-schema.js';
import { KINDS_FLEET_HOSTS } from './fleet-hosts.js';
import { KINDS_FLEET_PM } from './fleet-pm.js';
import { KINDS_FLEET_FACTORY } from './fleet-factory.js';
export { FLEET_ACTIONS };
export const FLEET_APPS = { 'fleet-hosts': 'k3s', 'fleet-portfolio': 'dash', 'fleet-factory': 'aodl' };
const commands = { 'fleet-hosts': '/hosts', 'fleet-portfolio': '/portfolio', 'fleet-factory': '/factory graph' };
const examples = { 'fleet-hosts': () => ({ hosts: HOSTS }), 'fleet-portfolio': () => ({ portfolios: PORTFOLIOS }), 'fleet-factory': () => FACTORY };
export function updated(at, now = Date.now()) {
  const age = Math.round((now - Date.parse(at)) / 1000), seconds = Math.abs(age);
  const [n, unit] = seconds < 60 ? [seconds, 's'] : seconds < 3600 ? [Math.floor(seconds / 60), 'm'] : seconds < 86400 ? [Math.floor(seconds / 3600), 'h'] : [Math.floor(seconds / 86400), 'd'];
  return `updated ${age < 0 ? `in ${n}${unit}` : `${n}${unit} ago`}`;
}
const renderers = { ...KINDS_FLEET_HOSTS, ...KINDS_FLEET_PM, ...KINDS_FLEET_FACTORY };
export const KINDS_FLEET = Object.fromEntries(Object.entries(renderers).map(([kind, K]) => [kind, {
  ...K,
  make(a, r, input, opts = {}) {
    // Accept the gallery's make(app, rng, data, opts) and a complete card doc.
    const isDoc = input && (Object.hasOwn(input, 'data') || Object.hasOwn(input, 'demo') || Object.hasOwn(input, 'kind'));
    const demo = (isDoc ? input.demo : opts.demo) === true;
    let data = isDoc ? input.data : input;
    if (data === undefined && demo) data = { at: new Date().toISOString(), ...examples[kind]() };
    const result = validateFleet(kind, data);
    let c;
    if (!result.ok) {
      const reason = data === undefined ? 'No data supplied.' : result.errors.join('; ');
      const body = h('div', { class: 'fl-root fl-unavailable', role: 'status' }, h('h3', {}, 'Fleet data unavailable'), h('p', {}, reason), h('p', {}, `Run ${commands[kind]} in glide.`));
      c = { el: shell(a, kind, { verb: K.label, status: 'Unavailable', body }), spec: { kind, app: a.id, actions: FLEET_ACTIONS[kind], unavailable: reason }, async play() {} };
    } else {
      c = K.make(a, r, data, { ...opts, demo });
      c.spec.provenance = demo ? 'authored-example' : 'card-data';
      c.spec.actions = FLEET_ACTIONS[kind];
      const stamp = h('time', { class: 'fl-updated', datetime: data.at, title: data.at }, `${demo ? 'Example · ' : ''}${updated(data.at)}`);
      c.el.querySelector('.fl-root').prepend(stamp);
    }
    // Pin/unpin belongs to the generic shell, not the fleet action contract.
    c.el.querySelector('.eu-ttl')?.remove();
    return c;
  }
}]));
