import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
const component = lazy(() => import('./StrimziForms'));
const inventory = [
 ['Kafka','kafkas'],['KafkaNodePool','kafkanodepools'],['KafkaConnect','kafkaconnects'],
 ['KafkaConnector','kafkaconnectors'],['KafkaTopic','kafkatopics'],['KafkaUser','kafkausers'],
 ['KafkaBridge','kafkabridges'],['KafkaMirrorMaker2','kafkamirrormaker2s'],['KafkaRebalance','kafkarebalances'],
] as const;
export const resourceEditors: readonly ResourceEditorContribution[] = inventory.map(([kind,resource]) => ({
 contractVersion: 1,
 label: `Strimzi · ${kind}`,
 targets: [{group:'kafka.strimzi.io',version:'v1beta2',kind,resource,scope:'Namespaced'}],
 intents: ['create','edit','inspect'],
 sections: [{id:'configuration',label:'Configuration'}],
 ownershipPolicy: kind==='KafkaRebalance'?'conditional':'declarative',
 ownedPaths: [['spec'],['metadata','labels','strimzi.io/cluster'],['metadata','annotations','strimzi.io/kraft'],['metadata','annotations','strimzi.io/node-pools'],['metadata','annotations','strimzi.io/use-connector-resources'],['metadata','annotations','strimzi.io/rebalance'],['metadata','annotations','strimzi.io/restart']],
 sensitivePaths: [['spec','config'],['spec','authentication','password'],['spec','authentication','clientSecret'],['spec','clusters','*','authentication','password'],['spec','clusters','*','config']],
 component,
 validate: (draft) => {
  const issues: {path: readonly (string|number)[];message:string}[]=[];
  if(kind==='KafkaMirrorMaker2') {
   const clusters=draft.get(['spec','clusters']);
   const aliases=Array.isArray(clusters)?clusters.map((_,i)=>draft.get(['spec','clusters',i,'alias'])):[];
   if(new Set(aliases).size!==aliases.length) issues.push({path:['spec','clusters'],message:'Cluster aliases must be unique.'});
   const connect=draft.get(['spec','connectCluster']);
   if(connect&&!aliases.includes(connect)) issues.push({path:['spec','connectCluster'],message:'Connect alias must match a cluster connection.'});
   const mirrors=draft.get(['spec','mirrors']);
   if(Array.isArray(mirrors)) mirrors.forEach((_,i)=>{
    const source=draft.get(['spec','mirrors',i,'sourceCluster']);
    const target=draft.get(['spec','mirrors',i,'targetCluster']);
    if(!aliases.includes(source)||!aliases.includes(target)||source===target) issues.push({path:['spec','mirrors',i],message:'Choose distinct source and target cluster aliases.'});
   });
  }
  if(kind==='KafkaRebalance'&&['add-brokers','remove-brokers'].includes(String(draft.get(['spec','mode'])))) {
   const brokers=draft.get(['spec','brokers']);
   if(!Array.isArray(brokers)||!brokers.length) issues.push({path:['spec','brokers'],message:'Select broker IDs for this rebalance mode.'});
  }
  if(kind==='Kafka') {
   const listeners=draft.get(['spec','kafka','listeners']);
   const names=new Set<unknown>();const ports=new Set<unknown>();
   if(Array.isArray(listeners)) listeners.forEach((_,i)=>{
    const name=draft.get(['spec','kafka','listeners',i,'name']);
    const port=draft.get(['spec','kafka','listeners',i,'port']);
    if(!name||names.has(name)) issues.push({path:['spec','kafka','listeners',i,'name'],message:'Listener names must be present and unique.'});
    if((typeof port!=='number'&&typeof port!=='bigint')||port<9092||port>65535||port===9404||port===9999||port===9404n||port===9999n||ports.has(port)) issues.push({path:['spec','kafka','listeners',i,'port'],message:'Choose a unique listener port from 9092–65535, excluding 9404 and 9999.'});
    names.add(name);ports.add(port);
   });
  }
  return issues;
 },
 readOnly: (_draft,context) => context.intent==='inspect'||context.ownership?.status==='controller'||context.ownership?.status==='system'||kind==='KafkaRebalance'&&context.ownership?.status!=='application',
 formUnavailable: (draft,context) => {
  if(context.discovery.status!=='available'||context.schema.status!=='available') return 'Installed Strimzi API and schema must be available.';
  if(kind==='KafkaConnector'&&context.discovery.features['strimzi.connector-resources']!=='available') return 'Connector-resource enablement and installed connector class must be verified.';
  if(kind==='KafkaRebalance'&&context.intent==='create'&&context.ownership?.status!=='application') return 'Rebalance authoring requires an explicitly application-owned request.';
  if(kind==='KafkaNodePool'&&draft.get(['spec','storage','type'])==='jbod') return 'JBOD volume layout requires source editing; no storage conversion is performed.';
  return null;
 },
}));
