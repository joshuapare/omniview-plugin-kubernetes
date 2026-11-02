import { Button, SegmentedControl } from '@omniviewdev/base-ui';
import { RESOURCE_EDITOR_EXTENSION_POINT, selectResourceEditor, matchesResourceEditor, useExtensionPointSnapshot, type ResourceEditorContext, type ResourceEditorContribution, type ResourceEditorReferenceService, type ResourceEditorActionService, type ResourceEditorActionResult, type ResourceEditorPath } from '@omniviewdev/runtime';
import { Component, Suspense, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from 'react';
import { LuFileCode2, LuSlidersHorizontal } from 'react-icons/lu';
import CodeEditor from '../../shared/CodeEditor';
import SimpleTooltip from '../../shared/SimpleTooltip';
import { inspectManifest, patchManifest, readManifestValue, supportedManifestKind, validateManifest } from './manifestDraft';
import { ResourcePortalContext } from './ResourcePortalContext';
import { builtinResourceEditors, isNativeResourceEditor, NativeResourceEditorContext, nativeFormUnavailable } from './resourceEditors';
import { ResourceEditorController, resourceEditorPreview, assertResourceEditorInput, projectResourceEditorValue, createResourceEditorDraft, inspectResourceEditorProjection } from './resourceEditorController';
import { createEditorContext, validateEditorIdentity } from './resourceEditorContext';
import { useResourceEditorServices, prepareCronJobRun, isReadOnlyResourceEditorProtocol } from './resourceEditorServices';
import { canonicalEditorRequest } from './resourceEditorRequest';
import CronJobRunReview from './CronJobRunReview';
import { redactSecretManifest } from './dataDraft';
import { useManifestMode } from './useManifestMode';
import { Field, Section } from './ResourceFormFields';
import DataConfirmation from './DataConfirmation';
import styles from './ResourceManifestEditor.module.css';
import { editorOwnership } from './resourceEditorPolicy';
import { useEditorEvidence } from './useEditorEvidence';
import ResourceLinkChip from '../../shared/ResourceLinkChip';
import { projectEditorActionResult } from './resourceEditorResults';
import { stringify } from 'yaml';
import { useManualEndpointsAdmission } from './useManualEndpointsAdmission';
import { validateEditorSource, type ResourceEditorSubmissionHandle, type ResourceEditorPreparedSubmission } from './resourceEditorSubmission';

export interface ResourceManifestEditorProps {
  value: string; onChange: (value: string) => void; resourceKey: string;
  editing?: boolean; disabled?: boolean; filename?: string; path?: string; baseline?: string; diff?: boolean;
  context?: string; connectionID?: string; onValidityChange?: (error: string | null) => void;
  editorContext?: ResourceEditorContext;
  contribution?: ResourceEditorContribution;
  preferredProviderID?: string;
  references?: ResourceEditorReferenceService;
  actions?: ResourceEditorActionService;
  onAdmissionChange?: (readOnly: boolean) => void;
  submissionRef?: Ref<ResourceEditorSubmissionHandle>;
}

class ProviderBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <div role="alert">Editor unavailable. Source remains intact. Use YAML or retry.</div> : this.props.children; }
}
const emptyPaths: readonly ResourceEditorPath[] = [];
const nativeRegistrations = builtinResourceEditors.map((value, index) => ({ id: `kubernetes/native-${index}`, plugin: 'kubernetes', label: value.label, value }));
const providerPreferenceKey = 'omniview.kubernetes.manifest-editor.provider';

export default function ResourceManifestEditor(props: ResourceManifestEditorProps) {
  const target = props.editorContext;
  const sessionKey = JSON.stringify([props.connectionID ?? target?.connectionID, props.resourceKey, props.context, props.filename, props.editing, target?.group, target?.version, target?.kind, target?.resource, target?.scope, target?.intent, target?.intent === 'create' ? undefined : [target?.name, target?.namespace, target?.uid]]);
  return <ResourceManifestSession key={sessionKey} {...props} />;
}

