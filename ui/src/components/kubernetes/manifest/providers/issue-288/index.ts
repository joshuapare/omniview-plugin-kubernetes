import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { admissionSensitivePaths } from './admissionReview';

const AdmissionReviewInspector = lazy(() => import('./AdmissionReviewInspector'));

/** Empty resource is the non-served protocol sentinel, not a guessed REST plural. */
export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: ['v1', 'v1beta1'].map(version => ({
    group: 'admission.k8s.io', version, kind: 'AdmissionReview', resource: '', scope: 'Cluster' as const,
  })),
  intents: ['inspect'],
  label: 'AdmissionReview protocol inspector',
  sections: [
    { id: 'request', label: 'Request' },
    { id: 'response', label: 'Response' },
    { id: 'payloads', label: 'Payload boundaries' },
    { id: 'review', label: 'Exchange check' },
  ],
  ownedPaths: [],
  sensitivePaths: admissionSensitivePaths,
  component: AdmissionReviewInspector,
  readOnly: () => true,
}];
