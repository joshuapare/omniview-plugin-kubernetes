import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath, ResourceEditorPatch } from '@omniviewdev/runtime';
import { EditorChoice, EditorField, EditorSection } from '../../editor-controls';
import { AppendButton, Consequence, NetworkField, RemoveButton, useNetworkingForm, type NetworkingForm } from './fields';
import { list, parseCIDR, peerChanges, portName, portNumber, record, strictSubset, text } from './model';
import Selector from './Selector';

function Peer({ editor, path, label }: { editor: NetworkingForm; path: ResourceEditorPath; label: string }) {
  const peer = record(editor.form.draft.get(path));
  const actual = peer.ipBlock !== undefined ? 'ipBlock' : peer.namespaceSelector !== undefined ? peer.podSelector !== undefined ? 'both' : 'namespace' : 'pod';
  const mode = editor.local([...path, 'ipBlock'], 'mode')?.text ?? actual;
  const exception = editor.local([...path, 'ipBlock', 'except'], 'new-exception')?.text ?? '';
  const block = record(peer.ipBlock), parent = parseCIDR(text(block.cidr), false), candidate = parseCIDR(exception, false);
  const choose = (mode: string) => {
    editor.stage([...path, 'ipBlock'], 'mode', null, mode);
    editor.stage([...path, 'ipBlock', 'cidr'], 'branch', mode === 'ipBlock' && !peer.ipBlock ? 'Complete the IP block or choose a selector branch.' : null);
    if (mode === 'ipBlock' && !peer.ipBlock) return;
    const operations = peerChanges(path, mode, text(block.cidr));
    if (mode === 'pod' || mode === 'both') if (!peer.podSelector) operations.push({ op: 'set', path: [...path, 'podSelector'], value: {} });
    if (mode === 'namespace' || mode === 'both') if (!peer.namespaceSelector) operations.push({ op: 'set', path: [...path, 'namespaceSelector'], value: {} });
    editor.commit(operations);
  };
  return <div className="networking-card"><div className="networking-row">
    <EditorChoice label={`${label} match`} value={mode} options={[{ value: 'pod', label: 'Pods in policy namespace' }, { value: 'namespace', label: 'Namespaces' }, { value: 'both', label: 'Namespaces AND Pods' }, { value: 'ipBlock', label: 'IP block' }]} onChange={choose} disabled={editor.form.disabled} />
    <RemoveButton editor={editor} path={path} label={`Remove ${label}`} />
  </div>
    {mode === 'ipBlock' ? peer.ipBlock ? <>
      <NetworkField editor={editor} path={[...path, 'ipBlock', 'cidr']} label={`${label} CIDR`} parse={value => {
        const next = parseCIDR(value, false);
        return next && list(block.except).every(value => { const child = parseCIDR(text(value), false); return child && strictSubset(next, child); }) ? { value } : { error: 'Use a CIDR containing every existing exception.' };
      }} />
      {list(block.except).map((_, index) => <div className="networking-row" key={index}><NetworkField editor={editor} path={[...path, 'ipBlock', 'except', index]} label={`${label} exception ${index + 1}`} parse={value => { const child = parseCIDR(value, false); return child && parent && strictSubset(parent, child) ? { value } : { error: 'Exception must be strictly inside the block.' }; }} /><RemoveButton editor={editor} path={[...path, 'ipBlock', 'except', index]} label={`Remove ${label} exception ${index + 1}`} /></div>)}
      <div className="networking-row"><EditorField label={`${label} new exception`} value={exception} onChange={value => {
        const child = parseCIDR(value, false);
        editor.stage([...path, 'ipBlock', 'except'], 'new-exception', value && (!child || !parent || !strictSubset(parent, child)) ? 'Exception must be strictly inside the block.' : null, value);
      }} disabled={editor.form.disabled} error={exception && (!candidate || !parent || !strictSubset(parent, candidate)) ? 'Exception must be strictly inside the block.' : undefined} />
        {candidate && parent && strictSubset(parent, candidate) ? <AppendButton editor={editor} path={[...path, 'ipBlock', 'except']} label="Add exception" value={exception} /> : <Button size="sm" variant="outline" disabled>Add exception</Button>}
      </div>
    </> : <NetworkField editor={editor} path={[...path, 'ipBlock', 'cidr']} label={`${label} new IP block`} parse={value => parseCIDR(value, false) ? { value } : { error: 'Enter an IPv4 or IPv6 CIDR.' }} operations={value => peerChanges(path, 'ipBlock', String(value))} /> : <>
      {(mode === 'pod' || mode === 'both') && <Selector editor={editor} path={[...path, 'podSelector']} label={`${label} Pods`} />}
      {(mode === 'namespace' || mode === 'both') && <Selector editor={editor} path={[...path, 'namespaceSelector']} label={`${label} Namespaces`} />}
    </>}
  </div>;
}

