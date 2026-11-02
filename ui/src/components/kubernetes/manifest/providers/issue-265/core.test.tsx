import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorFormProps, ResourceEditorReferenceResult } from '@omniviewdev/runtime';
import { createResourceEditorDraft, ResourceEditorController } from '../../resourceEditorController';
import { resourceEditors } from './index';
import { coreUnavailable, endpointError, ownershipReason, validateCore, validateEndpointsSubmission } from './domain';
import { PodTemplateForm } from './WorkloadFields';
import PersistentVolumeForm from './PersistentVolumeForm';
import EndpointsForm from './EndpointsForm';

const capabilities = { create: 'available', update: 'available', get: 'available', list: 'available', delete: 'available', actions: {} } as const;
const context = (kind: string, intent: ResourceEditorContext['intent'] = 'create'): ResourceEditorContext => {
  const target = resourceEditors.find(provider => provider.targets[0].kind === kind)!.targets[0];
  return { ...target, intent, connectionID: 'fixture', namespace: target.scope === 'Namespaced' ? 'team' : undefined, capabilities, discovery: { status: 'available', features: {} }, schema: { status: 'available' }, ownership: { status: 'application' } };
};
const source = `apiVersion: v1
kind: PodTemplate
metadata:
  name: template
  namespace: team
  annotations:
    exact: 9007199254740993 # retain exact scalar
template:
  spec:
    containers:
      - name: api
        image: example.invalid/api:v1 # retain image comment
        terminationMessagePolicy: FallbackToLogsOnError
`;
function Harness({ onValidityChange }: { onValidityChange: (error: string | null) => void }) {
  const [controller] = useState(() => new ResourceEditorController(source, 'fixture'));
  const [, update] = useState(0);
  const contribution = resourceEditors.find(provider => provider.targets[0].kind === 'PodTemplate')!;
  const form: ResourceEditorFormProps = { context: context('PodTemplate'), draft: controller.draft(contribution.sensitivePaths), section: 'configuration', disabled: false,
    patch: request => { const result = controller.patch(request, contribution, context('PodTemplate')); update(value => value + 1); return result; }, onValidityChange,
    references: { list: async () => ({ status: 'ready', items: [] }) }, actions: { execute: async () => ({ status: 'unavailable', message: 'No fixture action.' }) } };
  return <><PodTemplateForm {...form}/><output aria-label="Canonical fixture">{controller.getSource()}</output></>;
}
afterEach(cleanup);
describe('core domain authoring', () => {
  it('keeps partial image local while preserving unrelated canonical scalars and comments', () => {
    const validity = vi.fn();
    render(<Harness onValidityChange={validity}/>);
    fireEvent.change(screen.getByLabelText('Container image 1'), { target: { value: '' } });
    expect(screen.getByLabelText('Container image 1')).toHaveValue('');
    expect(screen.getByLabelText('Canonical fixture')).toHaveTextContent('example.invalid/api:v1');
    expect(validity).toHaveBeenLastCalledWith('Container image 1 is required.');
    fireEvent.change(screen.getByLabelText('Container name 1'), { target: { value: 'worker' } });
    expect(screen.getByLabelText('Container image 1')).toHaveValue('');
    expect(validity).toHaveBeenLastCalledWith('Container image 1 is required.');
    expect(screen.getByLabelText('Canonical fixture')).toHaveTextContent('9007199254740993 # retain exact scalar');
    expect(screen.getByLabelText('Canonical fixture')).toHaveTextContent('terminationMessagePolicy: FallbackToLogsOnError');
    fireEvent.change(screen.getByLabelText('Container image 1'), { target: { value: 'example.invalid/api:v2' } });
    expect(validity).toHaveBeenLastCalledWith(null);
    expect(screen.getByLabelText('Canonical fixture')).toHaveTextContent('# retain image comment');
  });
  it('rejects selector mismatch for legacy controllers without inventing template labels', () => {
    const draft = createResourceEditorDraft('spec:\n  selector: {app: selected}\n  template:\n    metadata:\n      labels: {app: other}\n    spec:\n      containers: [{name: api, image: example.invalid/api:v1}]\n', 'rc', 0);
    expect(validateCore(draft, context('ReplicationController'))).toContainEqual({ path: ['spec','selector','app'], message: 'Selector must match the Pod template label.' });
  });
  it('compares limit quantities exactly and rejects non-container defaults', () => {
    const draft = createResourceEditorDraft('spec:\n  limits:\n    - type: Pod\n      min: {memory: 2Gi}\n      max: {memory: 1024Mi}\n      defaultRequest: {memory: 1Gi}\n', 'limits', 0);
    const errors = validateCore(draft, context('LimitRange')).map(issue => issue.message);
    expect(errors).toContain('Default limits and requests apply only to Containers.');
    expect(errors).toContain('memory: minimum ≤ default request ≤ default limit ≤ maximum.');
  });
  it.each(['127.0.0.1','169.254.1.2','0.0.0.0','224.0.0.1','::1','fe80::1','ff02::1','::ffff:127.0.0.1','999.2.3.4'])('rejects forbidden endpoint address %s', address => {
    expect(endpointError(address)).not.toBeNull();
  });
  it.each(['10.0.0.4','2001:db8::4'])('accepts unicast endpoint %s', address => expect(endpointError(address)).toBeNull());
  it('never treats absent owner facts as static administrator ownership', () => {
    const draft = createResourceEditorDraft('spec: {nfs: {server: storage, path: /export}}', 'pv', 0);
    const unknown = { ...context('PersistentVolume', 'edit'), ownership: undefined };
    expect(ownershipReason(draft, unknown)).toBe('Ownership is unknown: inspect only.');
    const provider = resourceEditors.find(item => item.targets[0].kind === 'PersistentVolume')!;
    const controller = new ResourceEditorController('spec: {nfs: {server: storage, path: /export}}', 'pv');
    expect(controller.patch({sessionID:'pv',expectedRevision:0,operations:[{op:'set',path:['spec','persistentVolumeReclaimPolicy'],value:'Delete'}]},provider,unknown).status).toBe('forbidden');
  });
  it('locks existing static volume identity and source controls', () => {
    const draft = createResourceEditorDraft('spec: {nfs: {server: storage, path: /export}, capacity: {storage: 1Gi}, accessModes: [ReadWriteOnce], volumeMode: Filesystem}', 'pv', 0);
    render(<PersistentVolumeForm context={context('PersistentVolume','edit')} draft={draft} section="configuration" disabled={false} patch={vi.fn()} onValidityChange={vi.fn()} references={{list:async()=>({status:'ready',items:[]})}} actions={{execute:async()=>({status:'unavailable',message:'No fixture action.'})}}/>);
    for (const label of ['NFS server','Export path','Capacity']) expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getByLabelText('Storage class')).not.toBeDisabled();
  });
  it('locks endpoint edits when the live Service selector belongs to a controller', async () => {
    const patch = vi.fn();
    const draft = createResourceEditorDraft('metadata: {name: service}\nsubsets: [{addresses: [{ip: 10.0.0.8}], ports: [{port: 8080}]}]', 'endpoints', 0);
    render(<EndpointsForm context={context('Endpoints')} draft={draft} section="configuration" disabled={false} patch={patch} onValidityChange={vi.fn()} references={{list:async()=>({status:'ready',items:[{name:'service',namespace:'team',serviceSelector:'present'}]})}} actions={{execute:async()=>({status:'unavailable',message:'Fixture only.'})}}/>);
    expect(await screen.findByText('Service has a selector; endpoints belong to its controller.')).toBeInTheDocument();
    expect(screen.getByLabelText('Ready IP 1')).toBeDisabled();
    expect(patch).not.toHaveBeenCalled();
  });
  it('keeps malformed collections source-only instead of overwriting their old scalar shape', () => {
    const draft = createResourceEditorDraft('template: {spec: {containers: retained-scalar}}', 'shape', 0);
    expect(coreUnavailable(draft, context('PodTemplate'))).toBe('An owned collection has an unsupported shape. Edit the preserved source instead.');
  });
  it('retains provisioner presence after annotation values are masked and blocks volume mutation', () => {
    const provider = resourceEditors.find(item => item.targets[0].kind === 'PersistentVolume')!;
    const original = 'metadata:\n  annotations:\n    pv.kubernetes.io/provisioned-by: fixture.invalid/driver\nspec:\n  nfs: {server: storage, path: /export}\n';
    const controller = new ResourceEditorController(original,'dynamic-pv');
    const draft = controller.draft(provider.sensitivePaths);
    expect(draft.has(['metadata','annotations','pv.kubernetes.io/provisioned-by'])).toBe(true);
    expect(typeof draft.get(['metadata','annotations','pv.kubernetes.io/provisioned-by'])).toBe('object');
    expect(controller.patch({sessionID:'dynamic-pv',expectedRevision:0,operations:[{op:'set',path:['spec','persistentVolumeReclaimPolicy'],value:'Delete'}]},provider,context('PersistentVolume','edit')).status).toBe('forbidden');
    expect(controller.getSource()).toBe(original);
  });
  it('retains a shrinking capacity locally without patching static volume source', () => {
    const draft = createResourceEditorDraft('spec: {nfs: {server: storage, path: /export}, capacity: {storage: 1Gi}, accessModes: [ReadWriteOnce]}', 'capacity', 0);
    const patch = vi.fn();
    const validity = vi.fn();
    render(<PersistentVolumeForm context={context('PersistentVolume','edit')} draft={draft} baseline={draft} section="configuration" disabled={false} patch={patch} onValidityChange={validity} references={{list:async()=>({status:'ready',items:[]})}} actions={{execute:async()=>({status:'unavailable',message:'Fixture only.'})}}/>);
    fireEvent.change(screen.getByLabelText('Capacity'),{target:{value:'512Mi'}});
    expect(screen.getByLabelText('Capacity')).toHaveValue('512Mi');
    expect(validity).toHaveBeenLastCalledWith('Capacity cannot decrease in this editor.');
    expect(patch).not.toHaveBeenCalled();
    expect(draft.get(['spec','capacity','storage'])).toBe('1Gi');
  });
  it('changes one Pod Security label without replacing unrelated Namespace labels', () => {
    const provider = resourceEditors.find(item => item.targets[0].kind === 'Namespace')!;
    const controller = new ResourceEditorController('metadata:\n  labels:\n    pod-security.kubernetes.io/enforce: baseline\n    keep.example/key: unchanged # retain label\n','namespace-label');
    expect(controller.patch({sessionID:'namespace-label',expectedRevision:0,operations:[{op:'set',path:['metadata','labels','pod-security.kubernetes.io/enforce'],value:'restricted'}]},provider,context('Namespace')).status).toBe('accepted');
    expect(controller.draft().get(['metadata','labels','keep.example/key'])).toBe('unchanged');
    expect(controller.getSource()).toContain('# retain label');
  });
  it('stores ServiceAccount automount as a top-level boolean and retains legacy Secret references', () => {
    const provider = resourceEditors.find(item => item.targets[0].kind === 'ServiceAccount')!;
    const controller = new ResourceEditorController('automountServiceAccountToken: true\nsecrets: [{name: fixture-legacy-reference}]\n','service-account');
    expect(controller.patch({sessionID:'service-account',expectedRevision:0,operations:[{op:'set',path:['automountServiceAccountToken'],value:false}]},provider,context('ServiceAccount')).status).toBe('accepted');
    expect(controller.draft().get(['automountServiceAccountToken'])).toBe(false);
    expect(controller.draft().get(['secrets',0,'name'])).toBe('fixture-legacy-reference');
    expect(controller.draft().has(['spec'])).toBe(false);
  });
  it('keeps dotted quota resource names as literal keys and rejects incompatible scopes', () => {
    const provider = resourceEditors.find(item => item.targets[0].kind === 'ResourceQuota')!;
    const controller = new ResourceEditorController('spec:\n  hard: {requests.cpu: "1", requests.memory: 2Gi}\n  scopes: [BestEffort, NotBestEffort]\n','quota');
    expect(controller.patch({sessionID:'quota',expectedRevision:0,operations:[{op:'set',path:['spec','hard','requests.cpu'],value:'1500m'}]},provider,context('ResourceQuota')).status).toBe('accepted');
    expect(controller.draft().get(['spec','hard','requests.cpu'])).toBe('1500m');
    expect(controller.draft().get(['spec','hard','requests.memory'])).toBe('2Gi');
    expect(controller.draft().has(['spec','hard','requests'])).toBe(false);
    expect(validateCore(controller.draft(),context('ResourceQuota')).some(issue=>issue.message==='Quota scopes conflict.')).toBe(true);
  });
  it.each([
    {kind:'Node',path:['spec','unschedulable'],hidden:['status','conditions',0,'message']},
    {kind:'Event',path:['reason'],hidden:['message']},
    {kind:'ComponentStatus',path:['conditions',0,'status'],hidden:['conditions',0,'error']},
  ])('keeps $kind inspection immutable and hides sensitive reported detail', ({kind,path,hidden}) => {
    const provider = resourceEditors.find(item => item.targets[0].kind === kind)!;
    const original = JSON.stringify({message:'Fixture detail withheld',status:{conditions:[{message:'Fixture detail withheld'}]},conditions:[{error:'Fixture detail withheld'}]});
    const controller = new ResourceEditorController(original,'inspection');
    expect(typeof controller.draft(provider.sensitivePaths).get(hidden)).toBe('object');
    expect(controller.patch({sessionID:'inspection',expectedRevision:0,operations:[{op:'set',path,value:'changed'}]},provider,context(kind,'inspect')).status).toBe('forbidden');
    expect(controller.getSource()).toBe(original);
  });
});

