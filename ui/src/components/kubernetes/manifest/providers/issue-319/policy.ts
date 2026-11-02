import type { ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export function passwordIssues(draft: ResourceEditorDraft, prefix: readonly (string | number)[] = ['spec']): ResourceEditorFieldIssue[] {
  const read = (key: string, fallback: bigint) => {
    const value = draft.get([...prefix, key]);
    if (value === undefined) return fallback;
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return Number.isSafeInteger(value) ? BigInt(value) : null;
    if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return null;
    return BigInt(value);
  };
  const length = read('length', 24n);
  const digits = read('digits', length === null ? 0n : length / 4n);
  const symbols = read('symbols', length === null ? 0n : length / 4n);
  if (length === null || digits === null || symbols === null) return [{ path: prefix, message: 'Password constraints must be whole numbers.' }];
  if (length <= 0n || digits < 0n || symbols < 0n || digits + symbols > length) return [{ path: prefix, message: 'Use a positive length with digits plus symbols no greater than length.' }];
  return [];
}

export const clusterBranches: Readonly<Record<string, string>> = {
  ACRAccessToken: 'acrAccessTokenSpec', CloudsmithAccessToken: 'cloudsmithAccessTokenSpec',
  ECRAuthorizationToken: 'ecrAuthorizationTokenSpec', Fake: 'fakeSpec', GCRAccessToken: 'gcrAccessTokenSpec',
  GithubAccessToken: 'githubAccessTokenSpec', QuayAccessToken: 'quayAccessTokenSpec', Password: 'passwordSpec',
  SSHKey: 'sshKeySpec', STSSessionToken: 'stsSessionTokenSpec', UUID: 'uuidSpec',
  VaultDynamicSecret: 'vaultDynamicSecretSpec', Webhook: 'webhookSpec', Grafana: 'grafanaSpec',
};
export function clusterProblem(draft: ResourceEditorDraft): string | null {
  const kind = draft.get(['spec', 'kind']);
  if (kind === undefined) return null;
  if (typeof kind !== 'string' || !clusterBranches[kind]) return 'This generator kind is not supported by the pinned ClusterGenerator API.';
  const value = draft.get(['spec', 'generator']);
  if (value && typeof value === 'object' && Object.keys(value).some(key => key !== clusterBranches[kind])) return 'Multiple or mismatched generator branches require source editing.';
  return null;
}
