import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export function readOnly(draft:ResourceEditorDraft, context:ResourceEditorContext):boolean {
  if (context.intent === 'inspect' || ['BlockAffinity','ClusterInformation'].includes(context.kind)) return true;
  if (context.ownership?.status === 'controller' || context.ownership?.status === 'system') return true;
  if (context.kind === 'Profile') {
    const name = context.name ?? draft.get(['metadata','name']);
    const owners=draft.get(['metadata','ownerReferences']);
    return context.ownership?.status !== 'application' || typeof name !== 'string' || /^(kns\.|ksa\.)/.test(name) || (Array.isArray(owners)?owners.length>0:owners!==undefined);
  }
  return false;
}
export function unavailable(_draft:ResourceEditorDraft, context:ResourceEditorContext):string|null {
  if (context.discovery.status !== 'available') return 'Calico aggregated API availability is not established.';
  if (context.schema.status !== 'available') return 'Installed Calico schema is unavailable.';
  return null;
}
export function parseNumber(text:string): {valid:true;value:number|bigint}|{valid:false;error:string} {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return {valid:false,error:'Enter a finite number.'};
  if (/^[+-]?\d+$/.test(text)) return {valid:true,value:BigInt(text)};
  const value=Number(text);
  return Number.isFinite(value) ? {valid:true,value} : {valid:false,error:'Enter a finite number.'};
}
export function parseCalicoNumber(field:string,text:string):{valid:true;value:number|bigint|string}|{valid:false;error:string} {
  if(field==='order') return parseNumber(text);
  if(field==='asNumber' && /^\d+\.\d+$/.test(text)) {
    return text.split('.').every(part=>BigInt(part)<=65535n)?{valid:true,value:text}:{valid:false,error:'Each dotted AS component must be between 0 and 65535.'};
  }
  if(!/^\d+$/.test(text)) return {valid:false,error:'Enter a non-negative whole number.'};
  const value=BigInt(text);
  const maximum=field==='asNumber'?4294967295n:field==='updatePeriodSeconds'?86400n:['listenPort','port','endPort'].includes(field)?65535n:field==='blockSize'?128n:undefined;
  if(maximum!==undefined && value>maximum) return {valid:false,error:`Maximum value is ${maximum}.`};
  return {valid:true,value};
}
export function validCIDR(text:string):boolean {
  const [ip,prefix,...extra]=text.split('/');
  if (extra.length || !/^\d+$/.test(prefix ?? '')) return false;
  if (ip.includes(':')) {
    if (Number(prefix)>128 || ip.includes(':::')) return false;
    const halves=ip.split('::');
    if(halves.length>2) return false;
    const groups=halves.flatMap(half=>half?half.split(':'):[]);
    return groups.every(group=>/^[0-9a-f]{1,4}$/i.test(group)) && (halves.length===2?groups.length<8:groups.length===8);
  }
  return ip.split('.').length===4 && ip.split('.').every(p=>/^\d+$/.test(p)&&Number(p)<=255) && Number(prefix)<=32;
}
export function validate(draft:ResourceEditorDraft,context:ResourceEditorContext):readonly ResourceEditorFieldIssue[] {
  if(readOnly(draft,context)) return [];
  const issues:ResourceEditorFieldIssue[]=[];
  if(context.kind==='IPPool') {
    const cidr=draft.get(['spec','cidr']);
    if(typeof cidr!=='string'||!validCIDR(cidr)) issues.push({path:['spec','cidr'],message:'Enter a valid pool CIDR.'});
    const ipip=draft.get(['spec','ipipMode']);const vxlan=draft.get(['spec','vxlanMode']);
    if(ipip!==undefined&&ipip!=='Never'&&vxlan!==undefined&&vxlan!=='Never') issues.push({path:['spec','vxlanMode'],message:'Choose either IP-in-IP or VXLAN encapsulation, not both.'});
  }
  if(context.kind==='BGPPeer') {
    const address=draft.get(['spec','peerIP']);const selector=draft.get(['spec','peerSelector']);
    if((typeof address!=='string'||!address)&&(typeof selector!=='string'||!selector)) issues.push({path:['spec','peerIP'],message:'Choose a peer address or a peer node selector.'});
    if(address&&selector) issues.push({path:['spec','peerSelector'],message:'Peer address and peer node selector are alternatives.'});
  }
  if(['HostEndpoint','CalicoNodeStatus'].includes(context.kind)&&!draft.get(['spec','node'])) issues.push({path:['spec','node'],message:'Choose a node.'});
  if(context.kind==='CalicoNodeStatus') {
    const classes=draft.get(['spec','classes']);
    if(!Array.isArray(classes)||classes.length===0) issues.push({path:['spec','classes'],message:'Choose at least one diagnostic class.'});
    if(!draft.has(['spec','updatePeriodSeconds'])) issues.push({path:['spec','updatePeriodSeconds'],message:'Set an update interval in seconds.'});
  }
  return issues;
}
