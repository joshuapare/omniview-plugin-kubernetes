import { useEffect, useRef, useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection, ReferencePicker, type ReferenceQuery } from '../../editor-controls';
import { kinds, rows, sourceResources, text } from './domain';

export default function ArtifactGeneratorForm(form: ResourceEditorFormProps) {
  const { draft, context } = form;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const locked = form.disabled || context.intent === 'inspect' || context.ownership?.status !== 'application';
  useEffect(() => { form.onValidityChange(error || (Object.values(pending).some(Boolean) ? 'Correct the incomplete fields.' : null)); }, [error, pending, form.onValidityChange]);
  const commit = (operations: ResourceEditorPatch[]) => {
    const result = form.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations });
    setError(result.status === 'accepted' ? null : result.message);
  };
  const set = (path: ResourceEditorPath, value: string) => commit([value === '' ? { op: 'remove', path } : { op: 'set', path, value }]);
  const add = (path: ResourceEditorPath, count: number, value: unknown) => commit([draft.has(path) ? { op: 'insert', path, index: count, value } : { op: 'set', path, value: [value] }]);
  const remove = (path: ResourceEditorPath) => commit([{ op: 'remove', path }]);
  const sources = rows(draft.get(['spec', 'sources']));
  const artifacts = rows(draft.get(['spec', 'artifacts']));
  const aliases = sources.map(s => ({ value: `@${text(s.alias)}`, label: text(s.alias) })).filter(s => s.value !== '@');
  const field = (label: string, path: ResourceEditorPath, help?: string) => <BufferedField key={`${draft.sessionID}:${path.join('.')}`} label={label} path={path} value={text(draft.get(path))} disabled={locked} help={help} report={message => setPending(previous => ({ ...previous, [path.join('.')]: message }))} onCommit={value => set(path, value)} />;
  return <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
    {error && <div role="alert">{error}</div>}
    {context.ownership?.status !== 'application' && <div role="status">Owner-managed or unverified ownership: inspection only.</div>}
    {form.section === 'sources' && <EditorSection title="Source graph inputs">
      {sources.map((source, i) => {
        const p = ['spec', 'sources', i];
        const kind = text(source.kind);
        return <fieldset key={i} disabled={locked} style={{ minWidth: 0 }}><legend>Source {i + 1}</legend>
          {field('Alias', [...p, 'alias'], 'Unique lowercase alias. Copy and revision rules reference this alias.')}
          <EditorChoice label="Source kind" value={kind} options={kinds.map(value => ({ value, label: value }))} disabled={locked} onChange={value => set([...p, 'kind'], value)} />
          {field('Source namespace', [...p, 'namespace'], 'Omit to use the generator namespace. Cross-namespace access depends on source-watcher policy.')}
          {sourceResources[kind] ? <BufferedField key={`${draft.sessionID}:${i}:name`} label="Source name" path={[...p, 'name']} value={text(source.name)} disabled={locked} report={message => setPending(previous => ({ ...previous, [`source.${i}.name`]: message }))} onCommit={value => set([...p, 'name'], value)} form={form} query={{ group: 'source.toolkit.fluxcd.io', version: 'v1', resource: sourceResources[kind], namespace: text(source.namespace) || context.namespace, projection: 'metadata' }} /> : field('Source name', [...p, 'name'])}
          <Button size="sm" disabled={locked} onClick={() => remove(p)}>Remove source</Button>
        </fieldset>;
      })}
      <Button size="sm" disabled={locked || sources.length >= 1000} onClick={() => add(['spec', 'sources'], sources.length, { alias: '', kind: 'GitRepository', name: '' })}>Add source</Button>
    </EditorSection>}
    {form.section === 'outputs' && <EditorSection title="Generated outputs">
      <div role="note">Renaming or removing outputs can disrupt consumers.</div>
      {artifacts.map((artifact, i) => {
        const p = ['spec', 'artifacts', i];
        const copy = rows(artifact.copy);
        return <fieldset key={i} disabled={locked} style={{ minWidth: 0 }}><legend>Output {i + 1}</legend>
          {field('Output name', [...p, 'name'])}
          <EditorChoice label="Revision" value={text(artifact.revision)} options={[{ value: '', label: 'Content digest (default)' }, ...aliases]} disabled={locked} onChange={v => set([...p, 'revision'], v)} />
          <details><summary>Origin metadata</summary><EditorChoice label="Origin revision" value={text(artifact.originRevision)} options={[{ value: '', label: 'Omit' }, ...aliases]} disabled={locked} help="Uses source origin metadata only when available; not a guaranteed Git SHA." onChange={v => set([...p, 'originRevision'], v)} /></details>
          {copy.map((rule, j) => <fieldset key={j} style={{ minWidth: 0 }}><legend>Copy {j + 1}</legend>
            {field('From source / glob', [...p, 'copy', j, 'from'], 'Use @alias/glob. Rules run in order; later writes overwrite earlier files.')}
            {field('Destination', [...p, 'copy', j, 'to'], 'Use @artifact/path. This preview does not evaluate filesystem matches.')}
            <EditorChoice label="Copy strategy" value={text(rule.strategy)} options={[{ value: '', label: 'Default overwrite' }, { value: 'Overwrite', label: 'Overwrite' }, { value: 'Merge', label: 'Merge Helm values YAML' }]} disabled={locked} help="Merge applies Helm values YAML merge, not generic file merging." onChange={v => set([...p, 'copy', j, 'strategy'], v)} />
            <details><summary>Exclusion globs</summary>{(Array.isArray(rule.exclude) ? rule.exclude : []).map((_, k) => <div key={k}>{field(`Exclusion ${k + 1}`, [...p, 'copy', j, 'exclude', k])}<Button size="sm" disabled={locked} onClick={() => remove([...p, 'copy', j, 'exclude', k])}>Remove exclusion</Button></div>)}<Button size="sm" disabled={locked || (Array.isArray(rule.exclude) && rule.exclude.length >= 100)} onClick={() => add([...p, 'copy', j, 'exclude'], Array.isArray(rule.exclude) ? rule.exclude.length : 0, '')}>Add exclusion</Button></details>
            <Button size="sm" disabled={locked} onClick={() => remove([...p, 'copy', j])}>Remove copy rule</Button>
          </fieldset>)}
          <Button size="sm" disabled={locked} onClick={() => add([...p, 'copy'], copy.length, { from: '', to: '@artifact/' })}>Add copy rule</Button>
          <Button size="sm" disabled={locked} onClick={() => remove(p)}>Remove output</Button>
        </fieldset>;
      })}
      <Button size="sm" disabled={locked || artifacts.length >= 1000} onClick={() => add(['spec', 'artifacts'], artifacts.length, { name: '', copy: [] })}>Add output</Button>
    </EditorSection>}
    {form.section === 'graph' && <>
      <EditorSection title="Composition preview"><div role="note">Structural mapping only. No files fetched or generated.</div>{artifacts.map((a, i) => <section key={i}><h4>{text(a.name) || 'Unnamed output'}</h4><ol>{rows(a.copy).map((c, j) => <li key={j}>{text(c.from)} → {text(c.to)} · {text(c.strategy) || 'Overwrite'}</li>)}</ol></section>)}</EditorSection>
      <EditorSection title="Observed ExternalArtifacts">{rows(draft.get(['status', 'inventory'])).length ? rows(draft.get(['status', 'inventory'])).map((item, i) => <details key={i}><summary>{text(item.namespace)}/{text(item.name)}</summary><dl><dt>Digest</dt><dd>{text(item.digest)}</dd><dt>Filename</dt><dd>{text(item.filename)}</dd></dl></details>) : <div role="status">No observed generated artifacts.</div>}</EditorSection>
    </>}
  </div>;
}

