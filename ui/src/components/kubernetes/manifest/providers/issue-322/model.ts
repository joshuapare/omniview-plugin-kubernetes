import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPath } from '@omniviewdev/runtime';

export const pipelineRoot = (kind: string): ResourceEditorPath => kind === 'Operation' ? ['spec'] : ['spec', 'operationTemplate', 'spec'];
export function operationReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  if (context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system') return true;
  const owners = draft.get(['metadata', 'ownerReferences']);
  if (Array.isArray(owners) && owners.length > 0) return true;
  // Runs begin executing on creation. Even an apparently pending run may already be active.
  return context.kind === 'Operation' && context.intent !== 'create';
}
export function exactNonnegative(text: string, bits: 32 | 64) {
  if (!/^\d+$/.test(text)) return { valid: false as const, error: 'Enter a nonnegative whole number.' };
  const value = BigInt(text);
  return value <= (1n << BigInt(bits - 1)) - 1n ? { valid: true as const, value } : { valid: false as const, error: `Exceeds signed int${bits} range.` };
}
export function validateOperation(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (operationReadOnly(draft, context)) return [];
  const issues: ResourceEditorFieldIssue[] = [];
  const add = (path: ResourceEditorPath, message: string) => issues.push({ path, message });
  const root = pipelineRoot(context.kind);
  const mode = draft.get([...root, 'mode']);
  if (mode !== undefined && mode !== 'Pipeline') add([...root, 'mode'], 'Only Pipeline mode is supported.');
  const pipeline = draft.get([...root, 'pipeline']);
  if (!Array.isArray(pipeline) || pipeline.length < 1 || pipeline.length > 99) add([...root, 'pipeline'], 'Add between 1 and 99 function steps.');
  const names = new Set<string>();
  if (Array.isArray(pipeline)) pipeline.forEach((_, i) => {
    const step = draft.get([...root, 'pipeline', i, 'step']);
    if (typeof step !== 'string' || !step.trim() || names.has(step)) add([...root, 'pipeline', i, 'step'], 'Step names must be nonempty and unique.');
    if (typeof step === 'string') names.add(step);
    const fn = draft.get([...root, 'pipeline', i, 'functionRef', 'name']);
    if (typeof fn !== 'string' || !fn.trim()) add([...root, 'pipeline', i, 'functionRef', 'name'], 'Choose a Function or enter its name.');
  });
  if (context.kind === 'CronOperation') {
    const schedule = draft.get(['spec', 'schedule']);
    if (typeof schedule !== 'string' || schedule.trim().split(/\s+/).length !== 5) add(['spec', 'schedule'], 'Enter a five-field cron schedule. Admission validates schedule syntax.');
  }
  if (context.kind === 'WatchOperation') for (const field of ['apiVersion', 'kind']) {
    const value = draft.get(['spec', 'watch', field]);
    if (typeof value !== 'string' || !value.trim()) add(['spec', 'watch', field], `Watched ${field} is required.`);
  }
  const integers: [ResourceEditorPath, 32 | 64][] = [[ [...root, 'retryLimit'], 64 ]];
  if (context.kind !== 'Operation') integers.push([['spec', 'successfulHistoryLimit'], 32], [['spec', 'failedHistoryLimit'], 32]);
  if (context.kind === 'CronOperation') integers.push([['spec', 'startingDeadlineSeconds'], 64]);
  for (const [path, bits] of integers) if (draft.has(path)) {
    const value = draft.get(path);
    const result = exactNonnegative(typeof value === 'bigint' || typeof value === 'string' || typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '', bits);
    if (!result.valid) add(path, result.error);
  }
  const concurrency = draft.get(['spec', 'concurrencyPolicy']);
  if (context.kind !== 'Operation' && concurrency !== undefined && (typeof concurrency !== 'string' || !['Allow', 'Forbid', 'Replace'].includes(concurrency))) add(['spec', 'concurrencyPolicy'], 'Choose Allow, Forbid or Replace.');
  return issues;
}
