import { isAlias, isMap, isScalar, isSeq, parseAllDocuments, stringify } from 'yaml';
import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';

export const versionsPath = ['spec', 'versions'] as const;
export const webhookPath = ['spec', 'conversion', 'webhook'] as const;
export const clientPath = [...webhookPath, 'clientConfig'] as const;
export const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
export const rows = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
export const text = (value: unknown): string => typeof value === 'string' || typeof value === 'bigint' || typeof value === 'number' ? String(value) : '';
export const strings = (value: unknown): readonly string[] => rows(value).filter((item): item is string => typeof item === 'string');
export const set = (path: ResourceEditorPath, value: unknown): ResourceEditorPatch => ({ op: 'set', path, value });
export const remove = (path: ResourceEditorPath): ResourceEditorPatch => ({ op: 'remove', path });
export const established = (draft: ResourceEditorDraft): boolean => rows(draft.get(['status', 'conditions'])).some(condition => object(condition)?.type === 'Established' && object(condition)?.status === 'True');
export const controlled = (draft: ResourceEditorDraft): boolean => rows(draft.get(['metadata', 'ownerReferences'])).some(owner => object(owner)?.controller === true);
export const versionPath = (index: number, ...tail: (string | number)[]): ResourceEditorPath => [...versionsPath, index, ...tail];
export const simplePath = (value: string): boolean => /^\.[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)*$/.test(value);
export const dnsLabel = (value: string): boolean => value.length <= 63 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value);
export const dnsName = (value: string): boolean => value.length <= 253 && value.split('.').every(dnsLabel);
export const groupName = (value: string): boolean => value.includes('.') && dnsName(value);
export const kindName = (value: string): boolean => /^[A-Za-z][A-Za-z0-9]*$/.test(value);
export const versionName = (value: string): boolean => dnsLabel(value);
export const listValue = (value: string): string[] => value.split(',').map(item => item.trim()).filter(Boolean);
export function urlError(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.search && !url.hash ? null : 'Use HTTPS without credentials, query parameters or fragments.';
  } catch { return 'Enter a valid HTTPS endpoint.'; }
}
export function selectStorage(draft: ResourceEditorDraft, index: number): ResourceEditorPatch[] {
  return rows(draft.get(versionsPath)).map((_, row) => set(versionPath(row, 'storage'), row === index));
}
export function removeVersion(draft: ResourceEditorDraft, index: number): ResourceEditorPatch[] {
  const name = draft.get(versionPath(index, 'name'));
  if (strings(draft.get(['status', 'storedVersions'])).includes(String(name))) throw new Error('Stored versions require migration and status cleanup before removal.');
  if (draft.get(versionPath(index, 'storage')) === true) throw new Error('Choose another storage version before removal.');
  if (rows(draft.get(versionsPath)).length <= 1) throw new Error('Keep at least one version.');
  return [remove(versionPath(index))];
}
/** Never replace clientConfig: an opaque CA bundle can be present beside the endpoint. */
export function endpointOperations(draft: ResourceEditorDraft, branch: 'service' | 'url'): ResourceEditorPatch[] {
  const other = branch === 'service' ? 'url' : 'service';
  return [remove([...clientPath, other]), ...(draft.has([...clientPath, branch]) ? [] : [set([...clientPath, branch], branch === 'service' ? { namespace: '', name: '' } : '')])];
}

