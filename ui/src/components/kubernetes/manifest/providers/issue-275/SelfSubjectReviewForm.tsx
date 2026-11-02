import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorHelp, EditorSection } from '../../editor-controls';
import { AuthenticationResult } from './fields';

export default function SelfSubjectReviewForm(form: ResourceEditorFormProps) {
  return <div className="auth275-form"><EditorSection title="Inspect current identity"><div className="auth275-heading"><span>Current connection</span><EditorHelp label="Current identity">The API server reports the identity for this connection, including existing impersonation. This action does not edit impersonation, user accounts, or permissions. Identity values remain masked.</EditorHelp></div><p className="auth275-consequence">No authored identity or spec. This request is not persisted.</p></EditorSection><AuthenticationResult form={form} /></div>;
}
