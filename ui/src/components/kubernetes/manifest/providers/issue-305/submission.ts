import type { ResourceEditorActionService, ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue, ResourceEditorReferenceService } from '@omniviewdev/runtime';
import { evidenceFailure, TIGERA_EVIDENCE_PROTOCOL } from './evidence';
import { qualify, validate } from './model';
/** Read-only cross-object admission. Host owns snapshot/cancellation and the eventual mutation. */
export async function validateTigeraSubmission(
 draft: ResourceEditorDraft,
 context: ResourceEditorContext,
 services: {references:ResourceEditorReferenceService;actions:ResourceEditorActionService},
 signal: AbortSignal,
): Promise<readonly ResourceEditorFieldIssue[]> {
 if (context.intent === 'inspect' || context.kind === 'TigeraStatus') return [];
 const unsupported = qualify(draft,context);
 if (unsupported) return [{path:[],message:unsupported}];
 const fields = validate(draft,context);
 if (fields.length) return fields;
 if (signal.aborted) return [{path:[],message:'Submission validation cancelled.'}];
 try {
  const result = await services.actions.execute({protocol:TIGERA_EVIDENCE_PROTOCOL,input:{},sessionID:draft.sessionID,generation:draft.revision,signal});
  if (signal.aborted) return [{path:[],message:'Submission validation cancelled.'}];
  const message = result.status === 'ready' ? evidenceFailure(result.output,context.kind) : `Installed operator evidence ${result.status}.`;
  return message ? [{path:[],message}] : [];
 } catch {
  return [{path:[],message:signal.aborted ? 'Submission validation cancelled.' : 'Installed operator evidence unavailable.'}];
 }
}
