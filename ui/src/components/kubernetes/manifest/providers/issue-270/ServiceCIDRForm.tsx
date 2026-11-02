import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPatch } from '@omniviewdev/runtime';
import { useState } from 'react';
import { EditorSection } from '../../editor-controls';
import { Consequence, NetworkField, RemoveButton, useNetworkingForm } from './fields';
import { appendAllowed, list, parseCIDR, record, text } from './model';

export default function ServiceCIDRForm(form: ResourceEditorFormProps) {
  return <RangesSession key={form.draft.sessionID} {...form} />;
}
function RangesSession(form: ResourceEditorFormProps) {
  const editor = useNetworkingForm(form), ranges = list(form.draft.get(['spec', 'cidrs']));
  const editing = form.context.intent !== 'create';
  const [originalCount] = useState(() => list((form.baseline ?? form.draft).get(['spec', 'cidrs'])).length);
  const [showSecond, setShowSecond] = useState(ranges.length > 1);
  const canAppend = !editing || originalCount === 1 && appendAllowed(form.context);
  const validateRange = (value: string, index: number) => {
    const parsed = parseCIDR(value), other = parseCIDR(text(ranges[index === 0 ? 1 : 0]));
    return !parsed ? { error: 'Enter a canonical network CIDR, without host bits.' } : other && other.family === parsed.family ? { error: 'Use one IPv4 range and one IPv6 range.' } : { value };
  };
  const operations = (index: number, value: unknown): ResourceEditorPatch[] => form.draft.has(['spec', 'cidrs']) ? index < ranges.length ? [{ op: 'set', path: ['spec', 'cidrs', index], value }] : [{ op: 'insert', path: ['spec', 'cidrs'], index, value }] : [{ op: 'set', path: ['spec', 'cidrs'], value: [value] }];
  return <div className="networking-form">{editor.failure && <div role="alert">{editor.failure}</div>}
    {form.section === 'ranges' && <EditorSection title="Service allocation ranges">
      <Consequence help="Administrator configuration for future Service ClusterIP allocation. This editor does not test overlap, capacity, allocator health, or reconciliation.">Range changes affect Service address allocation.</Consequence>
      <NetworkField editor={editor} path={['spec', 'cidrs', 0]} label="Primary CIDR" readOnly={editing} parse={value => validateRange(value, 0)} operations={value => operations(0, value)} />
      {(showSecond || ranges.length > 1) && <div className="networking-row"><NetworkField editor={editor} path={['spec', 'cidrs', 1]} label="Opposite-family CIDR" readOnly={editing && (!canAppend || originalCount > 1)} parse={value => validateRange(value, 1)} operations={value => operations(1, value)} />
        {ranges.length > 1 && (!editing || originalCount === 1 && canAppend) && <RemoveButton editor={editor} path={['spec', 'cidrs', 1]} label="Remove unsubmitted opposite-family range" />}
        {ranges.length < 2 && <Button size="sm" variant="ghost" onClick={() => { setShowSecond(false); editor.stage(['spec', 'cidrs', 1], 'branch', null); editor.stage(['spec', 'cidrs', 1], 'value', null); }}>Cancel second range</Button>}
      </div>}
      {!showSecond && ranges.length < 2 && canAppend && <Button size="sm" variant="outline" disabled={form.disabled || ranges.length !== 1} onClick={() => { setShowSecond(true); editor.stage(['spec', 'cidrs', 1], 'branch', 'Complete the second range or cancel it.'); }}>Add opposite-family range</Button>}
      {editing && <span className="networking-muted">{canAppend ? 'Existing ranges are immutable. One opposite-family append is supported by the installed-version signal.' : 'Existing ranges are immutable. Installed-version append support is not confirmed.'}</span>}
    </EditorSection>}
    {form.section === 'status' && <EditorSection title="Reported allocator conditions">
      {!list(form.draft.get(['status', 'conditions'])).length && <span className="networking-muted">No conditions reported in this snapshot.</span>}
      {list(form.draft.get(['status', 'conditions'])).map((value, index) => { const condition = record(value); return <dl className="networking-facts" key={index}><dt>Condition</dt><dd>{text(condition.type) || 'Unknown'}</dd><dt>Status</dt><dd>{text(condition.status) || 'Unknown'}</dd><dt>Reason</dt><dd>{text(condition.reason) || 'Not reported'}</dd><dt>Observed generation</dt><dd>{text(condition.observedGeneration) || 'Not reported'}</dd><dt>Transition</dt><dd>{text(condition.lastTransitionTime) || 'Not reported'}</dd></dl>; })}
    </EditorSection>}
  </div>;
}
