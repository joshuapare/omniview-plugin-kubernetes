import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorFormProps, ResourceEditorPatch, ResourceEditorReferenceResult } from '@omniviewdev/runtime';
import { createResourceEditorDraft, ResourceEditorController } from '../../resourceEditorController';
import CustomResourceDefinitionEditor from './CustomResourceDefinitionEditor';
import { resourceEditors } from './index';
import { clientPath, diffSchema, endpointOperations, parseSchema, removeVersion, selectStorage, versionPath, versionsPath } from './model';
import { controllerSource, crdContext, createSource, editSource, multipleVersionsSource } from './fixtures';

const contribution = resourceEditors[0];
function Harness({ controller, context = crdContext, baseline, lookup = { status: 'ready', items: [] }, validity = () => undefined }: {
  controller: ResourceEditorController; context?: ResourceEditorContext; baseline?: string;
  lookup?: ResourceEditorReferenceResult; validity?: (error: string | null) => void;
}) {
  const [, refresh] = useState(0);
  const [section, setSection] = useState('conversion');
  const form: ResourceEditorFormProps = {
    context, draft: controller.draft(contribution.sensitivePaths),
    baseline: baseline ? createResourceEditorDraft(baseline, 'baseline', 0, contribution.sensitivePaths) : undefined,
    section, disabled: false, onValidityChange: validity,
    patch: request => { const result = controller.patch(request, contribution, context); if (result.status === 'accepted') refresh(value => value + 1); return result; },
    references: { list: async () => lookup },
    actions: { execute: async () => ({ status: 'unavailable', message: 'No fixture action.' }) },
  };
  return <><button onClick={() => setSection('names')}>Names section</button><button onClick={() => setSection('versions')}>Versions section</button><button onClick={() => setSection('conversion')}>Conversion section</button><CustomResourceDefinitionEditor {...form} /></>;
}

function apply(controller: ResourceEditorController, operations: readonly ResourceEditorPatch[]) {
  return controller.patch({ sessionID: controller.sessionID, expectedRevision: controller.revision, operations }, contribution, crdContext);
}

describe('CRD canonical editing', () => {
  it('switches storage atomically without dropping version schemas or exact YAML scalars', () => {
    const controller = new ResourceEditorController(multipleVersionsSource);
    expect(apply(controller, selectStorage(controller.draft(), 1)).status).toBe('accepted');
    expect(controller.draft().get(versionPath(0, 'storage'))).toBe(false);
    expect(controller.draft().get(versionPath(1, 'storage'))).toBe(true);
    expect(controller.draft().get(versionPath(0, 'schema', 'openAPIV3Schema', 'properties', 'spec', 'properties', 'replicas', 'maximum'))).toBe(9007199254740993n);
    expect(controller.getSource()).toContain('# exact schema constraint');
  });
  it('blocks stored-version removal and storage-version removal before any source mutation', () => {
    const controller = new ResourceEditorController(editSource);
    expect(() => removeVersion(controller.draft(), 0)).toThrow('Stored versions require migration');
    const multiple = new ResourceEditorController(multipleVersionsSource);
    expect(() => removeVersion(multiple.draft(), 0)).toThrow('Choose another storage version');
    expect(multiple.draft().get(versionsPath)).toHaveLength(2);
  });
  it('changes endpoint branches without writing back an opaque trust bundle', () => {
    const source = createSource.replace('        service:', '        caBundle: BUNDLE_RETAINED\n        service:');
    const controller = new ResourceEditorController(source);
    const projected = controller.draft(contribution.sensitivePaths);
    expect(typeof projected.get([...clientPath, 'caBundle'])).toBe('object');
    expect(apply(controller, endpointOperations(projected, 'url')).status).toBe('accepted');
    expect(controller.draft().get([...clientPath, 'caBundle'])).toBe('BUNDLE_RETAINED');
    expect(controller.draft().has([...clientPath, 'service'])).toBe(false);
    expect(controller.draft().get([...clientPath, 'url'])).toBe('');
  });
  it('patches schema leaves while preserving untouched constraints and comments', () => {
    const controller = new ResourceEditorController(createSource);
    const path = versionPath(0, 'schema', 'openAPIV3Schema');
    const before = controller.draft(contribution.sensitivePaths).get(path);
    const parsed = parseSchema('type: object\nproperties:\n  spec:\n    type: object\n    properties:\n      replicas:\n        type: integer\n        maximum: 9007199254740993\n        minimum: 0\n');
    expect(apply(controller, diffSchema(before, parsed, path)).status).toBe('accepted');
    expect(controller.draft().get([...path, 'properties', 'spec', 'properties', 'replicas', 'maximum'])).toBe(9007199254740993n);
    expect(controller.draft().get([...path, 'properties', 'spec', 'properties', 'replicas', 'minimum'])).toBe(0n);
    expect(controller.getSource()).toContain('# exact schema constraint');
  });
  it('rejects alias and duplicate-key schema imports before constructing a patch', () => {
    expect(() => parseSchema('type: object\nproperties: &props {}\nadditionalProperties: *props')).toThrow();
    expect(() => parseSchema('type: object\ntype: string')).toThrow();
  });
});

