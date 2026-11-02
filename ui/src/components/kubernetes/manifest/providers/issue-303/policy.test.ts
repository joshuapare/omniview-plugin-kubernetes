import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { parseCalicoNumber, parseNumber, readOnly, unavailable, validCIDR, validate } from './policy';
const draft:ResourceEditorDraft={sessionID:'fixture',revision:0,get:()=>undefined,has:()=>false};
const context:ResourceEditorContext={group:'projectcalico.org',version:'v3',kind:'Profile',resource:'profiles',scope:'Cluster',connectionID:'fixture',intent:'edit',name:'independent',ownership:{status:'application'},capabilities:{create:'available',update:'available',delete:'available',get:'available',list:'available',actions:{}},discovery:{status:'available',features:{}},schema:{status:'available'}};
describe('Calico authoring safety',()=>{
  it('protects generated and unknown-ownership Profiles',()=>{
    expect(readOnly(draft,context)).toBe(false);
    expect(readOnly(draft,{...context,name:'kns.default'})).toBe(true);
    expect(readOnly(draft,{...context,name:'ksa.default.reader'})).toBe(true);
    expect(readOnly(draft,{...context,ownership:undefined})).toBe(true);
    expect(readOnly(draft,{...context,ownership:{status:'controller'}})).toBe(true);
  });
  it('keeps system records inspection-only regardless of intent',()=>{
    for(const kind of ['BlockAffinity','ClusterInformation']) expect(readOnly(draft,{...context,kind,intent:'create'})).toBe(true);
  });
  it('requires installed API and schema without inventing a capability gate',()=>{
    expect(unavailable(draft,{...context,kind:'StagedNetworkPolicy'})).toBeNull();
    expect(unavailable(draft,{...context,discovery:{status:'unknown',features:{}}})).not.toBeNull();
    expect(unavailable(draft,{...context,schema:{status:'unknown'}})).not.toBeNull();
  });
  it('keeps large integers exact and incomplete numbers invalid',()=>{
    expect(parseNumber('9007199254740993')).toEqual({valid:true,value:9007199254740993n});
    expect(parseNumber('-').valid).toBe(false);
    expect(parseNumber('NaN').valid).toBe(false);
  });
  it('preserves dotted AS numbers and bounds diagnostic intervals',()=>{
    expect(parseCalicoNumber('asNumber','1.10')).toEqual({valid:true,value:'1.10'});
    expect(parseCalicoNumber('asNumber','65536.1').valid).toBe(false);
    expect(parseCalicoNumber('updatePeriodSeconds','86401').valid).toBe(false);
    expect(parseCalicoNumber('listenPort','1.5').valid).toBe(false);
  });
  it('blocks conflicting pool encapsulation without rewriting the draft',()=>{
    const values:Record<string,unknown>={cidr:'10.42.0.0/16',ipipMode:'Always',vxlanMode:'Always'};
    const pool:ResourceEditorDraft={...draft,get:path=>values[String(path[1])],has:path=>String(path[1]) in values};
    expect(validate(pool,{...context,kind:'IPPool'})).toEqual([{path:['spec','vxlanMode'],message:'Choose either IP-in-IP or VXLAN encapsulation, not both.'}]);
    expect(values).toEqual({cidr:'10.42.0.0/16',ipipMode:'Always',vxlanMode:'Always'});
  });
  it('rejects malformed network prefixes without accepting partial input',()=>{
    for(const input of ['10.0.0.0/24','2001:db8::/64','::/0']) expect(validCIDR(input)).toBe(true);
    for(const input of ['10.0.0.256/24','10.0.0.0/33','2001:::1/64','2001:db8/64','10.0.0.0/']) expect(validCIDR(input)).toBe(false);
  });
});
