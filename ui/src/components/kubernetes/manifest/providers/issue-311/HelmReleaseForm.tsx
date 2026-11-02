import { useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorField, EditorChoice, EditorSection, ExactValueField, ReferencePicker, useFieldValidity } from '../../editor-controls';
import { canRemoveBranch, duration, requestOperations, text } from './semantics';
const options = (values: string[]) => values.map(value => ({ value, label: value || 'Default (omit)' }));
export default function HelmReleaseForm(form: ResourceEditorFormProps) {
  const { draft } = form;
  const report = useFieldValidity(form);
  const [error, setError] = useState<string | null>(null);
  const disabled = form.disabled || form.context.intent === 'inspect' || form.context.ownership?.status !== 'application';
  const get = (path: ResourceEditorPath) => text(draft.get(path));
  const commit = (operations: ResourceEditorPatch[]) => {
    if (disabled) return 'Editing is unavailable.';
    const result = form.patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations });
    const failure = result.status === 'accepted' ? null : 'Change was not accepted. Review current source and permissions.';
    setError(failure); report('patch', failure); return failure;
  };
  const set = (path: ResourceEditorPath, value: unknown) => commit([value === '' ? { op: 'remove', path } : { op: 'set', path, value }]);
  const field = (label: string, path: ResourceEditorPath, help?: string) => <EditorField key={path.join('.')} label={label} value={get(path)} disabled={disabled} help={help} onChange={value => set(path, value)} />;
  const choice = (label: string, path: ResourceEditorPath, values: string[], help?: string) => <EditorChoice label={label} value={get(path)} options={options(values)} disabled={disabled} help={help} onChange={value => set(path, value)} />;
  const timed = (label: string, path: ResourceEditorPath, required = false) => <ExactValueField label={label} identity={`${draft.sessionID}/${path.join('/')}`} value={get(path)} disabled={disabled} parse={value => (!value && !required) || duration.test(value) ? { valid: true, value } : { valid: false, error: 'Use a duration such as 5m or 30s.' }} onCommit={value => set(path, value)} onValidityChange={failure => report(path.join('/'), failure)} />;
  const reference = (label: string, path: ResourceEditorPath, group: string, version: string, resource: string, namespace = form.context.namespace) => <ReferencePicker label={label} form={form} value={get(path)} disabled={disabled} query={{ group, version, resource, namespace, projection: 'metadata' }} onChange={value => set(path, value)} />;
  const rows = (kind: 'valuesFrom' | 'dependsOn') => {
    const path = ['spec', kind]; const value = draft.get(path); const items = Array.isArray(value) ? value : [];
    return <EditorSection title={kind === 'valuesFrom' ? 'Ordered values references' : 'Release dependencies'}>{items.map((_item, index) => {
      const row = [...path, index]; const values = kind === 'valuesFrom';
      return <EditorSection key={index} title={`${values ? 'Values' : 'Dependency'} ${index + 1}`}>
        {values && choice('Kind', [...row, 'kind'], ['ConfigMap', 'Secret'])}
        {reference('Name', [...row, 'name'], values ? '' : 'helm.toolkit.fluxcd.io', values ? 'v1' : 'v2', values ? get([...row, 'kind']) === 'Secret' ? 'secrets' : 'configmaps' : 'helmreleases', values ? form.context.namespace : get([...row, 'namespace']) || form.context.namespace)}
        {values ? <>{field('Values key', [...row, 'valuesKey'])}{field('Target path', [...row, 'targetPath'], 'Overrides earlier values, including inline values at this path.')}
          <EditorChoice label="Missing object" value={draft.get([...row, 'optional']) === true ? 'optional' : 'required'} options={options(['required', 'optional'])} disabled={disabled} onChange={value => set([...row, 'optional'], value === 'optional')} /></> : <>{field('Namespace', [...row, 'namespace'], 'Cross-namespace access depends on controller policy.')}{field('Readiness CEL', [...row, 'readyExpr'], 'Replaces built-in readiness unless AdditiveCELDependencyCheck is enabled. Server validates CEL.')}</>}
        <Button size="sm" disabled={disabled} onClick={() => commit([{ op: 'remove', path: row }])}>Remove {values ? 'values reference' : 'dependency'}</Button>
      </EditorSection>;
    })}<Button size="sm" disabled={disabled} onClick={() => commit([draft.has(path) ? { op: 'insert', path, index: items.length, value: kind === 'valuesFrom' ? { kind: 'ConfigMap', name: '' } : { name: '' } } : { op: 'set', path, value: [kind === 'valuesFrom' ? { kind: 'ConfigMap', name: '' } : { name: '' }] }])}>Add {kind === 'valuesFrom' ? 'values reference' : 'dependency'}</Button></EditorSection>;
  };
  const artifact = draft.has(['spec', 'chartRef']);
  const kind = get(artifact ? ['spec', 'chartRef', 'kind'] : ['spec', 'chart', 'spec', 'sourceRef', 'kind']);
  return <div>{error && <div role="alert">{error}</div>}{disabled && <div role="status">Read-only · ownership or permissions restrict editing.</div>}
    {form.section === 'chart' && <EditorSection title="Chart and destination">
      {timed('Reconcile interval', ['spec', 'interval'], true)}
      <EditorChoice label="Chart source" value={artifact ? 'artifact' : 'template'} options={options(['template', 'artifact'])} disabled={disabled} help="Template creates a controller-owned HelmChart. Artifact reuses an existing chart artifact." onChange={value => {
        const old = artifact ? ['spec', 'chartRef'] : ['spec', 'chart'];
        const safe = artifact ? canRemoveBranch(draft.get(old), ['kind', 'name', 'namespace']) : canRemoveBranch(draft.get(old), ['spec']) && canRemoveBranch(draft.get([...old, 'spec']), ['chart', 'version', 'sourceRef']) && canRemoveBranch(draft.get([...old, 'spec', 'sourceRef']), ['kind', 'name', 'namespace']);
        if (!safe) { setError('Chart contains source-owned fields. Change chart source in protected YAML.'); return; }
        commit([{ op: 'remove', path: old }, { op: 'set', path: value === 'artifact' ? ['spec', 'chartRef'] : ['spec', 'chart'], value: value === 'artifact' ? { kind: 'OCIRepository', name: '' } : { spec: { chart: '', sourceRef: { kind: 'HelmRepository', name: '' } } } }]);
      }} />
      {choice('Source kind', artifact ? ['spec', 'chartRef', 'kind'] : ['spec', 'chart', 'spec', 'sourceRef', 'kind'], artifact ? ['OCIRepository', 'HelmChart', 'ExternalArtifact'] : ['HelmRepository', 'GitRepository', 'Bucket'], 'ExternalArtifact requires controller feature support. API discovery alone does not prove that support.')}
      {reference('Source name', artifact ? ['spec', 'chartRef', 'name'] : ['spec', 'chart', 'spec', 'sourceRef', 'name'], kind === 'ExternalArtifact' ? 'source.extensions.fluxcd.io' : 'source.toolkit.fluxcd.io', kind === 'OCIRepository' || kind === 'ExternalArtifact' ? 'v1' : 'v1', ({ HelmRepository: 'helmrepositories', GitRepository: 'gitrepositories', Bucket: 'buckets', OCIRepository: 'ocirepositories', HelmChart: 'helmcharts', ExternalArtifact: 'externalartifacts' } as Record<string, string>)[kind] || 'helmrepositories', get(artifact ? ['spec', 'chartRef', 'namespace'] : ['spec', 'chart', 'spec', 'sourceRef', 'namespace']) || form.context.namespace)}
      {!artifact && <>{field('Chart name or path', ['spec', 'chart', 'spec', 'chart'])}{kind === 'HelmRepository' && field('Chart version', ['spec', 'chart', 'spec', 'version'], 'Omission follows upstream latest-version behavior.')}</>}
      {field('Source namespace', artifact ? ['spec', 'chartRef', 'namespace'] : ['spec', 'chart', 'spec', 'sourceRef', 'namespace'], 'Cross-namespace access depends on controller policy. Omission uses this release namespace.')}
      {field('Release name', ['spec', 'releaseName'])}{field('Target namespace', ['spec', 'targetNamespace'])}{field('Storage namespace', ['spec', 'storageNamespace'])}
      {form.context.intent === 'edit' && <div role="note">Changing release name or destination can uninstall and reinstall the release.</div>}
    </EditorSection>}
    {form.section === 'values' && <>{rows('valuesFrom')}<div role="note">Inline values remain protected source-owned. References never fetch Secret data.</div></>}
    {form.section === 'dependencies' && rows('dependsOn')}
    {form.section === 'lifecycle' && <EditorSection title="Upgrade and recovery">
      <EditorChoice label="Upgrade strategy" value={get(['spec', 'upgrade', 'strategy', 'name'])} options={options(['', 'RemediateOnFailure', 'RetryOnFailure'])} disabled={disabled} onChange={value => {
        const remove = value === 'RetryOnFailure' ? ['spec', 'upgrade', 'remediation'] : ['spec', 'upgrade', 'strategy', 'retryInterval'];
        if (value === 'RetryOnFailure' && draft.has(remove)) { setError('Remove remediation in source before choosing retry strategy.'); return; }
        commit([{ op: 'remove', path: remove }, value ? { op: 'set', path: ['spec', 'upgrade', 'strategy', 'name'], value } : { op: 'remove', path: ['spec', 'upgrade', 'strategy', 'name'] }]);
      }} />
      {get(['spec', 'upgrade', 'strategy', 'name']) === 'RetryOnFailure' ? timed('Retry interval', ['spec', 'upgrade', 'strategy', 'retryInterval']) : <>{choice('Remediation', ['spec', 'upgrade', 'remediation', 'strategy'], ['', 'rollback', 'uninstall'])}<ExactValueField label="Retries" value={get(['spec', 'upgrade', 'remediation', 'retries'])} identity={`${draft.sessionID}/retries`} disabled={disabled} help="Negative retries mean unlimited attempts." parse={value => value === '' ? { valid: true, value: '' } : /^-?\d+$/.test(value) && BigInt(value) >= -2147483648n && BigInt(value) <= 2147483647n ? { valid: true, value: BigInt(value) } : { valid: false, error: 'Enter a signed 32-bit integer.' }} onCommit={value => set(['spec', 'upgrade', 'remediation', 'retries'], value)} onValidityChange={failure => report('retries', failure)} /></>}
      {choice('CRD upgrade policy', ['spec', 'upgrade', 'crds'], ['', 'Skip', 'Create', 'CreateReplace'])}
      {get(['spec', 'upgrade', 'crds']) === 'CreateReplace' && <div role="note">CRD replacement affects cluster-wide resources.</div>}
      {choice('Drift detection', ['spec', 'driftDetection', 'mode'], ['', 'disabled', 'warn', 'enabled'])}
      {get(['spec', 'driftDetection', 'mode']) === 'enabled' && <div role="note">Controller may overwrite manual changes.</div>}
      <EditorChoice label="Suspension" value={draft.get(['spec', 'suspend']) === true ? 'suspended' : 'active'} options={options(['active', 'suspended'])} disabled={disabled} help="Suspension does not cancel in-flight reconciliation." onChange={value => set(['spec', 'suspend'], value === 'suspended')} />
      {form.context.intent === 'edit' && <div>{(['reconcile', 'reset', 'force'] as const).map(action => <Button key={action} size="sm" disabled={disabled} onClick={() => commit(requestOperations(action, new Date().toISOString()))}>Stage {action} request</Button>)}<div role="note">Requests take effect only after submission. Force can reinstall resources.</div></div>}
    </EditorSection>}
    {form.section === 'advanced' && <EditorSection title="Execution">{timed('Operation timeout', ['spec', 'timeout'])}{reference('Service account', ['spec', 'serviceAccountName'], '', 'v1', 'serviceaccounts')}<div role="note">Install, test, rollback, uninstall, post-renderers and remote-cluster configuration remain source-owned.</div></EditorSection>}
  </div>;
}
