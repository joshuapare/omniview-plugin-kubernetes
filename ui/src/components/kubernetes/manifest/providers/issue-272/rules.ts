import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPath } from '@omniviewdev/runtime';

export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function installerOwned(draft: ResourceEditorDraft): boolean {
  const owners = draft.get(['metadata', 'ownerReferences']);
  return Array.isArray(owners) && owners.length > 0 ||
    draft.get(['metadata', 'labels', 'app.kubernetes.io/managed-by']) !== undefined ||
    draft.has(['metadata', 'annotations', 'meta.helm.sh/release-name']) ||
    draft.has(['metadata', 'labels', 'argocd.argoproj.io/instance']) ||
    draft.has(['metadata', 'labels', 'kustomize.toolkit.fluxcd.io/name']);
}
export function authoringDisabled(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
  return context.intent === 'inspect' || context.intent !== 'create' && context.capabilities.update !== 'available' ||
    context.intent === 'create' && context.capabilities.create !== 'available' ||
    context.discovery.status !== 'available' || context.schema.status !== 'available' ||
    context.ownership?.status === 'controller' || context.ownership?.status === 'system' || installerOwned(draft) ||
    context.kind === 'CSIDriver' && context.ownership?.status !== 'application';
}
export function fieldAvailable(context: ResourceEditorContext, path: ResourceEditorPath, feature?: string): boolean {
  if (feature && context.discovery.features[feature] !== 'available') return false;
  return context.schema.status === 'available' && !!context.schema.paths?.some(candidate => candidate.length === path.length && candidate.every((part, index) => part === path[index]));
}
export function integerError(value: string, min: bigint, max = 9223372036854775807n): string | null {
  if (!/^\d+$/.test(value)) return 'Enter a whole number.';
  const integer = BigInt(value);
  return integer < min || integer > max ? `Use ${min}–${max} seconds.` : null;
}
export function identifierError(text: string, provisioner = false): string | null {
  const parts = (provisioner ? text.toLowerCase() : text).split('/');
  const name = parts[parts.length - 1];
  if (parts.length > 2 || !name || name.length > 63 || !/^[a-zA-Z0-9]([a-zA-Z0-9_.-]*[a-zA-Z0-9])?$/.test(name)) return 'Enter a qualified identifier with a name of at most 63 characters.';
  if (parts.length === 2) {
    const prefix = parts[0];
    if (!prefix || prefix.length > 253 || prefix.split('.').some(label => label.length > 63 || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(label))) return 'Use a valid DNS prefix before the slash.';
  }
  return null;
}
export function topologyValuesError(values: readonly string[]): string | null {
  return !values.length || values.some(value => !value || value.length > 63 || !/^[a-zA-Z0-9]([a-zA-Z0-9_.-]*[a-zA-Z0-9])?$/.test(value)) ? 'Use nonempty topology label values of at most 63 characters.' : new Set(values).size !== values.length ? 'Topology values must be unique.' : null;
}
export function parameterError(parameters: unknown, required: boolean): string | null {
  if (parameters === undefined) return required ? 'Add at least one attribute.' : null;
  if (!record(parameters)) return 'Parameters require a string map; retain unsupported source.';
  const entries = Object.entries(parameters);
  if (required && !entries.length) return 'Add at least one attribute.';
  if (entries.length > 512) return 'Use at most 512 parameters.';
  // Projected sensitive values are opaque; the host validates canonical values at submission.
  if (entries.some(([key, value]) => !key || typeof value !== 'string' && !record(value))) return 'Parameter keys must be nonempty and values must be strings.';
  const bytes = new TextEncoder();
  const size = entries.reduce((sum, [key, value]) => sum + bytes.encode(key).length + (typeof value === 'string' ? bytes.encode(value).length : 0), 0);
  return size > 262144 ? 'Parameters exceed 256 KiB.' : null;
}
export function validateStorage(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const add = (path: ResourceEditorPath, message: string | null) => { if (message) issues.push({ path, message }); };
  if (context.kind === 'StorageClass' || context.kind === 'VolumeAttributesClass') {
    const driverPath = [context.kind === 'StorageClass' ? 'provisioner' : 'driverName'];
    const driver = draft.get(driverPath);
    add(driverPath, typeof driver === 'string' && driver ? identifierError(driver, true) : 'Enter an exact driver identifier.');
    add(['parameters'], parameterError(draft.get(['parameters']), context.kind === 'VolumeAttributesClass'));
  }
  if (context.kind === 'CSIDriver') {
    const requests = draft.get(['spec', 'tokenRequests']);
    const seen = new Set<string>();
    if (Array.isArray(requests)) requests.forEach((_, index) => {
      const audience = draft.get(['spec', 'tokenRequests', index, 'audience']);
      add(['spec', 'tokenRequests', index, 'audience'], typeof audience !== 'string' ? 'Audience must be text.' : seen.has(audience) ? 'Each token audience must be unique.' : null);
      if (typeof audience === 'string') seen.add(audience);
      const expiry = draft.get(['spec', 'tokenRequests', index, 'expirationSeconds']);
      if (expiry !== undefined) add(['spec', 'tokenRequests', index, 'expirationSeconds'], typeof expiry === 'bigint' || typeof expiry === 'number' && Number.isSafeInteger(expiry) ? integerError(String(expiry), 600n, 4294967296n) : 'Use an integer YAML scalar for token expiration.');
    });
    if (draft.has(['spec', 'serviceAccountTokenInSecrets']) && (!Array.isArray(requests) || !requests.length)) add(['spec', 'serviceAccountTokenInSecrets'], 'Token delivery requires at least one token request, even when false.');
    const period = draft.get(['spec', 'nodeAllocatableUpdatePeriodSeconds']);
    if (period !== undefined) add(['spec', 'nodeAllocatableUpdatePeriodSeconds'], typeof period === 'bigint' || typeof period === 'number' && Number.isSafeInteger(period) ? integerError(String(period), 10n) : 'Use an integer YAML scalar for the refresh interval.');
  }
  return issues;
}
export function unsupportedShape(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  const strings = context.kind === 'StorageClass' ? ['provisioner', 'reclaimPolicy', 'volumeBindingMode'] : context.kind === 'VolumeAttributesClass' ? ['driverName'] : [];
  if (strings.some(key => draft.has([key]) && typeof draft.get([key]) !== 'string')) return 'A guided text field has an unsupported scalar type. Source remains unchanged.';
  if ((context.kind === 'StorageClass' || context.kind === 'VolumeAttributesClass') && draft.has(['parameters']) && !record(draft.get(['parameters']))) return 'Unsupported parameter shape. Source remains unchanged.';
  if (context.kind === 'StorageClass') {
    if (draft.has(['mountOptions']) && (!Array.isArray(draft.get(['mountOptions'])) || (draft.get(['mountOptions']) as unknown[]).some(value => typeof value !== 'string'))) return 'Unsupported mount option shape. Source remains unchanged.';
    const terms = draft.get(['allowedTopologies']);
    if (terms !== undefined && (!Array.isArray(terms) || terms.some(term => !record(term) || !Array.isArray(term.matchLabelExpressions) || term.matchLabelExpressions.some(expression => !record(expression) || typeof expression.key !== 'string' || !Array.isArray(expression.values) || expression.values.some(value => typeof value !== 'string'))))) return 'Unsupported topology shape. Source remains unchanged.';
  }
  if (context.kind === 'CSIDriver') {
    if (draft.has(['spec']) && !record(draft.get(['spec']))) return 'Unsupported driver specification. Source remains unchanged.';
    for (const key of ['attachRequired', 'podInfoOnMount', 'storageCapacity', 'requiresRepublish', 'seLinuxMount', 'serviceAccountTokenInSecrets']) {
      if (draft.has(['spec', key]) && typeof draft.get(['spec', key]) !== 'boolean') return 'Unsupported driver capability scalar. Source remains unchanged.';
    }
    const tokens = draft.get(['spec', 'tokenRequests']);
    if (tokens !== undefined && (!Array.isArray(tokens) || tokens.some(token => !record(token) || typeof token.audience !== 'string'))) return 'Unsupported token request shape. Source remains unchanged.';
    if (Array.isArray(tokens) && tokens.some(token => record(token) && token.expirationSeconds !== undefined && typeof token.expirationSeconds !== 'bigint' && !(typeof token.expirationSeconds === 'number' && Number.isSafeInteger(token.expirationSeconds)))) return 'Unsupported token expiration scalar. Source remains unchanged.';
    const period = draft.get(['spec', 'nodeAllocatableUpdatePeriodSeconds']);
    if (period !== undefined && typeof period !== 'bigint' && !(typeof period === 'number' && Number.isSafeInteger(period))) return 'Unsupported refresh interval scalar. Source remains unchanged.';
    const modes = draft.get(['spec', 'volumeLifecycleModes']);
    if (modes !== undefined && (!Array.isArray(modes) || modes.some(mode => mode !== 'Persistent' && mode !== 'Ephemeral'))) return 'Unsupported lifecycle mode. Source remains unchanged.';
  }
  return null;
}
