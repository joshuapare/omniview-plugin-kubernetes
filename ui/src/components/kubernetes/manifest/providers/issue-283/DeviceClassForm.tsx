import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorSection } from '../../editor-controls';
import { DraEditor, DraftField, Notice, Selectors } from './shared';

export default function DeviceClassForm(form: ResourceEditorFormProps) {
  const gate = form.context.discovery.features.DRAExtendedResource;
  const inspect = form.context.intent === 'inspect' || form.context.ownership?.status === 'controller' || form.context.ownership?.status === 'system';
  return <DraEditor form={form} locked={inspect}>{form.section === 'selection' && <Selectors path={['spec', 'selectors']} />}
    {form.section === 'advanced' && <><EditorSection title="Extended resources"><DraftField label="Extended resource name" path={['spec', 'extendedResourceName']} readOnly={gate !== 'available'} help="DRAExtendedResource must be enabled. Class names must not collide with another extended resource mapping." />{gate !== 'available' && <Notice>DRAExtendedResource: {gate ?? 'unknown'}.</Notice>}</EditorSection>
      {form.draft.has(['spec', 'config']) && <Notice>Driver configuration retained unchanged. Use its driver provider or protected source view.</Notice>}</>}
  </DraEditor>;
}
