import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { inspectionKinds, locked, ownedPaths, resources, validate, type Kind } from './policy';
const Schedule = lazy(()=>import('./VeleroForms').then(module=>({default:module.Schedule})));
const Storage = lazy(()=>import('./VeleroForms').then(module=>({default:module.Storage})));
const Backup = lazy(()=>import('./VeleroForms').then(module=>({default:module.Backup})));
const Restore = lazy(()=>import('./VeleroForms').then(module=>({default:module.Restore})));
const Inspection = lazy(()=>import('./VeleroForms').then(module=>({default:module.Inspection})));
const Request = lazy(()=>import('./VeleroForms').then(module=>({default:module.Request})));
export const resourceEditors: readonly ResourceEditorContribution[] = (Object.keys(resources) as Kind[]).map(kind=>({
 contractVersion:1,
 targets:[{group:'velero.io',version:kind==='DataUpload'||kind==='DataDownload'?'v2alpha1':'v1',kind,resource:resources[kind],scope:'Namespaced'}],
 intents:inspectionKinds.includes(kind)?['inspect']:kind==='DataUpload'||kind==='DataDownload'?['edit','inspect']:['create','edit','inspect'],
 label:`Velero ${kind}`,
 sections:[{id:'configuration',label:inspectionKinds.includes(kind)?'Execution':'Configuration'}],
 ownedPaths:ownedPaths(kind),
 sensitivePaths:[['spec','config'],['spec','objectStorage','caCert'],['status','downloadURL'],['spec','dataMoverConfig'],['status','dataMoverResult']],
 ownershipPolicy:inspectionKinds.includes(kind)||kind==='DataUpload'||kind==='DataDownload'?'controller':kind==='Backup'||kind==='Restore'?'conditional':'declarative',
 component:kind==='Schedule'?Schedule:kind==='BackupStorageLocation'||kind==='VolumeSnapshotLocation'?Storage:kind==='Backup'?Backup:kind==='Restore'?Restore:kind.endsWith('Request')?Request:Inspection,
 readOnly:locked,
 validate,
}));
