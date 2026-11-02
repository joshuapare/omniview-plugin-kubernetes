import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { certificateIssues, issuerIssues } from './domain';
const certificate = lazy(() => import('./Forms').then(module => ({ default: module.Certificate })));
const issuer = lazy(() => import('./Forms').then(module => ({ default: module.Issuer })));
const request = lazy(() => import('./Forms').then(module => ({ default: module.CertificateRequest })));
const certificatePaths = ['secretName', 'issuerRef', 'dnsNames', 'ipAddresses', 'uris', 'emailAddresses', 'otherNames', 'usages', 'duration', 'renewBefore', 'renewBeforePercentage', 'commonName', 'literalSubject', 'privateKey'];
export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    targets: [{ group: 'cert-manager.io', version: 'v1', kind: 'Certificate', resource: 'certificates', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect', 'action'], label: 'Certificate',
    sections: [{ id: 'certificate', label: 'Certificate' }, { id: 'observed', label: 'Issuance' }],
    ownedPaths: certificatePaths.map(key => ['spec', key]),
    sensitivePaths: [['metadata', 'annotations']],
    component: certificate, validate: certificateIssues,
    readOnly: (_draft, context) => context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system',
    formUnavailable: draft => {
      const group = draft.get(['spec', 'issuerRef', 'group']);
      const kind = draft.get(['spec', 'issuerRef', 'kind']);
      if ((group && group !== 'cert-manager.io') || (kind && kind !== 'Issuer' && kind !== 'ClusterIssuer')) return 'External issuer configuration remains in source.';
      for (const key of ['dnsNames', 'ipAddresses', 'uris', 'emailAddresses', 'usages']) {
        const value = draft.get(['spec', key]);
        if (value !== undefined && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) return 'Unsupported certificate list shape. Source remains unchanged.';
      }
      return null;
    },
  },
  ...(['Issuer', 'ClusterIssuer'] as const).map((kind): ResourceEditorContribution => ({
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    targets: [{ group: 'cert-manager.io', version: 'v1', kind, resource: kind === 'Issuer' ? 'issuers' : 'clusterissuers', scope: kind === 'Issuer' ? 'Namespaced' : 'Cluster' }],
    intents: ['create', 'edit', 'inspect'], label: kind,
    sections: [{ id: 'issuer', label: 'Signing authority' }, { id: 'observed', label: 'Status' }],
    ownedPaths: ['ca', 'acme', 'selfSigned', 'vault', 'venafi'].map(key => ['spec', key]),
    sensitivePaths: [['metadata', 'annotations'], ['spec', 'vault', 'caBundle'], ['spec', 'acme', 'caBundle'], ['spec', 'venafi', 'tpp', 'caBundle']],
    component: issuer, validate: issuerIssues,
    readOnly: (_draft, context) => context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system',
  })),
  {
    contractVersion: 1,
    ownershipPolicy: 'controller',
    targets: [{ group: 'cert-manager.io', version: 'v1', kind: 'CertificateRequest', resource: 'certificaterequests', scope: 'Namespaced' }],
    intents: ['inspect', 'edit', 'action'], label: 'Certificate request', sections: [{ id: 'request', label: 'Immutable request' }],
    ownedPaths: [], sensitivePaths: [['metadata', 'annotations'], ['spec', 'request'], ['spec', 'extra'], ['status', 'certificate'], ['status', 'ca']],
    component: request, readOnly: () => true,
  },
];
