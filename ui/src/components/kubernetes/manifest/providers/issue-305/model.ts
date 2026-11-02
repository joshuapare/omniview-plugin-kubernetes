import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorPath } from '@omniviewdev/runtime';
import { CALICO_330_IMAGES } from './evidence';
export const resources = { Installation: 'installations', APIServer: 'apiservers', ImageSet: 'imagesets', Goldmane: 'goldmanes', Whisker: 'whiskers', GatewayAPI: 'gatewayapis', TigeraStatus: 'tigerastatuses' } as const;
export type Kind = keyof typeof resources;
export const deployment = (kind: string) => kind === 'APIServer' ? 'apiServerDeployment' : kind === 'Goldmane' ? 'goldmaneDeployment' : 'whiskerDeployment';
export const paths: Record<Kind, readonly ResourceEditorPath[]> = {
 Installation: [['spec','kubernetesProvider'], ['spec','calicoNetwork','linuxDataplane'], ['spec','calicoNetwork','bgp'], ['spec','calicoNetwork','mtu'], ['spec','calicoNetwork','ipPools'], ['spec','registry'], ['spec','controlPlaneReplicas']],
 APIServer: [['spec','apiServerDeployment','spec','minReadySeconds'], ['spec','apiServerDeployment','spec','template','spec','priorityClassName'], ['spec','logging','apiServer','logSeverity']],
 Goldmane: [['spec','goldmaneDeployment','spec','minReadySeconds'], ['spec','goldmaneDeployment','spec','template','spec','priorityClassName']],
 Whisker: [['spec','whiskerDeployment','spec','minReadySeconds'], ['spec','whiskerDeployment','spec','template','spec','priorityClassName'], ['spec','notifications']],
 ImageSet: [['spec','images']], GatewayAPI: [['spec','crdManagement']], TigeraStatus: [],
};
export function qualify(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
 if (context.kind === 'TigeraStatus') return null;
 const name = draft.get(['metadata','name']);
 if (name && (typeof name !== 'string' || (context.kind === 'ImageSet' ? name !== 'calico-v3.30.0' : !['default', ...(context.kind === 'APIServer' || context.kind === 'GatewayAPI' ? ['tigera-secure'] : [])].includes(name)))) return 'This operator does not reconcile this resource name.';
 if (context.kind === 'Installation' && draft.has(['spec','variant']) && draft.get(['spec','variant']) !== 'Calico') return 'Enterprise installations require an Enterprise editor.';
 return null;
}
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
 const issues: ResourceEditorFieldIssue[] = [];
 if (context.kind === 'Installation') {
  const pools = draft.get(['spec','calicoNetwork','ipPools']);
  if (Array.isArray(pools)) pools.forEach((_, index) => {
   const cidr = draft.get(['spec','calicoNetwork','ipPools',index,'cidr']);
   if (typeof cidr !== 'string' || !parseRow(cidr,'cidr').valid) issues.push({path:['spec','calicoNetwork','ipPools',index,'cidr'],message:'Enter an IPv4 or IPv6 CIDR.'});
  });
 }
 if (context.kind === 'ImageSet') {
  const rows = draft.get(['spec','images']);
  if (!Array.isArray(rows) || !rows.length) issues.push({path:['spec','images'],message:'Add the complete image inventory for this operator release.'});
  const seen = new Set<string>();
  if (Array.isArray(rows)) rows.forEach((_, i) => {
   const image = draft.get(['spec','images',i,'image']);
   const digest = draft.get(['spec','images',i,'digest']);
   if (typeof image !== 'string' || !(CALICO_330_IMAGES as readonly string[]).includes(image) || seen.has(image)) issues.push({path:['spec','images',i,'image'],message:'Choose a unique original image from the pinned Calico v3.30.0 inventory.'});
   if (typeof image === 'string') seen.add(image);
   if (typeof digest !== 'string' || !/^sha256:[a-fA-F0-9]{64}$/.test(digest)) issues.push({path:['spec','images',i,'digest'],message:'Enter sha256: followed by 64 hexadecimal characters.'});
  });
  const missing = CALICO_330_IMAGES.filter(image=>!seen.has(image));
  if (missing.length) issues.push({path:['spec','images'],message:`Complete the pinned inventory: ${missing.length} image digests missing.`});
 }
 return issues;
}
export function integer(text: string) {
 if (text === '') return {valid:true as const,value:''};
 if (!/^\d+$/.test(text) || BigInt(text) > 2147483647n) return {valid:false as const,error:'Enter a whole number from 0 to 2147483647.'};
 return {valid:true as const,value:Number(text)};
}
export function parseRow(text: string, type: 'image' | 'digest' | 'cidr') {
 let valid = false;
 if (type === 'image') valid = /^[a-z0-9._-]+\/[a-z0-9._/-]+$/.test(text) && !text.includes('//');
 if (type === 'digest') valid = /^sha256:[a-fA-F0-9]{64}$/.test(text);
 if (type === 'cidr') {
  const [address, prefix, extra] = text.split('/');
  if (extra === undefined && /^\d+$/.test(prefix ?? '')) {
   if (address.includes(':')) {
    try { new URL(`http://[${address}]/`); valid = Number(prefix) <= 128; } catch { valid = false; }
   } else valid = address.split('.').length === 4 && address.split('.').every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255) && Number(prefix) <= 32;
  }
 }
 return valid ? {valid:true as const,value:text} : {valid:false as const,error:type === 'digest' ? 'Use sha256: and 64 hexadecimal characters.' : type === 'cidr' ? 'Enter an IPv4 or IPv6 CIDR.' : 'Enter an original image name without registry, tag or digest.'};
}
