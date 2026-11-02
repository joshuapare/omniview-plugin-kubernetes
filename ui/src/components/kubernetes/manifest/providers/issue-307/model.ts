import type { ResourceEditorDraft, ResourceEditorPatch, ResourceEditorPath } from '@omniviewdev/runtime';
export type Field = { key: string; label: string; type?: 'integer'|'duration'|'url'|'quantity'|'map'|'selector'|'array'|'rule'; options?: string[]; fields?: Field[]; help?: string };
const text = (key:string,label:string,type?:Field['type']):Field => ({key,label,type});
const array = (key:string,label:string,fields:Field[]):Field => ({key,label,type:'array',fields});
const selector = (key:string,label:string):Field => ({key,label,type:'selector',help:'Omitted selects no objects; empty selects all objects. Namespace selectors have different semantics. Existing expressions remain unchanged.'});
const replicas = text('replicas','Replicas','integer');
const shards = text('shards','Shards','integer');
const retention = text('retention','Retention','duration');
const storage:Field = {key:'storage',label:'Persistent storage',fields:[{key:'volumeClaimTemplate',label:'Volume claim',fields:[{key:'spec',label:'Claim settings',fields:[text('storageClassName','Storage class'),{key:'resources',label:'Resources',fields:[{key:'requests',label:'Requests',fields:[text('storage','Storage request','quantity')]}]}]}]}]};
const remote = array('remoteWrite','Remote write',[text('url','Destination URL','url'),text('name','Name'),text('remoteTimeout','Timeout','duration')]);
const relabel = array('relabelings','Relabeling',[{key:'action',label:'Action',options:['replace','keep','drop','hashmod','labelmap','labeldrop','labelkeep','lowercase','uppercase','keepequal','dropequal']},array('sourceLabels','Source labels',[text('','Label')]),text('separator','Separator'),text('regex','Regular expression'),text('targetLabel','Target label'),text('replacement','Replacement'),text('modulus','Modulus','integer')]);
const endpoint = [text('port','Named port'),text('path','Metrics path'),{key:'scheme',label:'Scheme',options:['http','https']},text('interval','Interval','duration'),text('scrapeTimeout','Timeout','duration'),relabel,array('metricRelabelings','Metric relabeling',relabel.fields!)];
const route:Field[] = [text('receiver','Receiver'),array('groupBy','Group labels',[text('','Label')]),text('groupWait','Group wait','duration'),text('groupInterval','Group interval','duration'),text('repeatInterval','Repeat interval','duration'),array('matchers','Matchers',[text('name','Label'),text('value','Value'),{key:'matchType',label:'Match',options:['=','!=','=~','!~']}])];
export const definitions:Record<string,{version:string;resource:string;fields:Field[];consequence?:string}> = {
 Prometheus:{version:'v1',resource:'prometheuses',fields:[replicas,shards,retention,selector('serviceMonitorSelector','Service monitors'),selector('podMonitorSelector','Pod monitors'),selector('probeSelector','Probes'),selector('scrapeConfigSelector','Scrape configs'),selector('ruleSelector','Rules'),storage,remote],consequence:'Shard changes do not redistribute historical data. Storage changes may roll Pods.'},
 PrometheusAgent:{version:'v1alpha1',resource:'prometheusagents',fields:[replicas,shards,selector('serviceMonitorSelector','Service monitors'),selector('podMonitorSelector','Pod monitors'),selector('probeSelector','Probes'),selector('scrapeConfigSelector','Scrape configs'),remote],consequence:'Alpha API. Agent collects and forwards; no local rule evaluation or query service.'},
 Alertmanager:{version:'v1',resource:'alertmanagers',fields:[replicas,text('configSecret','Configuration Secret'),selector('alertmanagerConfigSelector','Alertmanager configs'),retention,storage],consequence:'Configuration changes can redirect or silence notifications.'},
 ThanosRuler:{version:'v1',resource:'thanosrulers',fields:[replicas,array('queryEndpoints','Query endpoints',[text('','URL','url')]),array('alertmanagersUrl','Alertmanager URLs',[text('','URL','url')]),text('evaluationInterval','Evaluation interval','duration'),selector('ruleSelector','Rules'),storage]},
 ServiceMonitor:{version:'v1',resource:'servicemonitors',fields:[{key:'selector',label:'Service labels',type:'selector'},array('endpoints','Service scrape endpoints',endpoint)]},
 PodMonitor:{version:'v1',resource:'podmonitors',fields:[{key:'selector',label:'Pod labels',type:'selector'},array('podMetricsEndpoints','Pod scrape endpoints',endpoint)]},
 Probe:{version:'v1',resource:'probes',fields:[text('jobName','Job name'),{key:'prober',label:'Existing blackbox prober',fields:[text('url','Host:port'),text('path','Probe path'),{key:'scheme',label:'Scheme',options:['http','https']}]},text('module','Module'),text('interval','Interval','duration'),text('scrapeTimeout','Timeout','duration'),{key:'targets',label:'Targets',fields:[{key:'staticConfig',label:'Static targets',fields:[array('static','Targets',[text('','Target URL','url')]),{key:'labels',label:'Target labels',type:'map'},{...relabel,key:'relabelingConfigs'}]}]}],consequence:'Requires an existing blackbox exporter. No exporter or Service is created.'},
 PrometheusRule:{version:'v1',resource:'prometheusrules',fields:[array('groups','Rule groups',[text('name','Group name'),text('interval','Evaluation interval','duration'),array('rules','Rules',[{key:'',label:'Rule',type:'rule'},text('expr','PromQL expression'),text('for','Pending duration','duration'),text('keep_firing_for','Keep firing','duration'),{key:'labels',label:'Labels',type:'map'},{key:'annotations',label:'Annotations',type:'map'}])])]},
 AlertmanagerConfig:{version:'v1alpha1',resource:'alertmanagerconfigs',fields:[{key:'route',label:'Root route',fields:[...route,array('routes','Child routes',route)]},array('receivers','Receivers',[text('name','Receiver name'),array('webhookConfigs','Webhook delivery',[{key:'urlSecret',label:'URL Secret reference',fields:[text('name','Secret name'),text('key','Secret key')]}])])],consequence:'Alpha API. Routing changes can redirect or silence notifications. Secret values are never fetched.'},
 ScrapeConfig:{version:'v1alpha1',resource:'scrapeconfigs',fields:[text('jobName','Job name'),{key:'scheme',label:'Scheme',options:['HTTP','HTTPS']},text('metricsPath','Metrics path'),text('scrapeInterval','Interval','duration'),text('scrapeTimeout','Timeout','duration'),array('staticConfigs','Static target groups',[array('targets','Targets',[text('','Host:port')]),{key:'labels',label:'Labels',type:'map'}]),relabel],consequence:'Alpha API. Installed CRDs do not prove operator support.'},
};
/**
 * Display only public HTTP(S) URLs or prober host:port references.
 * Queries, fragments, userinfo, encoded syntax, and opaque projections stay
 * canonical but blank in the form, including after YAML edits or remounts.
 * This is display policy, not an additional admission or URL validation rule.
 */
