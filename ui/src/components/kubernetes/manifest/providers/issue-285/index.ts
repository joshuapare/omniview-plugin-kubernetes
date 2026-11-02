import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';

const EventInspector = lazy(() => import('./EventInspector'));

/** Events are reporter-owned observations, never ordinary desired-state edits. */
export const resourceEditors: readonly ResourceEditorContribution[] = [{
  contractVersion: 1,
  targets: [{ group: 'events.k8s.io', version: 'v1', kind: 'Event', resource: 'events', scope: 'Namespaced' }],
  intents: ['inspect', 'edit'],
  label: 'Event diagnostics',
  sections: [
    { id: 'diagnostics', label: 'Diagnostic' },
    { id: 'objects', label: 'Objects' },
    { id: 'series', label: 'Occurrences' },
    { id: 'ownership', label: 'Ownership' },
  ],
  ownedPaths: [],
  sensitivePaths: [['note'], ['metadata', 'annotations']],
  readOnly: () => true,
  formUnavailable: draft => draft.get(['apiVersion']) !== 'events.k8s.io/v1' || draft.get(['kind']) !== 'Event'
    ? 'Unsupported Event representation. Retained source remains read-only.'
    : null,
  component: EventInspector,
}];
