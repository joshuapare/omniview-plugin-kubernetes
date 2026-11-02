import { Button, Input, TextArea } from '@omniviewdev/base-ui';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorChoice as Choice, EditorField, EditorHelp, EditorSection, ReferencePicker, patchError, patchFields } from '../../editor-controls';
import { clientPath, controlled, diffSchema, dnsLabel, dnsName, endpointOperations, established, groupName, kindName, listValue, object, parseSchema, remove, removeVersion, rows, schemaSource, selectStorage, set, simplePath, strings, text, urlError, validateCRD, versionName, versionPath, versionsPath, webhookPath } from './model';
import './crd.css';

type Commit = (operations: readonly ResourceEditorPatch[]) => string | null;
type Report = (key: string, error: string | null) => void;
interface Session { form: ResourceEditorFormProps; commit: Commit; report: Report; locked: boolean }

/** Invalid text stays local; a source edit to this leaf replaces only this field's local buffer. */
function Leaf({ session, path, label, help, validate, optional: omitEmpty, disabled, referenceNamespace, parse, endpoint = false }: {
  session: Session; path: ResourceEditorPath; label: string; help?: string; validate?: (value: string) => string | null;
  optional?: boolean; disabled?: boolean; referenceNamespace?: string; parse?: (value: string) => unknown; endpoint?: boolean;
}) {
  const current = session.form.draft.get(path);
  // Never seed an endpoint control with private or opaque canonical references.
  const canonical = endpoint ? typeof current === 'string' && !urlError(current) ? current : '' : Array.isArray(current) ? strings(current).join(', ') : text(current);
  const key = JSON.stringify(path);
  const identity = JSON.stringify([session.form.draft.sessionID, path, canonical]);
  const [edit, setEdit] = useState<{ identity: string; value: string; error: string | null }>({ identity, value: canonical, error: null });
  if (edit.identity !== identity) setEdit({ identity, value: canonical, error: null });
  const { value, error } = edit.identity === identity ? edit : { value: canonical, error: null };
  const report = session.report;
  useEffect(() => { report(key, error); return () => report(key, null); }, [key, error, report]);
  const field = { label, value, help, placeholder: endpoint && current !== undefined && canonical === '' ? 'Stored reference unchanged' : undefined, error, disabled: session.locked || disabled, onChange: (next: string) => {
    const problem = next === '' && omitEmpty ? null : validate?.(next) ?? null;
    const failure = problem ?? session.commit([next === '' && omitEmpty ? remove(path) : set(path, parse ? parse(next) : next)]);
    setEdit({ identity, value: next, error: failure }); report(key, failure);
  } };
  return referenceNamespace !== undefined
    ? <ReferencePicker {...field} form={session.form} query={{ group: '', version: 'v1', resource: 'services', namespace: referenceNamespace, projection: 'metadata' }} />
    : <EditorField {...field} />;
}
function Toggle({ session, label, value, onChange, help, disabled }: { session: Session; label: string; value: boolean; onChange: (value: boolean) => void; help?: string; disabled?: boolean }) {
  return <div className="crd-toggle"><label><input type="checkbox" checked={value} disabled={session.locked || disabled} onChange={event => onChange(event.target.checked)} />{label}</label>{help && <EditorHelp label={label}>{help}</EditorHelp>}</div>;
}
const nameCheck = (value: string) => dnsLabel(value) ? null : 'Enter a lowercase DNS name.';
const pathCheck = (prefix?: 'spec' | 'status') => (value: string) => simplePath(value) && (!prefix || value.startsWith(`.${prefix}.`)) ? null : `Enter a simple path${prefix ? ` under .${prefix}` : ''}.`;
const listCheck = (check: (value: string) => boolean) => (value: string) => listValue(value).every(check) ? null : 'One or more entries are invalid.';

