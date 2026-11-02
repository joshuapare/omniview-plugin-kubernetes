import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';

export const versions = ['v1', 'v1beta1', 'v1beta2'] as const;
export const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const rows = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
export const text = (value: unknown): string => ['string', 'number', 'bigint', 'boolean'].includes(typeof value) ? String(value) : '';
export const claimRoot = (kind: string): ResourceEditorPath => kind === 'ResourceClaimTemplate' ? ['spec', 'spec', 'devices'] : ['spec', 'devices'];
export const generatedClaim = (draft: ResourceEditorDraft): boolean => rows(draft.get(['metadata', 'ownerReferences'])).length > 0 || draft.has(['metadata', 'annotations', 'resource.kubernetes.io/extended-resource-claim']);
export function claimGateUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  for (const value of rows(draft.get([...claimRoot(context.kind), 'requests']))) {
    const request = record(value);
    if (request.firstAvailable !== undefined && context.discovery.features.DRAPrioritizedList !== 'available') return 'DRAPrioritizedList availability is not confirmed.';
    const bodies = rows(request.firstAvailable).length ? rows(request.firstAvailable) : [context.version === 'v1beta1' ? request : request.exactly];
    for (const value of bodies) {
      const body = record(value);
      if (body.adminAccess === true && context.discovery.features.DRAAdminAccess !== 'available') return 'DRAAdminAccess availability is not confirmed.';
      if (body.capacity !== undefined && context.discovery.features.DRAConsumableCapacity !== 'available') return 'DRAConsumableCapacity availability is not confirmed.';
      if (rows(body.tolerations).length && context.discovery.features.DRADeviceTaints !== 'available') return 'DRADeviceTaints availability is not confirmed.';
    }
  }
  return null;
}
export const claimReadOnly = (draft: ResourceEditorDraft, context: ResourceEditorContext): boolean => context.intent !== 'create' || (context.kind === 'ResourceClaim' && generatedClaim(draft)) || claimGateUnavailable(draft, context) !== null;
export function positiveCount(value: string): { valid: true; value: bigint } | { valid: false; error: string } {
  if (!/^\d+$/.test(value) || BigInt(value) < 1n || BigInt(value) > 9223372036854775807n) return { valid: false, error: 'Enter a positive 64-bit whole number.' };
  return { valid: true, value: BigInt(value) };
}
export const dnsLabel = (value: string): string | null => value.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(value) ? null : 'Enter a DNS label, up to 63 characters.';
export const classNameError = (value: string): string | null => value.length <= 253 && value.split('.').every(part => dnsLabel(part) === null) ? null : 'Enter a DeviceClass DNS name.';
export const celError = (value: string): string | null => !value.trim() ? 'Enter a CEL expression.' : new TextEncoder().encode(value).length > 10240 ? 'CEL expression exceeds 10 KiB.' : null;
export function labelKeyError(value: string): string | null {
  const parts = value.split('/'); const suffix = parts.at(-1)!;
  return parts.length > 2 || !suffix || suffix.length > 63 || !/^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(suffix) || (parts.length === 2 && classNameError(parts[0])) ? 'Enter a qualified label key.' : null;
}
export const labelValueError = (value: string): string | null => value.length > 63 || (value !== '' && !/^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(value)) ? 'Enter a label value, up to 63 characters.' : null;
export function requestBodyPath(context: ResourceEditorContext, request: ResourceEditorPath, alternate?: number): ResourceEditorPath {
  return alternate !== undefined ? [...request, 'firstAvailable', alternate] : context.version === 'v1beta1' ? request : [...request, 'exactly'];
}

