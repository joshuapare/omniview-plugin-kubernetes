import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorHelp, EditorSection } from '../../editor-controls';
import ResourceLinkChip from '../../../../shared/ResourceLinkChip';
import { rows, text } from './domain';
import './forms.css';
function Facts({form,fields}:{form:ResourceEditorFormProps;fields:readonly {label:string;path:ResourceEditorPath}[]}) {
  return <dl>{fields.map(({label,path})=><div key={label} style={{display:'contents'}}><dt>{label}</dt><dd>{text(form.draft,path)||'Not reported'}</dd></div>)}</dl>;
}
function Conditions({form,path,columns = ['type','status','reason','lastTransitionTime']}:{form:ResourceEditorFormProps;path:ResourceEditorPath;columns?:readonly string[]}) {
  const items=rows(form.draft,path);
  const labels: Record<string,string> = {type:'Condition',status:'Status',reason:'Reason',lastTransitionTime:'Last transition'};
  return items.length?<table><thead><tr>{columns.map(key=><th key={key}>{labels[key]}</th>)}</tr></thead><tbody>{items.map((_,i)=><tr key={i}>{columns.map(key=><td key={key}>{text(form.draft,[...path,i,key])||'Not reported'}</td>)}</tr>)}</tbody></table>:<div role="status">No conditions reported. Health is unknown.</div>;
}
export function NodeForm(form:ResourceEditorFormProps) {
  const name = form.context.name || text(form.draft,['metadata','name']);
  return <div className="core-editor"><EditorSection title="Scheduling"><Facts form={form} fields={[{label:'Unschedulable',path:['spec','unschedulable']},{label:'Pod CIDR',path:['spec','podCIDR']},{label:'Provider ID',path:['spec','providerID']}]}/>{name && <ResourceLinkChip connectionID={form.context.connectionID} ownerReference={{apiVersion:'v1',kind:'Node',name,uid:form.context.uid}} resourceName="Node workflows"/>}<EditorHelp label="Node actions">Kubelet owns registration and status. Open existing Node workflows for available actions. Drain requires eviction, disruption-budget and local-data review; no action executes from this inspection.</EditorHelp></EditorSection>
    <EditorSection title="Taints">{rows(form.draft,['spec','taints']).length?rows(form.draft,['spec','taints']).map((_,i)=><Facts key={i} form={form} fields={['key','value','effect','timeAdded'].map(key=>({label:key,path:['spec','taints',i,key]}))}/>):<div>No taints reported.</div>}</EditorSection>
    <EditorSection title="Conditions"><Conditions form={form} path={['status','conditions']}/></EditorSection><EditorSection title="Node runtime"><Facts form={form} fields={['kubeletVersion','containerRuntimeVersion','operatingSystem','architecture'].map(key=>({label:key,path:['status','nodeInfo',key]}))}/></EditorSection></div>;
}
export function EventForm(form:ResourceEditorFormProps) {
  const related = {
    apiVersion: text(form.draft,['involvedObject','apiVersion']),
    kind: text(form.draft,['involvedObject','kind']),
    name: text(form.draft,['involvedObject','name']),
    uid: text(form.draft,['involvedObject','uid']) || undefined,
  };
  return <div className="core-editor"><EditorSection title="Event record"><Facts form={form} fields={['reason','type','count','reportingComponent','reportingInstance','firstTimestamp','lastTimestamp','eventTime'].map(key=>({label:key,path:[key]}))}/><div>Message hidden: event messages may contain sensitive application data.</div></EditorSection><EditorSection title="Involved object"><Facts form={form} fields={['apiVersion','kind','namespace','name','uid','fieldPath'].map(key=>({label:key,path:['involvedObject',key]}))}/>{related.apiVersion && related.kind && related.name && <ResourceLinkChip connectionID={form.context.connectionID} namespace={text(form.draft,['involvedObject','namespace']) || undefined} ownerReference={related} resourceName={related.name}/>}</EditorSection><EditorHelp label="Event lifecycle">Events are generated, expire and are not a durable audit history. This view cannot create, edit or replay them.</EditorHelp></div>;
}
export function ComponentStatusForm(form:ResourceEditorFormProps) {
  return <div className="core-editor"><div role="note">Deprecated ComponentStatus API. Missing data does not indicate health.</div><EditorSection title="Reported health"><Conditions form={form} path={['conditions']} columns={['type','status']}/></EditorSection><EditorHelp label="Health message privacy">Raw condition messages and errors are hidden because they can contain sensitive endpoint data.</EditorHelp></div>;
}
