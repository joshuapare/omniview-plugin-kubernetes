import type { ResourceEditorContribution, ResourceEditorTarget } from '@omniviewdev/runtime';
import { lazy } from 'react';

import { DISCOVERY_PROTOCOL } from './discovery';
import { discoveryQuery, validateDiscoveryQuery } from './request';

const component = lazy(() => import('./APIGroupDiscoveryForm'));
// Negotiated response envelopes have no persisted resource collection or plural.
const targets: readonly ResourceEditorTarget[] = ['v2', 'v2beta1'].flatMap(version =>
  ['APIGroupDiscovery', 'APIGroupDiscoveryList'].map(kind => ({ group: 'apidiscovery.k8s.io', version, kind, resource: '', scope: 'Cluster' as const })));
const sections = [{ id: 'capabilities', label: 'Capabilities' }, { id: 'request', label: 'Request review' }, { id: 'representation', label: 'Protocol & source' }];
const sensitivePaths = [['metadata', 'annotations'], ['items', '*', 'metadata', 'annotations']] as const;

export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1, targets, intents: ['inspect'], label: 'API discovery inspector', sections,
    ownershipPolicy: 'system',
    ownedPaths: [], sensitivePaths, component, readOnly: () => true,
  },
  {
    contractVersion: 1, targets, intents: ['action'], label: 'API discovery query', sections,
    ownershipPolicy: 'system',
    ownedPaths: [['query', 'endpoint'], ['query', 'version']], sensitivePaths, component,
    requirements: { actions: [DISCOVERY_PROTOCOL] },
    validate: draft => validateDiscoveryQuery(draft),
    request: { protocol: DISCOVERY_PROTOCOL, buildInput: discoveryQuery },
  },
];
