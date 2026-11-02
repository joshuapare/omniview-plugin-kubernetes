import type { ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export const kinds = ['GitRepository', 'OCIRepository', 'Bucket'] as const;
export const sourceResources: Record<string, string> = { GitRepository: 'gitrepositories', OCIRepository: 'ocirepositories', Bucket: 'buckets' };
export const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value as Record<string, unknown>[] : [];
export const text = (value: unknown): string => typeof value === 'string' ? value : '';
export function validateArtifact(draft: ResourceEditorDraft): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });
  const sources = rows(draft.get(['spec', 'sources']));
  const artifacts = rows(draft.get(['spec', 'artifacts']));
  const aliases = new Set<string>();
  if (!sources.length || sources.length > 1000) add(['spec', 'sources'], 'Use 1–1000 sources.');
  sources.forEach((s, i) => {
    const p = ['spec', 'sources', i];
    const alias = text(s.alias);
    if (!/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/.test(alias) || alias.length > 63 || aliases.has(alias)) add([...p, 'alias'], 'Use a unique source alias, up to 63 characters.');
    aliases.add(alias);
    if (!kinds.includes(s.kind as typeof kinds[number])) add([...p, 'kind'], 'Choose a supported source kind.');
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(text(s.name)) || text(s.name).length > 253) add([...p, 'name'], 'Enter a valid source name.');
    if (s.namespace !== undefined && (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(text(s.namespace)) || text(s.namespace).length > 63)) add([...p, 'namespace'], 'Enter a valid namespace or omit it.');
  });
  if (!artifacts.length || artifacts.length > 1000) add(['spec', 'artifacts'], 'Use 1–1000 outputs.');
  const names = new Set<string>();
  artifacts.forEach((a, i) => {
    const p = ['spec', 'artifacts', i];
    const name = text(a.name);
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) || name.length > 253 || names.has(name)) add([...p, 'name'], 'Enter a unique output name.');
    names.add(name);
    for (const key of ['revision', 'originRevision']) if (a[key] !== undefined && (!text(a[key]).startsWith('@') || !aliases.has(text(a[key]).slice(1)))) add([...p, key], 'Choose an existing source alias.');
    const copy = rows(a.copy);
    if (!copy.length) add([...p, 'copy'], 'Add at least one copy rule.');
    copy.forEach((c, j) => {
      const from = /^@([a-z0-9][a-z0-9_-]*)\/(.*)$/.exec(text(c.from));
      if (!from || !aliases.has(from[1]) || text(c.from).length > 1024) add([...p, 'copy', j, 'from'], 'Use @source-alias/glob with an existing source.');
      if (!text(c.to).startsWith('@artifact/') || text(c.to).length > 1024) add([...p, 'copy', j, 'to'], 'Use @artifact/path.');
      if (c.strategy !== undefined && !['Overwrite', 'Merge'].includes(text(c.strategy))) add([...p, 'copy', j, 'strategy'], 'Choose Overwrite or Merge.');
      if (c.exclude !== undefined && (!Array.isArray(c.exclude) || c.exclude.length > 100 || c.exclude.some(v => typeof v !== 'string'))) add([...p, 'copy', j, 'exclude'], 'Use at most 100 exclusion globs.');
    });
  });
  return issues;
}
export function unsupportedShape(draft: ResourceEditorDraft): string | null {
  for (const key of ['sources', 'artifacts']) {
    const value = draft.get(['spec', key]);
    if (value !== undefined && (!Array.isArray(value) || value.some(v => !v || typeof v !== 'object' || Array.isArray(v)))) return 'Unsupported source shape. Use YAML without converting this draft.';
  }
  for (const artifact of rows(draft.get(['spec', 'artifacts']))) if (artifact.copy !== undefined && (!Array.isArray(artifact.copy) || artifact.copy.some(v => !v || typeof v !== 'object' || Array.isArray(v)))) return 'Unsupported copy rules. Use YAML without converting this draft.';
  for (const source of rows(draft.get(['spec', 'sources']))) {
    if (['alias', 'kind', 'name', 'namespace'].some(key => source[key] !== undefined && typeof source[key] !== 'string')) return 'Unsupported source field type. Use YAML without converting this draft.';
  }
  for (const artifact of rows(draft.get(['spec', 'artifacts']))) {
    if (['name', 'revision', 'originRevision'].some(key => artifact[key] !== undefined && typeof artifact[key] !== 'string')) return 'Unsupported output field type. Use YAML without converting this draft.';
    for (const copy of rows(artifact.copy)) {
      if (['from', 'to', 'strategy'].some(key => copy[key] !== undefined && typeof copy[key] !== 'string') || (copy.exclude !== undefined && (!Array.isArray(copy.exclude) || copy.exclude.some(value => typeof value !== 'string')))) return 'Unsupported copy field type. Use YAML without converting this draft.';
    }
  }
  return null;
}
