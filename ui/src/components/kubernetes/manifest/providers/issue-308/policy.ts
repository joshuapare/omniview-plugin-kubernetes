import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
export const pathOf = (path: string): (string | number)[] => path.split('.').map(part => /^\d+$/.test(part) ? Number(part) : part);
export function inspectionOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  if (['WorkflowArtifactGCTask', 'WorkflowTaskResult', 'WorkflowTaskSet'].includes(context.kind)) return true;
  if (['Workflow', 'AnalysisRun', 'Experiment'].includes(context.kind) && context.intent !== 'create') return true;
  const owners = draft.get(['metadata', 'ownerReferences']);
  return context.ownership?.status === 'controller' || context.ownership?.status === 'system'
    || (Array.isArray(owners) && owners.length > 0)
    || (context.intent !== 'create' && context.ownership?.status !== 'application');
}
export function integerValue(text: string, weight = false): { valid: true; value: number } | { valid: false; error: string } {
  if (!/^\d+$/.test(text)) return { valid: false, error: 'Enter a nonnegative whole number.' };
  const value = Number(text);
  return Number.isSafeInteger(value) && value <= (weight ? 100 : 2147483647)
    ? { valid: true, value } : { valid: false, error: weight ? 'Use 0–100 percent.' : 'Value exceeds the supported integer range.' };
}

/** Unsupported unions stay in canonical source rather than becoming a second active branch. */
export function unsupportedShape(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  const has = (path: string) => draft.has(pathOf(path));
  if (context.kind === 'Application' && (has('spec.sources') || has('spec.source.chart') || has('spec.source.helm') || has('spec.source.plugin')))
    return 'Use source for multi-source, Helm, or plugin Applications.';
  if (context.kind === 'ApplicationSet') {
    const generators = draft.get(['spec', 'generators']);
    if (Array.isArray(generators) && (generators.length !== 1 || !has('spec.generators.0.list')))
      return 'Use source for non-list or combined generators.';
  }
  if (context.kind === 'Rollout' && (has('spec.strategy.blueGreen') || has('spec.workloadRef')))
    return 'Use source for blue-green or workload-reference Rollouts.';
  if (['AnalysisTemplate', 'ClusterAnalysisTemplate', 'AnalysisRun'].includes(context.kind)) {
    const provider = draft.get(pathOf('spec.metrics.0.provider'));
    if (provider && typeof provider === 'object' && Object.keys(provider).some(key => key !== 'prometheus'))
      return 'Use source for this metric provider.';
  }
  if (['WorkflowTemplate', 'ClusterWorkflowTemplate'].includes(context.kind)) {
    const template = draft.get(pathOf('spec.templates.0'));
    if (template && typeof template === 'object' && ['dag', 'steps', 'script', 'resource', 'suspend', 'http', 'plugin'].some(key => key in template))
      return 'Use source for non-container workflow templates.';
  }
  return null;
}
