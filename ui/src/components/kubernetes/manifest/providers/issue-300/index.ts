import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { readOnly, unavailable, validate } from './model';
const component = lazy(() => import('./TelemetryEditor'));
export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  ownershipPolicy: 'declarative',
  targets: ['v1','v1alpha1'].map(version => ({ group: 'telemetry.istio.io', version, kind: 'Telemetry', resource: 'telemetries', scope: 'Namespaced' as const })),
  intents: ['create','edit','inspect'], label: 'Istio Telemetry',
  sections: [{id:'placement',label:'Placement'},{id:'tracing',label:'Tracing'},{id:'metrics',label:'Metrics'},{id:'accessLogging',label:'Access logs'}],
  ownedPaths: ['selector','targetRef','targetRefs','tracing','metrics','accessLogging'].map(key => ['spec',key]),
  component, readOnly, formUnavailable: unavailable, validate,
}];
