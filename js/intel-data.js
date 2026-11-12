// Synthetic intel.v0 fixture, used only by explicit demo cards.
export const INTEL_DEMO = {
  at: '2026-11-11T12:00:00Z',
  tab: 0,
  climbs: [{ id: 'recall3', label: 'Memory recall', metric: 'Corrections recall@3', points: [0.63, 0.64, 0.62, 0.67, 0.69, 0.66, 0.71, 0.72, 0.7, 0.75, 0.74, 0.78, 0.77, 0.81], best: 0.81 }],
  routes: [
    { skill: 'blender-lookdev', hits: 9, corrected: 0 },
    { skill: 'ephemeral-ui-kit', hits: 8, corrected: 0 },
    { skill: 'systematic-debugging', hits: 7, corrected: 1 },
    { skill: 'github', hits: 6, corrected: 0 },
    { skill: 'fframes-video', hits: 5, corrected: 1 },
    { skill: 'other', hits: 5, corrected: 0 }
  ],
  memory: [
    { level: 'L5', name: 'State Packet', size: '1 md · 6 KB', fresh: '2 m ago', stale: false },
    { level: 'L4', name: 'Reconciled state', size: '2.4k claims', fresh: 'stale 6 h', stale: true },
    { level: 'L3', name: 'Relations', size: '31k edges', fresh: '12 m ago', stale: false },
    { level: 'L2', name: 'Cracking', size: '88k facts', fresh: '9 m ago', stale: false },
    { level: 'L1', name: 'Cheap retrieval', size: '412k chunks', fresh: '3 m ago', stale: false },
    { level: 'L0', name: 'Raw evidence', size: '2.1M events', fresh: 'live', stale: false }
  ],
  failures: [
    { sig: 'database is locked', source: 'service-watch', spark: '00101101011011', count: 34, status: 'open' },
    { sig: 'stale ctx index', source: 'ctx import', spark: '00010010010011', count: 9, status: 'open' },
    { sig: 'tmpfs full of render temp dirs', source: 'fframes', spark: '00000001010110', count: 6, status: 'fixed' },
    { sig: 'login keyring locked', source: 'memory lab', spark: '11111111100000', count: 123, status: 'law' }
  ],
  trace: [
    { lane: 'main', spans: [[0, 9, 'm'], [9, 14, 't'], [14, 31, 'm'], [31, 35, 't'], [52, 66, 'm'], [66, 70, 't'], [70, 88, 'm']] },
    { lane: 'lane · fast', spans: [[16, 22, 'm'], [22, 25, 't'], [25, 29, 'e'], [29, 41, 'm'], [41, 44, 't']] },
    { lane: 'lane · large', spans: [[18, 33, 'm'], [33, 37, 't'], [37, 50, 'm'], [50, 53, 't']] }
  ],
  notes: []
};
