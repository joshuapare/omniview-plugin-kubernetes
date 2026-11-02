import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { integer, parseRow, qualify, validate } from './model';
import { CALICO_330_IMAGES, evidenceFailure } from './evidence';
function draft(value: unknown): ResourceEditorDraft {
 return {sessionID:'fixture',revision:0,get(path){return path.reduce<unknown>((node,key)=>node !== null && typeof node === 'object' ? (node as Record<string|number,unknown>)[key] : undefined,value);},has(path){return this.get(path)!==undefined;}};
}
const context = (kind:string) => ({kind,intent:'create'}) as ResourceEditorContext;
describe('Calico operator authoring boundaries',()=>{
 it('rejects unsupported singleton names but preserves legacy APIServer identity',()=>{
  expect(qualify(draft({metadata:{name:'other'}}),context('Goldmane'))).not.toBeNull();
  expect(qualify(draft({metadata:{name:'tigera-secure'}}),context('APIServer'))).toBeNull();
  expect(qualify(draft({metadata:{name:'tigera-secure'}}),context('Whisker'))).not.toBeNull();
 });
 it('does not represent an Enterprise installation as OSS',()=>{
  expect(qualify(draft({spec:{variant:'TigeraSecureEnterprise'}}),context('Installation'))).not.toBeNull();
 });
 it('keeps partial digest and malformed CIDR values uncommitted',()=>{
  expect(parseRow('sha256:abc','digest').valid).toBe(false);
  expect(parseRow('sha256:'+'a'.repeat(64),'digest').valid).toBe(true);
  for(const value of ['999.1.1.1/24','10.0.0.0/33','2001:::1/64','2001:db8::/129']) expect(parseRow(value,'cidr').valid).toBe(false);
  expect(parseRow('2001:db8::/64','cidr').valid).toBe(true);
 });
 it('rejects duplicate image pins and malformed digests',()=>{
  const images = [{image:'calico/node',digest:'sha256:'+'a'.repeat(64)},{image:'calico/node',digest:'bad'}];
  expect(validate(draft({spec:{images}}),context('ImageSet')).map(issue=>issue.path.at(-1))).toEqual(['image','digest','images']);
 });
 it('bounds int32 fields without rounding and preserves omission',()=>{
  expect(integer('2147483648').valid).toBe(false);
  expect(integer('1.5').valid).toBe(false);
  expect(integer('')).toEqual({valid:true,value:''});
  expect(integer('2147483647')).toEqual({valid:true,value:2147483647});
 });
 it('requires all pinned images, disallows unknown images, and checks exact release name',()=>{
  const images: {image:string;digest:string}[] = CALICO_330_IMAGES.map(image=>({image,digest:'sha256:'+'a'.repeat(64)}));
  expect(validate(draft({spec:{images}}),context('ImageSet'))).toEqual([]);
  expect(validate(draft({spec:{images:images.slice(1)}}),context('ImageSet'))).toHaveLength(1);
  expect(validate(draft({spec:{images:[...images,{image:'calico/unknown',digest:'sha256:'+'b'.repeat(64)}]}}),context('ImageSet'))).toHaveLength(1);
  expect(qualify(draft({metadata:{name:'calico-v3.31.0'}}),context('ImageSet'))).not.toBeNull();
 });
 it('uses actual bounded cohort evidence without equating schema or image syntax with support',()=>{
  const evidence = {controller:{status:'ready',deployments:[{images:[{name:'tigera-operator',image:'quay.io/tigera/operator:v1.38.0'}]}]},installation:{status:'ready',observed:{variant:'Calico',calicoVersion:'v3.30.0'}},goldmane:{status:'ready'}};
  expect(evidenceFailure(evidence,'ImageSet')).toBeNull();
  expect(evidenceFailure(evidence,'Whisker')).toBeNull();
  expect(evidenceFailure({...evidence,goldmane:{status:'absent'}},'Whisker')).not.toBeNull();
  expect(evidenceFailure({...evidence,installation:{status:'denied'}},'GatewayAPI')).not.toBeNull();
  expect(evidenceFailure({...evidence,controller:{status:'ready',deployments:[{images:[{name:'tigera-operator',image:'quay.io/tigera/operator:v1.39.0'}]}]}},'APIServer')).not.toBeNull();
  expect(evidenceFailure({...evidence,installation:{status:'absent'}},'Installation')).toBeNull();
  expect(evidenceFailure({controller:{status:'ready'},installation:{status:'ready'}},'ImageSet')).not.toBeNull();
 });
});
