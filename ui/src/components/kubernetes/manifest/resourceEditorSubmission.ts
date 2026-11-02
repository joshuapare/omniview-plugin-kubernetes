import type { ResourceEditorContext } from '@omniviewdev/runtime';
import { inspectManifest, readManifestValue, validateManifest } from './manifestDraft';
import { validateEditorIdentity } from './resourceEditorContext';

/** Host source checks are independent of provider mode and never run provider code. */
export function validateEditorSource(source: string, context: ResourceEditorContext, baseline?: string): string | null {
  if (context.intent !== 'create' && context.intent !== 'edit') return 'This interface does not use resource creation or update.';
  const identityError = validateEditorIdentity(source, context, baseline);
  if (identityError) return identityError;
  const operation = context.intent === 'create' ? context.capabilities.create : context.capabilities.update;
  if (context.discovery.status !== 'available' || operation !== 'available') return 'Resource mutation is not advertised for this exact API and scope.';
  const draft = inspectManifest(source);
  if (context.scope === 'Namespaced' && !readManifestValue(draft, ['metadata', 'namespace'])) return 'Choose a destination namespace.';
  return validateManifest(source, `k8s:${context.group}/${context.resource}`, context.intent === 'edit', baseline);
}

export type ResourceEditorPreparedSubmission =
  | { status: 'ready'; source: string; sessionID: string; revision: number; isCurrent: () => boolean }
  | { status: 'invalid' | 'stale'; message: string };

/** Private host handle. This is never passed to contributed forms or exported from runtime. */
export interface ResourceEditorSubmissionHandle {
  prepare(signal: AbortSignal): Promise<ResourceEditorPreparedSubmission>;
}