interface BufferedFieldProps {
  label: string; path: ResourceEditorPath; value: string; disabled: boolean; help?: string;
  report(this: void, message: string): void; onCommit(this: void, value: string): void;
  form?: ResourceEditorFormProps; query?: ReferenceQuery;
}
function BufferedField(props: BufferedFieldProps) {
  return <BufferedFieldSession key={`${JSON.stringify(props.path)}/${props.value}`} {...props} />;
}
function BufferedFieldSession({ path, value, report, onCommit, form, query, ...props }: BufferedFieldProps) {
  const [local, setLocal] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef(report);
  useEffect(() => { reportRef.current = report; }, [report]);
  useEffect(() => () => reportRef.current(''), []);
  const key = String(path[path.length - 1]);
  const onChange = (next: string) => {
    setLocal(next);
    let valid = true;
    if (key === 'alias') valid = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/.test(next) && next.length <= 63;
    if (key === 'name' || key === 'namespace') valid = (key === 'namespace' && next === '') || (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(next) && next.length <= (key === 'namespace' ? 63 : 253));
    if (key === 'from') valid = /^@[a-z0-9]([a-z0-9_-]*[a-z0-9])?\/.*$/.test(next) && next.length <= 1024;
    if (key === 'to') valid = next.startsWith('@artifact/') && next.length <= 1024;
    const message = valid ? '' : 'Complete this field before applying.';
    setError(message || null);
    report(message);
    if (valid) onCommit(next);
  };
  return form && query ? <ReferencePicker {...props} value={local} error={error} onChange={onChange} form={form} query={query} /> : <EditorField {...props} value={local} error={error} onChange={onChange} />;
}
