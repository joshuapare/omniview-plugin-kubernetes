import { describe, expect, it } from 'vitest';
import { generated, nonnegativeInteger, packageImageError, validatePackage, validateImage, validateRuntime, unsupportedReason } from './model';
import type { ResourceEditorDraft } from '@omniviewdev/runtime';
describe('Crossplane package safety',()=>{
 it('retains exact bounded history values and rejects partial or out-of-range input',()=>{
  expect(nonnegativeInteger('0')).toEqual({valid:true,value:0n});
  expect(nonnegativeInteger('2147483647')).toEqual({valid:true,value:2147483647n});
  expect(nonnegativeInteger('9223372036854775807')).toEqual({valid:true,value:9223372036854775807n});
  for(const text of ['-1','1.5','9223372036854775808','1e3','']) expect(nonnegativeInteger(text).valid).toBe(false);
 });
 it('accepts tag and digest references without treating registry URLs as package images',()=>{
  expect(packageImageError('registry.example/team/provider:v2')).toBeNull();
  expect(packageImageError('registry.example/team/provider@sha256:abcd')).toBeNull();
  expect(packageImageError('https://registry.example/pkg')).not.toBeNull();
  expect(packageImageError('two words')).not.toBeNull();
 });
 it('blocks missing package data before submission',()=>{
  const draft:ResourceEditorDraft={sessionID:'fixture',revision:0,get:()=>undefined,has:()=>false};
  expect(validatePackage(draft)).toEqual([{path:['spec','package'],message:packageImageError('')}]);
 });
 it('keeps generated revisions and lock outside ordinary authoring',()=>{
  expect(generated('ProviderRevision')).toBe(true);
  expect(generated('ConfigurationRevision')).toBe(true);
  expect(generated('FunctionRevision')).toBe(true);
  expect(generated('Lock')).toBe(true);
  expect(generated('Provider')).toBe(false);
 });
});
describe('Crossplane shape validation',()=>{
 const draft = (values: Record<string, unknown>):ResourceEditorDraft => ({sessionID:'fixture',revision:0,get:path=>values[path.join('.')],has:path=>path.join('.') in values});
 it('requires nonempty matching prefixes instead of accepting an empty match list',()=>{
  expect(validateImage(draft({'spec.matchImages':[]}))).toHaveLength(1);
  expect(validateImage(draft({'spec.matchImages':[{}],'spec.matchImages.0.prefix':''}))).toHaveLength(1);
  expect(validateImage(draft({'spec.matchImages':[{}],'spec.matchImages.0.prefix':'registry.example/'}))).toHaveLength(0);
 });
 it('distinguishes omitted replicas and explicit zero without accepting int64 replica values',()=>{
  expect(validateRuntime(draft({}))).toHaveLength(0);
  expect(validateRuntime(draft({'spec.deploymentTemplate.spec.replicas':0n}))).toHaveLength(0);
  expect(validateRuntime(draft({'spec.deploymentTemplate.spec.replicas':9223372036854775807n}))).toHaveLength(1);
 });
});
it('keeps unsupported source shapes out of destructive row editing',()=>{
 const values:Record<string,unknown>={'spec.matchImages':[{prefix:'registry.example/',type:'FutureMatch'}],'spec.matchImages.0.type':'FutureMatch'};
 const draft:ResourceEditorDraft={sessionID:'fixture',revision:4,get:path=>values[path.join('.')],has:path=>path.join('.') in values};
 expect(unsupportedReason(draft,'ImageConfig')).toBeTruthy();
 expect(values['spec.matchImages.0.type']).toBe('FutureMatch');
 const malformed:ResourceEditorDraft={...draft,get:()=>({opaque:true}),has:()=>true};
 expect(unsupportedReason(malformed,'DeploymentRuntimeConfig')).toBeTruthy();
});
