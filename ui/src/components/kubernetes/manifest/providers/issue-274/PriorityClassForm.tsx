import { Checkbox, TextArea } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';

import { EditorChoice, EditorHelp, EditorSection, scalarText } from '../../editor-controls';

import { BufferedField } from './formState';
import { integer, schedulingReadOnly, validatePriority } from './model';
import { useSchedulingForm } from './useSchedulingForm';
import './scheduling.css';

export default function PriorityClassForm(form: ResourceEditorFormProps) {
  return <PriorityClassSession key={form.draft.sessionID} {...form} />;
}

function PriorityClassSession(form: ResourceEditorFormProps) {
  const state = useSchedulingForm(form);
  const { draft, context } = form;
  const immutable = state.locked || context.intent !== 'create';
  const issue = validatePriority(draft, context)[0];
  return <div className="scheduling-editor" key={draft.sessionID}>
    {state.error && <p role="alert">{state.error}</p>}
    {schedulingReadOnly(draft, context) && <p role="status">Inspection only: system, controller ownership or application ownership is unconfirmed.</p>}
    <EditorSection title="Priority and preemption">
      <div className="scheduling-grid">
        <BufferedField fieldKey="priority" label="Priority" value={scalarText(draft.get(['value']))} disabled={immutable} inputMode="numeric"
          help="Signed 32-bit priority. User maximum: 1000000000. Higher priorities schedule first. Priority cannot change after creation."
          error={issue?.path[0] === 'value' ? issue.message : null} report={state.report}
          validate={text => integer(text, -2147483648, 1000000000) === null ? 'Enter an integer from −2147483648 to 1000000000.' : null}
          onCommit={text => state.apply([{ op: 'set', path: ['value'], value: integer(text, -2147483648, 1000000000)! }])} />
        <EditorChoice label="Preemption" value={scalarText(draft.get(['preemptionPolicy'])) || 'default'} disabled={immutable}
          help="Never queues higher-priority Pods without evicting lower-priority Pods. API default is PreemptLowerPriority. This field is immutable."
          options={[{ value: 'default', label: 'API default (omitted)' }, { value: 'PreemptLowerPriority', label: 'Preempt lower-priority Pods' }, { value: 'Never', label: 'Never preempt' }]}
          onChange={value => state.apply([value === 'default' ? { op: 'remove', path: ['preemptionPolicy'] } : { op: 'set', path: ['preemptionPolicy'], value }])} />
      </div>
      {context.intent !== 'create' && <p className="scheduling-note">Priority and preemption are immutable.</p>}
      {draft.get(['preemptionPolicy']) !== 'Never' && <p className="scheduling-consequence">Higher-priority Pods may evict lower-priority Pods.</p>}
    </EditorSection>
    <EditorSection title="Class behavior">
      <Checkbox size="sm" checked={draft.get(['globalDefault']) === true} disabled={state.locked}
        onCheckedChange={checked => state.apply([{ op: 'set', path: ['globalDefault'], value: checked === true }])}>Default for new classless Pods</Checkbox>
      {draft.get(['globalDefault']) === true && <p className="scheduling-consequence">Changes priority for future classless Pods. Existing Pod priorities stay unchanged.</p>}
      <div className="resource-editor-field">
        <div className="resource-editor-label"><span>Description</span><EditorHelp label="Description">Usage guidelines for this class. If multiple classes are global defaults, Kubernetes selects the smallest priority value.</EditorHelp></div>
        <TextArea.Root><TextArea.Control aria-label="Description" rows={3} value={scalarText(draft.get(['description']))} disabled={state.locked}
          onChange={event => state.apply([{ op: 'set', path: ['description'], value: event.target.value }])} /></TextArea.Root>
      </div>
    </EditorSection>
  </div>;
}
