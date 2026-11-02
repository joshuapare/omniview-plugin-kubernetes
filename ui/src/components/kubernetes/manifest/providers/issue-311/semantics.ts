import type { ResourceEditorDraft, ResourceEditorPatch, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export const duration = /^([0-9]+(\.[0-9]+)?(ms|s|m|h))+$/;
export const text = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'bigint' ? String(value) : '';
export function requestOperations(action: 'reconcile' | 'reset' | 'force', token: string): ResourceEditorPatch[] {
  const operations: ResourceEditorPatch[] = [{ op: 'set', path: ['metadata', 'annotations', 'reconcile.fluxcd.io/requestedAt'], value: token }];
  if (action !== 'reconcile') operations.push({ op: 'set', path: ['metadata', 'annotations', `reconcile.fluxcd.io/${action}At`], value: token });
  return operations;
}
export function validate(draft: ResourceEditorDraft): ResourceEditorFieldIssue[] {
  const errors: ResourceEditorFieldIssue[] = [];
  const add = (path: string[], message: string) => errors.push({ path, message });
  if (!duration.test(text(draft.get(['spec', 'interval'])))) add(['spec', 'interval'], 'Enter a reconciliation duration.');
  const chart = draft.has(['spec', 'chart']); const ref = draft.has(['spec', 'chartRef']);
  if (chart === ref) add(['spec', 'chart'], 'Choose exactly one chart source.');
  if (chart && !text(draft.get(['spec', 'chart', 'spec', 'chart']))) add(['spec', 'chart', 'spec', 'chart'], 'Chart is required.');
  const path = chart ? ['spec', 'chart', 'spec', 'sourceRef', 'name'] : ['spec', 'chartRef', 'name'];
  if (!text(draft.get(path))) add(path, 'Source name is required.');
  for (const field of ['valuesFrom', 'dependsOn']) {
    const rows = draft.get(['spec', field]);
    if (!Array.isArray(rows)) continue;
    const references: readonly unknown[] = rows;
    references.forEach((row, index) => {
      if (!row || typeof row !== 'object') { errors.push({ path: ['spec', field, index], message: 'Unsupported row. Use protected source editing.' }); return; }
      if (!('name' in row) || typeof row.name !== 'string' || !row.name) errors.push({ path: ['spec', field, index, 'name'], message: 'Reference name is required.' });
      if (field === 'dependsOn' && 'name' in row && row.name === draft.get(['metadata', 'name']) && (!('namespace' in row) || !row.namespace || row.namespace === draft.get(['metadata', 'namespace']))) errors.push({ path: ['spec', field, index, 'name'], message: 'A release cannot depend on itself.' });
    });
  }
  return errors;
}
export function canRemoveBranch(value: unknown, keys: readonly string[]): boolean {
  return value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key)));
}
