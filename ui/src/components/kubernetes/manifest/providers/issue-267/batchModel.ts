import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPath } from '@omniviewdev/runtime';

export type BatchKind = 'Job' | 'CronJob';
export const jobPath = (kind: string): ResourceEditorPath => kind === 'CronJob' ? ['spec', 'jobTemplate', 'spec'] : ['spec'];
export const scalar = (value: unknown): string => typeof value === 'string' || typeof value === 'bigint' || typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
export const array = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
export const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const INT32_MAX = 2147483647n;
export const INT64_MAX = 9223372036854775807n;

export function parseInteger(text: string, max = INT32_MAX, min = 0n): { value?: bigint; error: string | null } {
  if (text === '') return { error: null };
  if (!/^\d+$/.test(text)) return { error: 'Enter a whole number.' };
  const value = BigInt(text);
  return value < min || value > max ? { error: `Use ${min}–${max}.` } : { value, error: null };
}

const macros: Readonly<Record<string, true>> = { '@yearly': true, '@annually': true, '@monthly': true, '@weekly': true, '@daily': true, '@midnight': true, '@hourly': true };
const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
/** Kubernetes uses five-field robfig cron syntax; server admission remains authoritative. */
export function scheduleError(text: string): string | null {
  const schedule = text.trim();
  if (macros[schedule]) return null;
  const fields = schedule.split(/\s+/);
  if (fields.length !== 5) return 'Use five cron fields or a supported @schedule.';
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  for (let i = 0; i < fields.length; i++) {
    const value = (token: string): number => {
      const upper = token.toUpperCase();
      if (i === 3 && monthNames.includes(upper)) return monthNames.indexOf(upper) + 1;
      if (i === 4 && dayNames.includes(upper)) return dayNames.indexOf(upper);
      return /^\d+$/.test(token) ? Number(token) : NaN;
    };
    for (const part of fields[i].split(',')) {
      const [span, step, extra] = part.split('/');
      if (extra !== undefined || step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1)) return 'Use valid cron ranges, lists and positive steps.';
      if (span === '*' || span === '?') continue;
      const tokens = span.split('-');
      if (tokens.length > 2 || tokens.some(token => !Number.isInteger(value(token)) || value(token) < ranges[i][0] || value(token) > ranges[i][1]) || tokens.length === 2 && value(tokens[0]) > value(tokens[1])) return `Cron field ${i + 1} is outside its valid range.`;
    }
  }
  return null;
}

export function timeZoneError(value: string): string | null {
  if (!value) return null;
  if (value.toLowerCase() === 'local' || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return 'Use an explicit IANA time zone.';
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return null; }
  catch { return 'Time zone is unknown to this browser; use YAML for server-only zones.'; }
}

export function managedByError(value: string): string | null {
  if (!value) return null;
  const slash = value.indexOf('/');
  const domain = value.slice(0, slash);
  return value.length > 63 || slash < 1 || !value.slice(slash + 1) || domain.length > 253 || domain.split('.').some(label => !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(label) || label.length > 63) || !/^[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(value.slice(slash + 1))
    ? 'Use a domain-prefixed controller path, up to 63 characters.' : null;
}

export function labelKeyError(value: string): string | null {
  const parts = value.split('/');
  const name = parts.at(-1) ?? '';
  const validName = name.length <= 63 && /^[A-Za-z0-9]([-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(name);
  const validPrefix = parts.length === 1 || parts[0].length <= 253 && parts[0].split('.').every(label => label.length <= 63 && /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(label));
  return parts.length > 2 || !validName || !validPrefix ? 'Use a Kubernetes label key with an optional DNS prefix.' : null;
}

export function labelValueError(value: string): string | null {
  return value.length <= 63 && (value === '' || /^[A-Za-z0-9]([-_.A-Za-z0-9]*[A-Za-z0-9])?$/.test(value)) ? null : 'Use up to 63 letters, digits, dots, underscores or dashes.';
}

export function ownerName(draft: ResourceEditorDraft): string | null {
  const owner = array(draft.get(['metadata', 'ownerReferences'])).map(record).find(item => item.controller === true);
  return owner ? `${scalar(owner.kind) || 'Controller'} / ${scalar(owner.name) || 'unknown'}` : null;
}

export function batchReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  if (context.intent === 'inspect') return true;
  if (context.ownership?.status === 'controller' || context.ownership?.status === 'system') return true;
  if (context.kind !== 'Job' || context.intent === 'create') return false;
  const managedBy = scalar(draft.get(['spec', 'managedBy']));
  return ownerName(draft) !== null || !!managedBy && managedBy !== 'kubernetes.io/job-controller';
}

export function batchUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.intent !== 'inspect' && context.schema.status !== 'available') return 'Installed batch schema is unavailable. Source remains unchanged.';
  const base = jobPath(context.kind);
  const containers = draft.get([...base, 'template', 'spec', 'containers']);
  if (containers !== undefined && (!Array.isArray(containers) || containers.some(value => value === null || typeof value !== 'object' || Array.isArray(value)))) return 'Container shape is unsupported. Source remains unchanged.';
  for (const [suffix, allowed] of [
    ['completionMode', ['NonIndexed', 'Indexed']],
    ['podReplacementPolicy', ['Failed', 'TerminatingOrFailed']],
  ] as const) {
    const value = draft.get([...base, suffix]);
    if (value !== undefined && !allowed.includes(value as never)) return 'This batch policy version requires YAML or another installed provider.';
  }
  return null;
}

