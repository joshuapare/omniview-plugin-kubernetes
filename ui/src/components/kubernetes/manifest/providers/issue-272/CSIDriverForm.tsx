import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useState } from 'react';

import { EditorField, EditorHelp, EditorSection } from '../../editor-controls';

import { fieldAvailable, installerOwned, integerError } from './rules';
import { Availability, ChoiceValue, TextValue } from './StorageFields';
import { booleanOptions, omitted, storageBuffer, useStorageForm, type StorageState } from './storageState';

export default function CSIDriverForm(form: ResourceEditorFormProps) {
  return <CSIDriverSession key={form.draft.sessionID} form={form} />;
}
function CSIDriverSession({ form }: { form: ResourceEditorFormProps }) {
  const state = useStorageForm(form);
  const immutable = form.context.intent !== 'create';
  if (form.section === 'availability') return <Availability form={form} />;
  const managed = installerOwned(form.draft) || form.context.ownership?.status !== 'application';
  const gated = (field: string, feature: string) => !fieldAvailable(form.context, ['spec', field], feature);
  const tokenRequests = form.draft.get(['spec', 'tokenRequests']);
  const hasTokenRequests = Array.isArray(tokenRequests) && tokenRequests.length > 0;
  return <div className="storage-form">
    {managed && <p role="status">{installerOwned(form.draft) ? 'Installer-owned driver. Change its installation configuration.' : 'Installation ownership unknown. Inspect only.'}</p>}
    {form.section === 'tokens' ? <EditorSection title="Service-account token delivery"><Tokens form={form} state={state} />
      <ChoiceValue form={form} state={state} path={['spec', 'serviceAccountTokenInSecrets']} label="Deliver tokens through CSI Secrets" options={booleanOptions} disabled={!hasTokenRequests || gated('serviceAccountTokenInSecrets', 'CSIServiceAccountTokenSecrets')} help="Requires CSIServiceAccountTokenSecrets, published schema and at least one tokenRequests entry. Driver must support reading tokens from CSI Secrets. When omitted or false, VolumeContext delivery can expose tokens in driver logs. This editor never requests or displays a token." />
      {gated('serviceAccountTokenInSecrets', 'CSIServiceAccountTokenSecrets') && <p role="status">CSI Secrets delivery availability is unconfirmed or unavailable.</p>}
      {!hasTokenRequests && <p role="status">Add a token request before configuring delivery.</p>}
    </EditorSection> : <><EditorSection title="Installed driver capabilities"><EditorHelp label="CSI driver identity">Resource name must match CSI GetPluginName(). These settings describe the installed driver; they do not install it or prove controller support.</EditorHelp>
      {immutable && <p role="status">Attachment requirement and lifecycle modes are immutable.</p>}
      <div className="storage-grid">
        <ChoiceValue form={form} state={state} path={['spec', 'attachRequired']} label="Attachment required" options={booleanOptions} disabled={immutable} help="Omission defaults to true. Disabling skips ControllerPublishVolume and attachment waiting." />
        <ChoiceValue form={form} state={state} path={['spec', 'fsGroupPolicy']} label="Filesystem group policy" options={[omitted, { value: 'ReadWriteOnceWithFSType', label: 'ReadWriteOnce with filesystem type' }, { value: 'File', label: 'Change every file' }, { value: 'None', label: 'Do not change ownership' }]} help="Omission uses ReadWriteOnceWithFSType. Choose behavior supported by the driver." />
        <ChoiceValue form={form} state={state} path={['spec', 'podInfoOnMount']} label="Pass pod information" options={booleanOptions} help="Passes pod identity and ephemeral-volume information in CSI volume context. Mutable on the Kubernetes 1.35 baseline." />
        <ChoiceValue form={form} state={state} path={['spec', 'storageCapacity']} label="Use capacity reports" options={booleanOptions} help="Enabling can pause late-binding provisioning until suitable CSIStorageCapacity reports exist. No report is created here." />
        <ChoiceValue form={form} state={state} path={['spec', 'requiresRepublish']} label="Periodic republish" options={booleanOptions} help="Requests repeated NodePublishVolume calls after mounting, for example to refresh token-dependent contents." />
        <ChoiceValue form={form} state={state} path={['spec', 'seLinuxMount']} label="SELinux mount context" options={booleanOptions} disabled={gated('seLinuxMount', 'SELinuxMountReadWriteOncePod')} help="Requires confirmed SELinuxMountReadWriteOncePod availability and a driver supporting separately labeled mounts." />
      </div>
      <div className="storage-heading"><strong>Volume lifecycle modes</strong><EditorHelp label="Volume lifecycle modes">Omission uses Persistent. Only declare lifecycle modes supported by the installed driver. Immutable after creation.</EditorHelp></div>
      <Lifecycle form={form} state={state} disabled={immutable} />
    </EditorSection><EditorSection title="Advanced capacity refresh"><TextValue form={form} state={state} path={['spec', 'nodeAllocatableUpdatePeriodSeconds']} label="Allocatable refresh interval (seconds)" disabled={gated('nodeAllocatableUpdatePeriodSeconds', 'MutableCSINodeAllocatableCount')} help="Minimum 10 seconds. Omission disables periodic and failure-triggered allocatable updates. Requires MutableCSINodeAllocatableCount. Exact int64 values stay exact."
      parse={text => { if (!text) return { value: '' }; const error = integerError(text, 10n); return error ? { error } : { value: BigInt(text) }; }} />
      {gated('nodeAllocatableUpdatePeriodSeconds', 'MutableCSINodeAllocatableCount') && <p role="status">Allocatable refresh availability is unconfirmed or unavailable.</p>}
    </EditorSection></>}
  </div>;
}
function Lifecycle({ form, state, disabled }: { form: ResourceEditorFormProps; state: StorageState; disabled: boolean }) {
  const modes = form.draft.get(['spec', 'volumeLifecycleModes']);
  const value = Array.isArray(modes) ? modes.join(',') : '';
  return <div className="storage-actions">{[{ text: 'Use server default', modes: undefined }, { text: 'Persistent', modes: ['Persistent'] }, { text: 'Ephemeral', modes: ['Ephemeral'] }, { text: 'Both', modes: ['Persistent', 'Ephemeral'] }].map(option => <Button key={option.text} size="sm" variant="ghost" disabled={state.locked || disabled} aria-pressed={value === (option.modes?.join(',') ?? '')} onClick={() => state.report('lifecycle', state.commit([option.modes ? { op: 'set', path: ['spec', 'volumeLifecycleModes'], value: option.modes } : { op: 'remove', path: ['spec', 'volumeLifecycleModes'] }]))}>{option.text}</Button>)}</div>;
}
function Tokens({ form, state }: { form: ResourceEditorFormProps; state: StorageState }) {
  const requests = form.draft.get(['spec', 'tokenRequests']);
  const [audience, setAudience] = storageBuffer(state, 'new-token-audience'); const [expiry, setExpiry] = storageBuffer(state, 'new-token-expiry'); const [error, setError] = useState<string | null>(null);
  return <div className="storage-list"><EditorHelp label="Token request policy">Embedded tokenRequests entries configure kubelet behavior. They are not TokenRequest resources. At most one audience can be empty, meaning API-server audiences. Expiration is optional, from 600 through 4294967296 seconds. No tokens are fetched.</EditorHelp>
    {Array.isArray(requests) && state.rows(['spec', 'tokenRequests']).map(({ id, index }) => <div className="storage-row" key={id}>
      <TextValue form={form} state={state} path={['spec', 'tokenRequests', index, 'audience']} label={`Token audience ${index + 1}`} allowEmpty parse={text => requests.some((__, other) => other !== index && form.draft.get(['spec', 'tokenRequests', other, 'audience']) === text) ? { error: 'Each token audience must be unique.' } : { value: text }} />
      <TextValue form={form} state={state} path={['spec', 'tokenRequests', index, 'expirationSeconds']} label={`Token expiration ${index + 1} (seconds)`} parse={text => { if (!text) return { value: '' }; const failure = integerError(text, 600n, 4294967296n); return failure ? { error: failure } : { value: BigInt(text) }; }} />
      <Button size="sm" variant="ghost" disabled={state.locked} onClick={() => {
        const failure = state.commit([{ op: 'remove', path: ['spec', 'tokenRequests', index] }, ...(requests.length === 1 && form.draft.has(['spec', 'serviceAccountTokenInSecrets']) ? [{ op: 'remove' as const, path: ['spec', 'serviceAccountTokenInSecrets'] }] : [])]);
        state.report('tokens', failure);
      }}>Remove request {index + 1}</Button>
    </div>)}
    <div className="storage-row"><EditorField label="New token audience" value={audience} disabled={state.locked} onChange={next => { setAudience(next); state.report('new-token', next || expiry ? 'Add or discard the pending token request.' : null); }} /><EditorField label="New token expiration (seconds)" value={expiry} disabled={state.locked} onChange={next => { setExpiry(next); state.report('new-token', audience || next ? 'Add or discard the pending token request.' : null); }} />
    <Button size="sm" disabled={state.locked} onClick={() => {
      let failure = Array.isArray(requests) && requests.some((_, index) => form.draft.get(['spec', 'tokenRequests', index, 'audience']) === audience) ? 'Each token audience must be unique.' : expiry ? integerError(expiry, 600n, 4294967296n) : null;
      const value = { audience, ...(expiry && !failure ? { expirationSeconds: BigInt(expiry) } : {}) };
      if (!failure) failure = state.commit([Array.isArray(requests) ? { op: 'insert', path: ['spec', 'tokenRequests'], index: requests.length, value } : { op: 'set', path: ['spec', 'tokenRequests'], value: [value] }]);
      setError(failure); if (!failure) { setAudience(''); setExpiry(''); state.report('new-token', null); }
    }}>Add token request</Button><Button size="sm" variant="ghost" disabled={state.locked || !audience && !expiry} onClick={() => { setAudience(''); setExpiry(''); setError(null); state.report('new-token', null); }}>Discard</Button></div>{error && <p role="alert">{error}</p>}
  </div>;
}
