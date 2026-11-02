import { useState } from 'react';
import { Button } from '@omniviewdev/base-ui';
import type { ResourceEditorFormProps, ResourceEditorPath } from '@omniviewdev/runtime';
import { EditorField, EditorChoice, EditorSection, ExactValueField, parseExactInteger, setDraftField, patchError, useFieldValidity } from '../../editor-controls';

type Field = [string, string, string?];
const fields: Record<string, Field[]> = {
 Kafka: [['Kafka version','spec.kafka.version'],['Metadata version','spec.kafka.metadataVersion'],['KRaft','metadata.annotations.strimzi.io/kraft','enabled'],['Node pools','metadata.annotations.strimzi.io/node-pools','enabled']],
 KafkaNodePool: [['Replicas','spec.replicas','integer'],['Roles','spec.roles','roles'],['Storage','spec.storage.type','persistent-claim|ephemeral|jbod'],['Capacity','spec.storage.size'],['StorageClass','spec.storage.class'],['Delete claim','spec.storage.deleteClaim','boolean']],
 KafkaConnect: [['Bootstrap servers','spec.bootstrapServers'],['Replicas','spec.replicas','integer'],['Kafka version','spec.version'],['Connector resources','metadata.annotations.strimzi.io/use-connector-resources','true|false']],
 KafkaConnector: [['Connector class','spec.class'],['Maximum tasks','spec.tasksMax','integer'],['Desired state','spec.state','running|paused|stopped']],
 KafkaTopic: [['Topic name','spec.topicName'],['Partitions','spec.partitions','integer'],['Replication factor','spec.replicas','integer']],
 KafkaUser: [['Authentication','spec.authentication.type','tls|scram-sha-512|tls-external'],['Authorization','spec.authorization.type','simple']],
 KafkaBridge: [['Bootstrap servers','spec.bootstrapServers'],['Replicas','spec.replicas','integer'],['HTTP port','spec.http.port','integer']],
 KafkaMirrorMaker2: [['Connect cluster alias','spec.connectCluster'],['Replicas','spec.replicas','integer']],
 KafkaRebalance: [['Mode','spec.mode','full|add-brokers|remove-brokers'],['Throttle · bytes/s','spec.replicationThrottle','integer']],
};
const notices: Record<string,string> = {
 Kafka: 'Broker/controller node pools must exist separately.', KafkaNodePool: 'Deleting claims can permanently delete broker data.',
 KafkaConnect: 'Connector resources require explicit cluster enablement.', KafkaConnector: 'Connector class must be installed on the enabled Connect cluster.',
 KafkaTopic: 'More partitions can change key routing. Replication changes require operator support.', KafkaUser: 'Generated credential Secrets remain outside this editor.',
 KafkaBridge: 'CORS is not authentication. No Ingress is created.', KafkaMirrorMaker2: 'Replication copies data across trust boundaries.',
 KafkaRebalance: 'Approval moves partition replicas. Only application-owned requests allow authoring.',
};
function fieldPath(value: string): string[] { return value.startsWith('metadata.annotations.') ? ['metadata','annotations',value.slice(21)] : value.split('.'); }
export function topicPartitionError(next: bigint, previous: unknown): string | null {
 return (typeof previous === 'number' && Number.isSafeInteger(previous) || typeof previous === 'bigint') && next < BigInt(previous) ? 'Partitions cannot decrease.' : null;
}
function Value({ form, label, path, type, locked = false }: {form: ResourceEditorFormProps;label:string;path:ResourceEditorPath;type?:string;locked?:boolean}) {
 const validity = useFieldValidity(form);
 const value=form.draft.get(path);
 const text=typeof value==='string'||typeof value==='number'||typeof value==='bigint'||typeof value==='boolean'?String(value):Array.isArray(value)&&type==='roles'?value.filter(x=>typeof x==='string').join(','):'';
 const commit=(next:string|number|bigint|boolean|string[])=>patchError(form.patch({sessionID:form.draft.sessionID,expectedRevision:form.draft.revision,operations:[{op:'set',path,value:next}]}));
 const disabled=form.disabled||locked;
 if(type==='integer') return <ExactValueField label={label} value={text} identity={`${form.draft.sessionID}:${path.join('/')}`} disabled={disabled} parse={input=>{const result=parseExactInteger(input);if(!result.valid)return result; const n=BigInt(result.value); const error=n<0n?'Enter a nonnegative integer.':form.context.kind==='KafkaTopic'&&path.at(-1)==='partitions'?topicPartitionError(n,form.baseline?.get(path)):null;return error?{valid:false,error}:result;}} onCommit={commit} onValidityChange={e=>validity(path.join('/'),e)}/>;
 if(type) { const options=type==='roles'?['broker','controller','broker,controller']:type==='boolean'?['false','true']:type.split('|'); return <EditorChoice label={label} value={text} disabled={disabled} options={options.map(value=>({value,label:value}))} onChange={v=>validity(path.join('/'),commit(type==='roles'?v.split(','):type==='boolean'?v==='true':v))}/>; }
 return <ExactValueField label={label} value={text} identity={`${form.draft.sessionID}:${path.join('/')}`} disabled={disabled} parse={value=>({valid:true,value})} onCommit={commit} onValidityChange={e=>validity(path.join('/'),e)}/>;
}
function Rows({form,path,title,columns,seed}:{form:ResourceEditorFormProps;path:ResourceEditorPath;title:string;columns:Field[];seed:unknown}) {
 const validity=useFieldValidity(form); const rows=form.draft.get(path);const count=Array.isArray(rows)?rows.length:0;
 const patch=(operations:Parameters<ResourceEditorFormProps['patch']>[0]['operations'])=>validity(title,patchError(form.patch({sessionID:form.draft.sessionID,expectedRevision:form.draft.revision,operations})));
 return <EditorSection title={title}>{Array.from({length:count},(_,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8}}>{columns.map(([label,key,type])=><Value key={key} form={form} label={`${label} ${i+1}`} path={[...path,i,...(key?key.split('.'):[])]} type={type}/>)}<Button size="sm" disabled={form.disabled} onClick={()=>patch([{op:'remove',path:[...path,i]}])}>Remove {title} {i+1}</Button></div>)}<Button size="sm" disabled={form.disabled} onClick={()=>patch(form.draft.has(path)?[{op:'insert',path,index:count,value:seed}]:[{op:'set',path,value:[seed]}])}>Add {title}</Button></EditorSection>;
}
function Configuration({form}:{form:ResourceEditorFormProps}) {
 const [key,setKey]=useState('');const [value,setValue]=useState('');const [error,setError]=useState<string|null>(null);const validity=useFieldValidity(form);
 return <details><summary>Advanced configuration</summary><EditorField label="Configuration key" value={key} onChange={setKey} disabled={form.disabled}/><EditorField label="Configuration value" type="password" value={value} onChange={setValue} disabled={form.disabled} help="Values remain masked. Existing configuration is preserved; only this exact key changes."/><Button size="sm" disabled={form.disabled||!key} onClick={()=>{const e=patchError(setDraftField(form,['spec','config',key],value));setError(e);validity('configuration',e);if(!e){setValue('');setKey('');}}}>Set configuration</Button>{error&&<span role="alert">{error}</span>}</details>;
}
function ControllerRequest({form}:{form:ResourceEditorFormProps}) {
 const [request,setRequest]=useState('');
 const [error,setError]=useState<string|null>(null);
 const validity=useFieldValidity(form);
 const rebalance=form.context.kind==='KafkaRebalance';
 const current=form.draft.get(['status','conditions']);
 const conditions: readonly unknown[] = Array.isArray(current) ? current : [];
 const proposal=conditions.some(condition=>condition!==null&&typeof condition==='object'&&'type' in condition&&condition.type==='ProposalReady');
 const options=rebalance?['refresh','approve','stop']:['restart'];
 return <EditorSection title="Controller request"><EditorChoice label="Request" value={request} options={options.map(value=>({value,label:value}))} disabled={form.disabled} onChange={setRequest} help="Stages an annotation in the canonical draft. Host submission review sends the resource update; reconciliation is not guaranteed."/><Button size="sm" disabled={form.disabled||!request||request==='approve'&&!proposal} onClick={()=>{
  const result=patchError(setDraftField(form,['metadata','annotations',rebalance?'strimzi.io/rebalance':'strimzi.io/restart'],rebalance?request:'true'));
  setError(result);validity('request',result);
 }}>Stage request for review</Button>{request==='approve'&&!proposal&&<span role="alert">Approval requires a current ProposalReady condition.</span>}{error&&<span role="alert">{error}</span>}</EditorSection>;
}
export default function StrimziForm(form:ResourceEditorFormProps) {
 const kind=form.context.kind;const edit=form.context.intent!=='create';
 return <div style={{display:'grid',gap:12,minWidth:0}}><EditorSection title={kind}>{kind!=='Kafka'&&kind!=='KafkaConnect'&&kind!=='KafkaBridge'&&kind!=='KafkaMirrorMaker2'&&<Value form={form} label={kind==='KafkaConnector'?'Connect cluster':'Kafka cluster'} path={['metadata','labels','strimzi.io/cluster']} locked={edit}/>} {(fields[kind]??[]).map(([label,path,type])=><Value key={path} form={form} label={label} path={fieldPath(path)} type={type} locked={edit&&(path==='spec.topicName'||kind==='KafkaNodePool'&&['spec.roles','spec.storage.type','spec.storage.class','spec.storage.size'].includes(path)||kind==='KafkaTopic'&&path==='spec.replicas')}/>)}<small>{notices[kind]}</small></EditorSection>
 {kind==='Kafka'&&<Rows form={form} title="Listeners" path={['spec','kafka','listeners']} columns={[[ 'Name','name'],['Port','port','integer'],['Type','type','internal|route|loadbalancer|nodeport|ingress|cluster-ip'],['TLS','tls','boolean']]} seed={{name:'',port:9092,type:'internal',tls:true}}/>}
 {edit&&['KafkaConnector','KafkaRebalance'].includes(kind)&&<ControllerRequest form={form}/>}
 {['KafkaConnect','KafkaConnector','KafkaTopic'].includes(kind)&&<Configuration form={form}/>}
 {kind==='KafkaBridge'&&<Rows form={form} title="CORS origins" path={['spec','http','cors','allowedOrigins']} columns={[[ 'Origin','']]} seed=""/>}
 {kind==='KafkaUser'&&<Rows form={form} title="ACL rules" path={['spec','authorization','acls']} columns={[[ 'Resource','resource.type','topic|group|cluster|transactionalId'],['Name','resource.name'],['Pattern','resource.patternType','literal|prefix'],['Operation','operation','Read|Write|Create|Delete|Alter|Describe|ClusterAction|AlterConfigs|DescribeConfigs|IdempotentWrite|All'],['Host','host']]} seed={{resource:{type:'topic',name:'',patternType:'literal'},operation:'Read',host:'*'}}/>}
 {kind==='KafkaMirrorMaker2'&&<><Rows form={form} title="Cluster connections" path={['spec','clusters']} columns={[[ 'Alias','alias'],['Bootstrap servers','bootstrapServers']]} seed={{alias:'',bootstrapServers:''}}/><Rows form={form} title="Replication routes" path={['spec','mirrors']} columns={[[ 'Source alias','sourceCluster'],['Target alias','targetCluster'],['Topic pattern','topicsPattern'],['Group pattern','groupsPattern']]} seed={{sourceCluster:'',targetCluster:'',topicsPattern:''}}/></>}
 {kind==='KafkaRebalance'&&<><Rows form={form} title="Broker IDs" path={['spec','brokers']} columns={[[ 'Broker ID','','integer']]} seed={0}/><Rows form={form} title="Ordered goals" path={['spec','goals']} columns={[[ 'Goal','']]} seed=""/><EditorSection title="Proposal"><Value form={form} label="State" path={['status','conditions',0,'type']} locked/><Value form={form} label="Proposal session" path={['status','sessionId']} locked/></EditorSection></>}
 </div>;
}
