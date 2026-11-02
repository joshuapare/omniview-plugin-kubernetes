import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
import { locked, validate } from './policy';
function draft(value: Record<string,unknown>):ResourceEditorDraft { return {sessionID:'fixture',revision:2,get:path=>path.reduce<unknown>((node,key)=>node&&typeof node==='object'?(node as Record<string,unknown>)[String(key)]:undefined,value),has(path){return this.get(path)!==undefined;}}; }
const context={kind:'Restore',intent:'create',ownership:{status:'application'}} as ResourceEditorContext;
describe('Velero submission and transfer boundaries',()=>{
 it('rejects ambiguous restore source without choosing one silently',()=>{expect(validate(draft({spec:{backupName:'backup-a',scheduleName:'nightly'}}),context)).toEqual([{path:['spec','backupName'],message:'Choose exactly one Backup or Schedule.'}]);});
 it('allows either explicit restore source',()=>{expect(validate(draft({spec:{scheduleName:'nightly'}}),context)).toEqual([]);});
 it('locks existing backups even when user can update objects',()=>{expect(locked(draft({spec:{}}),{...context,kind:'Backup',intent:'edit'})).toBe(true);});
 it('only stages cancellation during InProgress',()=>{for(const phase of ['New','Prepared','Canceling','Completed','Failed'])expect(locked(draft({status:{phase}}),{...context,kind:'DataUpload',intent:'edit'})).toBe(true);expect(locked(draft({status:{phase:'InProgress'}}),{...context,kind:'DataUpload',intent:'edit'})).toBe(false);});
 it('does not treat missing ownership as user ownership',()=>{expect(locked(draft({}),{...context,kind:'Schedule',intent:'edit',ownership:undefined})).toBe(true);});
});
