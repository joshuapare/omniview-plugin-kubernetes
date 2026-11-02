import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorHelp, EditorSection } from '../../editor-controls';
import { Consequence } from './fields';
import { record, text } from './model';

export default function IPAddressForm({ draft, context }: ResourceEditorFormProps) {
  const parent = record(draft.get(['spec', 'parentRef']));
  return <div className="networking-form"><EditorSection title="Allocated IP address">
    <Consequence help="IPAddress records belong to the allocator. Parent reference is immutable. Change the owning Service through its normal workflow; do not edit or recreate allocation records.">Allocator-owned · inspection only</Consequence>
    <dl className="networking-facts"><dt>Canonical address</dt><dd>{text(draft.get(['metadata', 'name'])) || context.name || 'Not reported'}</dd><dt>API version</dt><dd>networking.k8s.io/{context.version}</dd><dt>Scope</dt><dd>Cluster</dd></dl>
  </EditorSection><EditorSection title="Immutable parent reference">
    <EditorHelp label="Parent reference">This is the reference stored in the allocation snapshot, not proof that the parent still exists. No parent fetch, navigation, mutation, or allocator success is implied.</EditorHelp>
    <dl className="networking-facts"><dt>API group</dt><dd>{text(parent.group) || 'Core (empty group)'}</dd><dt>Exact resource</dt><dd>{text(parent.resource) || 'Not reported'}</dd><dt>Namespace</dt><dd>{text(parent.namespace) || 'Not specified'}</dd><dt>Name</dt><dd>{text(parent.name) || 'Not reported'}</dd></dl>
  </EditorSection></div>;
}
