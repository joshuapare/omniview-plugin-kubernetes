import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceEditorContext, ResourceEditorFormProps } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import StorageVersionMigrationForm from './StorageVersionMigrationForm';
import { resourceEditors } from './index';
import { createSource, migrationContext, migrationFixtures, preservationSource } from './fixtures';
import { groupError, migrationConditions, migrationProgress, resourceError, unsupportedMigration } from './model';

const contribution = resourceEditors[0];
const services = {
  references: { list: vi.fn(async () => ({ status: 'unavailable' as const, message: 'Fixture has no live lookup.' })) },
  actions: { execute: vi.fn(async () => ({ status: 'unavailable' as const, message: 'Fixture has no live actions.' })) },
};
function Harness({ source = createSource, context = migrationContext, section = 'target', validity = () => {} }: {
  source?: string; context?: ResourceEditorContext; section?: string; validity?: ResourceEditorFormProps['onValidityChange'];
}) {
  const [controller] = useState(() => new ResourceEditorController(source, 'migration-regression'));
  const [, renderRevision] = useState(0);
  return <><StorageVersionMigrationForm {...services} context={context} section={section} disabled={false}
    draft={controller.draft(contribution.sensitivePaths)} onValidityChange={validity} patch={request => {
      const result = controller.patch(request, contribution, context);
      if (result.status === 'accepted') renderRevision(result.revision);
      return result;
    }} /><output aria-label="Canonical source">{controller.getSource()}</output></>;
}
afterEach(cleanup);

describe('StorageVersionMigration guided editing', () => {
  it('holds invalid target locally without corrupting source and retains sibling input across patches', () => {
    const validity = vi.fn();
    render(<Harness source={preservationSource} validity={validity} />);
    fireEvent.change(screen.getByLabelText('Plural resource'), { target: { value: '' } });
    expect(screen.getByLabelText('Plural resource')).toHaveValue('');
    expect(screen.getByLabelText('Canonical source')).toHaveTextContent('resource: deployments');
    fireEvent.change(screen.getByLabelText('API group'), { target: { value: 'batch' } });
    expect(screen.getByLabelText('Plural resource')).toHaveValue('');
    expect(validity).toHaveBeenLastCalledWith(resourceError(''));
    const source = screen.getByLabelText('Canonical source').textContent;
    expect(source).toContain('group: batch # target group comment');
    expect(source).toContain('futureOption: 9007199254740993 # exact unknown sibling');
    fireEvent.change(screen.getByLabelText('Plural resource'), { target: { value: 'jobs' } });
    expect(validity).toHaveBeenLastCalledWith(null);
    expect(screen.getByLabelText('Canonical source').textContent).toContain('resource: jobs');
  });
  it('permits core group without inventing an API version', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('API group'), { target: { value: '' } });
    expect(screen.getByLabelText('API group')).toHaveValue('');
    expect(screen.getByLabelText('Canonical source').textContent).toMatch(/group: ["']{2}/);
    expect(screen.queryByLabelText('Target version')).not.toBeInTheDocument();
  });
  it('locks all target fields on existing request even with update permission', () => {
    render(<Harness context={{ ...migrationContext, intent: 'edit' }} />);
    expect(screen.getByLabelText('API group')).toBeDisabled();
    expect(screen.getByLabelText('Plural resource')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Plural resource'), { target: { value: 'jobs' } });
    expect(screen.getByLabelText('Canonical source').textContent).toBe(createSource);
  });
  it.each(['denied', 'unknown', 'unavailable'] as const)('does not infer create permission from discovery: %s', availability => {
    render(<Harness context={{ ...migrationContext, capabilities: { ...migrationContext.capabilities, create: availability } }} />);
    expect(screen.getByLabelText('Plural resource')).toBeDisabled();
  });
  it('rejects projected non-string target shape without writes', () => {
    render(<Harness source={migrationFixtures.unsupported} />);
    expect(screen.getByLabelText('Plural resource')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('string scalars');
    expect(screen.getByLabelText('Canonical source').textContent).toBe(migrationFixtures.unsupported);
  });
  it('shows exact opaque versions and controller observations without percentage or message disclosure', () => {
    render(<Harness source={migrationFixtures.failed} context={{ ...migrationContext, intent: 'inspect' }} section="progress" />);
    expect(screen.getAllByText('Failed', { selector: 'strong' })).toHaveLength(2);
    expect(screen.getByText('9007199254740993')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Observation details'));
    expect(screen.getByText(/hidden for privacy/)).toBeInTheDocument();
    expect(screen.queryByText('Synthetic controller detail; withheld in guided views')).not.toBeInTheDocument();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  });
  it('keeps missing observations unknown rather than reporting success', () => {
    const controller = new ResourceEditorController(migrationFixtures.unobserved);
    expect(migrationProgress(migrationConditions(controller.draft()))).toBe('Not reported');
  });
  it('does not round controller observedGeneration', () => {
    const controller = new ResourceEditorController(migrationFixtures.running);
    expect(migrationConditions(controller.draft())[0].observedGeneration).toBe('9007199254740993');
  });
  it('validates exact DNS distinctions and rejects consecutive group dots', () => {
    expect(groupError('')).toBeNull();
    expect(groupError('apps')).toBeNull();
    expect(groupError('example..test')).not.toBeNull();
    expect(resourceError('1deployments')).not.toBeNull();
    expect(resourceError('deployments')).toBeNull();
    const controller = new ResourceEditorController(migrationFixtures.unsupported);
    expect(unsupportedMigration(controller.draft())).not.toBeNull();
  });
});