function Port({ editor, path, label }: { editor: NetworkingForm; path: ResourceEditorPath; label: string }) {
  const port = record(editor.form.draft.get(path));
  const actual = port.port === undefined ? 'all' : typeof port.port === 'string' ? 'named' : 'number';
  const mode = editor.local([...path, 'port'], 'mode')?.text ?? actual;
  return <div className="networking-card"><div className="networking-row">
    <EditorChoice label={`${label} protocol`} value={text(port.protocol) || 'TCP'} options={['TCP', 'UDP', 'SCTP'].map(value => ({ value, label: value }))} disabled={editor.form.disabled} onChange={value => editor.commit([{ op: 'set', path: [...path, 'protocol'], value }])} />
    <EditorChoice label={`${label} port type`} value={mode} options={[{ value: 'all', label: 'All ports' }, { value: 'number', label: 'Number / range' }, { value: 'named', label: 'Named Pod port' }]} disabled={editor.form.disabled} onChange={value => {
      editor.setLocals(previous => Object.fromEntries(Object.entries(previous).filter(([key, local]) => JSON.stringify(local.path) !== JSON.stringify([...path, 'port']) || (JSON.parse(key) as [unknown, string])[1] === value)));
      editor.stage([...path, 'port'], 'mode', value !== 'all' && value !== actual ? 'Enter a valid port for the selected type.' : null, value);
      if (value === 'all') editor.commit([{ op: 'remove', path: [...path, 'port'] }, { op: 'remove', path: [...path, 'endPort'] }]);
    }} />
    <RemoveButton editor={editor} path={path} label={`Remove ${label}`} />
  </div>
    {mode !== 'all' && <div className="networking-row"><NetworkField editor={editor} path={[...path, 'port']} label={`${label} ${mode === 'named' ? 'name' : 'start'}`} slot={mode} parse={value => mode === 'named' ? portName(value) ? { value } : { error: 'Use a port name up to 15 characters containing a letter.' } : /^\d+$/.test(value) && portNumber(BigInt(value)) ? port.endPort !== undefined && BigInt(value) > BigInt(text(port.endPort)) ? { error: 'Start must not exceed the existing end.' } : { value: BigInt(value) } : { error: 'Enter a whole port number from 1–65535.' }} operations={value => [{ op: 'set', path: [...path, 'port'], value }, ...(mode === 'named' ? [{ op: 'remove' as const, path: [...path, 'endPort'] }] : [])]} />
      {mode === 'number' && <NetworkField editor={editor} path={[...path, 'endPort']} label={`${label} end (optional)`} optional parse={value => value === '' ? { value: undefined } : /^\d+$/.test(value) && portNumber(BigInt(value)) && portNumber(port.port) && BigInt(value) >= BigInt(text(port.port)) ? { value: BigInt(value) } : { error: 'End must be 1–65535 and at least the numeric start.' }} />}
    </div>}
  </div>;
}

