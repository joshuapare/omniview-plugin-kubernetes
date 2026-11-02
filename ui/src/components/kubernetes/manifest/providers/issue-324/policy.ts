import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export const resources = { Schedule: 'schedules', BackupStorageLocation: 'backupstoragelocations', VolumeSnapshotLocation: 'volumesnapshotlocations', Backup: 'backups', Restore: 'restores', BackupRepository: 'backuprepositories', PodVolumeBackup: 'podvolumebackups', PodVolumeRestore: 'podvolumerestores', DataUpload: 'datauploads', DataDownload: 'datadownloads', DeleteBackupRequest: 'deletebackuprequests', DownloadRequest: 'downloadrequests', ServerStatusRequest: 'serverstatusrequests' } as const;
export type Kind = keyof typeof resources;
export const inspectionKinds: readonly string[] = ['BackupRepository', 'PodVolumeBackup', 'PodVolumeRestore'];
export const submissionKinds: readonly string[] = ['Backup', 'Restore', 'DeleteBackupRequest', 'DownloadRequest', 'ServerStatusRequest'];
export const artifacts = ['BackupLog','BackupContents','BackupVolumeSnapshots','BackupItemOperations','BackupResourceList','BackupResults','RestoreLog','RestoreResults','RestoreResourceList','RestoreItemOperations','CSIBackupVolumeSnapshots','CSIBackupVolumeSnapshotContents','BackupVolumeInfos','RestoreVolumeInfo'];
export function locked(draft: ResourceEditorDraft, context: ResourceEditorContext) {
  if (inspectionKinds.includes(context.kind)) return true;
  if (submissionKinds.includes(context.kind)) return context.intent !== 'create';
  if (context.kind === 'DataUpload' || context.kind === 'DataDownload') return context.intent !== 'edit' || draft.get(['status','phase']) !== 'InProgress';
  return context.intent === 'inspect' || context.ownership?.status !== 'application';
}
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
  if (locked(draft,context)) return [];
  const issues: ResourceEditorFieldIssue[] = [];
  const required = (path: string[]) => { if (typeof draft.get(path) !== 'string' || !String(draft.get(path)).trim()) issues.push({path,message:'Required.'}); };
  if (context.kind === 'Schedule') required(['spec','schedule']);
  if (context.kind.endsWith('StorageLocation') || context.kind === 'VolumeSnapshotLocation') required(['spec','provider']);
  if (context.kind === 'BackupStorageLocation') required(['spec','objectStorage','bucket']);
  if (context.kind === 'Restore' && Boolean(draft.get(['spec','backupName'])) === Boolean(draft.get(['spec','scheduleName']))) issues.push({path:['spec','backupName'],message:'Choose exactly one Backup or Schedule.'});
  if (context.kind === 'DeleteBackupRequest') required(['spec','backupName']);
  if (context.kind === 'DownloadRequest') { required(['spec','target','name']); if (!artifacts.includes(String(draft.get(['spec','target','kind'])))) issues.push({path:['spec','target','kind'],message:'Choose an artifact.'}); }
  return issues;
}
export const backupFields = ['includedNamespaces','excludedNamespaces','includedResources','excludedResources','storageLocation','ttl','snapshotVolumes','defaultVolumesToFsBackup','snapshotMoveData','includeClusterResources','hooks'];
export function ownedPaths(kind: Kind): readonly (readonly string[])[] {
  if (kind === 'Schedule') return [['spec','schedule'],['spec','paused'],['spec','skipImmediately'],['spec','useOwnerReferencesInBackup'],...backupFields.map(field=>['spec','template',field])];
  if (kind === 'Backup') return backupFields.map(field=>['spec',field]);
  if (kind === 'Restore') return ['backupName','scheduleName','includedNamespaces','excludedNamespaces','includedResources','excludedResources','namespaceMapping','existingResourcePolicy','restorePVs','preserveNodePorts'].map(field=>['spec',field]);
  if (kind === 'BackupStorageLocation' || kind === 'VolumeSnapshotLocation') return ['provider','credential','objectStorage','accessMode','default','backupSyncPeriod','validationFrequency'].map(field=>['spec',field]);
  if (kind === 'DataUpload' || kind === 'DataDownload') return [['spec','cancel']];
  if (kind === 'DeleteBackupRequest') return [['spec','backupName']];
  if (kind === 'DownloadRequest') return [['spec','target','kind'],['spec','target','name']];
  if (kind === 'ServerStatusRequest') return [['spec']];
  return [];
}
