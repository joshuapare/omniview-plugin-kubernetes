import type { ResourceEditorFormProps } from '@omniviewdev/runtime';

import { EditorHelp, EditorSection, scalarText } from '../../editor-controls';

import { record } from './rules';
import { Availability } from './StorageFields';

function Fact({ label, value, empty = 'Not reported' }: { label: string; value: unknown; empty?: string }) {
  return <><dt>{label}</dt><dd>{scalarText(value) || empty}</dd></>;
}
function Ownership({ form, controller }: { form: ResourceEditorFormProps; controller: string }) {
  const owners = form.draft.get(['metadata', 'ownerReferences']);
  return <EditorSection title="Ownership"><p role="status">{controller}</p><dl className="storage-facts"><Fact label="Trusted ownership" value={form.context.ownership?.status} empty="Unknown" />{Array.isArray(owners) && owners.map((owner, index) => <Fact key={record(owner) ? scalarText(owner.uid) || `${scalarText(owner.kind)}:${scalarText(owner.name)}` : 'unsupported-owner'} label={`Owner ${index + 1}`} value={[form.draft.get(['metadata', 'ownerReferences', index, 'kind']), form.draft.get(['metadata', 'ownerReferences', index, 'name'])].map(scalarText).join(' / ')} />)}</dl></EditorSection>;
}
export function CSINodeForm(form: ResourceEditorFormProps) {
  if (form.section === 'availability') return <Availability form={form} />;
  if (form.section === 'ownership') return <Ownership form={form} controller="Kubelet registration owns this record. No direct create or edit." />;
  const drivers = form.draft.get(['spec', 'drivers']);
  return <div className="storage-form"><EditorSection title="Node driver registration"><dl className="storage-facts"><Fact label="Node" value={form.draft.get(['metadata', 'name'])} /></dl>
    {Array.isArray(drivers) && drivers.length ? drivers.map((driver, index) => <div className="storage-card" key={record(driver) ? scalarText(driver.name) : 'unsupported-driver'}><dl className="storage-facts">
      <Fact label="CSI driver" value={form.draft.get(['spec', 'drivers', index, 'name'])} /><Fact label="Node ID" value={form.draft.get(['spec', 'drivers', index, 'nodeID'])} /><Fact label="Allocatable volumes" value={form.draft.get(['spec', 'drivers', index, 'allocatable', 'count'])} empty="No limit reported" />
      <Fact label="Topology keys" value={Array.isArray(form.draft.get(['spec', 'drivers', index, 'topologyKeys'])) ? (form.draft.get(['spec', 'drivers', index, 'topologyKeys']) as unknown[]).map(scalarText).join(', ') : undefined} empty="None reported" />
    </dl></div>) : <p role="status">No registered CSI drivers reported.</p>}
    <EditorHelp label="Registration boundary">The node-driver-registrar and kubelet populate this resource. Missing registration does not prove an installation failure. Allocatable is a limit, not current free capacity.</EditorHelp>
  </EditorSection></div>;
}
export function CSIStorageCapacityForm(form: ResourceEditorFormProps) {
  if (form.section === 'availability') return <Availability form={form} />;
  if (form.section === 'ownership') return <Ownership form={form} controller="The CSI provisioner owns this capacity report. No direct create or edit." />;
  const topology = form.draft.get(['nodeTopology']);
  return <div className="storage-form"><EditorSection title="Provisioner capacity report"><dl className="storage-facts"><Fact label="Namespace" value={form.context.namespace ?? form.draft.get(['metadata', 'namespace'])} /><Fact label="Storage class" value={form.draft.get(['storageClassName'])} /><Fact label="Reported capacity" value={form.draft.get(['capacity'])} empty="Unknown — not zero" /><Fact label="Maximum volume size" value={form.draft.get(['maximumVolumeSize'])} empty="No maximum reported" /><Fact label="Topology access" value={topology === undefined || topology === null ? 'No nodes' : record(topology) && Object.keys(topology).length === 0 ? 'All nodes' : 'Matching nodes'} /></dl>
    <p role="status">Capacity is not a reservation or provisioning guarantee.</p>
    <EditorHelp label="Capacity semantics">Unset topology means no node access. An empty selector matches all nodes. Unknown capacity is not zero. Reports can become stale; matching reports and driver support govern scheduling.</EditorHelp>
  </EditorSection>{record(topology) && <EditorSection title="Node topology selector"><dl className="storage-facts">{record(topology.matchLabels) && Object.entries(topology.matchLabels).map(([key, value]) => <Fact key={key} label={key} value={value} />)}{Array.isArray(topology.matchExpressions) && topology.matchExpressions.map(expression => record(expression) ? <Fact key={`${scalarText(expression.key)}:${scalarText(expression.operator)}`} label={`${scalarText(expression.key)} ${scalarText(expression.operator)}`} value={Array.isArray(expression.values) ? expression.values.map(scalarText).join(', ') : undefined} empty="No values" /> : null)}</dl></EditorSection>}</div>;
}
export function VolumeAttachmentForm(form: ResourceEditorFormProps) {
  if (form.section === 'availability') return <Availability form={form} />;
  if (form.section === 'ownership') return <Ownership form={form} controller="Kubernetes owns attachment intent; the external-attacher owns status. No manual attach, detach or status editing." />;
  const error = (key: string) => form.draft.has(['status', key]) ? 'Reported — message hidden' : 'None reported';
  return <div className="storage-form"><EditorSection title="Attachment intent"><dl className="storage-facts"><Fact label="Attacher" value={form.draft.get(['spec', 'attacher'])} /><Fact label="Node" value={form.draft.get(['spec', 'nodeName'])} /><Fact label="Persistent volume" value={form.draft.get(['spec', 'source', 'persistentVolumeName'])} empty={form.draft.has(['spec', 'source', 'inlineVolumeSpec']) ? 'Inline migration source — protected' : 'Not reported'} /></dl></EditorSection>
    <EditorSection title="External-attacher status"><dl className="storage-facts"><Fact label="Attached" value={form.draft.get(['status', 'attached'])} empty="Unknown" /><Fact label="Attach error" value={error('attachError')} /><Fact label="Attach error time" value={form.draft.get(['status', 'attachError', 'time'])} /><Fact label="Attach gRPC code" value={form.draft.get(['status', 'attachError', 'errorCode'])} /><Fact label="Detach error" value={error('detachError')} /><Fact label="Detach error time" value={form.draft.get(['status', 'detachError', 'time'])} /><Fact label="Detach gRPC code" value={form.draft.get(['status', 'detachError', 'errorCode'])} /><Fact label="Attachment metadata" value={form.draft.has(['status', 'attachmentMetadata']) ? 'Protected controller data' : 'Not reported'} /></dl>
    <EditorHelp label="Attachment safety">Only the external-attacher may report attachment success. Error text, opaque attachment metadata and inline volume specifications stay protected because driver output can contain sensitive data. No action is implied by this inspection.</EditorHelp></EditorSection></div>;
}
