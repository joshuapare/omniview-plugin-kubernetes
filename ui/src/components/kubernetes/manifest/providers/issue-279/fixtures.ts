import type { ResourceEditorContext } from '@omniviewdev/runtime';

/** Synthetic verification fixtures only. No live requests or controller success is implied. */
export const crdContext: ResourceEditorContext = {
  group: 'apiextensions.k8s.io', version: 'v1', kind: 'CustomResourceDefinition',
  resource: 'customresourcedefinitions', scope: 'Cluster', connectionID: 'fixture-only',
  intent: 'create', ownership: { status: 'application' },
  capabilities: { create: 'available', update: 'available', delete: 'denied', list: 'available', get: 'available', actions: {} },
  discovery: { status: 'available', features: { CustomResourceFieldSelectors: 'available' } },
  schema: { status: 'available' },
};
export const blankSource = `apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata: {}
spec:
  names: {}
  versions: []
`;
export const createSource = `apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: widgets.fixture.example
spec:
  group: fixture.example
  names:
    plural: widgets
    kind: Widget
    shortNames: [wdg]
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                replicas:
                  type: integer
                  maximum: 9007199254740993 # exact schema constraint
      subresources:
        status: {}
        scale:
          specReplicasPath: .spec.replicas
          statusReplicasPath: .status.replicas
      additionalPrinterColumns:
        - name: Replicas
          type: integer
          jsonPath: .spec.replicas
          priority: 0
      selectableFields:
        - jsonPath: .spec.replicas
  conversion:
    strategy: Webhook
    webhook:
      conversionReviewVersions: [v1]
      clientConfig:
        service:
          namespace: fixture-system
          name: widget-converter
          path: /convert
          port: 443
`;
export const editSource = createSource + `status:
  acceptedNames:
    plural: widgets
    singular: widget
    kind: Widget
    listKind: WidgetList
  storedVersions: [v1]
  conditions:
    - type: Established
      status: 'True'
      reason: FixtureEstablished
`;
export const controllerSource = editSource.replace('  name: widgets.fixture.example', `  name: widgets.fixture.example
  ownerReferences:
    - apiVersion: fixture.example/v1
      kind: DefinitionSet
      name: fixture-owner
      uid: fixture-owner-uid
      controller: true`);
export const multipleVersionsSource = createSource.replace('  conversion:', `    - name: v2
      served: true
      storage: false
      schema:
        openAPIV3Schema:
          type: object
  conversion:`);
export const crdFixtureCases = {
  blank: { source: blankSource, context: crdContext },
  create: { source: createSource, context: crdContext },
  edit: { source: editSource, baseline: editSource, context: { ...crdContext, intent: 'edit' as const, name: 'widgets.fixture.example' } },
  preEstablished: { source: editSource.replace("status: 'True'", "status: 'False'"), baseline: editSource.replace("status: 'True'", "status: 'False'"), context: { ...crdContext, intent: 'edit' as const } },
  inspect: { source: editSource, context: { ...crdContext, intent: 'inspect' as const } },
  controller: { source: controllerSource, baseline: controllerSource, context: { ...crdContext, intent: 'edit' as const, ownership: { status: 'controller' as const } } },
  denied: { source: editSource, baseline: editSource, context: { ...crdContext, intent: 'edit' as const, capabilities: { ...crdContext.capabilities, update: 'denied' as const } } },
  unsupported: { source: createSource, context: { ...crdContext, schema: { status: 'unavailable' as const } } },
  discoveryAbsent: { source: createSource, context: { ...crdContext, discovery: { status: 'absent' as const, features: {} } } },
  unsupportedVersion: { source: createSource.replace('apiextensions.k8s.io/v1', 'apiextensions.k8s.io/v1beta1'), context: { ...crdContext, version: 'v1beta1' } },
  selectorsUnknown: { source: createSource, context: { ...crdContext, discovery: { ...crdContext.discovery, features: {} } } },
  multipleVersions: { source: multipleVersionsSource, context: crdContext },
};
