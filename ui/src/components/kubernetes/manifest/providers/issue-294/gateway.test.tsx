import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import GatewayForms from './GatewayForms';
import { resourceEditors } from './index';
import { boundedInteger, trustOperations } from './model';
const context: ResourceEditorContext = {group:'gateway.networking.k8s.io',version:'v1',kind:'Gateway',resource:'gateways',scope:'Namespaced',connectionID:'fixture',namespace:'preview',intent:'edit',ownership:{status:'application'},capabilities:{create:'available',update:'available',get:'available',list:'available',delete:'denied',actions:{}},discovery:{status:'available',features:{}},schema:{status:'available'}};
function Form({controller,validity}:{controller:ResourceEditorController;validity:(error:string|null)=>void}) {
 const [,refresh]=useState(0);
 return <GatewayForms context={context} draft={controller.draft()} section="configuration" disabled={false} onValidityChange={validity} references={{list:async()=>({status:'ready',items:[]})}} actions={{execute:async()=>({status:'unavailable',message:'Fixture only'})}} patch={request=>{const result=controller.patch(request,resourceEditors[1],context);if(result.status==='accepted')refresh(n=>n+1);return result;}}/>;
}
describe('Gateway domain changes',()=>{
 it('keeps partial ports local while preserving listener siblings',()=>{
  const controller=new ResourceEditorController('apiVersion: gateway.networking.k8s.io/v1\nkind: Gateway\nmetadata: {name: edge, namespace: preview}\nspec:\n  gatewayClassName: edge\n  listeners:\n    - name: web\n      protocol: HTTP\n      port: 80\n      allowedRoutes: {kinds: [{kind: HTTPRoute}]}\n');
  const validity=vi.fn();render(<Form controller={controller} validity={validity}/>);
  fireEvent.change(screen.getByLabelText('Port'),{target:{value:'8e'}});
  expect(controller.draft().get(['spec','listeners',0,'port'])).toBe(80n);
  expect(validity).toHaveBeenLastCalledWith('Enter a whole number from 1 to 65535.');
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'public'}});
  expect(screen.getByLabelText('Port')).toHaveValue('8e');
  expect(controller.draft().get(['spec','listeners',0,'allowedRoutes','kinds',0,'kind'])).toBe('HTTPRoute');
 });
 it('bounds ports without unsafe numeric coercion',()=>{
  expect(boundedInteger('65535',65535,1)).toEqual({valid:true,value:65535});
  for(const value of ['0','65536','1e3','9007199254740993','-1']) expect(boundedInteger(value,65535,1).valid).toBe(false);
 });
 it('switches trust branches atomically without replacing hostname',()=>{
  expect(trustOperations('System')).toEqual([{op:'remove',path:['spec','validation','caCertificateRefs']},{op:'set',path:['spec','validation','wellKnownCACertificates'],value:'System'}]);
  expect(trustOperations('ConfigMap')[0]).toEqual({op:'remove',path:['spec','validation','wellKnownCACertificates']});
 });
});
