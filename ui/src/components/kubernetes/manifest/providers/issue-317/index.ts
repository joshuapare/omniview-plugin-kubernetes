import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { allocatorReadOnly } from './policy';

const Collector = lazy(() => import('./forms').then(module => ({ default: module.Collector })));
const Instrumentation = lazy(() => import('./forms').then(module => ({ default: module.Instrumentation })));
const Bridge = lazy(() => import('./forms').then(module => ({ default: module.Bridge })));
const Allocator = lazy(() => import('./forms').then(module => ({ default: module.Allocator })));
const spec = (...paths: string[][]) => paths.map(path => ['spec', ...path]);
export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    ownershipPolicy: 'declarative',
    contractVersion: 1, label: 'OpenTelemetry Collector',
    targets: [{ group: 'opentelemetry.io', version: 'v1beta1', kind: 'OpenTelemetryCollector', resource: 'opentelemetrycollectors', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'], sections: [{ id: 'collector', label: 'Collector' }], component: Collector,
    ownedPaths: spec(['mode'], ['replicas'], ['image'], ['serviceAccount'], ['config', 'exporters'], ['config', 'processors', 'batch'], ['config', 'service', 'pipelines'], ['targetAllocator', 'enabled']),
    sensitivePaths: [['spec', 'config', 'exporters', '*', 'headers'], ['spec', 'config', 'extensions']],
    formUnavailable: draft => {
      const value = draft.get(['spec', 'config']);
      return value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value)) ? 'Collector configuration requires structured v1beta1 source.' : null;
    },
  },
  {
    contractVersion: 1, label: 'OpenTelemetry Instrumentation',
    targets: [{ group: 'opentelemetry.io', version: 'v1alpha1', kind: 'Instrumentation', resource: 'instrumentations', scope: 'Namespaced' }],
    ownershipPolicy: 'declarative',
    intents: ['create', 'edit', 'inspect'], sections: [{ id: 'instrumentation', label: 'Instrumentation' }], component: Instrumentation,
    ownedPaths: spec(['exporter', 'endpoint'], ['sampler', 'type'], ['sampler', 'argument'], ['propagators'], ...['java', 'python', 'nodejs', 'dotnet', 'go', 'apacheHttpd', 'nginx'].map(language => [language, 'image'])),
    sensitivePaths: [['spec', 'env'], ...['java', 'python', 'nodejs', 'dotnet', 'go', 'apacheHttpd', 'nginx'].map(language => ['spec', language, 'env'])],
  },
  {
    contractVersion: 1, label: 'OpAMP Bridge',
    targets: [{ group: 'opentelemetry.io', version: 'v1alpha1', kind: 'OpAMPBridge', resource: 'opampbridges', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'], sections: [{ id: 'bridge', label: 'OpAMP bridge' }], component: Bridge,
    ownershipPolicy: 'declarative',
    ownedPaths: spec(['endpoint'], ['capabilities', 'AcceptsRemoteConfig'], ['capabilities', 'ReportsEffectiveConfig'], ['replicas'], ['serviceAccount'], ['image'], ['upgradeStrategy']),
    sensitivePaths: spec(['headers'], ['env'], ['envFrom']),
    validate: draft => draft.get(['spec', 'endpoint']) ? [] : [{ path: ['spec', 'endpoint'], message: 'Server endpoint is required.' }],
  },
  {
    contractVersion: 1, label: 'OpenTelemetry Target Allocator',
    targets: [{ group: 'opentelemetry.io', version: 'v1alpha1', kind: 'TargetAllocator', resource: 'targetallocators', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'], sections: [{ id: 'allocator', label: 'Target allocation' }], component: Allocator,
    ownedPaths: spec(['allocationStrategy'], ['filterStrategy'], ['collectorNotReadyGracePeriod'], ['prometheusCR', 'enabled'], ['serviceAccount'], ['image'], ['replicas']),
    ownershipPolicy: 'conditional',
    sensitivePaths: spec(['scrapeConfigs'], ['env'], ['envFrom']),
    readOnly: allocatorReadOnly,
  },
];
