import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { ownedPaths, readOnly, unavailable, validate } from './model';
const component = lazy(() => import('./CloudEventEditor'));
export const resourceEditors: readonly ResourceEditorContribution[] = [
  { kind: 'CloudEventSource', resource: 'cloudeventsources', scope: 'Namespaced' as const },
  { kind: 'ClusterCloudEventSource', resource: 'clustercloudeventsources', scope: 'Cluster' as const },
].map(target => ({
  contractVersion: 1 as const,
  ownershipPolicy: 'declarative' as const,
  targets: [{ group: 'eventing.keda.sh', version: 'v1alpha1', ...target }],
  intents: ['create', 'edit', 'inspect'] as const,
  label: `KEDA ${target.kind}`,
  sections: [{ id: 'destinations', label: 'Destinations' }, { id: 'filters', label: 'Event filters' }, { id: 'advanced', label: 'Advanced' }, { id: 'observed', label: 'Observed' }],
  ownedPaths, component, validate, formUnavailable: unavailable, readOnly,
}));
