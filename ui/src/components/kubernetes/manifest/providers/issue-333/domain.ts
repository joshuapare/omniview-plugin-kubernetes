import type { ResourceEditorDraft, ResourceEditorContext, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export interface Field { label:string; path:string; type?:'integer'|'boolean'|'reference'; options?:readonly string[]; required?:boolean; immutable?:boolean; min?:number; help?:string }
const f=(label:string,path:string,extra:Partial<Field>={}):Field=>({label,path,...extra});
const cluster=f('Cluster','cluster.name',{type:'reference',required:true,immutable:true});
const reclaim=(kind:string)=>f('Reclaim policy',`${kind.toLowerCase()}ReclaimPolicy`,{options:['retain','delete'],help:'Delete can remove the managed SQL object. Retain is not a backup.'});
export const fields:Record<string,readonly Field[]>={
Cluster:[f('Instances','instances',{type:'integer',min:1,required:true}),f('PostgreSQL image','imageName'),f('Storage capacity','storage.size',{required:true,immutable:true,help:'Existing storage cannot shrink. Resize existing volumes through the storage workflow.'}),f('Storage class','storage.storageClass',{immutable:true}),f('CPU request','resources.requests.cpu'),f('Memory request','resources.requests.memory'),f('Failover delay (seconds)','failoverDelay',{type:'integer',min:0}),f('Primary update strategy','primaryUpdateStrategy',{options:['supervised','unsupervised']}),f('Recovery Backup','bootstrap.recovery.backup.name',{immutable:true,help:'Create-time restore only. Other bootstrap branches remain in source.'}),f('Synchronous standbys','postgresql.synchronous.number',{type:'integer',min:1}),f('Synchronous method','postgresql.synchronous.method',{options:['any','first']}),f('Data durability','postgresql.synchronous.dataDurability',{options:['required','preferred']})],
Pooler:[cluster,f('Traffic','type',{options:['rw','ro','r'],required:true}),f('Instances','instances',{type:'integer',min:1}),f('Pooling mode','pgbouncer.poolMode',{options:['session','transaction'],required:true,help:'Transaction pooling changes session semantics.'}),f('Paused','pgbouncer.paused',{type:'boolean',help:'Pausing stops new client connections.'})],
ScheduledBackup:[cluster,f('Schedule','schedule',{required:true,help:'Six cron fields, seconds first.'}),f('Backup method','method',{options:['barmanObjectStore','volumeSnapshot','plugin']}),f('Suspended','suspend',{type:'boolean'}),f('Run immediately','immediate',{type:'boolean'}),f('Backup owner','backupOwnerReference',{options:['none','self','cluster'],help:'Controls generated object garbage collection, not physical backup retention.'})],
Database:[cluster,f('SQL database name','name',{required:true,immutable:true}),f('Owner role','owner',{required:true}),f('Desired state','ensure',{options:['present','absent']}),reclaim('Database'),f('Encoding','encoding',{immutable:true}),f('Connection limit','connectionLimit',{type:'integer',min:-1})],
Publication:[cluster,f('SQL publication name','name',{required:true,immutable:true}),f('Database','dbname',{required:true,immutable:true}),reclaim('Publication')],
Subscription:[cluster,f('SQL subscription name','name',{required:true,immutable:true}),f('Subscriber database','dbname',{required:true,immutable:true}),f('Publication','publicationName',{required:true,immutable:true}),f('Publisher external cluster','externalClusterName',{required:true,immutable:true}),f('Publisher database','publicationDBName',{immutable:true}),reclaim('Subscription')],
Backup:[cluster,f('Method','method',{options:['barmanObjectStore','volumeSnapshot','plugin']}),f('Target','target',{options:['primary','prefer-standby']}),f('Online snapshot','online',{type:'boolean',help:'Offline snapshots may suspend database activity.'})],ImageCatalog:[],ClusterImageCatalog:[],FailoverQuorum:[]};
export const resources:Record<string,string>={Cluster:'clusters',Pooler:'poolers',ScheduledBackup:'scheduledbackups',ImageCatalog:'imagecatalogs',ClusterImageCatalog:'clusterimagecatalogs',Database:'databases',Publication:'publications',Subscription:'subscriptions',Backup:'backups',FailoverQuorum:'failoverquorums'};
export const path=(value:string)=>(['spec',...value.split('.')] as (string|number)[]);
export function locked(d:ResourceEditorDraft,c:ResourceEditorContext){return c.kind==='FailoverQuorum'||(c.kind==='Backup'&&c.intent!=='create')||c.ownership?.status==='controller'||c.ownership?.status==='system'||(Array.isArray(d.get(['metadata','ownerReferences']))&&(d.get(['metadata','ownerReferences']) as unknown[]).length>0);}
export function validate(d:ResourceEditorDraft,c:ResourceEditorContext):readonly ResourceEditorFieldIssue[]{
 if(locked(d,c))return [];
 const issues:ResourceEditorFieldIssue[]=[];
 for(const field of fields[c.kind]??[]){const value=d.get(path(field.path));if(field.required&&(value===undefined||value===''))issues.push({path:path(field.path),message:`${field.label} is required.`});}
 if(c.kind==='ScheduledBackup'&&typeof d.get(path('schedule'))==='string'&&String(d.get(path('schedule'))).trim().split(/\s+/).length!==6)issues.push({path:path('schedule'),message:'Use six schedule fields, seconds first.'});
 if(c.kind==='Pooler'&&c.name===d.get(path('cluster.name')))issues.push({path:path('cluster.name'),message:'Pooler and Cluster names must differ.'});
 if((c.kind==='Backup'||c.kind==='ScheduledBackup')&&d.get(path('method'))==='plugin'&&!d.get(path('pluginConfiguration.name')))issues.push({path:path('pluginConfiguration.name'),message:'Select a backup plugin.'});
 if(c.kind==='Database'){const rows=d.get(path('extensions'));if(Array.isArray(rows))rows.forEach((_,i)=>{if(!d.get(['spec','extensions',i,'name']))issues.push({path:['spec','extensions',i,'name'],message:'Extension name is required.'});});}
 if(c.kind==='Publication'&&d.get(path('target.allTables'))!==true){const rows=d.get(path('target.objects'));if(!Array.isArray(rows)||!rows.length)issues.push({path:path('target.objects'),message:'Select tables or all tables.'});else rows.forEach((_,i)=>{if(!d.get(['spec','target','objects',i,'table','name'])&&!d.get(['spec','target','objects',i,'tablesInSchema']))issues.push({path:['spec','target','objects',i],message:'Select a table or schema.'});});}
 if(c.kind.endsWith('ImageCatalog')){
  const rows: unknown = d.get(path('images'));
  if(!Array.isArray(rows)||rows.length<1||rows.length>8)issues.push({path:path('images'),message:'Provide 1–8 PostgreSQL images.'});
  else{
   const majors=new Set<bigint>();
   const images: readonly unknown[] = rows;
   for(const row of images){
    const value=row&&typeof row==='object'&&'major' in row?row.major:undefined;
    const major=typeof value==='bigint'?value:typeof value==='number'&&Number.isSafeInteger(value)?BigInt(value):undefined;
    if(major===undefined||major<10n||major>9007199254740991n||!row||typeof row!=='object'||!('image' in row)||typeof row.image!=='string'||!row.image||majors.has(major)){
     issues.push({path:path('images'),message:'Use unique major versions ≥10 and explicit images.'});
    }else majors.add(major);
   }
  }
 }
 return issues;
}
