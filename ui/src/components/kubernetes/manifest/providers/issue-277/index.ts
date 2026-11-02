import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { lazy } from 'react';

import { availability, unsupportedCSR, unsupportedTrust, validateCSR, validateTrust } from './domain';

const CertificateSigningRequestForm = lazy(() => import('./CertificateSigningRequestForm'));
const ClusterTrustBundleForm = lazy(() => import('./ClusterTrustBundleForm'));
const PodCertificateRequestForm = lazy(() => import('./PodCertificateRequestForm'));
const group = 'certificates.k8s.io';
export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1,
    targets: [{ group, version: 'v1', kind: 'CertificateSigningRequest', resource: 'certificatesigningrequests', scope: 'Cluster' }],
    intents: ['create', 'edit', 'inspect', 'action'], label: 'Certificate signing request',
    sections: [{ id: 'request', label: 'Request' }, { id: 'lifecycle', label: 'Approval & signing' }],
    ownedPaths: [['spec', 'signerName'], ['spec', 'request'], ['spec', 'usages'], ['spec', 'expirationSeconds']],
    sensitivePaths: [['spec', 'request'], ['spec', 'extra'], ['status', 'certificate'], ['status', 'conditions', '*', 'message'], ['metadata', 'annotations']],
    component: CertificateSigningRequestForm, validate: validateCSR, formUnavailable: unsupportedCSR,
    ownershipPolicy: 'conditional',
    readOnly: (_draft, context) => context.intent !== 'create' || context.capabilities.create !== 'available',
  },
  {
    contractVersion: 1,
    targets: ['v1beta1', 'v1alpha1'].map(version => ({ group, version, kind: 'ClusterTrustBundle', resource: 'clustertrustbundles', scope: 'Cluster' as const })),
    intents: ['create', 'edit', 'inspect'], label: 'Cluster trust bundle',
    sections: [{ id: 'trust', label: 'Trust distribution' }],
    ownedPaths: [['spec', 'signerName'], ['spec', 'trustBundle']],
    sensitivePaths: [['spec', 'trustBundle'], ['metadata', 'annotations']],
    component: ClusterTrustBundleForm, validate: validateTrust, formUnavailable: unsupportedTrust,
    ownershipPolicy: 'declarative',
    readOnly: (_draft, context) => context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system' || (context.intent === 'create' ? context.capabilities.create : context.capabilities.update) !== 'available',
  },
  {
    contractVersion: 1,
    targets: [{ group, version: 'v1beta1', kind: 'PodCertificateRequest', resource: 'podcertificaterequests', scope: 'Namespaced' }],
    intents: ['edit', 'inspect'], label: 'Pod certificate request',
    sections: [{ id: 'binding', label: 'Pod binding' }, { id: 'lifecycle', label: 'Certificate lifecycle' }],
    ownedPaths: [],
    sensitivePaths: [['spec', 'pkixPublicKey'], ['spec', 'proofOfPossession'], ['spec', 'unverifiedUserAnnotations'], ['status', 'certificateChain'], ['status', 'conditions', '*', 'message'], ['metadata', 'annotations']],
    component: PodCertificateRequestForm, formUnavailable: availability, readOnly: () => true,
    ownershipPolicy: 'system',
  },
];
