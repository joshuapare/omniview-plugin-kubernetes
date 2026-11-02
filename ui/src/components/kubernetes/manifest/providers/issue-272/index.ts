import type { ResourceEditorContribution, ResourceEditorTarget } from '@omniviewdev/runtime';
import { lazy } from 'react';

import { authoringDisabled, unsupportedShape, validateStorage } from './rules';

const StorageClass = lazy(() => import('./StorageClassForm'));
const VolumeAttributesClass = lazy(() => import('./VolumeAttributesClassForm'));
const CSIDriver = lazy(() => import('./CSIDriverForm'));
const CSINode = lazy(() => import('./InspectionForms').then(module => ({ default: module.CSINodeForm })));
const CSIStorageCapacity = lazy(() => import('./InspectionForms').then(module => ({ default: module.CSIStorageCapacityForm })));
const VolumeAttachment = lazy(() => import('./InspectionForms').then(module => ({ default: module.VolumeAttachmentForm })));
const target = (kind: string, resource: string, version = 'v1', scope: ResourceEditorTarget['scope'] = 'Cluster'): ResourceEditorTarget => ({ group: 'storage.k8s.io', version, kind, resource, scope });
const availability = { id: 'availability', label: 'Availability' };
const inspectionSections = [{ id: 'overview', label: 'Overview' }, { id: 'ownership', label: 'Ownership' }, availability];

export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1, label: 'Storage class', targets: [target('StorageClass', 'storageclasses')], intents: ['create', 'edit', 'inspect'],
    ownershipPolicy: 'declarative',
    sections: [{ id: 'provisioning', label: 'Provisioning' }, { id: 'advanced', label: 'Mounts & topology' }, availability],
    ownedPaths: [['provisioner'], ['parameters'], ['reclaimPolicy'], ['volumeBindingMode'], ['allowVolumeExpansion'], ['mountOptions'], ['allowedTopologies']],
    sensitivePaths: [['parameters', '*'], ['metadata', 'annotations', '*']], component: StorageClass, validate: validateStorage, formUnavailable: unsupportedShape, readOnly: authoringDisabled,
  },
  {
    contractVersion: 1, label: 'Volume attributes class', targets: [target('VolumeAttributesClass', 'volumeattributesclasses'), target('VolumeAttributesClass', 'volumeattributesclasses', 'v1beta1')], intents: ['create', 'edit', 'inspect'],
    ownershipPolicy: 'declarative',
    sections: [{ id: 'attributes', label: 'Attributes' }, availability], ownedPaths: [['driverName'], ['parameters']], sensitivePaths: [['parameters', '*'], ['metadata', 'annotations', '*']],
    component: VolumeAttributesClass, validate: validateStorage, formUnavailable: unsupportedShape, readOnly: authoringDisabled,
  },
  {
    contractVersion: 1, label: 'CSI driver', targets: [target('CSIDriver', 'csidrivers')], intents: ['create', 'edit', 'inspect'],
    ownershipPolicy: 'conditional',
    sections: [{ id: 'capabilities', label: 'Capabilities' }, { id: 'tokens', label: 'Token delivery' }, availability],
    ownedPaths: [['spec', 'attachRequired'], ['spec', 'podInfoOnMount'], ['spec', 'fsGroupPolicy'], ['spec', 'storageCapacity'], ['spec', 'requiresRepublish'], ['spec', 'seLinuxMount'], ['spec', 'volumeLifecycleModes'], ['spec', 'tokenRequests'], ['spec', 'serviceAccountTokenInSecrets'], ['spec', 'nodeAllocatableUpdatePeriodSeconds']],
    sensitivePaths: [['metadata', 'annotations', '*']], component: CSIDriver, validate: validateStorage, formUnavailable: unsupportedShape, readOnly: authoringDisabled,
  },
  {
    contractVersion: 1, label: 'CSI node registration', targets: [target('CSINode', 'csinodes')], intents: ['create', 'edit', 'inspect'],
    ownershipPolicy: 'controller',
    sections: inspectionSections, ownedPaths: [], sensitivePaths: [['metadata', 'annotations', '*']], component: CSINode, readOnly: () => true,
  },
  {
    contractVersion: 1, label: 'CSI storage capacity', targets: [target('CSIStorageCapacity', 'csistoragecapacities', 'v1', 'Namespaced')], intents: ['create', 'edit', 'inspect'],
    ownershipPolicy: 'controller',
    sections: inspectionSections, ownedPaths: [], sensitivePaths: [['metadata', 'annotations', '*']], component: CSIStorageCapacity, readOnly: () => true,
  },
  {
    contractVersion: 1, label: 'Volume attachment', targets: [target('VolumeAttachment', 'volumeattachments')], intents: ['create', 'edit', 'inspect'],
    ownershipPolicy: 'controller',
    sections: inspectionSections, ownedPaths: [], sensitivePaths: [['metadata', 'annotations', '*'], ['status', 'attachmentMetadata'], ['status', 'attachError', 'message'], ['status', 'detachError', 'message'], ['spec', 'source', 'inlineVolumeSpec']],
    component: VolumeAttachment, readOnly: () => true,
  },
];
