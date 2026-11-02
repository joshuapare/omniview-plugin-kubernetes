import { Button, Stack } from '@omniviewdev/base-ui';
import { jsonToValue, valueToJSON, useResourceMutations, useResourceTypes, type DrawerContext } from '@omniviewdev/runtime';
import React from 'react';
import { LuFileCode, LuSave, LuX } from 'react-icons/lu';
import { stringify, parse } from 'yaml';

import { KubernetesResourceObject } from '../../../../../types/resource';
import ResourceManifestEditor, { type ResourceManifestEditorProps } from '../../../../kubernetes/manifest/ResourceManifestEditor';
import { useCatalogEditorContext } from '../../../../kubernetes/manifest/useCatalogEditorContext';
import type { ResourceEditorSubmissionHandle } from '../../../../kubernetes/manifest/resourceEditorSubmission';

const outerStackStyle: React.CSSProperties = { flex: 1, minHeight: 0, overflow: 'hidden' };
type Resource = NonNullable<DrawerContext['resource']>;
interface Props { ctx: DrawerContext<KubernetesResourceObject> }

/** Requires the original contextual identity; never derives a write target from YAML. */
export const BaseEditorPage: React.FC<Props> = ({ ctx }) => {
  if (!ctx.resource || !ctx.data) {
    return <div role="alert">Resource identity and data are required to edit this resource.</div>;
  }
  const key = JSON.stringify([ctx.resource.pluginID, ctx.resource.targetId, ctx.resource.route, ctx.resource.reference, ctx.resource.representation]);
  return <ResourceEditor key={key} data={ctx.data} resource={ctx.resource} />;
};

const ResourceEditor: React.FC<{ data: KubernetesResourceObject; resource: Resource }> = ({ data, resource }) => {
  const { mutate } = useResourceMutations({ pluginID: resource.pluginID });
  const { resourceTypes } = useResourceTypes({ pluginID: resource.pluginID, route: resource.route });
  const descriptor = resourceTypes.data?.find((type) => type.type === resource.reference.address.type);
  const canUpdate = descriptor?.capabilities.some((capability) => capability.operation === 'mutationUpdate'
    && capability.scope.every((constraint) => constraint.match === 'any'
      || resource.reference.address.scope.some((entry) => entry.dimension === constraint.dimension && constraint.values.includes(entry.value))));
  const [baseline, setBaseline] = React.useState(() => stringify(data));
  const [value, setValue] = React.useState(() => stringify(data));
  const [usingDiff, setUsingDiff] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [editorRevision, setEditorRevision] = React.useState(0);
  const [readOnly, setReadOnly] = React.useState(false);
  const interacted = React.useRef(false);
  const revision = React.useRef(resource.record?.record.sourceRevision);
  const busy = React.useRef(false);
  const mounted = React.useRef(true);
  const preparation = React.useRef<AbortController | null>(null);
  const submission = React.useRef<ResourceEditorSubmissionHandle | null>(null);
  const changed = value !== baseline;
  const catalogContext = useCatalogEditorContext(value, resource.reference.address.type, resource.route.connection, 'edit', descriptor);
  const jobs = resourceTypes.data?.find((entry) => entry.type === 'k8s:batch/jobs');
  const canReviewJob = catalogContext.group === 'batch' && catalogContext.kind === 'CronJob' && catalogContext.capabilities.get === 'available' && jobs?.capabilities.some((entry) => entry.operation === 'create' && entry.scope.every((scope) => scope.match === 'any' || scope.dimension === 'namespace' && !!catalogContext.namespace && scope.values.includes(catalogContext.namespace)));
  const editorContext = canReviewJob ? { ...catalogContext, capabilities: { ...catalogContext.capabilities, actions: { ...catalogContext.capabilities.actions, 'kubernetes.cronjob-run-now.v1': 'available' as const } } } : catalogContext;

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; preparation.current?.abort(); };
  }, []);

  // Local form inputs can be pending without changing YAML. Freeze both source and
  // optimistic revision after interaction until an explicit successful submit/reset.
  React.useEffect(() => {
    if (!changed && !formError && !interacted.current && !busy.current) {
      const next = stringify(data);
      setBaseline(next);
      setValue(next);
      revision.current = resource.record?.record.sourceRevision;
    }
  }, [data, resource.record]);

  const handleSubmit = async () => {
    if (busy.current || !changed || !canUpdate || formError || readOnly) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    const preparing = new AbortController(); preparation.current = preparing;
    let phase: 'prepare' | 'mutate' | 'receipt' = 'prepare';
    try {
      const prepared = await submission.current?.prepare(preparing.signal);
      if (!prepared || prepared.status !== 'ready') { if (mounted.current) setError(prepared?.message ?? 'Editor is not ready for submission.'); return; }
      const parsed: unknown = parse(prepared.source, { intAsBigInt: true });
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Resource YAML must contain an object.');
      }
      const input = jsonToValue(parsed);
      if (preparing.signal.aborted || !mounted.current || !prepared.isCurrent()) return;
      phase = 'mutate';
      const result = await mutate({
        route: resource.route,
        reference: resource.reference,
        operation: 'update',
        input,
        expectedRevision: revision.current,
      });
      phase = 'receipt';
      if (!mounted.current) return;
      const next = stringify(valueToJSON(result.body));
      revision.current = result.sourceRevision;
      setBaseline(next);
      setValue(next);
      interacted.current = false;
      setEditorRevision((current) => current + 1);
    } catch {
      if (mounted.current) {
        if (resource.reference.address.type === 'k8s:/secrets' && phase !== 'receipt') {
          setError('Secret update failed. Credential values are hidden; check permissions and server policy.');
        } else if (phase === 'prepare') {
          setError('Resource YAML could not be prepared. Review the document and its immutable fields.');
        } else if (phase === 'receipt') {
          setError('The resource was updated, but its returned document could not be displayed. Reopen the resource to load the saved document.');
        } else {
          setError('Resource update failed. Check connection, permissions and server policy.');
        }
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };

  const unavailable = resourceTypes.isError ? 'Unable to load resource update capabilities.'
    : resourceTypes.isPending ? 'Loading resource update capabilities…'
      : !canUpdate ? 'This resource does not advertise update support for this scope.' : undefined;

  return <ResourceEditorFrame editorKey={editorRevision}
    editor={{ submissionRef: submission, connectionID: resource.route.connection, onValidityChange: setFormError, editorContext, onAdmissionChange: setReadOnly, value, baseline, diff: usingDiff, editing: true, disabled: pending, resourceKey: resource.reference.address.type, context: resource.reference.address.id, filename: `${resource.reference.address.id}/spec.yaml`, onChange: (next) => { if (!busy.current) { setValue(next); setError(undefined); } } }}
    pending={pending} canUpdate={!!canUpdate} readOnly={readOnly} formError={formError} changed={changed} error={error} unavailable={unavailable}
    onInteraction={() => { interacted.current = true; }}
    onToggleDiff={() => setUsingDiff((previous) => !previous)}
    onReset={() => { interacted.current = false; setValue(baseline); setError(undefined); setEditorRevision((current) => current + 1); }}
    onSubmit={() => { void handleSubmit(); }} />;
};

