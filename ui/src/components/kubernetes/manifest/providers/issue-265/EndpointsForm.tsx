import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useEditorReferences } from '../../editor-controls';
import { endpointError, endpointServiceError, text } from './domain';
import { Advanced, Choice, CoreForm, Field, Repeat, SafetyGate } from './fields';
export default function EndpointsForm(form:ResourceEditorFormProps) {
  const name = text(form.draft,['metadata','name']) || form.context.name || '';
  const namespace = text(form.draft,['metadata','namespace']) || form.context.namespace || '';
  if (!name || !namespace) return <CoreForm form={form}><SafetyGate error="Choose a name and namespace to verify Service ownership."/></CoreForm>;
  return <ResolvedEndpointsForm form={form} name={name} namespace={namespace}/>;
}
function ResolvedEndpointsForm({form,name,namespace}:{form:ResourceEditorFormProps;name:string;namespace:string}) {
  const services = useEditorReferences(form,{group:'',version:'v1',resource:'services',namespace,projection:'servicePorts'});
  const message = endpointServiceError(services,name,namespace);
  const guarded = {...form,disabled:form.disabled || !!message};
  return <CoreForm form={form} confirm="I am authoring manual endpoints for a selectorless Service."><SafetyGate error={message}/><div role="note">Endpoints is deprecated. Address changes redirect Service traffic.</div>
    <Repeat form={guarded} title="Subset" path={['subsets']} initial={{addresses:[],ports:[]}}>{index=><>
      {['addresses','notReadyAddresses'].map(branch=><Repeat key={branch} form={guarded} title={branch==='addresses'?'Ready address':'Not-ready address'} path={['subsets',index,branch]} initial={{ip:''}}>{n=><><Field form={guarded} label={(branch==='addresses'?'Ready IP ':'Not-ready IP ')+(n+1)} path={['subsets',index,branch,n,'ip']} required validate={endpointError}/><Advanced><Field form={guarded} label={'Hostname '+(n+1)} path={['subsets',index,branch,n,'hostname']}/><Field form={guarded} label={'Node name '+(n+1)} path={['subsets',index,branch,n,'nodeName']}/></Advanced></>}</Repeat>)}
      <Repeat form={guarded} title="Port" path={['subsets',index,'ports']} initial={{port:0,protocol:'TCP'}}>{n=><div className="core-grid"><Field form={guarded} label={'Port name '+(n+1)} path={['subsets',index,'ports',n,'name']}/><Field form={guarded} label={'Port number '+(n+1)} path={['subsets',index,'ports',n,'port']} required kind="integer" validate={value=>/^\d+$/.test(value)&&BigInt(value)>0n&&BigInt(value)<=65535n?null:'Use a port from 1 to 65535.'}/><Choice form={guarded} label={'Protocol '+(n+1)} path={['subsets',index,'ports',n,'protocol']} options={['TCP','UDP','SCTP']}/></div>}</Repeat>
    </>}</Repeat></CoreForm>;
}
