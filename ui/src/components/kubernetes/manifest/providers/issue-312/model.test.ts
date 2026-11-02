import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { notificationReadOnly, notificationUnavailable, validateNotification } from './model';
function draft(value: unknown): ResourceEditorDraft {
  const get = (path: readonly (string|number)[]) => path.reduce<unknown>((node,key) => node && typeof node === 'object' ? (node as Record<string|number,unknown>)[key] : undefined,value);
  return {sessionID:'test',revision:0,get,has:path => get(path) !== undefined};
}
const context = {kind:'Provider',intent:'edit',ownership:{status:'application'},discovery:{status:'available',features:{}}} as ResourceEditorContext;
describe('Flux notification safety', () => {
  it('blocks conflicting static and workload credentials and unknown gates', () => {
    const issues = validateNotification(draft({spec:{type:'azureeventhub',serviceAccountName:'sender',secretRef:{name:'static'}}}),context);
    expect(issues.filter(issue => issue.path.includes('serviceAccountName'))).toHaveLength(2);
  });
  it('keeps Provider timeout units distinct from Receiver interval units', () => {
    expect(validateNotification(draft({spec:{type:'generic',timeout:'1h'}}),context).map(issue => issue.path)).toContainEqual(['spec','timeout']);
    expect(validateNotification(draft({spec:{type:'generic',interval:'1h',secretRef:{name:'validation'},resources:[{kind:'GitRepository',name:'repo'}]}}),{...context,kind:'Receiver'})).toEqual([]);
  });
  it('rejects label targeting without wildcard without changing source', () => {
    const source = {spec:{providerRef:{name:'destination'},eventSources:[{kind:'GitRepository',name:'repo',matchLabels:{team:'platform'}}]}};
    const before = JSON.stringify(source);
    expect(validateNotification(draft(source),{...context,kind:'Alert'}).map(issue => issue.path)).toContainEqual(['spec','eventSources',0,'name']);
    expect(JSON.stringify(source)).toBe(before);
  });
  it('does not present live editing for GitOps or unknown ownership', () => {
    expect(notificationReadOnly(draft({}),{...context,ownership:undefined})).toBe(true);
    expect(notificationReadOnly(draft({metadata:{labels:{'kustomize.toolkit.fluxcd.io/name':'root'}}}),context)).toBe(true);
    expect(notificationReadOnly(draft({}),{...context,intent:'create',ownership:undefined})).toBe(false);
  });
  it('rejects unsupported commit CEL and missing Receiver validation references', () => {
    expect(validateNotification(draft({spec:{type:'slack',commitStatusExpr:'event.message'}}),context).map(issue => issue.path)).toContainEqual(['spec','commitStatusExpr']);
    expect(validateNotification(draft({spec:{type:'github',resources:[]}}),{...context,kind:'Receiver'}).map(issue => issue.path)).toContainEqual(['spec','secretRef','name']);
  });
  it('keeps non-string source targets in source mode rather than coercing scalars', () => {
    expect(notificationUnavailable(draft({spec:{resources:[{kind:'GitRepository',name:9007199254740993n}]}}),{...context,kind:'Receiver'})).not.toBeNull();
    expect(notificationUnavailable(draft({spec:{eventSources:[{kind:'GitRepository',name:'source',unknown:9007199254740993n}]}}),{...context,kind:'Alert'})).toBeNull();
  });
});