function assertSafe(value: unknown): void {
  if (value === null || ['string', 'boolean', 'bigint', 'undefined'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return;
  if (Array.isArray(value)) { value.forEach(assertSafe); return; }
  const map = object(value);
  if (!map || Object.getPrototypeOf(map) !== Object.prototype && Object.getPrototypeOf(map) !== null) throw new Error('Schema contains an unsupported value.');
  if (Object.keys(map).some(key => key.startsWith('$') || ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Schema contains a protected value; use the source editor.');
  Object.values(map).forEach(assertSafe);
}
function inspectNode(node: unknown): void {
  if (isAlias(node) || (node !== null && typeof node === 'object' && 'anchor' in node && node.anchor)) throw new Error('Aliases and anchors require the source editor.');
  if (isMap(node)) node.items.forEach(pair => {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || pair.key.value === '<<') throw new Error('Schema keys must be strings.');
    inspectNode(pair.value);
  });
  if (isSeq(node)) node.items.forEach(inspectNode);
}
export function parseSchema(source: string): Record<string, unknown> {
  const documents = parseAllDocuments(source, { intAsBigInt: true, uniqueKeys: true });
  if (documents.length !== 1 || documents[0].errors.length || !isMap(documents[0].contents)) throw new Error('Enter one valid schema object.');
  inspectNode(documents[0].contents);
  const value: unknown = documents[0].toJS({ maxAliasCount: 0 });
  assertSafe(value);
  if (!object(value) || object(value)?.type !== 'object') throw new Error('A v1 CRD schema requires type: object at its root.');
  return value as Record<string, unknown>;
}
export function schemaSource(value: unknown): string | null {
  try { assertSafe(value); return value === undefined ? '' : stringify(value); } catch { return null; }
}
/** Diff leaves so unedited YAML nodes, comments and exact scalars remain host-owned. */
export function diffSchema(before: unknown, after: unknown, path: ResourceEditorPath): ResourceEditorPatch[] {
  assertSafe(before); assertSafe(after);
  if (Object.is(before, after)) return [];
  const left = object(before); const right = object(after);
  if (left && right) return [
    ...Object.keys(left).filter(key => !Object.hasOwn(right, key)).map(key => remove([...path, key])),
    ...Object.entries(right).flatMap(([key, value]) => diffSchema(left[key], value, [...path, key])),
  ];
  if (Array.isArray(before) && Array.isArray(after)) return [
    ...after.slice(0, before.length).flatMap((value, index) => diffSchema(before[index], value, [...path, index])),
    ...before.slice(after.length).map((_, index) => remove([...path, before.length - index - 1])),
    ...after.slice(before.length).map((value, index): ResourceEditorPatch => ({ op: 'insert', path, index: before.length + index, value })),
  ];
  return [set(path, after)];
}

export function validateCRD(draft: ResourceEditorDraft, _context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const issue = (path: ResourceEditorPath, message: string) => issues.push({ path, message });
  const group = text(draft.get(['spec', 'group']));
  const plural = text(draft.get(['spec', 'names', 'plural']));
  if (!groupName(group)) issue(['spec', 'group'], 'Enter a dotted DNS API group.');
  if (!dnsLabel(plural)) issue(['spec', 'names', 'plural'], 'Enter a lowercase DNS resource plural.');
  if (!kindName(text(draft.get(['spec', 'names', 'kind'])))) issue(['spec', 'names', 'kind'], 'Enter a valid kind name.');
  if (text(draft.get(['metadata', 'name'])) !== `${plural}.${group}`) issue(['metadata', 'name'], 'Definition name must equal plural.group.');
  if (!['Namespaced', 'Cluster'].includes(text(draft.get(['spec', 'scope'])))) issue(['spec', 'scope'], 'Choose the custom resource scope.');
  const versions = rows(draft.get(versionsPath));
  if (!versions.length) issue(versionsPath, 'Add at least one API version.');
  if (versions.filter(version => object(version)?.storage === true).length !== 1) issue(versionsPath, 'Choose exactly one storage version.');
  if (!versions.some(version => object(version)?.served === true)) issue(versionsPath, 'Serve at least one API version.');
  const names = versions.map(version => text(object(version)?.name));
  versions.forEach((version, index) => {
    const row = object(version) ?? {};
    if (!versionName(text(row.name)) || names.indexOf(text(row.name)) !== index) issue(versionPath(index, 'name'), 'Enter a unique DNS version name.');
    if (typeof row.served !== 'boolean' || typeof row.storage !== 'boolean') issue(versionPath(index), 'Set served and storage explicitly.');
    if (object(object(row.schema)?.openAPIV3Schema)?.type !== 'object') issue(versionPath(index, 'schema', 'openAPIV3Schema'), 'Provide an object structural schema.');
    if (row.deprecationWarning !== undefined && row.deprecated !== true) issue(versionPath(index, 'deprecationWarning'), 'A warning requires deprecated to be enabled.');
    const scale = object(object(row.subresources)?.scale);
    if (scale) {
      for (const [field, prefix] of [['specReplicasPath', '.spec.'], ['statusReplicasPath', '.status.']] as const) {
        const value = text(scale[field]);
        if (!simplePath(value) || !value.startsWith(prefix)) issue(versionPath(index, 'subresources', 'scale', field), `Use a simple path under ${prefix.slice(0, -1)}.`);
      }
      if (scale.labelSelectorPath !== undefined && (!simplePath(text(scale.labelSelectorPath)) || !/^\.(spec|status)\./.test(text(scale.labelSelectorPath)))) issue(versionPath(index, 'subresources', 'scale', 'labelSelectorPath'), 'Use a simple path under .spec or .status.');
    }
    const selectable = rows(row.selectableFields);
    if (selectable.length > 8) issue(versionPath(index, 'selectableFields'), 'At most eight selectable fields are supported.');
    selectable.forEach((field, fieldIndex) => {
      const value = text(object(field)?.jsonPath);
      if (!simplePath(value) || value.startsWith('.metadata')) issue(versionPath(index, 'selectableFields', fieldIndex, 'jsonPath'), 'Use a simple non-metadata field path.');
    });
    rows(row.additionalPrinterColumns).forEach((column, columnIndex) => {
      const value = object(column) ?? {};
      if (!text(value.name) || !text(value.jsonPath).startsWith('.') || !['integer', 'number', 'string', 'boolean', 'date'].includes(text(value.type))) issue(versionPath(index, 'additionalPrinterColumns', columnIndex), 'Each column needs a name, supported type and JSONPath.');
    });
  });
  strings(draft.get(['status', 'storedVersions'])).forEach(name => { if (!names.includes(name)) issue(versionsPath, 'Retain stored versions until migration and status cleanup finish.'); });
  if (draft.get(['spec', 'conversion', 'strategy']) === 'Webhook') {
    const hasService = draft.has([...clientPath, 'service']); const hasURL = draft.has([...clientPath, 'url']);
    if (hasService === hasURL) issue(clientPath, 'Choose exactly one webhook endpoint.');
    if (hasURL) { const error = urlError(text(draft.get([...clientPath, 'url']))); if (error) issue([...clientPath, 'url'], error); }
    if (hasService) {
      for (const field of ['name', 'namespace']) if (!dnsLabel(text(draft.get([...clientPath, 'service', field])))) issue([...clientPath, 'service', field], 'Enter a valid Service reference.');
      const port = draft.get([...clientPath, 'service', 'port']);
      if (port !== undefined && (!/^\d+$/.test(text(port)) || BigInt(text(port)) < 1n || BigInt(text(port)) > 65535n)) issue([...clientPath, 'service', 'port'], 'Port must be 1–65535.');
    }
    const reviewVersions = strings(draft.get([...webhookPath, 'conversionReviewVersions']));
    if (!reviewVersions.length || !reviewVersions.some(version => ['v1', 'v1beta1'].includes(version))) issue([...webhookPath, 'conversionReviewVersions'], 'Include a supported ConversionReview version: v1 or v1beta1.');
  }
  return issues;
}
