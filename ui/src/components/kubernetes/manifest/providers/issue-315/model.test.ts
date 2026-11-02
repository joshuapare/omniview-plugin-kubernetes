import { describe, expect, it } from 'vitest';
import type { ResourceEditorDraft, ResourceEditorContext } from '@omniviewdev/runtime';
import { integer, validate } from './model';
function draft(value: unknown): ResourceEditorDraft {
 const get = (path: readonly (string | number)[]) => path.reduce<unknown>((node, key) => node !== null && typeof node === 'object' ? (node as Record<string | number, unknown>)[key] : undefined, value);
 return { sessionID: 'fixture', revision: 0, get, has: path => get(path) !== undefined };
}
const context = { kind: 'ScaledObject' } as ResourceEditorContext;
describe('KEDA scaling validation', () => {
 it('rejects partial and out-of-range integers without rounding', () => { expect(integer('-')).toMatchObject({valid:false}); expect(integer('9007199254740993')).toMatchObject({valid:false}); expect(integer('0')).toEqual({valid:true,value:0}); });
 it('compares exact replica bounds', () => { expect(validate(draft({spec:{scaleTargetRef:{name:'worker'},minReplicaCount:10,maxReplicaCount:2,triggers:[{type:'cron'}]}}), context)).toContainEqual({path:['spec','maxReplicaCount'],message:'Maximum must be at least minimum.'}); });
 it('reports malformed source values instead of throwing', () => { expect(validate(draft({spec:{minReplicaCount:'partial',maxReplicaCount:2}}), context).some(issue => issue.path.includes('minReplicaCount'))).toBe(true); });
 it('requires both fallback fields while accepting zero replicas', () => { const source = draft({spec:{scaleTargetRef:{name:'worker'},fallback:{failureThreshold:3,replicas:0},triggers:[{type:'cron'}]}}); expect(validate(source, context)).toEqual([]); });
 it('requires real Job container image and restart policy', () => { const issues = validate(draft({spec:{jobTargetRef:{template:{spec:{containers:[{name:'worker'}]}}},triggers:[{type:'cron'}]}}), {...context,kind:'ScaledJob'}); expect(issues.map(issue => issue.path.at(-1))).toEqual(['image','restartPolicy']); });
 it('validates every Secret parameter mapping', () => { const issues = validate(draft({spec:{secretTargetRef:[{parameter:'host',name:'auth',key:'endpoint'},{parameter:'token'}]}}), {...context,kind:'ClusterTriggerAuthentication'}); expect(issues.map(issue => issue.path)).toEqual([['spec','secretTargetRef',1,'name'],['spec','secretTargetRef',1,'key']]); });
});