function Schema({ session, index }: { session: Session; index: number }) {
  const path = versionPath(index, 'schema', 'openAPIV3Schema');
  const initial = schemaSource(session.form.draft.get(path));
  const [value, setValue] = useState(initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const id = useId();
  const key = JSON.stringify(path);
  const lastApplied = useRef(initial);
  const report = session.report;
  useEffect(() => {
    if (initial !== lastApplied.current) { setValue(initial ?? ''); setDirty(false); setError(null); report(key, null); lastApplied.current = initial; }
  }, [initial, report, key]);
  useEffect(() => () => report(key, null), [key, report]);
  if (initial === null) return <p role="status">Schema includes protected values. Use the host source workflow; other version fields remain editable.</p>;
  return <details className="crd-advanced"><summary>Structural schema</summary>
    <div className="crd-label"><label htmlFor={id}>OpenAPI v3 schema</label><EditorHelp label="OpenAPI v3 schema">Schema changes can prune existing fields. Structural rules, CEL and schema-path compatibility require API-server validation. Only changed leaves are patched.</EditorHelp></div>
    <TextArea.Root><TextArea.Control id={id} rows={13} value={value} disabled={session.locked} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} spellCheck={false} onChange={event => {
      const next = event.target.value; setValue(next); setDirty(true);
      let failure: string | null = null;
      try { parseSchema(next); } catch { failure = 'Enter one object structural schema without aliases or protected values.'; }
      setError(failure); report(key, failure ?? 'Apply pending schema changes.');
    }} /></TextArea.Root>
    {error && <span id={`${id}-error`} role="alert">{error}</span>}
    <div className="crd-actions"><Button size="sm" disabled={session.locked || !dirty || !!error} onClick={() => {
      try {
        const parsed = parseSchema(value);
        const failure = session.commit(diffSchema(session.form.draft.get(path), parsed, path));
        setError(failure); report(key, failure);
        if (!failure) { lastApplied.current = schemaSource(parsed); setDirty(false); }
      } catch { setError('Schema cannot be safely applied.'); report(key, 'Schema cannot be safely applied.'); }
    }}>Apply schema</Button><Button size="sm" variant="ghost" disabled={!dirty} onClick={() => { setValue(initial); setDirty(false); setError(null); report(key, null); }}>Discard schema changes</Button></div>
  </details>;
}

function Names({ session }: { session: Session }) {
  const { form } = session;
  const editing = form.context.intent !== 'create';
  const fixed = editing && (!form.baseline || established(form.baseline));
  return <EditorSection title="Names and scope"><div className="crd-grid">
    <Leaf session={session} label="API group" path={['spec', 'group']} disabled={editing} validate={value => groupName(value) ? null : 'Enter a dotted DNS API group.'} help="Group and resource plural are immutable. Set the host Definition name to plural.group." />
    <Leaf session={session} label="Resource plural" path={['spec', 'names', 'plural']} disabled={editing} validate={nameCheck} />
    <Leaf session={session} label="Kind" path={['spec', 'names', 'kind']} disabled={fixed} validate={value => kindName(value) ? null : 'Enter a kind identifier.'} />
    <Choice label="Custom resource scope" value={text(form.draft.get(['spec', 'scope']))} disabled={session.locked || fixed} options={[{ value: 'Namespaced', label: 'Namespaced' }, { value: 'Cluster', label: 'Cluster' }]} onChange={value => session.commit([set(['spec', 'scope'], value)])} help="The definition itself is always cluster-scoped. Instance scope and kind become immutable once Established." />
  </div><p className="crd-consequence">Definition name: {text(form.draft.get(['spec', 'names', 'plural'])) || 'plural'}.{text(form.draft.get(['spec', 'group'])) || 'group'}</p>
  <details className="crd-advanced"><summary>Discovery names</summary><div className="crd-grid">
    <Leaf session={session} label="Singular" path={['spec', 'names', 'singular']} optional validate={nameCheck} />
    <Leaf session={session} label="List kind" path={['spec', 'names', 'listKind']} optional validate={value => kindName(value) ? null : 'Enter a kind identifier.'} />
    <Leaf session={session} label="Short names" path={['spec', 'names', 'shortNames']} optional validate={listCheck(dnsLabel)} parse={listValue} help="Comma-separated lowercase aliases exposed through discovery." />
    <Leaf session={session} label="Categories" path={['spec', 'names', 'categories']} optional validate={listCheck(dnsLabel)} parse={listValue} help="Comma-separated discovery categories." />
  </div></details></EditorSection>;
}