export function publicMonitoringReference(value:unknown, hostPort=false):string {
 if(typeof value!=='string'||!value||/[\s\\%?#@]/.test(value)||!/^[A-Za-z0-9._~:/+[\]-]+$/.test(value)) return '';
 try {
  const url=new URL(hostPort&&!value.includes('://')?`http://${value}`:value);
  return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?value:'';
 } catch { return ''; }
}
export function parseField(field:Field,text:string):{value:unknown;error?:string} {
 if(field.type==='integer') return /^\d+$/.test(text) && BigInt(text)<=2147483647n ? {value:Number(text)} : {value:null,error:'Enter a nonnegative 32-bit integer.'};
 if(field.type==='duration' && !/^(?:\d+(?:ms|s|m|h|d|w|y))+$/.test(text)) return {value:null,error:'Enter a duration with units.'};
 if(field.type==='quantity' && !/^(?:\d+(?:\.\d+)?)(?:[EPTGMK]i?|[munk])?$/.test(text)) return {value:null,error:'Enter a Kubernetes storage quantity.'};
 if(field.type==='url') { try { const url=new URL(text); if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw Error(); } catch { return {value:null,error:'Enter an HTTP(S) URL without credentials.'}; } }
 return {value:text};
}
export function ruleBranch(path:ResourceEditorPath,branch:string):ResourceEditorPatch[] { const operations:ResourceEditorPatch[] = ['alert','record','for','keep_firing_for'].map(key=>({op:'remove',path:[...path,key]})); return [...operations,{op:'set',path:[...path,branch],value:''}]; }
export function unsupported(draft:ResourceEditorDraft,kind:string):string|null { return kind==='PrometheusAgent' && draft.get(['spec','mode'])==='DaemonSet' ? 'DaemonSet mode requires an independently verified feature gate; use source.' : null; }