export function validateBatch(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (batchReadOnly(draft, context)) return [];
  const issues: ResourceEditorFieldIssue[] = [];
  const add = (path: ResourceEditorPath, message: string | null) => { if (message) issues.push({ path, message }); };
  const base = jobPath(context.kind);
  const get = (suffix: string) => draft.get([...base, suffix]);
  for (const field of ['parallelism', 'completions', 'backoffLimit', 'ttlSecondsAfterFinished', 'backoffLimitPerIndex', 'maxFailedIndexes']) {
    const value = get(field);
    if (value !== undefined) add([...base, field], typeof value !== 'bigint' && !(typeof value === 'number' && Number.isSafeInteger(value)) ? 'Use an integer scalar.' : parseInteger(scalar(value)).error);
  }
  const deadline = get('activeDeadlineSeconds');
  if (deadline !== undefined) add([...base, 'activeDeadlineSeconds'], typeof deadline !== 'bigint' && !(typeof deadline === 'number' && Number.isSafeInteger(deadline)) ? 'Use an integer scalar.' : parseInteger(scalar(deadline), INT64_MAX, 1n).error);
  const indexed = get('completionMode') === 'Indexed';
  if (indexed && get('completions') === undefined) add([...base, 'completions'], 'Indexed execution requires completions.');
  const numeric = (field: string) => { const parsed = parseInteger(scalar(get(field))); return parsed.value; };
  add([...base, 'managedBy'], managedByError(scalar(get('managedBy'))));
  if (indexed && (numeric('parallelism') ?? 0n) > 100000n) add([...base, 'parallelism'], 'Indexed execution permits at most 100000 concurrent Pods.');
  const perIndex = get('backoffLimitPerIndex') !== undefined;
  if (perIndex && !indexed) add([...base, 'backoffLimitPerIndex'], 'Per-index retries require Indexed execution.');
  const restartPath = [...base, 'template', 'spec', 'restartPolicy'];
  const restart = draft.get(restartPath);
  if (restart !== 'Never' && restart !== 'OnFailure') add(restartPath, 'Choose Never or OnFailure.');
  if ((perIndex || draft.has([...base, 'podFailurePolicy'])) && restart !== 'Never') add(restartPath, 'Per-index retries and failure policies require Never.');
  if (draft.has([...base, 'podFailurePolicy']) && get('podReplacementPolicy') === 'TerminatingOrFailed') add([...base, 'podReplacementPolicy'], 'Failure policy requires Failed replacement.');
  if (draft.has([...base, 'successPolicy']) && !indexed) add([...base, 'completionMode'], 'Success policy requires Indexed execution.');
  const failed = numeric('maxFailedIndexes');
  if (failed !== undefined && (!perIndex || !indexed)) add([...base, 'maxFailedIndexes'], 'Failed-index limit requires per-index retries and Indexed execution.');
  if (failed !== undefined && (failed > 100000n || failed > (numeric('completions') ?? INT32_MAX))) add([...base, 'maxFailedIndexes'], 'Failed-index limit exceeds completions or 100000.');
  if (indexed && perIndex && (numeric('completions') ?? 0n) > 100000n) {
    if (failed === undefined || failed > 10000n) add([...base, 'maxFailedIndexes'], 'Above 100000 completions, specify at most 10000 failed indexes.');
    if ((numeric('parallelism') ?? 0n) > 10000n) add([...base, 'parallelism'], 'Above 100000 completions, per-index retries permit at most 10000 concurrent Pods.');
  }
  const containersPath = [...base, 'template', 'spec', 'containers'];
  const containers = array(draft.get(containersPath));
  if (!containers.length) add(containersPath, 'Add at least one executable container.');
  const names = new Set<string>();
  containers.forEach((_, index) => {
    const name = scalar(draft.get([...containersPath, index, 'name']));
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name) || name.length > 63 || names.has(name)) add([...containersPath, index, 'name'], 'Use a unique DNS label, up to 63 characters.');
    names.add(name);
    if (!scalar(draft.get([...containersPath, index, 'image'])).trim()) add([...containersPath, index, 'image'], 'Image is required.');
  });
  if (context.kind === 'CronJob') {
    add(['spec', 'schedule'], scheduleError(scalar(draft.get(['spec', 'schedule']))));
    add(['spec', 'timeZone'], timeZoneError(scalar(draft.get(['spec', 'timeZone']))));
    for (const field of ['successfulJobsHistoryLimit', 'failedJobsHistoryLimit', 'startingDeadlineSeconds']) {
      if (draft.has(['spec', field])) add(['spec', field], parseInteger(scalar(draft.get(['spec', field])), field === 'startingDeadlineSeconds' ? INT64_MAX : INT32_MAX).error);
    }
  }
  return issues;
}
