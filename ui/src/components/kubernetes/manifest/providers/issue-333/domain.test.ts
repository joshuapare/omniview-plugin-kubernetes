import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { locked, validate } from './domain';
const context=(kind:string,intent:ResourceEditorContext['intent']='create')=>({kind,intent,name:'pool',ownership:{status:'application'}} as ResourceEditorContext);
function draft(spec:unknown,metadata:unknown={}):ResourceEditorDraft{const source:unknown={spec,metadata};return {sessionID:'fixture',revision:0,get(path){return path.reduce<unknown>((value,key)=>value&&typeof value==='object'?(value as Record<string|number,unknown>)[key]:undefined,source);},has(path){return this.get(path)!==undefined;}};}
describe('CloudNativePG domain safety',()=>{
 it('locks generated backup and all existing backup requests',()=>{expect(locked(draft({cluster:{name:'db'}}),context('Backup','edit'))).toBe(true);expect(locked(draft({}, {ownerReferences:[{kind:'ScheduledBackup'}]}),context('Backup'))).toBe(true);expect(locked(draft({}),context('Backup'))).toBe(false);});
 it('never offers quorum authoring',()=>{expect(locked(draft({}),context('FailoverQuorum'))).toBe(true);});
 it('rejects Kubernetes five-field cron for scheduled backups',()=>{const issues=validate(draft({cluster:{name:'db'},schedule:'0 0 * * *'}),context('ScheduledBackup'));expect(issues.some(i=>i.path.at(-1)==='schedule')).toBe(true);expect(validate(draft({cluster:{name:'db'},schedule:'0 0 0 * * *'}),context('ScheduledBackup'))).toEqual([]);});
 it('requires plugin selection only for plugin backup method',()=>{expect(validate(draft({cluster:{name:'db'},method:'plugin'}),context('Backup')).some(i=>i.message==='Select a backup plugin.')).toBe(true);expect(validate(draft({cluster:{name:'db'},method:'volumeSnapshot'}),context('Backup'))).toEqual([]);});
 it('rejects duplicate catalog majors and missing explicit images',()=>{expect(validate(draft({images:[{major:17,image:'image-a'},{major:17,image:'image-b'}]}),context('ImageCatalog'))).not.toEqual([]);expect(validate(draft({images:[{major:17,image:'image-a'}]}),context('ClusterImageCatalog'))).toEqual([]);});
 it('requires publication objects without forcing a schema-based source into table form',()=>{const base={cluster:{name:'db'},name:'pub',dbname:'app'};expect(validate(draft({...base,target:{}}),context('Publication')).length).toBeGreaterThan(0);expect(validate(draft({...base,target:{objects:[{tablesInSchema:'public'}]}}),context('Publication'))).toEqual([]);});
 it('rejects Pooler names colliding with target Cluster',()=>{expect(validate(draft({cluster:{name:'pool'},type:'rw',pgbouncer:{poolMode:'transaction'}}),context('Pooler')).some(i=>i.message.includes('must differ'))).toBe(true);});
});
