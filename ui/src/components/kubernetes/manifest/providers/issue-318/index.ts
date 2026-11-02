import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { generated, isFanout, isPush, isStore, specPath, targets, unavailable, validate } from './domain';

const ExternalSecretsEditor = lazy(() => import('./ExternalSecretsEditor'));
export const resourceEditors: readonly ResourceEditorContribution[] = targets.map(target => {
  const base = specPath(target.kind);
  const store = isStore(target.kind);
  const push = isPush(target.kind);
  return {
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    targets: [target],
    intents: ['create', 'edit', 'inspect'],
    label: `External Secrets · ${target.kind}`,
    sections: [
      { id: 'connection', label: store ? 'Connection & identity' : push ? 'Source & destinations' : 'Store & mappings' },
      ...(!store ? [{ id: 'lifecycle', label: 'Lifecycle & policies' }] : []),
      ...(isFanout(target.kind) ? [{ id: 'fanout', label: 'Namespace fan-out' }] : []),
      { id: 'advanced', label: store ? 'Access & retries' : 'Templates' },
    ],
    ownedPaths: store ? [['spec', 'provider', 'aws'], ['spec', 'controller'], ['spec', 'refreshInterval'], ['spec', 'retrySettings'], ['spec', 'conditions']] : [
      ...['data', 'refreshInterval', ...(push ? ['selector', 'secretStoreRefs', 'updatePolicy', 'deletionPolicy', 'template'] : ['secretStoreRef', 'refreshPolicy', 'target'])].map(key => [...base, key]),
      ...(isFanout(target.kind) ? [['spec', 'namespaceSelectors'], ['spec', 'refreshTime'], ['spec', push ? 'pushSecretName' : 'externalSecretName']] : []),
    ],
    sensitivePaths: store ? [['status'], ['spec', 'provider', 'aws', 'externalID']] : [
      ['status'],
      ...['data', 'metadata'].map(key => [...base, ...(push ? ['template'] : ['target', 'template']), key]),
      ...['literal', 'secret'].map(key => [...base, ...(push ? ['template'] : ['target', 'template']), 'templateFrom', '*', key]),
      ...(push ? [[...base, 'data', '*', 'metadata']] : []),
      ...(isFanout(target.kind) ? [['spec', push ? 'pushSecretMetadata' : 'externalSecretMetadata', 'annotations']] : []),
    ],
    component: ExternalSecretsEditor,
    readOnly: generated,
    formUnavailable: unavailable,
    validate,
  };
});
