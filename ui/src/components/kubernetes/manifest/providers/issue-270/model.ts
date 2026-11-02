import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';

export const DEFAULT_CLASS = 'ingressclass.kubernetes.io/is-default-class';
export const DUAL_STACK_APPEND = 'networking.k8s.io/ServiceCIDR/append-dual-stack';
export const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value) : '';
export const dnsName = (value: string): boolean => value.length > 0 && value.length <= 253 && value.split('.').every(part => /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(part));
export const namespaceName = (value: string): boolean => value.length <= 63 && !value.includes('.') && dnsName(value);
export const parameterSegment = (value: string): boolean => value !== '' && value !== '.' && value !== '..' && !/[/%]/.test(value);
export function controllerPath(value: string): boolean {
  const slash = value.indexOf('/');
  return value.length <= 250 && slash > 0 && dnsName(value.slice(0, slash)) && /^[A-Za-z0-9/\-._~%!$&'()*+,;=:]+$/.test(value.slice(slash + 1));
}
export const labelKey = (value: string): boolean => {
  const parts = value.split('/');
  const name = parts.at(-1)!;
  return parts.length <= 2 && (parts.length === 1 || dnsName(parts[0])) && name.length <= 63 && /^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(name);
};
export const labelValue = (value: string): boolean => value.length <= 63 && (value === '' || /^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(value));
export const portName = (value: string): boolean => value.length <= 15 && !value.includes('--') && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(value) && /[a-z]/.test(value);
export const portNumber = (value: unknown): boolean => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 65535) || (typeof value === 'bigint' && value >= 1n && value <= 65535n);

function address(value: string): { family: 4 | 6; bits: number; value: bigint; canonical: string } | null {
  if (!value.includes(':')) {
    const parts = value.split('.');
    if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return null;
    return { family: 4, bits: 32, value: parts.reduce((result, part) => result * 256n + BigInt(part), 0n), canonical: value };
  }
  if (!/^[a-fA-F0-9:.]+$/.test(value) || value.length > 45) return null;
  let canonical: string;
  try { canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1); } catch { return null; }
  const halves = canonical.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const words = halves.length === 2 ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right] : left;
  if (words.length !== 8) return null;
  return { family: 6, bits: 128, value: words.reduce((result, part) => result * 65536n + BigInt(`0x${part}`), 0n), canonical };
}
export interface CIDR { family: 4 | 6; prefix: number; network: bigint; bits: number }
/** Exact arithmetic keeps IPv6 prefixes and containment independent of floating point. */
export function parseCIDR(value: string, canonical = true): CIDR | null {
  const parts = value.split('/');
  if (parts.length !== 2 || !/^(0|[1-9]\d{0,2})$/.test(parts[1])) return null;
  const ip = address(parts[0]), prefix = Number(parts[1]);
  if (!ip || prefix > ip.bits) return null;
  const shift = BigInt(ip.bits - prefix), network = ip.value >> shift << shift;
  if (canonical && (network !== ip.value || parts[0] !== ip.canonical)) return null;
  return { family: ip.family, prefix, network, bits: ip.bits };
}
export function strictSubset(parent: CIDR, child: CIDR): boolean {
  return parent.family === child.family && child.prefix > parent.prefix && child.network >> BigInt(parent.bits - parent.prefix) === parent.network >> BigInt(parent.bits - parent.prefix);
}
export function controllerOwned(draft: ResourceEditorDraft): boolean {
  return list(draft.get(['metadata', 'ownerReferences'])).some(owner => record(owner).controller === true);
}
export function scopeChanges(path: ResourceEditorPath, scope: string): ResourceEditorPatch[] {
  return [{ op: 'set', path: [...path, 'scope'], value: scope }, ...(scope === 'Cluster' ? [{ op: 'remove' as const, path: [...path, 'namespace'] }] : [])];
}
export function peerChanges(path: ResourceEditorPath, mode: string, cidr?: string): ResourceEditorPatch[] {
  const operations: ResourceEditorPatch[] = [];
  for (const key of ['podSelector', 'namespaceSelector', 'ipBlock']) {
    const retain = mode === 'ipBlock' ? key === 'ipBlock' : mode === 'namespace' ? key === 'namespaceSelector' : mode === 'both' ? key !== 'ipBlock' : key === 'podSelector';
    if (!retain) operations.push({ op: 'remove', path: [...path, key] });
  }
  if (mode === 'ipBlock') operations.push({ op: 'set', path: [...path, 'ipBlock', 'cidr'], value: cidr });
  return operations;
}
export function appendAllowed(context: ResourceEditorContext): boolean {
  return context.discovery.features[DUAL_STACK_APPEND] === 'available';
}