export interface ResourceEditorFrameProps {
  editor: ResourceManifestEditorProps;
  editorKey?: number;
  pending: boolean;
  canUpdate: boolean;
  readOnly: boolean;
  formError: string | null;
  changed: boolean;
  error?: string;
  unavailable?: string;
  onInteraction?: () => void;
  onToggleDiff: () => void;
  onReset: () => void;
  onSubmit: () => void;
}

/** Controlled production edit surface; transport and session lifetime stay with its caller. */
export function ResourceEditorFrame({ editor, editorKey, pending, canUpdate, readOnly, formError, changed, error, unavailable, onInteraction, onToggleDiff, onReset, onSubmit }: ResourceEditorFrameProps) {
  return <Stack style={outerStackStyle} spacing={2} direction="column" onFocusCapture={onInteraction} onPointerDownCapture={onInteraction}>
    <ResourceManifestEditor key={editorKey} {...editor} />
    {unavailable && <div role="status">{unavailable}</div>}
    {error && <div role="alert">{error}</div>}
    <Stack direction="row" justify="between">
      <Button size="sm" variant="soft" color="neutral" disabled={!!formError} startDecorator={<LuFileCode />} onClick={onToggleDiff}>{editor.diff ? 'Show Editor' : 'Show Diff'}</Button>
      <Stack direction="row" spacing={1}>
        <Button startDecorator={<LuX />} color="neutral" disabled={(!changed && !formError) || pending} size="sm" variant="soft" onClick={onReset}>Reset</Button>
        <Button startDecorator={<LuSave />} color="brand" disabled={!changed || pending || !canUpdate || !!formError || readOnly} size="sm" variant="soft" onClick={onSubmit}>{pending ? 'Submitting…' : 'Submit'}</Button>
      </Stack>
    </Stack>
  </Stack>;
}

BaseEditorPage.displayName = 'BaseEditorPage';
export default BaseEditorPage;