describe('Endpoints submission admission without a mounted form', () => {
  const source = 'apiVersion: v1\nkind: Endpoints\nmetadata: {name: manual, namespace: team}\nsubsets: []\n';
  it('requires an exact live selectorless Service and propagates snapshot/cancellation identity', async () => {
    const draft = createResourceEditorDraft(source,'yaml-only',7);
    const signal = new AbortController().signal;
    const references = {list:vi.fn(async()=>({status:'ready' as const,items:[{name:'manual',namespace:'team',serviceSelector:'none' as const}]}))};
    const actions = {execute:vi.fn()};
    expect(await validateEndpointsSubmission(draft,context('Endpoints'),{references,actions},signal)).toEqual([]);
    expect(references.list).toHaveBeenCalledWith({group:'',version:'v1',resource:'services',namespace:'team',projection:'servicePorts',sessionID:'yaml-only',generation:7,signal});
    expect(actions.execute).not.toHaveBeenCalled();
  });
  it.each(['denied','unavailable','absent'] as const)('blocks %s lookup without exposing upstream diagnostics', async status => {
    const draft = createResourceEditorDraft(source,'yaml-only',0);
    const references = {list:vi.fn(async()=>({status,message:'Untrusted upstream detail must not escape.'}))};
    const issues = await validateEndpointsSubmission(draft,context('Endpoints'),{references,actions:{execute:vi.fn()}},new AbortController().signal);
    expect(issues).toEqual([{path:['subsets'],message:`Service lookup ${status}. Manual editing is locked.`}]);
  });
  it.each([
    {name:'selector-managed',items:[{name:'manual',namespace:'team',serviceSelector:'present' as const}]},
    {name:'selector-unknown',items:[{name:'manual',namespace:'team',serviceSelector:'unknown' as const}]},
    {name:'selector-omitted',items:[{name:'manual',namespace:'team'}]},
    {name:'wrong-namespace',items:[{name:'manual',namespace:'other',serviceSelector:'none' as const}]},
    {name:'namespace-unknown',items:[{name:'manual',serviceSelector:'none' as const}]},
    {name:'missing-service',items:[]},
  ])('blocks $name evidence in initial YAML mode', async ({items}) => {
    const draft = createResourceEditorDraft(source,'yaml-only',0);
    const references = {list:vi.fn(async()=>({status:'ready' as const,items}))};
    const issues = await validateEndpointsSubmission(draft,context('Endpoints'),{references,actions:{execute:vi.fn()}},new AbortController().signal);
    expect(issues).toHaveLength(1);
  });
  it('does not accept a lookup that finishes after cancellation', async () => {
    const draft = createResourceEditorDraft(source,'yaml-only',3);
    const cancellation = new AbortController();
    const {promise:result,resolve:complete} = Promise.withResolvers<ResourceEditorReferenceResult>();
    const references = {list:vi.fn(()=>result)};
    const pending = validateEndpointsSubmission(draft,context('Endpoints'),{references,actions:{execute:vi.fn()}},cancellation.signal);
    cancellation.abort();
    complete({status:'ready',items:[{name:'manual',namespace:'team',serviceSelector:'none'}]});
    expect(await pending).toEqual([{path:['subsets'],message:'Service ownership validation was cancelled.'}]);
  });
  it('rejects a changed target namespace before performing any lookup', async () => {
    const draft = createResourceEditorDraft(source,'yaml-only',0);
    const references = {list:vi.fn()};
    expect(await validateEndpointsSubmission(draft,{...context('Endpoints'),namespace:'other'},{references,actions:{execute:vi.fn()}},new AbortController().signal)).toEqual([{path:['subsets'],message:'Resource identity changed. Retry from the current editor.'}]);
    expect(references.list).not.toHaveBeenCalled();
  });
});