export function validateNetworking(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const issue = (path: ResourceEditorPath, message: string) => issues.push({ path, message });
  const selector = (value: unknown, path: ResourceEditorPath) => {
    const selected = record(value);
    for (const [key, val] of Object.entries(record(selected.matchLabels))) {
      if (!labelKey(key) || typeof val !== 'string' || !labelValue(val)) issue([...path, 'matchLabels', key], 'Use a valid label key and value.');
    }
    list(selected.matchExpressions).forEach((value, index) => {
      const row = record(value), base = [...path, 'matchExpressions', index];
      if (!labelKey(text(row.key))) issue([...base, 'key'], 'Enter a valid label key.');
      const values = list(row.values);
      if (!['In', 'NotIn', 'Exists', 'DoesNotExist'].includes(text(row.operator))) issue([...base, 'operator'], 'Choose a selector operator.');
      else if (['In', 'NotIn'].includes(text(row.operator)) ? values.length === 0 || values.some(value => typeof value !== 'string' || !labelValue(value)) : values.length !== 0) issue([...base, 'values'], 'In/NotIn require values; Exists/DoesNotExist forbid values.');
    });
  };
  if (context.kind === 'IngressClass') {
    const controller = text(draft.get(['spec', 'controller']));
    if (!controllerPath(controller)) issue(['spec', 'controller'], 'Enter a domain-prefixed controller path, up to 250 characters.');
    if (draft.has(['spec', 'parameters'])) {
      const params = record(draft.get(['spec', 'parameters']));
      if (params.apiGroup !== undefined && !dnsName(text(params.apiGroup))) issue(['spec', 'parameters', 'apiGroup'], 'Use a DNS API group or omit for core.');
      if (!parameterSegment(text(params.kind))) issue(['spec', 'parameters', 'kind'], 'Enter a resource kind.');
      if (!parameterSegment(text(params.name))) issue(['spec', 'parameters', 'name'], 'Enter a parameter resource name.');
      if (params.scope !== undefined && !['Cluster', 'Namespace'].includes(text(params.scope))) issue(['spec', 'parameters', 'scope'], 'Choose Cluster or Namespace.');
      if (params.scope === 'Namespace' && !namespaceName(text(params.namespace))) issue(['spec', 'parameters', 'namespace'], 'Enter a namespace.');
      if ((params.scope ?? 'Cluster') === 'Cluster' && params.namespace !== undefined) issue(['spec', 'parameters', 'namespace'], 'Cluster-scoped references cannot have a namespace.');
    }
  }
  if (context.kind === 'ServiceCIDR') {
    const ranges = list(draft.get(['spec', 'cidrs']));
    if (ranges.length < 1 || ranges.length > 2) issue(['spec', 'cidrs'], 'Provide one CIDR or two opposite-family CIDRs.');
    const parsed = ranges.map((range, index) => {
      const cidr = parseCIDR(text(range));
      if (!cidr) issue(['spec', 'cidrs', index], 'Enter a canonical network CIDR.');
      return cidr;
    });
    if (parsed.length === 2 && parsed[0] && parsed[1] && parsed[0].family === parsed[1].family) issue(['spec', 'cidrs', 1], 'Second range must use the opposite IP family.');
  }
  if (context.kind === 'NetworkPolicy') {
    selector(draft.get(['spec', 'podSelector']), ['spec', 'podSelector']);
    const types = list(draft.get(['spec', 'policyTypes']));
    if (types.some(type => !['Ingress', 'Egress'].includes(text(type))) || new Set(types).size !== types.length) issue(['spec', 'policyTypes'], 'Choose unique Ingress/Egress directions.');
    for (const direction of ['ingress', 'egress']) {
      list(draft.get(['spec', direction])).forEach((value, index) => {
        const rule = record(value), base = ['spec', direction, index];
        list(rule.ports).forEach((value, index) => {
          const port = record(value), path = [...base, 'ports', index];
          if (port.protocol !== undefined && !['TCP', 'UDP', 'SCTP'].includes(text(port.protocol))) issue([...path, 'protocol'], 'Choose TCP, UDP, or SCTP.');
          if (port.port !== undefined && !(typeof port.port === 'string' ? portName(port.port) : portNumber(port.port))) issue([...path, 'port'], 'Use a port number from 1–65535 or a valid port name.');
          if (port.endPort !== undefined && (!portNumber(port.port) || !portNumber(port.endPort) || BigInt(text(port.endPort)) < BigInt(text(port.port)))) issue([...path, 'endPort'], 'Range requires a numeric start and end ≥ start.');
        });
        const key = direction === 'ingress' ? 'from' : 'to';
        list(rule[key]).forEach((value, index) => {
          const peer = record(value), path = [...base, key, index];
          if (peer.ipBlock !== undefined) {
            if (peer.podSelector !== undefined || peer.namespaceSelector !== undefined) issue(path, 'IP blocks cannot include selectors.');
            const block = record(peer.ipBlock), parent = parseCIDR(text(block.cidr), false);
            if (!parent) issue([...path, 'ipBlock', 'cidr'], 'Enter an IPv4 or IPv6 CIDR.');
            list(block.except).forEach((value, index) => {
              const child = parseCIDR(text(value), false);
              if (!child || !parent || !strictSubset(parent, child)) issue([...path, 'ipBlock', 'except', index], 'Exception must be a strictly smaller CIDR inside this block.');
            });
          } else {
            if (peer.podSelector === undefined && peer.namespaceSelector === undefined) issue(path, 'Choose a peer selector or IP block.');
            if (peer.podSelector !== undefined) selector(peer.podSelector, [...path, 'podSelector']);
            if (peer.namespaceSelector !== undefined) selector(peer.namespaceSelector, [...path, 'namespaceSelector']);
          }
        });
      });
    }
  }
  return issues;
}

