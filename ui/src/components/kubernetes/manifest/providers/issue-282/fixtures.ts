import type { ResourceEditorContext } from '@omniviewdev/runtime';

import { target } from './model';

/** Synthetic, non-sensitive fixtures. Never production defaults or cluster claims. */
export const runtimeClassContext: ResourceEditorContext = {
  ...target, connectionID: 'fixture-only', intent: 'create', ownership: { status: 'application' },
  discovery: { status: 'available', features: {} }, schema: { status: 'available' },
  capabilities: { create: 'available', update: 'available', delete: 'available', get: 'available', list: 'available', actions: {} },
};
export const emptyRuntimeClass = 'apiVersion: node.k8s.io/v1\nkind: RuntimeClass\nmetadata: {}\n';
export const populatedRuntimeClass = `apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: isolated-runtime
  labels:
    runtime.example.test/tier: isolated
handler: isolated
# Preserve this admission note.
overhead:
  podFixed:
    cpu: 100m
    memory: 32Mi
    example.test/accelerator: '1'
scheduling:
  nodeSelector:
    runtime.example.test/enabled: 'true'
  tolerations:
    - key: runtime.example.test/isolated
      operator: Equal
      value: enabled
      effect: NoExecute
      tolerationSeconds: 9007199254740993
      futureField: retain
futureExtension:
  exactInteger: 9007199254740993
  typedBoolean: false
`;
export const controllerRuntimeClass = populatedRuntimeClass.replace('  name: isolated-runtime', `  name: isolated-runtime
  ownerReferences:
    - apiVersion: example.test/v1
      kind: RuntimeInstallation
      name: isolated-installation
      uid: fixture-owner
      controller: true`);
export const unsupportedRuntimeClass = populatedRuntimeClass.replace('operator: Equal', 'operator: FutureOperator');
export const invalidRuntimeClass = 'apiVersion: node.k8s.io/v1\nkind: RuntimeClass\nscheduling: [\n';
