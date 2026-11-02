import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import CiliumForm from './CiliumForm';
function fixture(kind: string, value: unknown, intent: 'create'|'edit'|'inspect' = 'create'): ResourceEditorFormProps {
 return {
  context:{group:'cilium.io',version:'v2',kind,resource:'test',scope:'Cluster',connectionID:'fixture',intent,ownership:{status:'application'},capabilities:{create:'available',update:'available',delete:'available',list:'available',get:'available',actions:{}},discovery:{status:'available',features:{}},schema:{status:'available'}},
  draft:{sessionID:'cilium-test',revision:7,has:()=>false,get:path=>path.reduce<unknown>((node,key)=>node && typeof node === 'object' ? (node as Record<string|number,unknown>)[key] : undefined,value)},
  section:'network',disabled:false,patch:vi.fn(()=>({status:'accepted' as const,revision:8})),onValidityChange:vi.fn(),references:{list:async()=>({status:'ready',items:[]})},actions:{execute:async()=>({status:'unavailable',message:'Fixture only'})},
 };
}
describe('Cilium domain editing',()=>{
 it('patches only selected CIDR row and never replaces sibling data',()=>{
  const props=fixture('CiliumCIDRGroup',{spec:{externalCIDRs:['192.0.2.0/24','2001:db8::/32'],unknown:'retain'}});
  render(<CiliumForm {...props}/>);
  fireEvent.change(screen.getByLabelText('External CIDRs 1'),{target:{value:'198.51.100.0/24'}});
  expect(props.patch).toHaveBeenCalledWith({sessionID:'cilium-test',expectedRevision:7,operations:[{op:'set',path:['spec','externalCIDRs',0],value:'198.51.100.0/24'}]});
 });
 it('holds invalid ASN locally without changing canonical source',()=>{
  const props=fixture('CiliumBGPClusterConfig',{spec:{bgpInstances:[{name:'router',localASN:64512,peers:[]}]}});
  render(<CiliumForm {...props}/>);
  fireEvent.change(screen.getByLabelText('Local ASN'),{target:{value:'-'}});
  expect(props.patch).not.toHaveBeenCalled();
  expect(props.onValidityChange).toHaveBeenLastCalledWith('Enter a whole number.');
 });
 it('locks immutable redirect fields on edit',()=>{
  const props=fixture('CiliumLocalRedirectPolicy',{spec:{redirectFrontend:{serviceMatcher:{serviceName:'dns',namespace:'system'}},redirectBackend:{toPorts:[]}}},'edit');
  render(<CiliumForm {...props}/>);
  expect(screen.getByLabelText('Service Name')).toBeDisabled();
  expect(screen.queryByRole('button',{name:/Add/})).toBeNull();
 });
 it('renders all existing nested BGP peers without recursive loops',()=>{
  const props=fixture('CiliumBGPNodeConfigOverride',{spec:{bgpInstances:[{name:'router',peers:[{name:'first',localAddress:'192.0.2.1'},{name:'second',localAddress:'192.0.2.2'}]}]}});
  render(<CiliumForm {...props}/>);
  expect(screen.getByDisplayValue('192.0.2.2')).toBeTruthy();
 });
 it('blocks controller-owned authoring without inferred permissions',()=>{
  const props=fixture('CiliumCIDRGroup',{spec:{externalCIDRs:['192.0.2.0/24']}},'edit');
  props.context.ownership={status:'controller'};
  render(<CiliumForm {...props}/>);
  expect(screen.getByLabelText('External CIDRs 1')).toBeDisabled();
  expect(props.patch).not.toHaveBeenCalled();
 });
 it('keeps controller ownership restricted even for explicit create intent',()=>{
  const props=fixture('CiliumCIDRGroup',{spec:{externalCIDRs:['192.0.2.0/24']}});
  props.context.ownership={status:'controller'};
  render(<CiliumForm {...props}/>);
  expect(screen.getByLabelText('External CIDRs 1')).toBeDisabled();
  expect(screen.queryByRole('button',{name:/Add/})).toBeNull();
  expect(props.patch).not.toHaveBeenCalled();
 });
 it('does not coerce a malformed boolean into an editable selection',()=>{
  const props=fixture('CiliumLoadBalancerIPPool',{spec:{disabled:'false'}});
  render(<CiliumForm {...props}/>);
  expect(screen.getByText('Disabled has an unsupported scalar type. Preserve source.')).toBeTruthy();
  expect(screen.queryByRole('combobox',{name:'Disabled'})).toBeNull();
  expect(props.patch).not.toHaveBeenCalled();
 });
});
