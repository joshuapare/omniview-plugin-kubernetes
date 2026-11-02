import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { unavailable, validate } from './model';

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  ownershipPolicy: 'declarative',
  label: 'Istio Wasm plugin',
  targets: [{ group: 'extensions.istio.io', version: 'v1alpha1', kind: 'WasmPlugin', resource: 'wasmplugins', scope: 'Namespaced' }],
  intents: ['create', 'edit', 'inspect'],
  sections: [{ id: 'module', label: 'Module' }, { id: 'targets', label: 'Workloads' }, { id: 'execution', label: 'Execution' }, { id: 'configuration', label: 'Configuration' }],
  ownedPaths: ['url', 'sha256', 'imagePullPolicy', 'imagePullSecret', 'selector', 'targetRefs', 'type', 'phase', 'priority', 'failStrategy', 'match', 'pluginName', 'pluginConfig', 'vmConfig'].map(key => ['spec', key]),
  sensitivePaths: [['spec', 'pluginConfig'], ['spec', 'vmConfig', 'env', '*', 'value']],
  component: lazy(() => import('./WasmPluginForm')),
  validate,
  formUnavailable: unavailable,
  readOnly: (_draft, context) => context.intent === 'inspect' || context.ownership?.status !== 'application',
}];
