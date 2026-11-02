import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorSection } from '../../editor-controls';
import { Advanced, Choice, CoreForm, Field } from './fields';
export default function NamespaceForm(form: ResourceEditorFormProps) {
  return <CoreForm form={form}><EditorSection title="Admission policy">
    {['enforce','warn','audit'].map(mode => <div className="core-grid" key={mode}><Choice form={form} label={
      mode === 'enforce' ? 'Pod security enforcement' : mode === 'warn' ? 'Pod security warnings' : 'Pod security audit'} path={['metadata','labels', 'pod-security.kubernetes.io/'+mode]} options={['privileged','baseline','restricted']} help="Changes admission for new Pods. Existing workloads are not rewritten." />
      <Field form={form} label={mode+' policy version'} path={['metadata','labels','pod-security.kubernetes.io/'+mode+'-version']} validate={value => /^(latest|v1\.\d+)$/.test(value) ? null : 'Use latest or a Kubernetes version such as v1.35.'} /></div>)}
  </EditorSection><Advanced><Field form={form} label="Environment label" path={['metadata','labels','environment']} /></Advanced></CoreForm>;
}