/** Branch changes never copy a projected container or erase advanced/unknown fields. */
export function branchOperations(draft: ResourceEditorDraft, context: ResourceEditorContext, path: ResourceEditorPath, prioritized: boolean): readonly ResourceEditorPatch[] | string {
  const request = record(draft.get(path));
  const alternatives = rows(request.firstAvailable);
  if (prioritized) {
    const bodyPath = requestBodyPath(context, path);
    const body = record(draft.get(bodyPath));
    const permitted = context.version === 'v1beta1' ? ['name', 'deviceClassName', 'allocationMode', 'count'] : ['deviceClassName', 'allocationMode', 'count'];
    if (Object.keys(body).some(key => !permitted.includes(key))) return 'Keep advanced request fields in YAML before changing request strategy.';
    const item = { name: '', deviceClassName: text(body.deviceClassName), ...(body.allocationMode !== undefined ? { allocationMode: body.allocationMode } : {}), ...(body.count !== undefined ? { count: body.count } : {}) };
    const removals: ResourceEditorPatch[] = context.version === 'v1beta1' ? ['deviceClassName', 'allocationMode', 'count'].filter(key => draft.has([...path, key])).map(key => ({ op: 'remove', path: [...path, key] })) : draft.has(bodyPath) ? [{ op: 'remove', path: bodyPath }] : [];
    return [...removals, { op: 'set', path: [...path, 'firstAvailable'], value: [item] }];
  }
  if (alternatives.length !== 1) return 'Keep one alternative before choosing a single request.';
  const body = record(alternatives[0]);
  if (Object.keys(body).some(key => !['name', 'deviceClassName', 'allocationMode', 'count'].includes(key))) return 'Keep advanced alternative fields in YAML before changing request strategy.';
  const output: ResourceEditorPatch[] = [{ op: 'remove', path: [...path, 'firstAvailable'] }];
  const target = requestBodyPath(context, path);
  if (context.version !== 'v1beta1') output.push({ op: 'set', path: target, value: {} });
  for (const key of ['deviceClassName', 'allocationMode', 'count']) if (body[key] !== undefined) output.push({ op: 'set', path: [...target, key], value: body[key] });
  return output;
}
export function allocationOperations(draft: ResourceEditorDraft, path: ResourceEditorPath, mode: string): readonly ResourceEditorPatch[] {
  return [{ op: 'set', path: [...path, 'allocationMode'], value: mode }, ...(mode === 'All' && draft.has([...path, 'count']) ? [{ op: 'remove' as const, path: [...path, 'count'] }] : [])];
}
export function validateClaims(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (claimReadOnly(draft, context)) return [];
  const root = [...claimRoot(context.kind), 'requests'];
  const requests = rows(draft.get(root));
  const issues: ResourceEditorFieldIssue[] = [];
  const fail = (path: ResourceEditorPath, message: string | null) => { if (message) issues.push({ path, message }); };
  if (requests.length < 1 || requests.length > 32) fail(root, 'Add between 1 and 32 device requests.');
  const names = new Set<string>();
  requests.forEach((value, index) => {
    const request = record(value); const path = [...root, index]; const name = text(request.name);
    fail([...path, 'name'], dnsLabel(name));
    if (names.has(name)) fail([...path, 'name'], 'Request names must be unique.');
    names.add(name);
    const alternatives = rows(request.firstAvailable);
    const exact = context.version === 'v1beta1' ? typeof request.deviceClassName === 'string' : request.exactly !== undefined;
    if (exact === (alternatives.length > 0)) fail(path, 'Choose exactly one request strategy.');
    if (alternatives.length > 8) fail([...path, 'firstAvailable'], 'Use at most 8 ordered alternatives.');
    const subNames = new Set<string>();
    const bodies = alternatives.length ? alternatives.map((body, i) => ({ body: record(body), path: requestBodyPath(context, path, i) })) : [{ body: record(draft.get(requestBodyPath(context, path))), path: requestBodyPath(context, path) }];
    bodies.forEach(({ body, path: bodyPath }) => {
      if (alternatives.length) { const subName = text(body.name); fail([...bodyPath, 'name'], dnsLabel(subName)); if (subNames.has(subName)) fail([...bodyPath, 'name'], 'Alternative names must be unique.'); subNames.add(subName); }
      fail([...bodyPath, 'deviceClassName'], classNameError(text(body.deviceClassName)));
      if (body.allocationMode !== undefined && !['ExactCount', 'All'].includes(text(body.allocationMode))) fail([...bodyPath, 'allocationMode'], 'Unsupported allocation mode. Use YAML.');
      if (body.count !== undefined) { const parsed = positiveCount(text(body.count)); fail([...bodyPath, 'count'], parsed.valid ? null : parsed.error); if (body.allocationMode === 'All') fail([...bodyPath, 'count'], 'All allocation must omit count.'); }
      rows(body.selectors).forEach((selector, i) => fail([...bodyPath, 'selectors', i, 'cel', 'expression'], celError(text(record(record(selector).cel).expression))));
    });
  });
  return issues;
}
export function claimUnsupported(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  const root = [...claimRoot(context.kind), 'requests'];
  for (let index = 1; index < root.length; index++) { const value = draft.get(root.slice(0, index)); if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) return 'Unsupported claim container. Source remains unchanged.'; }
  if (draft.has(root) && !Array.isArray(draft.get(root))) return 'Device requests are not a supported list. Source remains unchanged.';
  for (const request of rows(draft.get(root))) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) return 'Unsupported request shape. Use YAML.';
    const data = record(request);
    if (data.name !== undefined && typeof data.name !== 'string') return 'Request name has an unsupported scalar type. Use YAML.';
    if (data.firstAvailable !== undefined && !Array.isArray(data.firstAvailable)) return 'Unsupported alternatives shape. Use YAML.';
    const bodies = rows(data.firstAvailable).length ? rows(data.firstAvailable) : [context.version === 'v1beta1' ? data : data.exactly];
    for (const value of bodies) {
      if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) return 'Unsupported request body. Source remains unchanged.';
      const body = record(value);
      if (body.deviceClassName !== undefined && typeof body.deviceClassName !== 'string') return 'Device class has an unsupported scalar type. Use YAML.';
      if (body.count !== undefined && !['bigint', 'number'].includes(typeof body.count)) return 'Device count has an unsupported scalar type. Use YAML.';
      if (body.allocationMode !== undefined && !['ExactCount', 'All'].includes(text(body.allocationMode))) return 'Unknown allocation mode. Source remains unchanged.';
    }
  }
  return null;
}
export function validateTaint(draft: ResourceEditorDraft): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const keyError = labelKeyError(text(draft.get(['spec', 'taint', 'key'])));
  if (keyError) issues.push({ path: ['spec', 'taint', 'key'], message: keyError });
  const valueError = labelValueError(text(draft.get(['spec', 'taint', 'value'])));
  if (valueError) issues.push({ path: ['spec', 'taint', 'value'], message: valueError });
  for (const field of ['driver', 'pool', 'device']) {
    const path = ['spec', 'deviceSelector', field];
    if (!draft.has(path)) continue;
    const value = text(draft.get(path));
    const invalid = field === 'device' ? dnsLabel(value) : field === 'driver' ? (value.length > 63 ? 'Driver name exceeds 63 characters.' : classNameError(value)) : value.length > 253 || value.split('/').some(part => classNameError(part)) ? 'Enter a slash-separated DNS pool name.' : null;
    if (invalid) issues.push({ path, message: invalid });
  }
  if (!['None', 'NoSchedule', 'NoExecute'].includes(text(draft.get(['spec', 'taint', 'effect'])))) issues.push({ path: ['spec', 'taint', 'effect'], message: 'Choose a supported taint effect.' });
  return issues;
}
