import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';

export const metricBranches = { Resource: 'resource', ContainerResource: 'containerResource', Pods: 'pods', Object: 'object', External: 'external' } as const;
export type MetricType = keyof typeof metricBranches;
export const metricTypes = Object.keys(metricBranches) as MetricType[];
/** Source fragments remain unknown until domain validation checks each used field. */
interface HPAFragment {
  type?: unknown; controller?: unknown; resource?: unknown; containerResource?: unknown;
  pods?: unknown; object?: unknown; external?: unknown; target?: unknown; policies?: unknown;
  value?: unknown; averageValue?: unknown; averageUtilization?: unknown;
  matchExpressions?: unknown; key?: unknown; operator?: unknown; values?: unknown;
}
export const isRecord = (value: unknown): value is HPAFragment => value !== null && typeof value === 'object' && !Array.isArray(value);
export const text = (value: unknown): string => ['string', 'number', 'bigint'].includes(typeof value) ? String(value) : '';
export const quantityPattern = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+|[numkKMGTPE]|[KMGTPE]i)?$/;
export function parseInteger(value: string, minimum = 0, maximum = 2147483647): number | null {
  if (!/^\d+$/.test(value)) return null;
  const exact = BigInt(value);
  return exact >= BigInt(minimum) && exact <= BigInt(maximum) ? Number(exact) : null;
}
export function validQuantity(value: unknown, allowZero = false): boolean {
  return typeof value === 'string' && quantityPattern.test(value) && (allowZero || /[1-9]/.test(value.split(/[eEnumkKMGTPE]/)[0]));
}
export function sourceChange(index: number, type: MetricType): ResourceEditorPatch[] {
  const root = ['spec', 'metrics', index] as const;
  return [
    ...Object.values(metricBranches).map(branch => ({ op: 'remove' as const, path: [...root, branch] })),
    { op: 'set', path: [...root, 'type'], value: type },
    { op: 'set', path: [...root, metricBranches[type]], value: {} },
  ];
}
export function targetChange(path: ResourceEditorPath, type: string): ResourceEditorPatch[] {
  return [
    ...['value', 'averageValue', 'averageUtilization'].map(key => ({ op: 'remove' as const, path: [...path, key] })),
    { op: 'set', path: [...path, 'type'], value: type },
  ];
}
export function isManaged(draft: ResourceEditorDraft): boolean {
  const owners = draft.get(['metadata', 'ownerReferences']);
  return Array.isArray(owners) && owners.some(owner => isRecord(owner) && owner.controller === true);
}
export function hpaReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  return context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system' || isManaged(draft) || context.capabilities[context.intent === 'create' ? 'create' : 'update'] !== 'available';
}
export function hpaUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  if (context.discovery.status !== 'available') return 'Autoscaling API discovery is not available.';
  if (context.schema.status !== 'available') return 'Installed autoscaling schema is not available.';
  for (const path of [['spec'], ['spec', 'scaleTargetRef'], ['spec', 'behavior']]) {
    const value = draft.get(path);
    if (value !== undefined && !isRecord(value)) return 'Unsupported autoscaling object shape requires source editing.';
  }
  const metrics = draft.get(['spec', 'metrics']);
  if (metrics !== undefined && !Array.isArray(metrics)) return 'Metrics shape requires source editing.';
  if (context.version === 'v2' && Array.isArray(metrics)) {
    for (const [index, metric] of metrics.entries()) {
      if (!isRecord(metric) || !metricTypes.includes(metric.type as MetricType)) return 'Unsupported metric source requires source editing.';
      const branch = metricBranches[metric.type as MetricType];
      const source = metric[branch];
      if (!isRecord(source)) return 'Unsupported metric source shape requires source editing.';
      if (Object.values(metricBranches).some(other => other !== branch && metric[other] !== undefined)) return 'Multiple metric source branches require source editing.';
      const target = source.target;
      if (target !== undefined && !isRecord(target)) return 'Unsupported metric target shape requires source editing.';
      if (isRecord(target) && target.type !== undefined && (typeof target.type !== 'string' || !['Utilization', 'AverageValue', 'Value'].includes(target.type))) return 'Unsupported metric target requires source editing.';
      const root = ['spec', 'metrics', index, branch];
      for (const suffix of [['metric'], ['metric', 'selector'], ['metric', 'selector', 'matchLabels'], ['describedObject']]) {
        const value = draft.get([...root, ...suffix]);
        if (value !== undefined && !isRecord(value)) return 'Unsupported metric reference or selector shape requires source editing.';
      }
      const labels = draft.get([...root, 'metric', 'selector', 'matchLabels']);
      if (labels && typeof labels === 'object' && Object.values(labels).some(value => typeof value !== 'string')) return 'Non-text metric labels require source editing.';
      const expressions = draft.get([...root, 'metric', 'selector', 'matchExpressions']);
      if (expressions !== undefined && (!Array.isArray(expressions) || expressions.some(value => !isRecord(value)))) return 'Unsupported selector expressions require source editing.';
      for (const key of ['averageValue', 'value']) {
        const value = draft.get([...root, 'target', key]);
        if (value !== undefined && typeof value !== 'string') return 'Non-string metric quantities remain intact in source editing.';
      }
    }
  }
  for (const direction of ['scaleUp', 'scaleDown']) {
    const rules = draft.get(['spec', 'behavior', direction]);
    if (rules !== undefined && !isRecord(rules)) return 'Unsupported scaling behavior requires source editing.';
    if (isRecord(rules) && rules.policies !== undefined && (!Array.isArray(rules.policies) || rules.policies.some(policy => !isRecord(policy)))) return 'Unsupported scaling policies require source editing.';
  }
  return null;
}
export function validateHPA(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const fail = (path: ResourceEditorPath, message: string) => issues.push({ path, message });
  const required = (path: ResourceEditorPath) => { if (!text(draft.get(path)).trim()) fail(path, 'Required.'); };
  const integer = (path: ResourceEditorPath, min: number, max: number, optional = false) => {
    const value = draft.get(path);
    if (value === undefined && optional) return;
    if ((typeof value !== 'number' && typeof value !== 'bigint') || parseInteger(text(value), min, max) === null) fail(path, `Enter a whole number from ${min} to ${max}.`);
  };
  required(['spec', 'scaleTargetRef', 'kind']);
  required(['spec', 'scaleTargetRef', 'name']);
  integer(['spec', 'minReplicas'], 0, 2147483647, true);
  integer(['spec', 'maxReplicas'], 1, 2147483647);
  const min = draft.get(['spec', 'minReplicas']) ?? 1;
  const max = draft.get(['spec', 'maxReplicas']);
  if (parseInteger(text(min)) !== null && parseInteger(text(max)) !== null && BigInt(text(max)) < BigInt(text(min))) fail(['spec', 'maxReplicas'], 'Maximum must not be below minimum.');
  if (context.version === 'v1') {
    integer(['spec', 'targetCPUUtilizationPercentage'], 1, 2147483647, true);
    if (text(min) === '0') fail(['spec', 'minReplicas'], 'Scale-to-zero requires v2 Object or External metrics and a verified feature gate.');
    return issues;
  }
  const metrics = draft.get(['spec', 'metrics']);
  if (text(min) === '0' && (context.discovery.features.HPAScaleToZero !== 'available' || !Array.isArray(metrics) || !metrics.some(metric => isRecord(metric) && typeof metric.type === 'string' && ['Object', 'External'].includes(metric.type)))) fail(['spec', 'minReplicas'], 'Zero requires verified HPAScaleToZero and an Object or External metric.');
  if (Array.isArray(metrics)) metrics.forEach((metric, index) => {
    if (!isRecord(metric) || !metricTypes.includes(metric.type as MetricType)) { fail(['spec', 'metrics', index], 'Choose a supported metric source.'); return; }
    const type = metric.type as MetricType;
    const branch = metricBranches[type];
    const root = ['spec', 'metrics', index, branch] as const;
    if (type === 'Resource' || type === 'ContainerResource') required([...root, 'name']);
    else required([...root, 'metric', 'name']);
    if (type === 'ContainerResource') required([...root, 'container']);
    if (type === 'Object') { required([...root, 'describedObject', 'kind']); required([...root, 'describedObject', 'name']); }
    const targetPath = [...root, 'target'];
    const target = draft.get(targetPath);
    const allowed = type === 'Resource' || type === 'ContainerResource' ? ['Utilization', 'AverageValue'] : type === 'Pods' ? ['AverageValue'] : ['Value', 'AverageValue'];
    if (!isRecord(target) || typeof target.type !== 'string' || !allowed.includes(target.type)) { fail(targetPath, 'Choose a compatible target.'); return; }
    const key = target.type === 'Utilization' ? 'averageUtilization' : target.type === 'AverageValue' ? 'averageValue' : 'value';
    if (target.type === 'Utilization') integer([...targetPath, key], 1, 2147483647);
    else if (!validQuantity(target[key])) fail([...targetPath, key], 'Enter a positive Kubernetes quantity.');
    if ((['value', 'averageValue', 'averageUtilization'] as const).some(other => other !== key && target[other] !== undefined)) fail(targetPath, 'Remove incompatible target fields in source.');
    const selector = draft.get([...root, 'metric', 'selector']);
    if (isRecord(selector) && Array.isArray(selector.matchExpressions)) selector.matchExpressions.forEach((expression, row) => {
      const path = [...root, 'metric', 'selector', 'matchExpressions', row];
      if (!isRecord(expression) || !text(expression.key).trim() || typeof expression.operator !== 'string' || !['In', 'NotIn', 'Exists', 'DoesNotExist'].includes(expression.operator)) { fail(path, 'Complete selector key and operator.'); return; }
      const values = expression.values;
      if (['In', 'NotIn'].includes(expression.operator) ? !Array.isArray(values) || values.length === 0 || values.some(value => typeof value !== 'string' || !value) : values !== undefined && (!Array.isArray(values) || values.length !== 0)) fail(path, 'Selector values must match the operator.');
    });
  });
  for (const direction of ['scaleUp', 'scaleDown']) {
    const root = ['spec', 'behavior', direction];
    integer([...root, 'stabilizationWindowSeconds'], 0, 3600, true);
    const choice = draft.get([...root, 'selectPolicy']);
    if (choice !== undefined && (typeof choice !== 'string' || !['Max', 'Min', 'Disabled'].includes(choice))) fail([...root, 'selectPolicy'], 'Choose a supported policy.');
    const tolerance = draft.get([...root, 'tolerance']);
    if (tolerance !== undefined && !validQuantity(tolerance, true)) fail([...root, 'tolerance'], 'Enter a nonnegative quantity.');
    const policies = draft.get([...root, 'policies']);
    if (Array.isArray(policies)) policies.forEach((policy, index) => {
      if (!isRecord(policy) || typeof policy.type !== 'string' || !['Pods', 'Percent'].includes(policy.type)) fail([...root, 'policies', index, 'type'], 'Choose Pods or Percent.');
      integer([...root, 'policies', index, 'value'], 1, 2147483647);
      integer([...root, 'policies', index, 'periodSeconds'], 1, 1800);
    });
  }
  return issues;
}
