import { Button, SegmentedControl } from '@omniviewdev/base-ui';
import { useContext, useEffect, useId, useMemo, useState } from 'react';
import { LuBox, LuDatabase, LuFileCode2, LuSlidersHorizontal } from 'react-icons/lu';

import CodeEditor from '../../shared/CodeEditor';
import SimpleTooltip from '../../shared/SimpleTooltip';
import { inspectManifest, readManifestValue, supportedManifestKind } from './manifestDraft';
import { ResourcePortalContext } from './ResourcePortalContext';
import WorkloadForm, { type WorkloadSection } from './WorkloadForm';
import ServiceForm from './ServiceForm';
import IngressForm from './IngressForm';
import ConfigMapForm from './ConfigMapForm';
import SecretForm from './SecretForm';
import PersistentVolumeClaimForm from './PersistentVolumeClaimForm';
import { redactSecretManifest } from './dataDraft';
import { useManifestMode } from './useManifestMode';
import DataConfirmation from './DataConfirmation';
import styles from './ResourceManifestEditor.module.css';

export interface ResourceManifestEditorProps {
  value: string;
  onChange: (value: string) => void;
  resourceKey: string;
  editing?: boolean;
  disabled?: boolean;
  filename?: string;
  path?: string;
  baseline?: string;
  diff?: boolean;
  context?: string;
  connectionID?: string;
  onValidityChange?: (error: string | null) => void;
}

const labels: Record<string, string> = {
  basics: 'Basics', containers: 'Containers', storage: 'Storage', ports: 'Ports',
  selector: 'Workload selector', routes: 'Routes', tls: 'TLS', entries: 'Entries', credentials: 'Credentials',
};