function Rules({ editor, direction }: { editor: NetworkingForm; direction: 'ingress' | 'egress' }) {
  const path = ['spec', direction], rules = list(editor.form.draft.get(path));
  const peerKey = direction === 'ingress' ? 'from' : 'to';
  const types = list(editor.form.draft.get(['spec', 'policyTypes']));
  const effective = types.length ? types : ['Ingress', ...(list(editor.form.draft.get(['spec', 'egress'])).length ? ['Egress'] : [])];
  const active = effective.includes(direction === 'ingress' ? 'Ingress' : 'Egress');
  return <EditorSection title={direction === 'ingress' ? 'Incoming traffic' : 'Outgoing traffic'}>
    <Consequence help="Rules and peers are ORed. Ports AND peers must match within a rule. Other NetworkPolicies remain additive; CNI enforcement is not confirmed.">Changes can interrupt connectivity.</Consequence>
    {!active && <Consequence>This direction is not isolated; stored rules remain unchanged.</Consequence>}
    {!rules.length && <span className="networking-muted">No allowances from this policy in this direction.</span>}
    {rules.map((value, index) => {
      const rule = record(value), base = [...path, index], peers = list(rule[peerKey]);
      return <fieldset className="networking-rule" key={index}><legend>Rule {index + 1}</legend>
        <div className="networking-row"><span>{peers.length ? `${peers.length} alternative peers` : 'All peers allowed by this rule'}</span><RemoveButton editor={editor} path={base} label={`Remove ${direction} rule ${index + 1}`} /></div>
        {peers.map((_, peer) => <Peer editor={editor} path={[...base, peerKey, peer]} label={`${direction} rule ${index + 1} peer ${peer + 1}`} key={peer} />)}
        <AppendButton editor={editor} path={[...base, peerKey]} value={{ podSelector: {} }} label="Add peer" />
        {!!peers.length && <Button size="sm" variant="ghost" disabled={editor.form.disabled} onClick={() => editor.commit([{ op: 'remove', path: [...base, peerKey] }])}>Allow all peers in this rule</Button>}
        <details className="networking-advanced" open={list(rule.ports).length > 0 || undefined}><summary>Destination ports ({list(rule.ports).length || 'all'})</summary>
          {list(rule.ports).map((_, port) => <Port editor={editor} path={[...base, 'ports', port]} label={`${direction} rule ${index + 1} port ${port + 1}`} key={port} />)}
          <AppendButton editor={editor} path={[...base, 'ports']} value={{ protocol: 'TCP' }} label="Add destination port" />
        </details>
      </fieldset>;
    })}
    <AppendButton editor={editor} path={path} value={{ [peerKey]: [{ podSelector: {} }] }} label={`Add ${direction} rule`} />
  </EditorSection>;
}

export default function NetworkPolicyForm(form: ResourceEditorFormProps) {
  return <PolicySession key={form.draft.sessionID} {...form} />;
}
function PolicySession(form: ResourceEditorFormProps) {
  const editor = useNetworkingForm(form);
  const types = list(form.draft.get(['spec', 'policyTypes']));
  const effective = types.length ? types : ['Ingress', ...(list(form.draft.get(['spec', 'egress'])).length ? ['Egress'] : [])];
  const direction = (type: string, enabled: boolean) => {
    const next = enabled ? [...new Set([...effective, type])] : effective.filter(entry => entry !== type);
    if (!next.length) return;
    const operations: ResourceEditorPatch[] = [{ op: 'set', path: ['spec', 'policyTypes'], value: next }];
    editor.commit(operations);
  };
  return <div className="networking-form">
    {editor.failure && <div role="alert">{editor.failure}</div>}
    {form.section === 'selection' && <EditorSection title="Target Pods and isolation">
      <Selector editor={editor} path={['spec', 'podSelector']} label="Target Pods" />
      <div className="networking-row">{['Ingress', 'Egress'].map(type => <Button key={type} size="sm" variant={effective.includes(type) ? 'soft' : 'outline'} aria-pressed={effective.includes(type)} disabled={form.disabled || effective.length === 1 && effective.includes(type)} onClick={() => direction(type, !effective.includes(type))}>{type} isolation</Button>)}</div>
      <Consequence help="Unchecking a direction does not delete its existing rules. Kubernetes defaults omitted policyTypes to Ingress and also Egress when egress rules exist.">Isolation is additive across matching policies.</Consequence>
      <span className="networking-muted">Network plugin enforcement: not verified.</span>
    </EditorSection>}
    {form.section === 'ingress' && <Rules editor={editor} direction="ingress" />}
    {form.section === 'egress' && <Rules editor={editor} direction="egress" />}
  </div>;
}
