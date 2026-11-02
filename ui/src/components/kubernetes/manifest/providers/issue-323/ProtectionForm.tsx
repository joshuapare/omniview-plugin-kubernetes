import { Button } from '@omniviewdev/base-ui';
import { useState } from 'react';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorSection, ExactValueField, KeyValueFields, patchError, setDraftField, useFieldValidity } from '../../editor-controls';
import { protectionReadOnly } from './policy';

export default function ProtectionForm(props: ResourceEditorFormProps) {
  const locked = props.disabled || protectionReadOnly(props.draft, props.context);
  const form = { ...props, disabled: locked };
  const [error, setError] = useState<string | null>(null);
  const validity = useFieldValidity(props);
  const apply = (operations: ResourceEditorPatch[]) => {
    const failure = patchError(props.patch({ sessionID: props.draft.sessionID, expectedRevision: props.draft.revision, operations }));
    setError(failure); validity('operation', failure);
  };
  const text = (path: ResourceEditorPath) => typeof props.draft.get(path) === 'string' ? props.draft.get(path) as string : '';
  const field = (label: string, path: ResourceEditorPath, help?: string) => <ExactValueField label={label} value={text(path)} identity={`${props.draft.sessionID}:${path.join('.')}`} disabled={locked} help={help} parse={value => ({ valid: true, value })} onCommit={value => patchError(setDraftField(form, path, value))} onValidityChange={failure => validity(path.join('.'), failure)} />;
  const hasBy = props.draft.has(['spec', 'by']);
  const endpoint = (side: 'of' | 'by') => {
    const root = ['spec', side];
    const ref = props.draft.has([...root, 'resourceRef']);
    const selector = props.draft.has([...root, 'resourceSelector']);
    return <EditorSection title={side === 'of' ? 'Used resource · deletion protected' : 'Using resource · dependency'}>
      {field('API version', [...root, 'apiVersion'], 'Exact served API version, including group when present. No resource plural is inferred.')}
      {field('Kind', [...root, 'kind'])}
      <EditorChoice label={`${side === 'of' ? 'Used' : 'Using'} selection`} value={ref ? 'reference' : selector ? 'selector' : ''} disabled={locked} options={[{ value: '', label: 'Choose target method' }, { value: 'reference', label: 'Named reference' }, { value: 'selector', label: 'Label selector' }]} help="References take precedence. Changing method explicitly removes the other method. Selectors resolve once; multiple matches may select randomly." onChange={value => {
        if (!value) return;
        const target = value === 'reference' ? 'resourceRef' : 'resourceSelector';
        const other = value === 'reference' ? 'resourceSelector' : 'resourceRef';
        apply([...(props.draft.has([...root, other]) ? [{ op: 'remove' as const, path: [...root, other] }] : []), ...(!props.draft.has([...root, target]) ? [{ op: 'set' as const, path: [...root, target], value: target === 'resourceRef' ? { name: '' } : {} }] : [])]);
      }} />
      {ref && field('Resource name', [...root, 'resourceRef', 'name'], 'Enter an existing exact name. Arbitrary GVK lookup needs discovered GVR; no plural is guessed.')}
      {ref && selector && <p role="status">Reference takes precedence; existing selector remains preserved.</p>}
      {selector && <details><summary>Selector controls</summary><KeyValueFields form={form} path={[...root, 'resourceSelector', 'matchLabels']} label={`${side} label`} /><EditorChoice label="Match controller owner" value={props.draft.get([...root, 'resourceSelector', 'matchControllerRef']) === true ? 'true' : 'false'} disabled={locked} options={[{ value: 'false', label: 'Not required' }, { value: 'true', label: 'Same controller owner' }]} onChange={value => apply([{ op: 'set', path: [...root, 'resourceSelector', 'matchControllerRef'], value: value === 'true' }])} /></details>}
      {side === 'of' && props.context.kind === 'Usage' && <details><summary>Namespace override</summary>{ref && field('Used reference namespace', [...root, 'resourceRef', 'namespace'], 'Omit for the Usage namespace. An explicit namespace requires a using resource.')}{selector && field('Used selector namespace', [...root, 'resourceSelector', 'namespace'])}<Button size="sm" disabled={locked} onClick={() => apply(['resourceRef', 'resourceSelector'].filter(branch => props.draft.has([...root, branch, 'namespace'])).map(branch => ({ op: 'remove', path: [...root, branch, 'namespace'] })))}>Use relationship namespace</Button></details>}
    </EditorSection>;
  };
  return <div>
    {locked && <p role="status">Inspection only. Change the owning composition or controller when managed.</p>}
    {endpoint('of')}
    <EditorSection title="Protection relationship"><EditorChoice label="Protection mode" value={hasBy ? 'dependency' : 'reason'} disabled={locked} options={[{ value: 'reason', label: 'Reason-only protection' }, { value: 'dependency', label: 'Resource dependency' }]} onChange={value => apply(value === 'dependency' ? [{ op: 'set', path: ['spec', 'by'], value: {} }] : [{ op: 'remove', path: ['spec', 'by'] }])} />{field('Protection reason', ['spec', 'reason'], 'Required without a using resource. A reason may also accompany a dependency.')}</EditorSection>
    {hasBy && endpoint('by')}
    <EditorSection title="Dependency preview"><p>{hasBy ? `${text(['spec', 'by', 'kind']) || 'Using resource'} → ` : ''}{text(['spec', 'of', 'kind']) || 'Used resource'}: deletion protection requested</p></EditorSection>
    <details><summary>Advanced · deletion replay</summary><EditorChoice label="Replay blocked deletion" value={props.draft.has(['spec', 'replayDeletion']) ? String(props.draft.get(['spec', 'replayDeletion'])) : 'omit'} disabled={locked} options={[{ value: 'omit', label: 'Unspecified' }, { value: 'false', label: 'Disabled' }, { value: 'true', label: 'Enabled' }]} onChange={value => apply(value === 'omit' ? [{ op: 'remove', path: ['spec', 'replayDeletion'] }] : [{ op: 'set', path: ['spec', 'replayDeletion'], value: value === 'true' }])} />{props.draft.get(['spec', 'replayDeletion']) === true && <p role="alert">Removing this relationship may delete the used resource after a blocked deletion attempt. Other blockers may remain.</p>}</details>
    <details><summary>Ownership and observed conditions</summary>
      <p>Ownership: {props.context.ownership?.status ?? 'unknown'}</p>
      {Array.isArray(props.draft.get(['metadata', 'ownerReferences'])) && (props.draft.get(['metadata', 'ownerReferences']) as unknown[]).map((owner, index) => {
        const value = owner as { kind?: unknown; name?: unknown };
        return <p key={index}>{typeof value?.kind === 'string' ? value.kind : 'Owner'}: {typeof value?.name === 'string' ? value.name : 'unavailable'}</p>;
      })}
      {Array.isArray(props.draft.get(['status', 'conditions'])) ? (props.draft.get(['status', 'conditions']) as unknown[]).map((condition, index) => {
        const value = condition as { type?: unknown; status?: unknown };
        return <p key={index}>{typeof value?.type === 'string' ? value.type : 'Condition'}: {typeof value?.status === 'string' ? value.status : 'Unknown'}</p>;
      }) : <p>No observed conditions reported.</p>}
    </details>
    {error && <p role="alert">{error}</p>}
  </div>;
}
