import type { ResourceEditorFormProps } from '@omniviewdev/runtime';

import { EditorHelp, EditorSection } from '../../editor-controls';

import { Availability, DriverField, Parameters } from './StorageFields';
import { useStorageForm } from './storageState';

export default function VolumeAttributesClassForm(form: ResourceEditorFormProps) {
  return <VolumeAttributesClassSession key={form.draft.sessionID} form={form} />;
}
function VolumeAttributesClassSession({ form }: { form: ResourceEditorFormProps }) {
  const state = useStorageForm(form);
  const immutable = form.context.intent !== 'create';
  if (form.section === 'availability') return <Availability form={form} />;
  return <div className="storage-form"><EditorSection title="Volume attributes">
    {immutable && <p role="status">Driver and attributes are immutable. Create a new class to change them.</p>}
    <DriverField form={form} state={state} path={['driverName']} label="CSI driver" disabled={immutable} />
    <Parameters form={form} state={state} required disabled={immutable} />
    <p role="status">No PVC reference changes automatically.</p>
    <EditorHelp label="Compatibility and application">v1 is preferred. v1beta1 requires actual discovery; v1alpha1 is not served in Kubernetes 1.35. CSI driver support is required. Applying a different class requires a separate authorized PVC reference update.</EditorHelp>
  </EditorSection></div>;
}
