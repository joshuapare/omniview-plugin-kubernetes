import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { inspectionOnly, integerValue, unsupportedShape } from './policy';
const draft = (values: Record<string, unknown> = {}): ResourceEditorDraft => ({ sessionID: 'fixture', revision: 1, get: path => values[path.join('.')], has: path => Object.hasOwn(values, path.join('.')) });
const context = (kind: string, intent = 'edit', ownership = 'application') => ({ kind, intent, ownership: { status: ownership } }) as ResourceEditorContext;
describe('Argo authoring boundaries', () => {
  it('allows standalone submission but never live execution spec editing', () => {
    for (const kind of ['Workflow', 'AnalysisRun', 'Experiment']) {
      expect(inspectionOnly(draft(), context(kind, 'create'))).toBe(false);
      expect(inspectionOnly(draft(), context(kind))).toBe(true);
    }
  });
  it('locks generated Applications and unknown ownership', () => {
    expect(inspectionOnly(draft({ 'metadata.ownerReferences': [{ kind: 'ApplicationSet' }] }), context('Application'))).toBe(true);
    expect(inspectionOnly(draft(), context('Application', 'edit', 'unknown'))).toBe(true);
    expect(inspectionOnly(draft(), context('Application'))).toBe(false);
    expect(inspectionOnly(draft(), context('Application', 'create', 'controller'))).toBe(true);
  });
  it('never creates executor records', () => {
    for (const kind of ['WorkflowArtifactGCTask', 'WorkflowTaskResult', 'WorkflowTaskSet']) expect(inspectionOnly(draft(), context(kind, 'create'))).toBe(true);
  });
  it('rejects unsafe integers and partial canary weights without coercion', () => {
    for (const value of ['-', '1.5', '-1', '101', '9007199254740993']) expect(integerValue(value, true).valid).toBe(false);
    expect(integerValue('100', true)).toEqual({ valid: true, value: 100 });
  });
  it('retains unsupported source unions instead of introducing a competing branch', () => {
    expect(unsupportedShape(draft({ 'spec.strategy.blueGreen': {} }), context('Rollout'))).toBeTruthy();
    expect(unsupportedShape(draft({ 'spec.templates.0': { dag: {} } }), context('WorkflowTemplate'))).toBeTruthy();
    expect(unsupportedShape(draft({ 'spec.sources': [] }), context('Application'))).toBeTruthy();
  });
});
