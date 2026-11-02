import type { ResourceEditorContribution, ResourceEditorFormProps } from '@omniviewdev/runtime';

import { EditorChoice, EditorField, EditorSection, ExactValueField, KeyValueFields, ReferencePicker, parseExactInteger, patchError, scalarText, setDraftField, useFieldValidity } from './index';

/**
 * Isolated verification only. Mount this contribution through ResourceEditorHarness,
 * never register it in the production extension registry. It exercises actual controls,
 * canonical host patches, local partial drafts and injected reference transports.
 *
 * Capture coverage: complete and partial exact integer/quantity; sibling map edits;
 * rename/add/remove/duplicate rows; loading/empty/denied/absent/unavailable references;
 * unresolved manual name; help click/focus/Escape; disabled fields; narrow layout.
 * Transport fixtures must be supplied by the capture runner. No live mutation is needed.
 *
 * API audit: base-ui Input and Select compound exports cover field/choice composition.
 * Tooltip and Popover supply hover/focus/click help and Escape/focus return. No base-ui
 * release is needed. Quantity grammar, selector rules, bounds and omission remain group
 * adapter responsibilities. apps issue266 and storage issue272 consume these primitives;
 * node issue282 uses value validation and reference groups use cancellable suggestions.
 */
export function ControlsFixture(form: ResourceEditorFormProps) {
  const validity = useFieldValidity(form);
  const count = scalarText(form.draft.get(['spec', 'count']));
  const quantity = scalarText(form.draft.get(['spec', 'quantity']));
  return <div style={{ display: 'grid', gap: 16, padding: 20 }}>
    <div role="note">Isolated production-control fixture. No live mutations.</div>
    <EditorSection title="Exact values">
      <ExactValueField label="Count" value={count} identity={`${form.draft.sessionID}:count`} disabled={form.disabled} parse={parseExactInteger} onCommit={value => patchError(setDraftField(form, ['spec', 'count'], value))} onValidityChange={error => validity('count', error)} help="Partial values stay local. Wide integers keep exact digits." />
      <ExactValueField label="Quantity" value={quantity} identity={`${form.draft.sessionID}:quantity`} disabled={form.disabled} parse={text => /^\d+(?:\.\d+)?Gi$/.test(text) ? { valid: true, value: text } : { valid: false, error: 'Complete the Gi quantity.' }} onCommit={value => patchError(setDraftField(form, ['spec', 'quantity'], value))} onValidityChange={error => validity('quantity', error)} help="Fixture adapter owns this quantity grammar; shared input does not normalize units." />
    </EditorSection>
    <EditorSection title="Preserved siblings"><KeyValueFields form={{ ...form, onValidityChange: error => validity('labels', error) }} path={['metadata', 'labels']} label="Label" /></EditorSection>
    <EditorSection title="References">
      <ReferencePicker form={form} query={{ group: '', version: 'v1', resource: 'services', namespace: form.context.namespace }} label="Service" value={scalarText(form.draft.get(['spec', 'serviceName']))} onChange={value => validity('service', patchError(setDraftField(form, ['spec', 'serviceName'], value)))} />
      <EditorChoice label="Policy" value={scalarText(form.draft.get(['spec', 'policy']))} options={[{ value: 'Automatic', label: 'Automatic' }, { value: 'Manual', label: 'Manual' }]} disabled={form.disabled} onChange={value => validity('policy', patchError(setDraftField(form, ['spec', 'policy'], value)))} />
      <EditorField label="Read-only identity" value={form.context.name ?? ''} onChange={() => validity('identity', 'Identity is read-only.')} readOnly />
    </EditorSection>
  </div>;
}
export const controlsFixtureContribution: ResourceEditorContribution = {
  contractVersion: 1,
  targets: [{ group: 'fixtures.omniview.dev', version: 'v1', kind: 'ControlFixture', resource: 'controlfixtures', scope: 'Namespaced' }],
  intents: ['create', 'edit'], label: 'Control fixture', sections: [{ id: 'controls', label: 'Controls' }],
  ownedPaths: [['spec'], ['metadata', 'labels']], component: ControlsFixture,
};
export const controlsFixtureSource = 'apiVersion: fixtures.omniview.dev/v1\nkind: ControlFixture\nmetadata:\n  name: controls\n  namespace: fixture\n  labels:\n    editable: value\n    preserved: sibling\nspec:\n  count: 9007199254740993\n  quantity: 1Gi\n  serviceName: unresolved-service\n  policy: Manual\n  preserved:\n    nested: unchanged\n';