export default function ResourceManifestEditor({ value, onChange, resourceKey, editing = false, disabled = false, filename = 'resource.yaml', path, baseline, diff = false, context, connectionID, onValidityChange }: ResourceManifestEditorProps) {
  const draft = useMemo(() => inspectManifest(value, resourceKey), [value, resourceKey]);
  const container = useContext(ResourcePortalContext);
  const modelID = useId();
  const [preferredMode, chooseMode] = useManifestMode();
  const [section, setSection] = useState('basics');
  const [formError, setFormError] = useState<string | null>(null);
  const identity = useMemo(() => ({ resourceKey, context, connectionID, filename, baseline, diff, preferredMode, section }), [resourceKey, context, connectionID, filename, baseline, diff, preferredMode, section]);
  const [disclosure, setDisclosure] = useState<{ identity: object; source: string; mode: 'confirm' | 'raw' } | null>(null);
  if (disclosure && (disclosure.identity !== identity || disclosure.source !== value)) setDisclosure(null);
  const currentDisclosure = disclosure?.identity === identity && disclosure.source === value ? disclosure : null;
  const raw = currentDisclosure?.mode === 'raw' && !diff;
  const unavailable = draft.error ?? draft.formError;
  const supportedKind = supportedManifestKind(resourceKey);
  const namespace = readManifestValue(draft, ['metadata', 'namespace']);
  const destination = connectionID || context;
  const namespaceLabel = typeof namespace === 'string' && namespace ? namespace : draft.kind ? 'Choose namespace' : null;
  const secret = supportedKind === 'Secret' || draft.document?.get('kind') === 'Secret';
  const formAvailable = !!draft.kind && !unavailable;
  const showForm = formAvailable && !diff && preferredMode === 'form' && !raw;
  const sections = draft.kind === 'Service' ? ['basics', 'ports', 'selector']
    : draft.kind === 'Ingress' ? ['basics', 'routes', 'tls']
      : draft.kind === 'ConfigMap' ? ['basics', 'entries']
        : draft.kind === 'Secret' ? ['basics', 'credentials']
          : draft.kind === 'PersistentVolumeClaim' ? ['basics', 'storage']
            : draft.kind === 'StatefulSet' ? ['basics', 'containers', 'storage'] : ['basics', 'containers'];
  const activeSection = sections.includes(section) ? section : 'basics';
  const formProps = { value, onChange, draft, section: activeSection, editing, disabled, baseline, connectionID, onValidityChange: setFormError };
  useEffect(() => { onValidityChange?.(formError); }, [formError, onValidityChange]);
  useEffect(() => () => { onValidityChange?.(null); }, [onValidityChange]);
  const codeValue = useMemo(() => secret ? redactSecretManifest(value) : value, [secret, value]);
  const original = useMemo(() => secret && baseline !== undefined ? redactSecretManifest(baseline) : baseline, [secret, baseline]);

  return <div className={styles.editor}>
    <div className={styles.toolbar}>
      <span className={styles.context}>{destination || (diff ? 'Changes' : showForm ? 'Resource configuration' : filename)}{namespaceLabel && <> / {namespaceLabel}</>}{editing && context && context !== destination && <> / {context}</>}</span>
      {supportedKind && !diff && <SegmentedControl size="sm" value={showForm ? 'form' : 'yaml'} onValueChange={(next) => {
        if (!formError && (next === 'yaml' || (next === 'form' && formAvailable))) {
          setDisclosure(null);
          chooseMode(next);
        }
      }} aria-label="Manifest editor mode">
        <SegmentedControl.Item value="form" disabled={!formAvailable || disabled}>Form</SegmentedControl.Item>
        <SegmentedControl.Item value="yaml" disabled={disabled || !!formError}>YAML</SegmentedControl.Item>
      </SegmentedControl>}
      {diff && <span className={styles.modeBadge}><LuFileCode2 size={13} /> YAML diff</span>}
    </div>
    {!showForm && unavailable && <div className={styles.notice} role="status">{secret ? 'Secret form unavailable. Use raw YAML to inspect or repair the source.' : unavailable}</div>}
    {!showForm && secret && <div className={styles.notice} role="status">
      {raw ? 'Real credential values are visible and editable.' : 'Values redacted · Read-only preview'}
      {!diff && <SimpleTooltip container={container} content="Raw YAML exposes real credentials and allows editing all fields. Hiding it keeps source edits.">
        <Button size="sm" variant="ghost" disabled={disabled || !!formError} onClick={() => {
          setDisclosure(raw ? null : { identity, source: value, mode: 'confirm' });
        }}>{raw ? 'Hide raw source' : 'Edit raw YAML'}</Button>
      </SimpleTooltip>}
    </div>}
    {formError && <div className={styles.notice} role="alert">{secret ? 'Resolve pending Secret form changes before continuing.' : formError}</div>}
    <DataConfirmation open={secret && !showForm && !diff && !disabled && !formError && currentDisclosure?.mode === 'confirm'}
      title="Edit raw YAML?"
      description="Real credential values will become visible and editable. Continue only in a private environment."
      onCancel={() => setDisclosure(null)}
      onConfirm={() => {
        if (!disabled && !formError && !diff && currentDisclosure?.mode === 'confirm') {
          setDisclosure({ identity, source: value, mode: 'raw' });
        } else setDisclosure(null);
      }} />
    {showForm ? <div className={styles.formLayout}>
      <nav className={styles.navigation} aria-label="Resource configuration sections">
        {sections.map((key) => <button key={key} type="button" className={styles.navItem} aria-current={activeSection === key ? 'page' : undefined} onClick={() => { setDisclosure(null); setSection(key); }}>
          {key === 'storage' ? <LuDatabase size={15} /> : key === 'containers' || key === 'ports' ? <LuBox size={15} /> : <LuSlidersHorizontal size={15} />}<span>{labels[key]}</span>
        </button>)}
        <SimpleTooltip container={container} content={secret ? 'Secret YAML starts as a read-only redacted preview. Explicit confirmation allows raw editing.' : 'Use YAML for fields not shown in the form. Switching views keeps the same manifest.'}>
          <button type="button" className={styles.yamlLink} disabled={disabled || !!formError} onClick={() => chooseMode('yaml')}><LuFileCode2 size={14} /><span>{secret ? 'Redacted YAML' : 'Advanced YAML'}</span></button>
        </SimpleTooltip>
      </nav>
      <div className={styles.formScroll}>
        {draft.kind === 'Service' ? <ServiceForm {...formProps} />
          : draft.kind === 'Ingress' ? <IngressForm {...formProps} />
            : draft.kind === 'ConfigMap' ? <ConfigMapForm {...formProps} />
              : draft.kind === 'Secret' ? <SecretForm {...formProps} />
                : draft.kind === 'PersistentVolumeClaim' ? <PersistentVolumeClaimForm {...formProps} />
                  : <WorkloadForm {...formProps} section={activeSection as WorkloadSection} />}
      </div>
    </div> : <div className={styles.code}>
      <CodeEditor key={secret ? diff ? 'secret-diff' : raw ? 'secret-raw' : 'secret-preview' : diff ? 'diff' : 'source'} filename={secret ? `${raw ? 'raw-secret' : diff ? 'redacted-secret-diff' : 'redacted-secret'}/${filename}` : filename} path={secret ? (!diff ? `inmemory://omniview-secret/${encodeURIComponent(modelID)}/${raw ? 'raw' : 'preview'}/${encodeURIComponent(filename)}` : undefined) : path} language="yaml" value={secret && raw ? value : codeValue} onChange={secret && (!raw || diff) ? undefined : (next) => {
        if (secret && raw) setDisclosure({ identity, source: next, mode: 'raw' });
        onChange(next);
      }} readOnly={disabled || (secret && (!raw || diff))} diff={diff} original={original} height="100%" />
    </div>}
  </div>;
}