describe('CRD form behavior', () => {
  it('keeps partial port input through sibling changes and section navigation', () => {
    const controller = new ResourceEditorController(createSource);
    const validity = vi.fn();
    render(<Harness controller={controller} validity={validity} />);
    fireEvent.change(screen.getByLabelText('Service port'), { target: { value: '-' } });
    expect(controller.draft().get([...clientPath, 'service', 'port'])).toBe(443n);
    fireEvent.change(screen.getByLabelText('Service path'), { target: { value: '/new-convert' } });
    fireEvent.click(screen.getByText('Versions section'));
    fireEvent.click(screen.getByText('Conversion section'));
    expect(screen.getByLabelText('Service port')).toHaveValue('-');
    expect(validity).toHaveBeenLastCalledWith('Enter a port from 1 to 65535.');
    fireEvent.change(screen.getByLabelText('Service port'), { target: { value: '8443' } });
    expect(controller.draft().get([...clientPath, 'service', 'port'])).toBe(8443n);
  });
  it('renders existing list values and patches aliases without touching identity', () => {
    const controller = new ResourceEditorController(editSource);
    render(<Harness controller={controller} baseline={editSource} context={{ ...crdContext, intent: 'edit' }} />);
    fireEvent.click(screen.getByText('Names section'));
    expect(screen.getByLabelText('Short names')).toHaveValue('wdg');
    expect(screen.getByLabelText('API group')).toBeDisabled();
    expect(screen.getByLabelText('Resource plural')).toBeDisabled();
    expect(screen.getByLabelText('Kind')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Short names'), { target: { value: 'wdg, widget' } });
    expect(controller.draft().get(['spec', 'names', 'shortNames'])).toEqual(['wdg', 'widget']);
    expect(controller.draft().get(['metadata', 'name'])).toBe('widgets.fixture.example');
  });
  it('reports denied Service lookup distinctly and preserves unresolved manual references', async () => {
    const controller = new ResourceEditorController(createSource);
    render(<Harness controller={controller} lookup={{ status: 'denied', message: 'denied' }} />);
    expect(await screen.findByText('Reference access denied. Enter a name manually.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Service name'), { target: { value: 'unresolved-converter' } });
    expect(controller.draft().get([...clientPath, 'service', 'name'])).toBe('unresolved-converter');
  });
  it('keeps invalid schema local and blocks submission validity until discard', () => {
    const controller = new ResourceEditorController(createSource);
    const validity = vi.fn();
    render(<Harness controller={controller} validity={validity} />);
    fireEvent.click(screen.getByText('Versions section'));
    const before = controller.getSource();
    fireEvent.change(screen.getByLabelText('OpenAPI v3 schema'), { target: { value: 'type: [' } });
    expect(controller.getSource()).toBe(before);
    expect(validity).toHaveBeenLastCalledWith('Enter one object structural schema without aliases or protected values.');
    fireEvent.click(screen.getByText('Discard schema changes'));
    expect(validity).toHaveBeenLastCalledWith(null);
  });
  it('uses inspection-only controls for a controller-owned definition', () => {
    const controller = new ResourceEditorController(controllerSource);
    render(<Harness controller={controller} context={{ ...crdContext, intent: 'edit' }} baseline={controllerSource} />);
    expect(screen.getByLabelText('Service port')).toBeDisabled();
    expect(screen.getByText('Read-only inspection')).toBeInTheDocument();
  });
  it('never treats unknown create authorization as writable', () => {
    const controller = new ResourceEditorController(createSource);
    const context: ResourceEditorContext = { ...crdContext, capabilities: { ...crdContext.capabilities, create: 'unknown' } };
    render(<Harness controller={controller} context={context} />);
    expect(screen.getByLabelText('Service port')).toBeDisabled();
    const result = controller.patch({ sessionID: controller.sessionID, expectedRevision: controller.revision, operations: [{ op: 'set', path: [...clientPath, 'service', 'port'], value: 8443n }] }, contribution, context);
    expect(result.status).toBe('forbidden');
    expect(controller.draft().get([...clientPath, 'service', 'port'])).toBe(443n);
  });
});

describe('CRD public webhook reference', () => {
  const service = '        service:\n          namespace: fixture-system\n          name: widget-converter\n          path: /convert\n          port: 443';
  const source = (url: unknown) => createSource.replace(service, `        caBundle: PRIVATE_CA_RETAINED\n        future: {private: PRIVATE_SIBLING_RETAINED}\n        url: ${JSON.stringify(url)}`);

  it.each([
    'https://user:private-password@example.invalid/convert',
    'https://example.invalid/convert?token=private-token',
    'https://example.invalid/convert#private-token',
    { opaque: 'private-token' },
  ])('keeps unsafe or opaque endpoint canonical and hidden through remount/source switch: %j', url => {
    const controller = new ResourceEditorController(source(url));
    const before = controller.getSource();
    const view = render(<Harness controller={controller} />);
    expect(screen.getByLabelText('HTTPS endpoint')).toHaveValue('');
    expect(screen.getByLabelText('HTTPS endpoint')).toHaveAttribute('placeholder', 'Stored reference unchanged');
    expect(view.container.innerHTML).not.toContain('private-password');
    expect(view.container.innerHTML).not.toContain('private-token');
    expect(controller.getSource()).toBe(before);
    view.unmount();
    const mounted = render(<Harness controller={controller} />);
    expect(screen.getByLabelText('HTTPS endpoint')).toHaveValue('');
    expect(controller.getSource()).toBe(before);
    const fromSource = new ResourceEditorController(source('https://example.invalid/from-source'));
    mounted.rerender(<Harness controller={fromSource} />);
    expect(screen.getByLabelText('HTTPS endpoint')).toHaveValue('https://example.invalid/from-source');
    expect(controller.getSource()).toBe(before);
  });

  it.each(['https://example.invalid/convert', 'https://user:private-password@example.invalid/convert'])('replaces endpoint leaf explicitly and retains CA/private siblings: %s', url => {
    const controller = new ResourceEditorController(source(url));
    const before = controller.draft().get(clientPath);
    const view = render(<Harness controller={controller} />);
    expect(screen.getByLabelText('HTTPS endpoint')).toHaveValue(url.includes('@') ? '' : url);
    fireEvent.change(screen.getByLabelText('HTTPS endpoint'), { target: { value: 'https://user:password@example.invalid/invalid' } });
    expect(controller.draft().get([...clientPath, 'url'])).toBe(url);
    fireEvent.change(screen.getByLabelText('HTTPS endpoint'), { target: { value: 'https://example.invalid/public' } });
    expect(controller.draft().get(clientPath)).toEqual({ ...before as Record<string, unknown>, url: 'https://example.invalid/public' });
    expect(controller.draft().get([...clientPath, 'caBundle'])).toBe('PRIVATE_CA_RETAINED');
    expect(controller.draft().get([...clientPath, 'future'])).toEqual({ private: 'PRIVATE_SIBLING_RETAINED' });
    view.unmount();
    render(<Harness controller={controller} />);
    expect(screen.getByLabelText('HTTPS endpoint')).toHaveValue('https://example.invalid/public');
  });
});
