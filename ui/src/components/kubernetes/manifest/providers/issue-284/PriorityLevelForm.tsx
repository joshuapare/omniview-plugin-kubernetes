import { useRef } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorSection } from '../../editor-controls';
import { ownership, responseChanges } from './domain';
import { ChoiceField, PolicyFrame, PolicyStatus, usePolicy, ValueField } from './fields';

function PriorityFields() {
  const { form } = usePolicy();
  const queueCache = useRef<Record<string, number | bigint>>({});
  const exempt = ownership(form.draft, form.context) === 'exempt';
  const base = ['spec', exempt ? 'exempt' : 'limited'];
  const queue = [...base, 'limitResponse', 'queuing'];
  const response = form.draft.get([...base, 'limitResponse', 'type']);
  return <><div hidden={form.section === 'status'}>
    <EditorSection title={exempt ? 'Exempt concurrency allocation' : 'Concurrency allocation'}><div className="apf-grid">
      <ValueField path={[...base, 'nominalConcurrencyShares']} label="Nominal concurrency shares" integer placeholder={exempt ? 'Server default: 0' : 'Server default: 30'} help="Relative allocation, not a fixed request count. Increasing shares reduces other levels’ proportional allocation. Explicit zero remains zero." />
      <ValueField path={[...base, 'lendablePercent']} label="Lendable concurrency (%)" integer max={100} placeholder="Server default: 0" help="Fraction of nominal capacity other priority levels may borrow, from 0 to 100 percent." />
    </div></EditorSection>
    {!exempt && <><EditorSection title="Overload behavior"><ChoiceField path={[...base, 'limitResponse', 'type']} label="When concurrency is exhausted" options={[{ value: '', label: 'Choose overload behavior' }, { value: 'Queue', label: 'Queue requests' }, { value: 'Reject', label: 'Reject immediately' }]} help="Queue waits until capacity is available or queue limits are reached. Reject immediately returns HTTP 429." onSelect={type => {
      if (!type) return 'Choose Queue or Reject.';
      if (type === 'Reject') {
        const values: Record<string, number | bigint> = {};
        for (const key of ['queues', 'handSize', 'queueLengthLimit']) {
          const value = form.draft.get([...queue, key]);
          if (typeof value === 'number' || typeof value === 'bigint') values[key] = value;
        }
        queueCache.current = values;
      }
      return responseChanges(form.draft, type, queueCache.current);
    }} />
    {response === 'Reject' && <div role="note" className="apf-notice">Excess API requests receive HTTP 429 immediately.</div>}
    {response === 'Queue' && <div className="apf-grid">
      <ValueField path={[...queue, 'queues']} label="Queue count" integer min={1} max={10000000} placeholder="Server default: 64" help="Queues per API server. One queue disables shuffle sharding." />
      <ValueField path={[...queue, 'handSize']} label="Shuffle-sharding hand size" integer min={1} placeholder="Server default: 8" help="Queues considered for each flow. Must not exceed queue count; server validates hash entropy." />
      <ValueField path={[...queue, 'queueLengthLimit']} label="Requests per queue" integer min={1} placeholder="Server default: 50" help="Maximum waiting requests per queue; excess requests are rejected." />
    </div>}</EditorSection>
    <details className="apf-advanced"><summary>Advanced borrowing</summary><ValueField path={[...base, 'borrowingLimitPercent']} label="Borrowing limit (%)" integer placeholder="Omitted: no borrowing limit" help="Maximum borrowed seats relative to nominal allocation. Values above 100 are valid. Zero disables borrowing; omission imposes no limit." /></details></>}
    <div className="apf-notice">Policy changes affect API server capacity, not workload replica counts.</div>
  </div><div hidden={form.section !== 'status'}><PolicyStatus /></div></>;
}
export default function PriorityLevelForm(form: ResourceEditorFormProps) {
  return <PolicyFrame key={form.draft.sessionID} form={form}><PriorityFields /></PolicyFrame>;
}