function Versions({ session }: { session: Session }) {
  const { form } = session;
  const versions = rows(form.draft.get(versionsPath));
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  return <EditorSection title="Versions and validation">
    {versions.map((version, index) => { const row = object(version) ?? {}; const stored = strings(form.draft.get(['status', 'storedVersions'])).includes(text(row.name)); return <fieldset key={index} className="crd-card"><legend>{text(row.name) || `Version ${index + 1}`}{stored ? ' · stored' : ''}</legend>
      <div className="crd-grid"><Leaf session={session} label={`Version name ${index + 1}`} path={versionPath(index, 'name')} disabled={stored} validate={value => versionName(value) && !versions.some((item, other) => other !== index && object(item)?.name === value) ? null : 'Enter a unique DNS version name.'} />
        <div className="crd-actions"><Toggle session={session} label={`Serve ${text(row.name) || index + 1}`} value={row.served === true} onChange={value => session.commit([set(versionPath(index, 'served'), value)])} help="Disabling a served version breaks clients using that API endpoint." />
          <label className="crd-storage"><input type="radio" name={`storage-${form.draft.sessionID}`} checked={row.storage === true} disabled={session.locked} onChange={() => session.commit(selectStorage(form.draft, index))} />Storage version</label>
        </div></div>
      <Toggle session={session} label={`Deprecate ${text(row.name) || index + 1}`} value={row.deprecated === true} onChange={value => session.commit([set(versionPath(index, 'deprecated'), value), ...(!value ? [remove(versionPath(index, 'deprecationWarning'))] : [])])} />
      {row.deprecated === true && <Leaf session={session} label={`Deprecation warning ${index + 1}`} path={versionPath(index, 'deprecationWarning')} optional help="Optional warning returned in API response headers." />}
      <Schema session={session} index={index} />
      <Button size="sm" variant="ghost" disabled={session.locked || stored || row.storage === true || versions.length <= 1} onClick={() => { try { session.commit(removeVersion(form.draft, index)); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Cannot remove this version.'); } }}>Remove version {text(row.name)}</Button>
    </fieldset>; })}
    <div className="crd-actions"><EditorField label="New API version" value={name} onChange={setName} disabled={session.locked} error={error} /><Button size="sm" disabled={session.locked || !name} onClick={() => {
      if (!versionName(name) || versions.some(version => object(version)?.name === name)) { setError('Enter a unique DNS version name.'); return; }
      const version = { name, served: true, storage: versions.length === 0, schema: { openAPIV3Schema: { type: 'object', properties: {} } } };
      const failure = session.commit(form.draft.has(versionsPath) ? [{ op: 'insert', path: versionsPath, index: versions.length, value: version }] : [set(versionsPath, [version])]);
      setError(failure); if (!failure) setName('');
    }}>Add version</Button></div><p className="crd-consequence">Storage selection does not migrate stored objects. Retain stored versions until migration and status cleanup finish.</p>
  </EditorSection>;
}


function TrustBundle({ session }: { session: Session }) {
  const path = [...clientPath, 'caBundle'];
  const [replacement, setReplacement] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const id = useId();
  const report = session.report;
  useEffect(() => () => report('caBundle', null), [report]);
  return <details className="crd-advanced"><summary>Certificate trust</summary>
    <p>{session.form.draft.has(path) ? 'CA bundle retained and masked.' : 'API-server system trust roots are used.'}</p>
    <div className="crd-actions"><Button size="sm" variant="ghost" disabled={session.locked} onClick={() => { setReplace(!replace); setReplacement(''); setError(null); report('caBundle', null); }}>{replace ? 'Cancel replacement' : 'Replace CA bundle'}</Button>
      <Button size="sm" variant="ghost" disabled={session.locked || !session.form.draft.has(path)} onClick={() => { const failure = session.commit([remove(path)]); setError(failure); report('caBundle', failure); setReplacement(''); }}>Use system roots</Button></div>
    {replace && <><label htmlFor={id}>New CA bundle (Base64)</label><Input.Root size="sm" invalid={!!error}><Input.Control id={id} type="password" autoComplete="new-password" value={replacement} disabled={session.locked} onChange={event => { setReplacement(event.target.value); report('caBundle', event.target.value ? 'Apply pending CA bundle replacement.' : null); }} /></Input.Root>
      <Button size="sm" disabled={session.locked || !replacement} onClick={() => {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(replacement)) { setError('Enter a valid Base64 bundle.'); report('caBundle', 'Enter a valid Base64 bundle.'); return; }
        const failure = session.commit([set(path, replacement)]); setError(failure); report('caBundle', failure); if (!failure) { setReplacement(''); setReplace(false); }
      }}>Apply CA bundle</Button></>}{error && <span role="alert">{error}</span>}
  </details>;
}

function Conversion({ session }: { session: Session }) {
  const draft = session.form.draft;
  const strategy = text(draft.get(['spec', 'conversion', 'strategy'])) || 'None';
  const endpoint = draft.has([...clientPath, 'url']) ? 'url' : 'service';
  return <EditorSection title="Version conversion"><Choice label="Conversion strategy" value={strategy} disabled={session.locked} options={[{ value: 'None', label: 'None — change API version only' }, { value: 'Webhook', label: 'Conversion webhook' }]} onChange={value => {
    session.commit([set(['spec', 'conversion', 'strategy'], value), ...(value === 'None' ? [remove(webhookPath)] : draft.has(webhookPath) ? [] : [set([...webhookPath, 'conversionReviewVersions'], ['v1'])])]);
  }} help="No conversion controller or webhook Service is installed by this editor." />
    {strategy === 'Webhook' && <><p className="crd-consequence">Webhook failure can block reads and writes for custom resources.</p>
      <Choice label="Webhook endpoint" value={endpoint} disabled={session.locked} options={[{ value: 'service', label: 'Existing Service' }, { value: 'url', label: 'HTTPS URL' }]} onChange={value => session.commit(endpointOperations(draft, value as 'service' | 'url'))} />
      {endpoint === 'url' ? <Leaf session={session} label="HTTPS endpoint" path={[...clientPath, 'url']} endpoint validate={urlError} help="Do not embed credentials. Private or opaque stored endpoints stay hidden until replaced. Use a Service reference for in-cluster endpoints." /> : <div className="crd-grid">
        <Leaf session={session} label="Service namespace" path={[...clientPath, 'service', 'namespace']} validate={nameCheck} />
        <Leaf session={session} label="Service name" path={[...clientPath, 'service', 'name']} validate={value => dnsName(value) ? null : 'Enter a valid Service name.'} referenceNamespace={text(draft.get([...clientPath, 'service', 'namespace']))} help="Select an existing Service or keep an unresolved manual reference. No Service is created." />
        <Leaf session={session} label="Service path" path={[...clientPath, 'service', 'path']} optional validate={value => value.startsWith('/') ? null : 'Path must start with /.'} />
        <Leaf session={session} label="Service port" path={[...clientPath, 'service', 'port']} optional validate={value => /^\d+$/.test(value) && BigInt(value) >= 1n && BigInt(value) <= 65535n ? null : 'Enter a port from 1 to 65535.'} parse={value => BigInt(value)} help="Omit to use API default 443." />
      </div>}
      <Leaf session={session} label="ConversionReview versions" path={[...webhookPath, 'conversionReviewVersions']} validate={value => listValue(value).length && listValue(value).every(versionName) ? null : 'Enter an ordered comma-separated version list.'} parse={listValue} help="The API server chooses the first supported version. Include v1 or v1beta1; this is a webhook protocol, not a resource." />
      <TrustBundle session={session} />
    </>}
  </EditorSection>;
}

function Subresources({ session }: { session: Session }) {
  const versions = rows(session.form.draft.get(versionsPath));
  return <EditorSection title="Status and scale endpoints">{versions.map((version, index) => {
    const status = versionPath(index, 'subresources', 'status'); const scale = versionPath(index, 'subresources', 'scale');
    return <fieldset key={index} className="crd-card"><legend>{text(object(version)?.name) || `Version ${index + 1}`}</legend>
      <Toggle session={session} label={`Status endpoint ${index + 1}`} value={session.form.draft.has(status)} onChange={value => session.commit([value ? set(status, {}) : remove(status)])} help="Declares a /status endpoint for instances. Does not edit CRD or instance status." />
      <Toggle session={session} label={`Scale endpoint ${index + 1}`} value={session.form.draft.has(scale)} onChange={value => session.commit([value ? set(scale, { specReplicasPath: '', statusReplicasPath: '' }) : remove(scale)])} help="Declares autoscaling/v1 Scale mapping. Does not resize any resource." />
      {session.form.draft.has(scale) && <div className="crd-grid"><Leaf session={session} label={`Desired replicas path ${index + 1}`} path={[...scale, 'specReplicasPath']} validate={pathCheck('spec')} />
        <Leaf session={session} label={`Observed replicas path ${index + 1}`} path={[...scale, 'statusReplicasPath']} validate={pathCheck('status')} />
        <Leaf session={session} label={`Label selector path ${index + 1}`} path={[...scale, 'labelSelectorPath']} optional validate={value => /^\.(spec|status)\./.test(value) ? pathCheck()(value) : 'Use a path under .spec or .status.'} help="HPA requires this string field containing a serialized label selector." />
      </div>}
    </fieldset>;
  })}</EditorSection>;
}

function Columns({ session }: { session: Session }) {
  const selectableAvailable = session.form.context.discovery.features.CustomResourceFieldSelectors === 'available';
  return <EditorSection title="Printer columns and field selectors">{rows(session.form.draft.get(versionsPath)).map((version, index) => {
    const columns = versionPath(index, 'additionalPrinterColumns'); const fields = versionPath(index, 'selectableFields');
    const columnRows = rows(session.form.draft.get(columns)); const fieldRows = rows(session.form.draft.get(fields));
    const append = (path: ResourceEditorPath, value: unknown) => session.commit(session.form.draft.has(path) ? [{ op: 'insert', path, index: rows(session.form.draft.get(path)).length, value }] : [set(path, [value])]);
    return <fieldset key={index} className="crd-card"><legend>{text(object(version)?.name) || `Version ${index + 1}`}</legend>
      {columnRows.map((column, columnIndex) => { const path = [...columns, columnIndex]; return <div className="crd-card" key={columnIndex}><div className="crd-grid">
        <Leaf session={session} label={`Column name ${index + 1}.${columnIndex + 1}`} path={[...path, 'name']} validate={value => value ? null : 'Enter a column name.'} />
        <Choice label={`Column type ${index + 1}.${columnIndex + 1}`} value={text(object(column)?.type)} disabled={session.locked} options={['string', 'integer', 'number', 'boolean', 'date'].map(value => ({ value, label: value }))} onChange={value => session.commit([set([...path, 'type'], value)])} />
        <Leaf session={session} label={`Column JSONPath ${index + 1}.${columnIndex + 1}`} path={[...path, 'jsonPath']} validate={value => value.startsWith('.') ? null : 'JSONPath must start with a dot.'} />
        <Leaf session={session} label={`Column priority ${index + 1}.${columnIndex + 1}`} path={[...path, 'priority']} optional validate={value => /^\d+$/.test(value) && BigInt(value) <= 2147483647n ? null : 'Enter a nonnegative int32.'} parse={value => BigInt(value)} />
      </div><details className="crd-advanced"><summary>Column details</summary><Leaf session={session} label={`Column format ${index + 1}.${columnIndex + 1}`} path={[...path, 'format']} optional /><Leaf session={session} label={`Column description ${index + 1}.${columnIndex + 1}`} path={[...path, 'description']} optional /></details>
      <Button size="sm" variant="ghost" disabled={session.locked} onClick={() => session.commit([remove(path)])}>Remove column {columnIndex + 1}</Button></div>; })}
      <Button size="sm" disabled={session.locked} onClick={() => append(columns, { name: '', type: 'string', jsonPath: '' })}>Add printer column</Button>
      <details className="crd-advanced"><summary>Selectable fields</summary>
        {!selectableAvailable && <p role="status">Field-selector support is not confirmed. Existing declarations are retained.</p>}
        {fieldRows.map((_, fieldIndex) => <div className="crd-actions" key={fieldIndex}><Leaf session={session} label={`Selectable JSONPath ${index + 1}.${fieldIndex + 1}`} path={[...fields, fieldIndex, 'jsonPath']} disabled={!selectableAvailable} validate={value => simplePath(value) && !value.startsWith('.metadata') ? null : 'Use a simple non-metadata field path.'} help="Path must resolve to a string, boolean or integer. API-server schema validation is authoritative." /><Button size="sm" variant="ghost" disabled={session.locked || !selectableAvailable} onClick={() => session.commit([remove([...fields, fieldIndex])])}>Remove field {fieldIndex + 1}</Button></div>)}
        <Button size="sm" disabled={session.locked || !selectableAvailable || fieldRows.length >= 8} onClick={() => append(fields, { jsonPath: '' })}>Add selectable field</Button>
      </details>
    </fieldset>;
  })}</EditorSection>;
}

function Inspection({ session }: { session: Session }) {
  const draft = session.form.draft;
  const status = object(draft.get(['status']));
  const managers = [...new Set(rows(draft.get(['metadata', 'managedFields'])).map(row => text(object(row)?.manager)).filter(Boolean))];
  const accepted = object(status?.acceptedNames);
  const tracksGeneration = status?.observedGeneration !== undefined || rows(status?.conditions).some(condition => object(condition)?.observedGeneration !== undefined);
  return <EditorSection title="Status and ownership"><dl className="crd-facts"><dt>Stored versions</dt><dd>{strings(status?.storedVersions).join(', ') || 'Not reported'}</dd>
    <dt>Accepted plural</dt><dd>{text(object(status?.acceptedNames)?.plural) || 'Not reported'}</dd><dt>Accepted kind</dt><dd>{text(object(status?.acceptedNames)?.kind) || 'Not reported'}</dd>
    <dt>Accepted singular / list kind</dt><dd>{[text(accepted?.singular), text(accepted?.listKind)].filter(Boolean).join(' / ') || 'Not reported'}</dd>
    <dt>Accepted aliases / categories</dt><dd>{[strings(accepted?.shortNames).join(', '), strings(accepted?.categories).join(', ')].filter(Boolean).join(' / ') || 'Not reported'}</dd>
    {tracksGeneration && <><dt>Observed generation</dt><dd>{text(status?.observedGeneration) || 'Not reported'}</dd></>}
    <dt>Field managers</dt><dd>{managers.join(', ') || 'Not reported'}</dd><dt>Controller owner</dt><dd>{controlled(draft) ? 'Controller-owned · inspection only' : 'No controller owner reported'}</dd>
    <dt>Discovery</dt><dd>{session.form.context.discovery.status}</dd><dt>Schema</dt><dd>{session.form.context.schema.status}</dd><dt>Create / update</dt><dd>{session.form.context.capabilities.create} / {session.form.context.capabilities.update}</dd>
  </dl>{rows(status?.conditions).map((condition, index) => { const row = object(condition) ?? {}; return <div className="crd-condition" key={index}><strong>{text(row.type)}</strong><span>{text(row.status)}</span><span>{text(row.reason)}</span><span>{text(row.lastTransitionTime)}</span>{tracksGeneration && row.observedGeneration !== undefined && <span>Observed generation {text(row.observedGeneration)}</span>}</div>; })}
  <p role="status">Status is server-owned. No status writes or ownership takeover.</p></EditorSection>;
}

function Review({ session }: { session: Session }) {
  const { draft, context } = session.form;
  const versions = rows(draft.get(versionsPath));
  return <EditorSection title="Definition change review"><dl className="crd-facts">
    <dt>Destination</dt><dd>{context.connectionID} · cluster-scoped definition</dd>
    <dt>Definition</dt><dd>{text(draft.get(['metadata', 'name'])) || 'Name required'}</dd>
    <dt>Custom resource scope</dt><dd>{text(draft.get(['spec', 'scope'])) || 'Scope required'}</dd>
    <dt>Served versions</dt><dd>{versions.filter(version => object(version)?.served === true).map(version => text(object(version)?.name)).join(', ') || 'None'}</dd>
    <dt>Storage version</dt><dd>{versions.filter(version => object(version)?.storage === true).map(version => text(object(version)?.name)).join(', ') || 'None'}</dd>
    <dt>Conversion</dt><dd>{text(draft.get(['spec', 'conversion', 'strategy'])) || 'None'}</dd>
  </dl><ul className="crd-consequences"><li>Definition changes affect cluster-wide API discovery.</li><li>Schema changes can prune stored fields.</li><li>Disabling served versions breaks clients.</li><li>Storage selection does not migrate objects.</li>{draft.get(['spec', 'conversion', 'strategy']) === 'Webhook' && <li>Webhook failure can block custom-resource reads and writes.</li>}</ul>
  <p role="status">Draft review only. No resource mutation occurs in this review.</p></EditorSection>;
}

export default function CustomResourceDefinitionEditor(form: ResourceEditorFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [patchFailure, setPatchFailure] = useState<string | null>(null);
  const report = useCallback<Report>((key, error) => setErrors(previous => {
    if (previous[key] === error || !error && !Object.hasOwn(previous, key)) return previous;
    const next = { ...previous }; if (error) next[key] = error; else delete next[key]; return next;
  }), []);
  const validity = Object.values(errors)[0] ?? patchFailure;
  useEffect(() => form.onValidityChange(validity ?? null), [validity, form.onValidityChange]);
  const commit = useCallback<Commit>(operations => {
    const failure = patchError(patchFields(form, operations)); setPatchFailure(failure); return failure;
  }, [form]);
  const ownership = form.context.ownership?.status;
  const locked = form.disabled || form.context.intent === 'inspect' || controlled(form.draft) || ownership === 'controller' || ownership === 'system'
    || form.context.intent === 'create' && form.context.capabilities.create !== 'available'
    || form.context.intent === 'edit' && form.context.capabilities.update !== 'available';
  const session = useMemo<Session>(() => ({ form, commit, report, locked }), [form, commit, report, locked]);
  const fieldIssues = validateCRD(form.draft, form.context).filter(issue => {
    const section = issue.path[0] === 'metadata' || ['group', 'names', 'scope'].includes(String(issue.path[1])) ? 'names'
      : issue.path[1] === 'conversion' ? 'conversion'
        : issue.path.includes('subresources') ? 'subresources'
          : issue.path.includes('additionalPrinterColumns') || issue.path.includes('selectableFields') ? 'columns' : 'versions';
    return section === form.section;
  });
  return <div className="crd-editor">{locked && <p role="status">Read-only inspection</p>}{patchFailure && <p role="alert">{patchFailure}</p>}
    {fieldIssues.length > 0 && <ul role="alert" className="crd-field-issues">{fieldIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
    <div hidden={form.section !== 'names'}><Names session={session} /></div>
    <div hidden={form.section !== 'versions'}><Versions session={session} /></div>
    <div hidden={form.section !== 'conversion'}><Conversion session={session} /></div>
    <div hidden={form.section !== 'subresources'}><Subresources session={session} /></div>
    <div hidden={form.section !== 'columns'}><Columns session={session} /></div>
    <div hidden={form.section !== 'status'}><Inspection session={session} /></div>
    <div hidden={form.section !== 'review'}><Review session={session} /></div>
  </div>;
}