/** Known fields must be typed; unknown siblings remain host-owned and untouched. */
export function unsupportedShape(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  const spec = draft.get(['spec']);
  let safe = spec === undefined || objectShape(spec);
  if (objectShape(spec)) {
    if (context.kind === 'IngressClass') {
      const annotation = draft.get(['metadata', 'annotations', DEFAULT_CLASS]);
      safe &&= annotation === undefined || annotation === 'true' || annotation === 'false';
      safe &&= spec.controller === undefined || typeof spec.controller === 'string';
      if (spec.parameters !== undefined) {
        safe &&= objectShape(spec.parameters) && ['apiGroup', 'kind', 'name', 'scope', 'namespace'].every(key => {
          const value = record(spec.parameters)[key];
          return value === undefined || typeof value === 'string';
        });
      }
    }
    if (context.kind === 'ServiceCIDR') safe &&= spec.cidrs === undefined || stringListShape(spec.cidrs);
    if (context.kind === 'NetworkPolicy') {
      safe &&= selectorShape(spec.podSelector);
      safe &&= spec.policyTypes === undefined || stringListShape(spec.policyTypes);
      for (const direction of ['ingress', 'egress']) {
        const rules = spec[direction], key = direction === 'ingress' ? 'from' : 'to';
        if (rules === undefined) continue;
        if (!Array.isArray(rules)) { safe = false; continue; }
        safe &&= rules.every(rule => {
          if (!objectShape(rule)) return false;
          if (rule.ports !== undefined && (!Array.isArray(rule.ports) || !rule.ports.every(policyPortShape))) return false;
          return rule[key] === undefined || Array.isArray(rule[key]) && rule[key].every(policyPeerShape);
        });
      }
    }
  }
  return safe ? null : 'This document contains an unsupported field shape. Use source; no fields were changed.';
}

function objectShape(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function stringListShape(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(value => typeof value === 'string');
}
function selectorShape(value: unknown): boolean {
  if (value === undefined) return true;
  if (!objectShape(value)) return false;
  if (value.matchLabels !== undefined && (!objectShape(value.matchLabels) || Object.values(value.matchLabels).some(value => typeof value !== 'string'))) return false;
  if (value.matchExpressions === undefined) return true;
  return Array.isArray(value.matchExpressions) && value.matchExpressions.every(expression => objectShape(expression)
    && typeof expression.key === 'string'
    && typeof expression.operator === 'string'
    && (expression.values === undefined || stringListShape(expression.values)));
}
function policyPortShape(value: unknown): boolean {
  if (!objectShape(value)) return false;
  return (value.protocol === undefined || typeof value.protocol === 'string')
    && (value.port === undefined || ['string', 'bigint', 'number'].includes(typeof value.port))
    && (value.endPort === undefined || ['bigint', 'number'].includes(typeof value.endPort));
}
function policyPeerShape(value: unknown): boolean {
  if (!objectShape(value) || !selectorShape(value.podSelector) || !selectorShape(value.namespaceSelector)) return false;
  if (value.ipBlock === undefined) return true;
  return objectShape(value.ipBlock)
    && typeof value.ipBlock.cidr === 'string'
    && (value.ipBlock.except === undefined || stringListShape(value.ipBlock.except));
}
