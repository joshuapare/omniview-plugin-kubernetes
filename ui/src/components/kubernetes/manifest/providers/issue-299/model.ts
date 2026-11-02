import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export const modes = ['', 'UNSET', 'DISABLE', 'PERMISSIVE', 'STRICT'];
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });
  if (draft.has(['spec', 'selector']) && draft.has(['spec', 'targetRefs'])) add(['spec', 'targetRefs'], 'Choose labels or target references, not both.');
  if (context.kind === 'AuthorizationPolicy' && draft.get(['spec', 'action']) === 'CUSTOM' && !draft.get(['spec', 'provider', 'name'])) add(['spec', 'provider', 'name'], 'Choose an external authorization provider.');
  if (context.kind === 'PeerAuthentication') {
    const ports = draft.get(['spec', 'portLevelMtls']);
    if (ports && typeof ports === 'object') {
      const labels = draft.get(['spec', 'selector', 'matchLabels']);
      if (!labels || typeof labels !== 'object' || Array.isArray(labels) || !Object.keys(labels).length) add(['spec', 'selector'], 'Workload port overrides require workload labels.');
      for (const port of Object.keys(ports)) if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) add(['spec', 'portLevelMtls', port], 'Workload port must be 1–65535.');
    }
    if (context.discovery.features['istio.ambient'] === 'available' && draft.get(['spec', 'mtls', 'mode']) === 'DISABLE') add(['spec', 'mtls', 'mode'], 'Ambient does not support DISABLE.');
  }
  const rules = draft.get(['spec', 'jwtRules']);
  if (Array.isArray(rules)) rules.forEach((_, index) => {
    if (!draft.get(['spec', 'jwtRules', index, 'issuer'])) add(['spec', 'jwtRules', index, 'issuer'], 'Issuer is required.');
    if (['jwks', 'jwksUri', 'jwks_uri'].filter(key => draft.has(['spec', 'jwtRules', index, key])).length > 1) add(['spec', 'jwtRules', index], 'Choose one JWKS source.');
  });
  return issues;
}
export function unavailable(draft: ResourceEditorDraft): string | null {
  const spec = draft.get(['spec']);
  return spec !== undefined && (!spec || typeof spec !== 'object' || Array.isArray(spec)) ? 'Unsupported policy shape. Keep source unchanged in YAML.' : null;
}
