import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import GeneratorForm from './GeneratorForm';
import { resourceEditors } from './index';

afterEach(cleanup);

it('accepts public Secret selector metadata without exposing or replacing protected sibling values', () => {
  const provider = resourceEditors.find(editor => editor.targets[0].kind === 'Grafana')!;
  const context: ResourceEditorContext = {
    ...provider.targets[0], intent: 'edit', connectionID: 'fixture', namespace: 'team',
    ownership: { status: 'application' },
    capabilities: { create: 'available', update: 'available', delete: 'available', get: 'available', list: 'available', actions: {} },
    discovery: { status: 'available', features: {} }, schema: { status: 'available' },
  };
  const source = 'apiVersion: generators.external-secrets.io/v1alpha1\nkind: Grafana\nmetadata: {name: dashboard, namespace: team}\nspec:\n  auth:\n    token:\n      name: original-reference\n      key: original-key\n      unknownCredential: private-value-retained\n  serviceAccount: {name: dashboard-reader, role: Viewer}\n';
  const controller = new ResourceEditorController(source);
  const validity = vi.fn();
  function Harness() {
    const [, update] = useState(0);
    const form: ResourceEditorFormProps = {
      context, draft: controller.draft(provider.sensitivePaths), section: 'configuration', disabled: false,
      patch: request => { const result = controller.patch(request, provider, context); update(value => value + 1); return result; },
      onValidityChange: validity,
      references: { list: async () => ({ status: 'ready', items: [] }) },
      actions: { execute: async () => ({ status: 'unavailable', message: 'Fixture only.' }) },
    };
    return <GeneratorForm {...form} />;
  }
  const view = render(<Harness />);
  const selector = screen.getByText('Token', { selector: 'summary' }).parentElement!;
  const name = within(selector).getByRole<HTMLInputElement>('textbox', { name: 'Name', hidden: true });
  const key = within(selector).getByRole<HTMLInputElement>('textbox', { name: 'Key', hidden: true });
  expect(name.value).toBe('');
  expect(key.value).toBe('');
  fireEvent.change(name, { target: { value: 'selected-reference' } });
  fireEvent.change(key, { target: { value: 'selected-key' } });
  expect(name.value).toBe('selected-reference');
  expect(key.value).toBe('selected-key');
  expect(controller.getSource()).toContain('name: selected-reference');
  expect(controller.getSource()).toContain('key: selected-key');
  expect(controller.getSource()).toContain('unknownCredential: private-value-retained');
  expect(view.container.textContent).not.toContain('private-value-retained');
  expect(Array.from(view.container.querySelectorAll('input')).map(input => input.value)).not.toContain('private-value-retained');
  view.unmount();
  controller.dispose();
});
