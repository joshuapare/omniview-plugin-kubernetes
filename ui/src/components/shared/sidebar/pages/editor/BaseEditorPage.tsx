import { Button, Stack } from '@omniviewdev/base-ui';
import { jsonToValue, valueToJSON, parseAppError, useResourceEditorModelPath, useResourceMutations, useResourceTypes, type DrawerContext } from '@omniviewdev/runtime';
import React from 'react';
import { LuFileCode, LuSave, LuX } from 'react-icons/lu';
import { stringify, parse } from 'yaml';

import { KubernetesResourceObject } from '../../../../../types/resource';
import ResourceManifestEditor from '../../../../kubernetes/manifest/ResourceManifestEditor';
import { validateManifest } from '../../../../kubernetes/manifest/manifestDraft';

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
  const editorPath = useResourceEditorModelPath({
    pluginID: resource.pluginID, route: resource.route, type: resource.reference.address.type,
    representation: resource.representation, name: 'draft',
  });
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
  const interacted = React.useRef(false);
  const revision = React.useRef(resource.record?.record.sourceRevision);
  const busy = React.useRef(false);
  const mounted = React.useRef(true);
  const changed = value !== baseline;

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
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
    if (busy.current || !changed || !canUpdate || formError) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    let phase: 'prepare' | 'mutate' | 'receipt' = 'prepare';
    try {
      const validationError = validateManifest(value, resource.reference.address.type, true, baseline);
      if (validationError) { setError(validationError); return; }
      const parsed: unknown = parse(value, { intAsBigInt: true });
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Resource YAML must contain an object.');
      }
      const input = jsonToValue(parsed);
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
    } catch (cause) {
      if (mounted.current) {
        if (resource.reference.address.type === 'k8s:/secrets' && phase !== 'receipt') {
          setError('Secret update failed. Credential values are hidden; check permissions and server policy.');
        } else if (phase === 'prepare') {
          setError(cause instanceof Error ? cause.message : 'Resource YAML could not be converted.');
        } else if (phase === 'receipt') {
          setError('The resource was updated, but its returned document could not be displayed. Reopen the resource to load the saved document.');
        } else {
          const safe = parseAppError(cause);
          setError(safe.detail || safe.title);
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

  return (
    <Stack style={outerStackStyle} spacing={2} direction="column"
      onFocusCapture={() => { interacted.current = true; }}
      onPointerDownCapture={() => { interacted.current = true; }}
    >
      <ResourceManifestEditor
        key={editorRevision}
        connectionID={resource.route.connection}
        onValidityChange={setFormError}
        value={value}
        baseline={baseline}
        diff={usingDiff}
        editing
        disabled={pending}
        resourceKey={resource.reference.address.type}
        context={resource.reference.address.id}
        filename={`${resource.reference.address.id}/spec.yaml`}
        path={editorPath}
        onChange={(next) => { if (!busy.current) { setValue(next); setError(undefined); } }}
      />
      {unavailable && <div role="status">{unavailable}</div>}
      {error && <div role="alert">{error}</div>}
      <Stack direction="row" justify="between">
        <Button size="sm" variant="soft" color="neutral" disabled={!!formError} startDecorator={<LuFileCode />} onClick={() => setUsingDiff((prev) => !prev)}>
          {usingDiff ? 'Show Editor' : 'Show Diff'}
        </Button>
        <Stack direction="row" spacing={1}>
          <Button startDecorator={<LuX />} color="neutral" disabled={(!changed && !formError) || pending} size="sm" variant="soft" onClick={() => { interacted.current = false; setValue(baseline); setError(undefined); setEditorRevision((current) => current + 1); }}>
            Reset
          </Button>
          <Button startDecorator={<LuSave />} color="brand" disabled={!changed || pending || !canUpdate || !!formError} size="sm" variant="soft" onClick={() => { void handleSubmit(); }}>
            {pending ? 'Submitting…' : 'Submit'}
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
};

BaseEditorPage.displayName = 'BaseEditorPage';
export default BaseEditorPage;
