import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export type RecordValue = Record<string, unknown>;
export const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
export const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export function validCIDR(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parts = value.split('/');
  if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return false;
  const [address, prefix] = parts;
  if (address.includes('.')) return !address.includes(':') && Number(prefix) <= 32 && address.split('.').length === 4 && address.split('.').every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
  if (Number(prefix) > 128 || !/^[0-9a-f:]+$/i.test(address)) return false;
  const halves = address.split('::');
  if (halves.length > 2) return false;
  const groups = halves.flatMap(half => half ? half.split(':') : []);
  return groups.every(group => /^[0-9a-f]{1,4}$/i.test(group)) && (halves.length === 2 ? groups.length < 8 : groups.length === 8);
}
export function authoringReason(context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') return 'API discovery is not available.';
  if (context.schema.status !== 'available') return 'Installed schema is not available.';
  if (context.discovery.features['admin-network-policy-enforcement'] !== 'available') return 'Implementation enforcement support is unconfirmed. Inspection only.';
  if (context.ownership?.status !== 'application') return 'Policy ownership does not permit direct authoring.';
  if (context.intent === 'inspect') return 'Inspection only.';
  if (context.capabilities[context.intent === 'create' ? 'create' : 'update'] !== 'available') return 'Authoring permission is not available.';
  return null;
}
export function validatePolicy(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const fail = (path: (string | number)[], message: string) => issues.push({ path, message });
  const baseline = context.kind === 'BaselineAdminNetworkPolicy';
  if (baseline && draft.get(['metadata', 'name']) !== 'default') fail(['metadata', 'name'], 'Baseline policy name must be default.');
  if (!baseline) { const p = draft.get(['spec', 'priority']); if ((typeof p !== 'number' && typeof p !== 'bigint') || p < 0 || p > 1000 || (typeof p === 'number' && !Number.isInteger(p))) fail(['spec', 'priority'], 'Priority must be an integer from 0 to 1000.'); }
  function selector(value: unknown, path: (string | number)[]) {
    const s = object(value);
    for (const [i, expression] of list(s.matchExpressions).entries()) {
      const e = object(expression); const values = list(e.values);
      if (typeof e.key !== 'string' || !e.key) fail([...path, 'matchExpressions', i, 'key'], 'Selector key is required.');
      if (!['In', 'NotIn', 'Exists', 'DoesNotExist'].includes(String(e.operator))) fail([...path, 'matchExpressions', i, 'operator'], 'Choose a selector operator.');
      if (['In', 'NotIn'].includes(String(e.operator)) ? !values.length : values.length > 0) fail([...path, 'matchExpressions', i, 'values'], 'Values must match the selector operator.');
    }
  }
  function union(value: unknown, allowed: string[], path: (string | number)[]) {
    const keys = Object.keys(object(value)); if (keys.length !== 1 || !allowed.includes(keys[0])) { fail(path, 'Choose exactly one supported selector.'); return; }
    const key = keys[0]; const branch = object(value)[key];
    if (key === 'pods') { selector(object(branch).namespaceSelector, [...path, key, 'namespaceSelector']); selector(object(branch).podSelector, [...path, key, 'podSelector']); }
    else if (key !== 'networks') selector(branch, [...path, key]);
    if (['nodes', 'networks'].includes(key) && context.discovery.features[`admin-network-policy-${key}`] !== 'available') fail(path, 'Implementation support for this peer is unconfirmed.');
    if (key === 'networks' && (!list(branch).length || list(branch).length > 25)) fail(path, 'Specify 1–25 CIDR networks.');
  }
  union(draft.get(['spec', 'subject']), ['namespaces', 'pods'], ['spec', 'subject']);
  for (const direction of ['ingress', 'egress']) {
    list(draft.get(['spec', direction])).forEach((value, i) => {
      const peerKey = direction === 'ingress' ? 'from' : 'to';
      list(object(value)[peerKey]).forEach((peer, j) => {
        list(object(peer).networks).forEach((network, n) => {
          if (!validCIDR(network)) fail(['spec', direction, i, peerKey, j, 'networks', n], 'Enter a valid IPv4 or IPv6 CIDR.');
        });
      });
    });
  }
  let total = 0;
  for (const direction of ['ingress', 'egress']) {
    const rules = list(draft.get(['spec', direction])); total += rules.length;
    if (rules.length > 100) fail(['spec', direction], 'At most 100 rules per direction.');
    rules.forEach((value, i) => {
      const rule = object(value); const path = ['spec', direction, i];
      if (!(baseline ? ['Allow', 'Deny'] : ['Allow', 'Deny', 'Pass']).includes(String(rule.action))) fail([...path, 'action'], 'Choose a supported rule action.');
      if (typeof rule.name === 'string' && rule.name.length > 100) fail([...path, 'name'], 'Rule names allow at most 100 characters.');
      const peerKey = direction === 'ingress' ? 'from' : 'to'; const peers = list(rule[peerKey]);
      if (!peers.length || peers.length > 100) fail([...path, peerKey], 'Specify 1–100 peers.');
      peers.forEach((peer, j) => union(peer, direction === 'ingress' ? ['namespaces', 'pods'] : ['namespaces', 'pods', 'nodes', 'networks'], [...path, peerKey, j]));
      const ports = list(rule.ports);
      if (ports.length > 100) fail([...path, 'ports'], 'At most 100 ports.');
      ports.forEach((value, j) => {
        const port = object(value); const keys = Object.keys(port); const p = [...path, 'ports', j];
        if (keys.length !== 1 || !['namedPort', 'portNumber', 'portRange'].includes(keys[0])) { fail(p, 'Choose exactly one port type.'); return; }
        if ('namedPort' in port) {
          if (typeof port.namedPort !== 'string' || !port.namedPort) fail(p, 'Port name is required.');
          if (context.discovery.features['admin-network-policy-named-ports'] !== 'available') fail(p, 'Named-port implementation support is unconfirmed.');
          if (peers.some(peer => 'nodes' in object(peer) || 'networks' in object(peer))) fail(p, 'Named ports cannot target nodes or networks.');
        } else {
          const v = object(port[keys[0]]); const fields = keys[0] === 'portRange' ? ['start', 'end'] : ['port'];
          fields.forEach(key => { const n = v[key]; if ((typeof n !== 'number' && typeof n !== 'bigint') || n < 1 || n > 65535 || (typeof n === 'number' && !Number.isInteger(n))) fail([...p, keys[0], key], 'Port must be an integer from 1 to 65535.'); });
          if (keys[0] === 'portRange' && Number(v.start) >= Number(v.end)) fail(p, 'Range end must exceed start.');
          if (v.protocol !== undefined && (typeof v.protocol !== 'string' || !['TCP', 'UDP', 'SCTP'].includes(v.protocol))) fail(p, 'Choose TCP, UDP or SCTP.');
        }
      });
    });
  }
  if (!baseline && total > 100) fail(['spec'], 'Admin policy allows at most 100 rules in total.');
  return issues;
}
export function unsupportedShape(draft: ResourceEditorDraft): string | null {
  const plain = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  if (draft.has(['spec']) && !plain(draft.get(['spec']))) return 'Unsupported specification shape. Preserve source.';
  const selector = (value: unknown): boolean => {
    if (!plain(value)) return false;
    const s = object(value);
    if (s.matchLabels !== undefined && (!plain(s.matchLabels) || Object.values(object(s.matchLabels)).some(value => typeof value !== 'string'))) return false;
    if (s.matchExpressions !== undefined && (!Array.isArray(s.matchExpressions) || s.matchExpressions.some(value => !plain(value)))) return false;
    return true;
  };
  const peer = (value: unknown, egress: boolean): boolean => {
    if (!plain(value)) return false;
    const p = object(value); const keys = Object.keys(p);
    if (keys.length !== 1) return false;
    if (keys[0] === 'pods') return plain(p.pods) && selector(object(p.pods).namespaceSelector) && selector(object(p.pods).podSelector);
    if (keys[0] === 'namespaces') return selector(p.namespaces);
    if (keys[0] === 'nodes') return egress && selector(p.nodes);
    return keys[0] === 'networks' && egress && Array.isArray(p.networks) && p.networks.every(value => typeof value === 'string');
  };
  if (draft.has(['spec', 'subject']) && !peer(draft.get(['spec', 'subject']), false)) return 'Unsupported subject shape. Preserve source.';
  for (const direction of ['ingress', 'egress']) {
    const rules = draft.get(['spec', direction]);
    if (rules === undefined) continue;
    if (!Array.isArray(rules)) return 'Unsupported rule container. Preserve source.';
    for (const value of rules) {
      if (!plain(value)) return 'Unsupported rule shape. Preserve source.';
      const r = object(value); const peers = r[direction === 'ingress' ? 'from' : 'to'];
      if (!Array.isArray(peers) || !peers.every(value => peer(value, direction === 'egress'))) return 'Unsupported peer shape. Preserve source.';
      if (r.ports !== undefined && (!Array.isArray(r.ports) || !r.ports.every(value => {
        if (!plain(value)) return false;
        const port = object(value); const keys = Object.keys(port);
        return keys.length === 1 && (keys[0] === 'namedPort' ? typeof port.namedPort === 'string' : ['portNumber', 'portRange'].includes(keys[0]) && plain(port[keys[0]]));
      }))) return 'Unsupported port shape. Preserve source.';
    }
  }
  return null;
}