function ResourceManifestSession(props: ResourceManifestEditorProps) {
  const { value, onChange, resourceKey, editing = false, disabled = false, filename = 'resource.yaml', baseline, diff = false, context, connectionID = '', onValidityChange } = props;
  const [controller] = useState(() => new ResourceEditorController(value));
  const controllerState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const currentRevision = controllerState.source === value ? controllerState.revision : controllerState.revision + 1;
  const changeSource = useRef(onChange);
  useLayoutEffect(() => { changeSource.current = onChange; }, [onChange]);
  useLayoutEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  useLayoutEffect(() => { controller.syncSource(value); }, [controller, value]);
  const draft = useMemo(() => inspectManifest(value, resourceKey), [value, resourceKey]);
  const contextKey = JSON.stringify(props.editorContext);
  const incomingContext = useMemo(() => contextKey === undefined ? undefined : JSON.parse(contextKey) as ResourceEditorContext, [contextKey]);
  const baseContext = useMemo(() => {
    if (!incomingContext) return createEditorContext(value, resourceKey, connectionID, editing ? 'edit' : 'create');
    const name = readManifestValue(draft, ['metadata', 'name']);
    const namespace = readManifestValue(draft, ['metadata', 'namespace']);
    return { ...incomingContext, ...(incomingContext.intent === 'create' ? { name: typeof name === 'string' ? name : undefined, namespace: typeof namespace === 'string' ? namespace : undefined } : {}) };
  }, [incomingContext, draft, value, resourceKey, connectionID, editing]);
  const admittedContext = useEditorEvidence(baseContext, !!props.actions || !!props.references);
  const transport = useResourceEditorServices(admittedContext);
  const services = { references: props.references ?? transport.references, actions: props.actions ?? transport.actions };
  const [cronJobRun, setCronJobRun] = useState<string>();
  const snapshot = useExtensionPointSnapshot<ResourceEditorContribution, ResourceEditorContext>(RESOURCE_EDITOR_EXTENSION_POINT);
  const contributions = props.contribution ? [{ id: 'fixture/editor', plugin: 'kubernetes', label: props.contribution.label, value: props.contribution }]
    : snapshot.store ? snapshot.contributions : nativeRegistrations;
  const preferenceScope = JSON.stringify([admittedContext.group, admittedContext.version, admittedContext.kind, admittedContext.resource, admittedContext.scope]);
  const [preferences, setPreferences] = useState<Record<string, string>>(() => { try { const saved: unknown = JSON.parse(localStorage.getItem(providerPreferenceKey) ?? '{}'); return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as Record<string, string> : {}; } catch { return {}; } });
  const requestedSelection = selectResourceEditor(contributions, admittedContext, { builtinPluginID: 'kubernetes', preferredID: props.preferredProviderID ?? preferences[preferenceScope] });
  const inspectionSelection = requestedSelection.status === 'fallback' && admittedContext.intent === 'edit' ? selectResourceEditor(contributions, { ...admittedContext, intent: 'inspect' }, { builtinPluginID: 'kubernetes', preferredID: props.preferredProviderID ?? preferences[preferenceScope] }) : undefined;
  const inspectionFallback = !!inspectionSelection && inspectionSelection.status !== 'fallback';
  const selection = inspectionFallback && inspectionSelection ? inspectionSelection : requestedSelection;
  const selected = selection.status === 'selected' ? selection.contribution : undefined;
  const provider = selected?.value;
  const sourceOwnership = useMemo(() => editorOwnership(editing && baseline !== undefined ? baseline : value, admittedContext, provider), [admittedContext, provider, value, baseline, editing]);
  const exactTargets = contributions.filter((entry) => entry.value.targets.some((target) => target.group === admittedContext.group && target.version === admittedContext.version && target.kind === admittedContext.kind && target.resource === admittedContext.resource && target.scope === admittedContext.scope));
  const inspectOnlyTarget = exactTargets.length > 0 && !exactTargets.some((entry) => entry.value.intents.includes(admittedContext.intent));
  const providerIdentity = useRef(provider);
  useLayoutEffect(() => {
    if (providerIdentity.current !== provider) { providerIdentity.current = provider; controller.invalidate(); }
  }, [controller, provider]);
  const serviceRevision = currentRevision;
  const endpointAdmission = useManualEndpointsAdmission(baseline, { ...admittedContext, ownership: sourceOwnership }, services.references, controller.sessionID, serviceRevision);
  const effectiveContext = useMemo(() => ({ ...admittedContext, ...(inspectionFallback ? { intent: 'inspect' as const } : {}), ownership: endpointAdmission.manual && sourceOwnership.status === 'unknown' ? { status: 'application' as const } : sourceOwnership }), [admittedContext, sourceOwnership, endpointAdmission.manual, inspectionFallback]);
  const [quarantined, setQuarantined] = useState<ResourceEditorContribution | null>(null);
  const [preferredMode, chooseMode] = useManifestMode();
  const [section, setSection] = useState('basics');
  const [localValidity, setLocalValidity] = useState<{ provider: ResourceEditorContribution | undefined; error: string | null }>(() => ({ provider, error: null }));
  const formError = localValidity.provider === provider ? localValidity.error : null;
  const [abandonedCrash, setAbandonedInputs] = useState(false);
  const abandonedInputs = abandonedCrash || localValidity.provider !== provider && localValidity.error !== null;
  const setFormError = useCallback((error: string | null) => {
    if (controller.isActive() && providerIdentity.current === provider) setLocalValidity((previous) => previous.provider === provider && previous.error === error ? previous : { provider, error });
  }, [controller, provider]);
  const [requestOutcome, setRequestOutcome] = useState<{ provider: ResourceEditorContribution | undefined; revision: number; protocol: string; result: ResourceEditorActionResult } | null>(null);
  const recordResult = useCallback((result: ResourceEditorActionResult, protocol: string, revision: number) => { setRequestOutcome({ provider, revision, protocol, result }); }, [provider, setRequestOutcome]);
  const currentRequestResult = requestOutcome !== null && requestOutcome.provider === provider && requestOutcome.revision === currentRevision ? requestOutcome.result : undefined;
  const visibleRequestResult = currentRequestResult && requestOutcome ? projectEditorActionResult(currentRequestResult, requestOutcome.protocol, provider?.sensitivePaths) : undefined;
  const [resultDisclosure, setResultDisclosure] = useState<{ result: ResourceEditorActionResult; identity: object; mode: 'confirm' | 'raw' } | null>(null);
  const [pendingState, setPendingState] = useState<{ provider: ResourceEditorContribution | undefined; revision: number; pending: boolean } | null>(null);
  const requestPending = pendingState !== null && pendingState.provider === provider && pendingState.revision === currentRevision && pendingState.pending;
  const setRequestPending = useCallback((pending: boolean) => { setPendingState({ provider, revision: serviceRevision, pending }); }, [provider, serviceRevision]);
  const pendingRequest = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => { pendingRequest.current?.abort(); }, [controller, provider, currentRevision]);
  const scopedActions = useMemo<ResourceEditorActionService>(() => ({ execute: async (request) => {
    if (!controller.isActive() || request.sessionID !== controller.sessionID || serviceRevision !== controller.revision || request.signal.aborted) return { status: 'cancelled', message: 'Editor session changed.' };
    try { assertResourceEditorInput(request.input); } catch { return { status: 'invalid', message: 'Hidden or inexact values cannot be submitted.' }; }
    if (request.protocol === 'kubernetes.cronjob-run-now.v1') {
      if (props.actions) return props.actions.execute(request);
      try {
        const prepared = await prepareCronJobRun(admittedContext, request.signal);
        if (request.signal.aborted || serviceRevision !== controller.revision) return { status: 'cancelled', message: 'Editor session changed.' };
        setCronJobRun(prepared.source);
        return { status: 'ready', output: { opened: true } };
      } catch { return { status: 'unavailable', message: 'Saved CronJob template is unavailable.' }; }
    }
    const output = await services.actions.execute(request);
    if (!controller.isActive() || request.signal.aborted || serviceRevision !== controller.revision) return { status: 'cancelled', message: 'Editor session changed.' };
    if (output.status === 'ready' && output.sensitive) recordResult(output, request.protocol, serviceRevision);
    return projectEditorActionResult(output, request.protocol, provider?.sensitivePaths);
  } }), [controller, serviceRevision, services.actions, admittedContext, props.actions, provider, recordResult]);
  const scopedReferences = useMemo<ResourceEditorReferenceService>(() => ({ list: async (request) => {
    if (!controller.isActive() || request.sessionID !== controller.sessionID || serviceRevision !== controller.revision || request.signal.aborted) return { status: 'unavailable', message: 'Editor session changed.' };
    const result = await services.references.list(request);
    return !controller.isActive() || request.signal.aborted || serviceRevision !== controller.revision ? { status: 'unavailable', message: 'Editor session changed.' } : result;
  } }), [controller, serviceRevision, services.references]);
  const providerPaths = provider?.sensitivePaths ?? emptyPaths;
  const maskedPaths = useMemo(() => [...controllerState.protectedPaths, ...providerPaths.filter((path) => !controllerState.protectedPaths.some((saved) => saved.length === path.length && saved.every((segment, index) => segment === path[index])))], [controllerState.protectedPaths, providerPaths]);
  const publicDraft = controllerState.source === value ? controller.draft(maskedPaths) : createResourceEditorDraft(value, controller.sessionID, currentRevision, maskedPaths);
  const publicBaseline = useMemo(() => baseline === undefined ? undefined : new ResourceEditorController(baseline).draft(maskedPaths), [baseline, maskedPaths]);
  const secret = resourceKey === 'k8s:/secrets' || readManifestValue(draft, ['kind']) === 'Secret';
  const quarantinedCurrent = !!provider && quarantined === provider;
  const projection = useMemo(() => inspectResourceEditorProjection(value, maskedPaths), [value, maskedPaths]);
  const baselineProjection = useMemo(() => baseline === undefined ? undefined : inspectResourceEditorProjection(baseline, maskedPaths), [baseline, maskedPaths]);
  const fallback = !provider && !supportedManifestKind(resourceKey) || quarantinedCurrent;
  const observedSensitive = secret || projection.sensitive || !!baselineProjection?.sensitive || fallback;
  const sensitive = observedSensitive || controllerState.sensitive;
  let unavailable = draft.error;
  let readOnly = admittedContext.intent === 'inspect' || inspectOnlyTarget || !provider && exactTargets.some((entry) => entry.value.ownershipPolicy === 'controller' || entry.value.ownershipPolicy === 'system') || !!provider && (admittedContext.intent === 'create' || admittedContext.intent === 'edit') && effectiveContext.ownership.status !== 'application';
  try {
    if (provider) {
      readOnly ||= provider.readOnly?.(publicDraft, effectiveContext) ?? false;
      unavailable ??= isNativeResourceEditor(provider) ? nativeFormUnavailable(value, resourceKey) : provider.formUnavailable ? provider.formUnavailable(publicDraft, effectiveContext) : null;
    }
  } catch { unavailable = 'Editor unavailable. Source remains intact.'; readOnly = true; }
  if (!provider && exactTargets.length === 0) readOnly ||= controllerState.readOnly;
  const hasAdmissionPolicy = !!provider || exactTargets.length > 0;
  useLayoutEffect(() => { controller.commitSafety(observedSensitive, hasAdmissionPolicy ? readOnly : undefined, providerPaths, fallback); }, [controller, observedSensitive, hasAdmissionPolicy, readOnly, providerPaths, fallback]);
  const formAvailable = !!provider && !unavailable && !quarantinedCurrent;
  const sections = provider?.sections ?? [];
  const activeSection = sections.some((entry) => entry.id === section) ? section : sections[0]?.id ?? 'basics';
  const localIdentity = useMemo(() => ({}), [snapshot.store, snapshot.version, preferences, props.preferredProviderID, props.contribution, preferredMode, section, diff, baseline, disabled, readOnly, requestPending]);
  const [disclosure, setDisclosure] = useState<{ identity: object; source: string; mode: 'confirm' | 'raw' } | null>(null);
  const currentDisclosure = disclosure?.identity === localIdentity && disclosure.source === value ? disclosure : null;
  const raw = currentDisclosure?.mode === 'raw' && !diff && !readOnly && !disabled && !requestPending;
  const showForm = formAvailable && !diff && preferredMode === 'form' && !raw;
  const sourceAdmission = useRef({ controller, readOnly, disabled, requestPending, diff, sensitive, raw, identity: localIdentity });
  useLayoutEffect(() => { sourceAdmission.current = { controller, readOnly, disabled, requestPending, diff, sensitive, raw, identity: localIdentity }; }, [controller, readOnly, disabled, requestPending, diff, sensitive, raw, localIdentity]);
  const changeYAML = useCallback((next: string) => {
    const current = sourceAdmission.current;
    if (current.controller !== controller || !controller.isActive() || current.readOnly || current.disabled || current.requestPending || current.diff || current.sensitive && !current.raw) return;
    if (current.sensitive && current.raw) setDisclosure({ identity: current.identity, source: next, mode: 'raw' });
    controller.syncSource(next); changeSource.current(next);
  }, [controller, setDisclosure]);
  const container = useContext(ResourcePortalContext);
  const revealResult = currentRequestResult?.status === 'ready' && currentRequestResult.sensitive && resultDisclosure?.result === currentRequestResult && resultDisclosure.identity === localIdentity && resultDisclosure.mode === 'raw' && !disabled && !requestPending;
  const rawResult = useMemo(() => {
    if (!revealResult || currentRequestResult?.status !== 'ready') return '';
    try { return stringify(currentRequestResult.output); } catch { return '# Result cannot be displayed safely.\n'; }
  }, [revealResult, currentRequestResult]);
  const modelID = useId();
  const identityError = editing ? validateEditorIdentity(value, admittedContext, baseline) : null;
  let providerError: string | null = null;
  try { providerError = provider?.validate?.(publicDraft, effectiveContext)[0]?.message ?? null; } catch { providerError = 'Editor validation is unavailable.'; }
  const validity = (endpointAdmission.pending ? 'Checking Service ownership…' : null) ?? (abandonedInputs ? 'An editor was removed with pending local input. Discard that input or reset before continuing.' : null) ?? formError ?? identityError ?? (providerError ? sensitive ? 'Review the sensitive form fields before continuing.' : providerError : null) ?? (readOnly && admittedContext.intent !== 'inspect' ? 'This resource is inspection only.' : null);
  useEffect(() => { onValidityChange?.(validity); props.onAdmissionChange?.(readOnly); }, [validity, onValidityChange, readOnly, props.onAdmissionChange]);
  useEffect(() => () => onValidityChange?.(null), [onValidityChange]);
  const fullPreview = !!provider && !quarantinedCurrent && !controllerState.fallback;
  const codeValue = sensitive ? secret ? redactSecretManifest(value) : fullPreview ? projection.preview : resourceEditorPreview(value) : value;
  const original = sensitive && baseline !== undefined ? secret ? redactSecretManifest(baseline) : fullPreview ? baselineProjection?.preview : resourceEditorPreview(baseline) : baseline;
  const publicContext = useMemo(() => projectResourceEditorValue(effectiveContext) as ResourceEditorContext, [effectiveContext]);
  const patchIdentity = useMemo(() => ({}), [controller, provider, currentRevision, disabled, requestPending, quarantinedCurrent, readOnly, effectiveContext]);
  const currentPatchIdentity = useRef(patchIdentity);
  useLayoutEffect(() => { currentPatchIdentity.current = patchIdentity; }, [patchIdentity]);
  const patch = useCallback((request: Parameters<ResourceEditorController['patch']>[0]) => {
    if (currentPatchIdentity.current !== patchIdentity) return { status: 'stale' as const, message: 'Editor admission changed.' };
    if (!provider || provider !== providerIdentity.current || disabled || requestPending || quarantinedCurrent || readOnly) return { status: 'forbidden' as const, message: 'Editor is not writable.' };
    if (controller.revision !== currentRevision) return { status: 'stale' as const, message: 'Editor revision changed.' };
    const result = controller.patch(request, { ...provider, sensitivePaths: maskedPaths }, effectiveContext);
    if (result.status === 'accepted') changeSource.current(controller.getSource());
    return result;
  }, [controller, provider, currentRevision, disabled, requestPending, quarantinedCurrent, readOnly, effectiveContext, patchIdentity, maskedPaths]);
  // Canonical validation gates submission above. Local form admission gates mode
  // changes, because unmounting controls can discard uncommitted input.
  const reportValidity = useCallback((error: string | null) => { setFormError(error && !readOnly ? 'Resolve pending form changes before continuing.' : null); }, [setFormError, readOnly]);
  // A readonly manifest may declare capability-gated subresource actions.
  // Patch/YAML stay readonly; global disabled/busy still disables both paths.
  const formDisabled = disabled || requestPending || readOnly && effectiveContext.intent !== 'action';
  const formProps = { context: publicContext, draft: publicDraft, baseline: publicBaseline, section: activeSection, disabled: formDisabled, patch, onValidityChange: reportValidity, references: scopedReferences, actions: scopedActions, requestResult: visibleRequestResult };
  const nativeProps = { value, onChange: (next: string) => {
    if (sourceAdmission.current.disabled || sourceAdmission.current.requestPending || sourceAdmission.current.readOnly || provider !== providerIdentity.current || controller.revision !== currentRevision || !controller.isActive()) return;
    const identityError = editing ? validateEditorIdentity(next, admittedContext, baseline ?? value) : null;
    if (!identityError) { controller.syncSource(next); onChange(next); }
  }, draft, section: activeSection, editing, disabled: disabled || readOnly || requestPending, baseline, connectionID, onValidityChange: setFormError };
  const submissionSnapshot = useRef({ controller, provider, revision: currentRevision, context: effectiveContext, formError, readOnly, abandonedInputs });
  useLayoutEffect(() => { submissionSnapshot.current = { controller, provider, revision: currentRevision, context: effectiveContext, formError, readOnly, abandonedInputs }; }, [controller, provider, currentRevision, effectiveContext, formError, readOnly, abandonedInputs]);
  const activePreparation = useRef<AbortController | null>(null);
  const requiredAdmission = useRef(false);
  useLayoutEffect(() => { requiredAdmission.current ||= !!provider?.validateSubmission; }, [provider]);
  useEffect(() => () => activePreparation.current?.abort(), [controller, provider, currentRevision, effectiveContext]);
  useImperativeHandle(props.submissionRef, () => ({
    prepare: async (signal: AbortSignal): Promise<ResourceEditorPreparedSubmission> => {
      if (signal.aborted || !controller.isActive()) return { status: 'stale', message: 'Editor session changed.' };
      const captured = submissionSnapshot.current;
      if (captured.controller !== controller || captured.provider !== provider || captured.revision !== currentRevision) return { status: 'stale', message: 'Editor session changed.' };
      if (captured.readOnly || captured.formError || captured.abandonedInputs) return { status: 'invalid', message: captured.formError ?? 'Resolve editor admission before submitting.' };
      if (!provider && requiredAdmission.current) return { status: 'invalid', message: 'The resource editor admission provider is unavailable.' };
      const source = controller.getSource();
      const sourceError = props.editorContext || connectionID ? validateEditorSource(source, effectiveContext, baseline) : draft.error ? 'Enter a valid Kubernetes YAML object.' : validateManifest(source, resourceKey, editing, baseline);
      if (sourceError) return { status: 'invalid', message: sourceError };
      activePreparation.current?.abort();
      const preparing = new AbortController(); activePreparation.current = preparing;
      const cancel = () => preparing.abort();
      signal.addEventListener('abort', cancel, { once: true });
      const isCurrent = () => !signal.aborted && !preparing.signal.aborted && controller.isActive() && controller.revision === currentRevision && providerIdentity.current === provider && submissionSnapshot.current.context === captured.context && !submissionSnapshot.current.formError && !submissionSnapshot.current.readOnly && !submissionSnapshot.current.abandonedInputs;
      try {
        const issues = provider?.validate?.(publicDraft, publicContext);
        if (issues?.length) return { status: 'invalid', message: issues[0].message };
        const admissionServices = {
          references: scopedReferences,
          actions: { execute: (request: Parameters<ResourceEditorActionService['execute']>[0]) => isReadOnlyResourceEditorProtocol(request.protocol) ? scopedActions.execute(request) : Promise.resolve({ status: 'invalid' as const, message: 'Submission admission cannot execute mutations.' }) },
        };
        const submissionIssues = await provider?.validateSubmission?.(publicDraft, publicContext, admissionServices, preparing.signal);
        if (!isCurrent()) return { status: 'stale', message: 'The draft or editor changed during submission preparation.' };
        if (submissionIssues?.length) return { status: 'invalid', message: submissionIssues[0].message };
        return { status: 'ready', source, sessionID: controller.sessionID, revision: currentRevision, isCurrent };
      } catch {
        return { status: preparing.signal.aborted ? 'stale' : 'invalid', message: preparing.signal.aborted ? 'Submission preparation cancelled.' : 'Resource prerequisites could not be verified. No mutation was sent.' };
      } finally { signal.removeEventListener('abort', cancel); }
    },
  }), [controller, provider, currentRevision, effectiveContext, publicContext, publicDraft, scopedReferences, scopedActions, baseline, props.editorContext, connectionID, draft.error, resourceKey, editing]);
  const runRequest = async () => {
    if (!provider?.request || formError || providerError || abandonedInputs || disabled || requestPending || quarantinedCurrent || pendingRequest.current && !pendingRequest.current.signal.aborted) return;
    const revision = controller.revision;
    const abort = new AbortController(); pendingRequest.current?.abort(); pendingRequest.current = abort;
    setRequestPending(true); setRequestOutcome(null);
    try {
      const issues = await provider.validateSubmission?.(publicDraft, publicContext, {
        references: scopedReferences,
        actions: { execute: (request) => isReadOnlyResourceEditorProtocol(request.protocol) ? scopedActions.execute(request) : Promise.resolve({ status: 'invalid' as const, message: 'Submission admission cannot execute mutations.' }) },
      }, abort.signal);
      if (abort.signal.aborted || !controller.isActive() || controller.revision !== revision || provider !== providerIdentity.current || submissionSnapshot.current.context !== effectiveContext) return;
      if (issues?.length) { recordResult({ status: 'invalid', message: issues[0].message }, provider.request.protocol, revision); return; }
      const input = provider.request.source === 'canonical' ? canonicalEditorRequest(controller.getSource(), provider.request.protocol, admittedContext) : provider.request.buildInput(publicDraft, publicContext);
      assertResourceEditorInput(input);
      const output = await services.actions.execute({ protocol: provider.request.protocol, input, sessionID: controller.sessionID, generation: revision, signal: abort.signal });
      if (!abort.signal.aborted && controller.isActive() && controller.revision === revision && provider === providerIdentity.current) recordResult(output, provider.request.protocol, revision);
    } catch { if (!abort.signal.aborted) recordResult({ status: 'unavailable', message: 'Request failed. Check connection, permissions and server policy.' }, provider.request.protocol, revision); }
    finally { if (pendingRequest.current === abort) { pendingRequest.current = null; setRequestPending(false); } }
  };
  const compatible = contributions.filter((entry) => matchesResourceEditor(entry.value, effectiveContext));
  return <div className={styles.editor} data-read-only={readOnly || undefined}>
    <div className={styles.toolbar}>
      <span className={styles.context}>{connectionID || context || filename}{admittedContext.scope === 'Namespaced' && <> / {admittedContext.namespace || 'Choose namespace'}</>}</span>
      {compatible.length > 1 && <label>Editor <select aria-label="Resource editor provider" value={selected?.id ?? ''} disabled={disabled || !!formError || requestPending} onChange={(event) => {
        const next = { ...preferences, [preferenceScope]: event.target.value }; setPreferences(next); setDisclosure(null);
        try { localStorage.setItem(providerPreferenceKey, JSON.stringify(next)); } catch { /* ID-only memory preference remains available. */ }
      }}><option value="" disabled>Choose editor</option>{compatible.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {entry.plugin}</option>)}</select></label>}
      {!diff && exactTargets.length > 0 && <SegmentedControl size="sm" value={showForm ? 'form' : 'yaml'} onValueChange={(next) => { if (!formError && (next === 'yaml' || (next === 'form' && formAvailable))) { setDisclosure(null); chooseMode(next); } }} aria-label="Manifest editor mode">
        <SegmentedControl.Item value="form" disabled={!formAvailable || disabled}>Form</SegmentedControl.Item><SegmentedControl.Item value="yaml" disabled={disabled || !!formError}>YAML</SegmentedControl.Item>
      </SegmentedControl>}
      {!diff && exactTargets.length === 0 && <span className={styles.modeBadge}><LuFileCode2 size={13} /> YAML</span>}
      {diff && <span className={styles.modeBadge}><LuFileCode2 size={13} /> YAML diff</span>}
    </div>
    {!showForm && <>{(unavailable || !provider || quarantinedCurrent) && <div className={styles.notice} role="status">{admittedContext.discovery.status !== 'available' ? `API availability: ${admittedContext.discovery.status}. Source remains intact.` : sensitive ? 'Form unavailable. Sensitive source remains hidden.' : unavailable || (selection.status === 'choose' ? 'Choose an editor to configure this resource.' : 'No compatible form. YAML source remains available.')}{quarantinedCurrent && <Button size="sm" onClick={() => setQuarantined(null)}>Retry editor</Button>}</div>}</>}
    {!showForm && sensitive && <div className={styles.notice} role="status">{raw ? 'Real credential values are visible and editable.' : 'Values redacted · Read-only preview'}{!diff && !readOnly && <SimpleTooltip container={container} content="Raw YAML exposes sensitive values. Hiding it keeps source edits."><Button size="sm" variant="ghost" disabled={disabled || !!formError} onClick={() => setDisclosure(raw ? null : { identity: localIdentity, source: value, mode: 'confirm' })}>{raw ? 'Hide raw source' : 'Edit raw YAML'}</Button></SimpleTooltip>}</div>}
    {formError && <div className={styles.notice} role="alert">{formError}</div>}
    {abandonedInputs && <div className={styles.notice} role="alert">Editor changed with pending local input. Canonical YAML remains intact.<Button size="sm" variant="ghost" onClick={() => { setAbandonedInputs(false); setFormError(null); }}>Discard pending local input</Button></div>}
    <DataConfirmation open={sensitive && !showForm && !diff && !disabled && !readOnly && !formError && currentDisclosure?.mode === 'confirm'} title="Edit raw YAML?" description="Real credential values will become visible and editable. Continue only in a private environment." onCancel={() => setDisclosure(null)} onConfirm={() => setDisclosure({ identity: localIdentity, source: value, mode: 'raw' })} />
    {showForm && provider ? <div className={styles.formLayout}>
      <nav className={styles.navigation} aria-label="Resource configuration sections">{sections.map((entry) => <button key={entry.id} type="button" className={styles.navItem} aria-current={activeSection === entry.id ? 'page' : undefined} disabled={disabled || requestPending} onClick={() => { setDisclosure(null); setSection(entry.id); }}><LuSlidersHorizontal size={15} /><span>{entry.label}</span></button>)}
        <button type="button" className={styles.yamlLink} disabled={disabled || !!formError} onClick={() => chooseMode('yaml')}><LuFileCode2 size={14} /><span>{sensitive ? 'Redacted YAML' : 'Advanced YAML'}</span></button>
      </nav>
      <div className={isNativeResourceEditor(provider) ? styles.formScroll : `${styles.formScroll} ${styles.contributedContent}`}>
        {!isNativeResourceEditor(provider) && activeSection === sections[0]?.id && admittedContext.intent !== 'inspect' && admittedContext.resource !== '' && <Section title={admittedContext.intent === 'action' ? 'Destination' : 'Identity'}>{(admittedContext.intent !== 'action' || ['serviceaccounts/token', 'certificatesigningrequests', 'pods/eviction'].includes(admittedContext.resource)) && <Field label={admittedContext.intent === 'action' ? 'Target name' : 'Name'} value={admittedContext.name ?? ''} disabled={disabled || editing || readOnly || requestPending || admittedContext.intent === 'action'} onChange={(next) => onChange(patchManifest(value, [{ path: ['metadata', 'name'], value: next }]))} />}{admittedContext.scope === 'Namespaced' && <Field label="Namespace" value={admittedContext.namespace ?? ''} disabled={disabled || editing || readOnly || requestPending || admittedContext.intent === 'action'} onChange={(next) => onChange(patchManifest(value, [{ path: ['metadata', 'namespace'], value: next }]))} />}</Section>}
        <NativeResourceEditorContext.Provider value={nativeProps}><ProviderBoundary key={`${controller.sessionID}/${selected?.id}/${quarantinedCurrent}`} onFailure={() => { controller.invalidate(); setDisclosure(null); setQuarantined(provider); setAbandonedInputs(!!formError); setFormError(null); }}><Suspense fallback={<div role="status">Loading resource editor…</div>}><provider.component {...formProps} /></Suspense></ProviderBoundary></NativeResourceEditorContext.Provider>
      </div>
    </div> : <div className={styles.code}><CodeEditor key={`${sensitive ? raw ? 'raw' : 'preview' : 'source'}/${diff ? 'diff' : 'editor'}`} filename={sensitive ? `redacted/${filename}` : filename} path={sensitive ? `inmemory://resource-editor/${encodeURIComponent(modelID)}/${raw ? 'raw' : 'preview'}` : props.path} language="yaml" value={raw ? value : codeValue} onChange={sensitive && !raw || readOnly || diff ? undefined : changeYAML} readOnly={disabled || requestPending || readOnly || diff || sensitive && !raw} diff={diff} original={original} height="100%" /></div>}
    {provider?.request && <div className={styles.toolbar}><Button size="sm" disabled={disabled || requestPending || !!formError || !!providerError || quarantinedCurrent || abandonedInputs} onClick={() => void runRequest()}>{requestPending ? 'Running…' : 'Run request'}</Button>{requestPending && <Button size="sm" variant="ghost" onClick={() => { pendingRequest.current?.abort(); setRequestPending(false); }}>Cancel request</Button>}{visibleRequestResult && <span role="status">{visibleRequestResult.status === 'ready' ? 'Request complete' : 'Request unavailable. Check target, permissions and server policy.'}</span>}</div>}
    {currentRequestResult?.status === 'ready' && currentRequestResult.sensitive && <div className={styles.notice}>Sensitive result {revealResult ? 'visible' : 'hidden'}<Button size="sm" variant="ghost" disabled={disabled || requestPending} onClick={() => setResultDisclosure(revealResult ? null : { result: currentRequestResult, identity: localIdentity, mode: 'confirm' })}>{revealResult ? 'Hide sensitive result' : 'Reveal sensitive result'}</Button></div>}
    <DataConfirmation open={currentRequestResult?.status === 'ready' && !!currentRequestResult.sensitive && resultDisclosure?.result === currentRequestResult && resultDisclosure.identity === localIdentity && resultDisclosure.mode === 'confirm' && !disabled && !requestPending} title="Reveal sensitive result?" description="The result may contain credentials or private identity information. Continue only in a private environment." onCancel={() => setResultDisclosure(null)} onConfirm={() => { if (currentRequestResult?.status === 'ready') setResultDisclosure({ result: currentRequestResult, identity: localIdentity, mode: 'raw' }); }} />
    {revealResult && <div style={{ minHeight: 160, maxHeight: 240, overflow: 'hidden' }}><CodeEditor filename="private-result.yaml" path={`inmemory://resource-editor-result/${encodeURIComponent(modelID)}/${controller.revision}`} value={rawResult} language="yaml" readOnly height="100%" /></div>}
    {readOnly && Array.isArray(readManifestValue(draft, ['metadata', 'ownerReferences'])) && <div className={styles.toolbar}>{(readManifestValue(draft, ['metadata', 'ownerReferences']) as unknown[]).map((owner, index) => {
      if (!owner || typeof owner !== 'object') return null;
      const reference = owner as { apiVersion?: unknown; kind?: unknown; name?: unknown; uid?: unknown };
      return typeof reference.apiVersion === 'string' && typeof reference.kind === 'string' && typeof reference.name === 'string' && typeof reference.uid === 'string' ? <ResourceLinkChip key={index} connectionID={connectionID} namespace={admittedContext.namespace} ownerReference={{ apiVersion: reference.apiVersion, kind: reference.kind, name: reference.name, uid: reference.uid }} resourceName={`Inspect owner ${reference.kind}`} /> : null;
    })}</div>}
    {cronJobRun && <CronJobRunReview source={cronJobRun} connectionID={connectionID} onClose={() => setCronJobRun(undefined)} />}
  </div>;
}
