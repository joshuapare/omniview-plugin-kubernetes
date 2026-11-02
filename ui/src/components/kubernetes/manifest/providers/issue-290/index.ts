import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';

const ImageReviewInspector = lazy(() => import('./ImageReviewInspector'));

export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  label: 'Image review snapshot',
  // Empty resource is the explicit protocol-envelope sentinel, not a guessed plural.
  targets: [{ group: 'imagepolicy.k8s.io', version: 'v1alpha1', kind: 'ImageReview', resource: '', scope: 'Cluster' }],
  intents: ['inspect'],
  sections: [
    { id: 'request', label: 'Images' },
    { id: 'decision', label: 'Decision' },
    { id: 'integration', label: 'Integration' },
  ],
  ownedPaths: [],
  sensitivePaths: [
    ['metadata'],
    ['spec', 'annotations', '*'],
    ['spec', 'containers', '*', 'image'],
    ['status', 'reason'],
    ['status', 'auditAnnotations', '*'],
  ],
  component: ImageReviewInspector,
  readOnly: () => true,
  formUnavailable: (draft, context) => {
    if (context.intent !== 'inspect') return 'ImageReview supports snapshot inspection only.';
    if (draft.get(['apiVersion']) !== 'imagepolicy.k8s.io/v1alpha1' || draft.get(['kind']) !== 'ImageReview') {
      return 'Unsupported ImageReview envelope. Source remains unchanged.';
    }
    const spec = draft.get(['spec']);
    if (spec !== undefined && (spec === null || typeof spec !== 'object' || Array.isArray(spec))) {
      return 'Unsupported ImageReview request shape. Source remains unchanged.';
    }
    return null;
  },
}];
