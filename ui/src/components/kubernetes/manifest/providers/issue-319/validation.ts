import type { ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPath } from '@omniviewdev/runtime';

type Schema = { readonly [keyword: string]: unknown; type?: string; properties?: Readonly<Record<string, Schema>>; required?: readonly string[]; default?: unknown; items?: Schema };
/** Validate presence without serializing values or exposing protected content. */
export function requiredIssues(draft: ResourceEditorDraft, schema: Schema, path: ResourceEditorPath = ['spec']): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  for (const key of schema.required ?? []) {
    const child = schema.properties?.[key];
    if (child?.default === undefined && !draft.has([...path, key])) issues.push({ path: [...path, key], message: `${key} is required.` });
  }
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    const childPath = [...path, key];
    if (!draft.has(childPath)) continue;
    if (/^(data|state|resource|body|headers|caBundle|parameters|tokenCode|password|token|clientSecret|url)$/i.test(key)) continue;
    const value = draft.get(childPath);
    if (child.properties && value && typeof value === 'object' && !Array.isArray(value)) issues.push(...requiredIssues(draft, child, childPath));
    if (child.items && Array.isArray(value)) value.forEach((_, index) => issues.push(...requiredIssues(draft, child.items!, [...childPath, index])));
  }
  return issues;
}
