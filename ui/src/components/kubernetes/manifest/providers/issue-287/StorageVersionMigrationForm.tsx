import { useEffect, useRef, useState } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorField, EditorHelp, EditorSection } from '../../editor-controls';
import { groupError, groupPath, migrationAvailability, migrationConditions, migrationProgress, resourceError, resourcePath, unsupportedMigration } from './model';
import styles from './migration.module.css';
import TargetDiscovery from './TargetDiscovery';
import type { MigrationTarget } from './discovery';

export default function StorageVersionMigrationForm(props: ResourceEditorFormProps) {
  return <MigrationSession key={props.draft.sessionID} {...props} />;
}
function MigrationSession(props: ResourceEditorFormProps) {
  const { context, draft, section, disabled, patch, onValidityChange } = props;
  const readGroup = draft.get(groupPath);
  const readResource = draft.get(resourcePath);
  const canonicalGroup = typeof readGroup === 'string' ? readGroup : '';
  const canonicalResource = typeof readResource === 'string' ? readResource : '';
  const [group, setGroup] = useState(canonicalGroup);
  const [resource, setResource] = useState(canonicalResource);
  const [patchFailure, setPatchFailure] = useState<string | null>(null);
  const ownRevision = useRef(draft.revision);
  const create = context.intent === 'create';
  const unsupported = unsupportedMigration(draft);
  const availability = create ? migrationAvailability(context) : null;
  const locked = disabled || !create || !!unsupported || !!availability;
  const invalidGroup = groupError(group);
  const invalidResource = resourceError(resource);
  const pendingGroupError = group !== canonicalGroup ? invalidGroup : null;
  const pendingResourceError = resource !== canonicalResource ? invalidResource : null;
  const conditions = migrationConditions(draft);
  const observedVersion = draft.get(['status', 'resourceVersion']);

  useEffect(() => {
    if (ownRevision.current === draft.revision) return;
    ownRevision.current = draft.revision;
    setGroup(canonicalGroup);
    setResource(canonicalResource);
    setPatchFailure(null);
  }, [draft.revision, canonicalGroup, canonicalResource]);
  useEffect(() => {
    onValidityChange(create ? availability || patchFailure || pendingGroupError || pendingResourceError : null);
  }, [create, availability, patchFailure, pendingGroupError, pendingResourceError, onValidityChange]);
  useEffect(() => () => onValidityChange(null), [onValidityChange]);

  function changeTarget(field: 'group' | 'resource', value: string) {
    if (locked) return;
    if (field === 'group') setGroup(value); else setResource(value);
    if ((field === 'group' ? groupError(value) : resourceError(value))) return;
    const result = patch({ sessionID: draft.sessionID, expectedRevision: draft.revision,
      operations: [{ op: 'set', path: field === 'group' ? groupPath : resourcePath, value }] });
    if (result.status === 'accepted') {
      ownRevision.current = result.revision;
      setPatchFailure(null);
    } else {
      setPatchFailure(result.status === 'stale' ? 'Draft changed. Re-enter the target using the current source.' : 'Target change was not accepted. Source remains unchanged.');
    }
  }

  function selectTarget(target: MigrationTarget) {
    if (locked) return;
    if (groupError(target.group) || resourceError(target.resource)) {
      setPatchFailure('Discovered target is not a valid GroupResource.');
      return;
    }
    const result = patch({ sessionID: draft.sessionID, expectedRevision: draft.revision, operations: [
      { op: 'set', path: groupPath, value: target.group },
      { op: 'set', path: resourcePath, value: target.resource },
    ] });
    if (result.status === 'accepted') {
      ownRevision.current = result.revision;
      setGroup(target.group);
      setResource(target.resource);
      setPatchFailure(null);
    } else {
      setPatchFailure('Target selection was not accepted. Source remains unchanged.');
    }
  }

  if (section === 'progress') return <div className={styles.root}>
    <EditorSection title="Migration progress">
      <div className={styles.summary}><span>Controller observation</span><strong>{migrationProgress(conditions)}</strong>
        <EditorHelp label="Controller observation">Conditions are observations, not a percentage or proof of current controller health. No observation means unknown.</EditorHelp>
      </div>
      <dl className={styles.facts}><dt>Observed resource version</dt><dd>{typeof observedVersion === 'string' && observedVersion !== '' ? observedVersion : 'Not reported'}</dd></dl>
      {conditions.length ? <div className={styles.conditions}>{conditions.map((condition, index) => <article className={styles.condition} key={`${condition.type}-${index}`}>
        <div className={styles.conditionHeading}><strong>{condition.type}</strong><span>{condition.status}</span></div>
        <dl className={styles.facts}><dt>Reason</dt><dd>{condition.reason}</dd></dl>
        <details><summary>Observation details</summary><dl className={styles.facts}>
          <dt>Last transition</dt><dd>{condition.lastTransitionTime}</dd>
          <dt>Observed generation</dt><dd>{condition.observedGeneration}</dd>
          <dt>Controller message</dt><dd>{condition.hasMessage ? 'Reported · hidden for privacy' : 'Not reported'} <EditorHelp label="Controller message">Controller error messages may contain credentials. Raw message text is excluded from guided views and captures.</EditorHelp></dd>
        </dl></details>
      </article>)}</div> : <p role="status" className={styles.notice}>No controller observations reported.</p>}
    </EditorSection>
  </div>;

  return <div className={styles.root}>
    {unsupported && <p role="alert" className={styles.notice}>{unsupported}</p>}
    {availability && <p role="status" className={styles.notice}>{availability}</p>}
    {!create && <p role="status" className={styles.notice}>Existing request · target immutable; progress is controller-owned.</p>}
    <EditorSection title="Migration target">
      {create && <TargetDiscovery form={props} disabled={locked} group={group} resource={resource} onSelect={selectTarget} />}
      <EditorField label="API group" value={group} onChange={value => changeTarget('group', value)} disabled={locked} error={create && !unsupported ? invalidGroup : null}
        help="Enter the exact served API group. Leave empty for core. This is not an API version or a namespace." />
      <EditorField label="Plural resource" value={resource} onChange={value => changeTarget('resource', value)} disabled={locked} error={create && !unsupported ? invalidResource : null}
        help="Use the exact plural from installed API discovery, not a kind or a guessed plural. The API accepts one group/resource target and no destination version." />
      {patchFailure && <p role="alert" className={styles.notice}>{patchFailure}</p>}
    </EditorSection>
    {create && <p className={styles.consequence}>Privileged request: may rewrite stored objects across namespaces and increase API/storage load. Target cannot change after creation.</p>}
    <details className={styles.advanced}><summary>Availability and ownership</summary><dl className={styles.facts}>
      <dt>Scope</dt><dd>Cluster</dd><dt>Controller support</dt><dd>Not proven by API discovery</dd>
      <dt>Prerequisites</dt><dd>Served v1beta1 API, StorageVersionMigrator, create permission</dd>
      <dt>Storage version</dt><dd>Selected by the API server</dd>
      <dt>Status</dt><dd>Controller-owned; no pause, rollback, or automatic retry</dd>
    </dl></details>
  </div>;
}
