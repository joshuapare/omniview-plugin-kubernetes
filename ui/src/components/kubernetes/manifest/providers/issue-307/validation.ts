import type { ResourceEditorDraft,ResourceEditorFieldIssue,ResourceEditorPath } from '@omniviewdev/runtime';
export function validateMonitoring(draft:ResourceEditorDraft,kind:string):ResourceEditorFieldIssue[] {
 const issues:ResourceEditorFieldIssue[]=[];
 const requireText=(path:ResourceEditorPath,label:string)=>{const value=draft.get(path);if(typeof value!=='string'||!value.trim())issues.push({path,message:`${label} is required.`});};
 const rows=(path:ResourceEditorPath,required:boolean,visit:(path:ResourceEditorPath)=>void)=>{const value=draft.get(path);if(!Array.isArray(value)){if(required)issues.push({path,message:'Add at least one row.'});return;}if(required&&!value.length)issues.push({path,message:'Add at least one row.'});value.forEach((_,index)=>visit([...path,index]));};
 if(kind==='ServiceMonitor'||kind==='PodMonitor')rows(['spec',kind==='ServiceMonitor'?'endpoints':'podMetricsEndpoints'],true,path=>{if(!draft.has([...path,'targetPort'])&&!draft.has([...path,'portNumber']))requireText([...path,'port'],'Named port');});
 if(kind==='PrometheusRule')rows(['spec','groups'],true,group=>{requireText([...group,'name'],'Group name');rows([...group,'rules'],true,rule=>{requireText([...rule,'expr'],'PromQL expression');const alert=draft.has([...rule,'alert']);const record=draft.has([...rule,'record']);if(alert===record)issues.push({path:rule,message:'Choose exactly one alert or recording rule.'});else requireText([...rule,alert?'alert':'record'],'Rule name');if(record&&(draft.has([...rule,'for'])||draft.has([...rule,'keep_firing_for'])))issues.push({path:rule,message:'Recording rules cannot have alert durations.'});});});
 if(kind==='Probe'){requireText(['spec','prober','url'],'Prober host:port');if(!draft.has(['spec','targets','ingress']))rows(['spec','targets','staticConfig','static'],true,path=>requireText(path,'Target'));}
 if(kind==='ThanosRuler')rows(['spec','queryEndpoints'],!draft.has(['spec','queryConfig']),path=>requireText(path,'Query endpoint'));
 if(kind==='AlertmanagerConfig'){
 const names=new Set<string>();
 rows(['spec','receivers'],false,path=>{requireText([...path,'name'],'Receiver name');const name=draft.get([...path,'name']);if(typeof name==='string'){if(names.has(name))issues.push({path:[...path,'name'],message:'Receiver name must be unique.'});names.add(name);}});
 if(draft.has(['spec','route'])){const receiver=draft.get(['spec','route','receiver']);if(typeof receiver!=='string'||!names.has(receiver))issues.push({path:['spec','route','receiver'],message:'Choose a receiver defined in this configuration.'});}
 }
 return issues;
}
