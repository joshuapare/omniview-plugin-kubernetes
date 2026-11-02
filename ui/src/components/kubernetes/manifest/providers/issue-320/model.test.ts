import { describe, expect, it } from 'vitest';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
import { parseScalar, parseSchemaFragment, validateDomain } from './model';
function draft(value:unknown):ResourceEditorDraft { const get=(path:readonly(string|number)[])=>path.reduce<unknown>((node,key)=>node&&typeof node==='object'?(node as Record<string|number,unknown>)[key]:undefined,value); return {sessionID:'fixture',revision:0,get,has:path=>get(path)!==undefined}; }
describe('Crossplane authoring constraints',()=>{
 it('rejects duplicate pipeline step names without touching function inputs',()=>{
 const value={spec:{compositeTypeRef:{apiVersion:'example.org/v1',kind:'Cluster'},pipeline:[{step:'render',functionRef:{name:'render'},input:{preserve:true}},{step:'render',functionRef:{name:'next'}}]}};
 expect(validateDomain(draft(value),'Composition').some(issue=>issue.message.includes('unique'))).toBe(true);
 expect(value.spec.pipeline[0].input).toEqual({preserve:true});
 });
 it('requires one referenceable served XRD version',()=>{expect(validateDomain(draft({spec:{group:'example.org',names:{kind:'Cluster',plural:'clusters'},versions:[{name:'v1',served:false,referenceable:true}]}}),'CompositeResourceDefinition').some(issue=>issue.message.includes('served'))).toBe(true);});
 it('allows Usage reason without inventing a using resource',()=>{expect(validateDomain(draft({spec:{of:{apiVersion:'example.org/v1',kind:'Database',resourceRef:{name:'db'}},reason:'Protection'}}),'Usage')).toEqual([]);});
 it('rejects non-prefix wildcard activation',()=>{expect(validateDomain(draft({spec:{activate:['*.example.org']}}),'ManagedResourceActivationPolicy')).not.toEqual([]);});
 it('keeps wide environment integers exact and partial decimals invalid',()=>{expect(parseScalar('9007199254740993123','number')).toEqual({valid:true,value:9007199254740993123n});expect(parseScalar('-','number').valid).toBe(false);expect(parseScalar('false','string')).toEqual({valid:true,value:'false'});});
 it('rejects lossy schema numeric tokens before committing fresh replacement',()=>{
  for (const number of ['9007199254740993','9007199254740991.1','1e-400','1e309']) expect(parseSchemaFragment(`{"default":${number}}`).valid).toBe(false);
  expect(parseSchemaFragment('{"type":"string","default":"9007199254740993"}')).toEqual({valid:true,value:{type:'string',default:'9007199254740993'}});
  expect(parseSchemaFragment('{"minimum":-9007199254740991,"properties":{"count":{"default":42}}}').valid).toBe(true);
  expect(parseSchemaFragment('[]').valid).toBe(false);
 });
});
