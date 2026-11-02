import type { ResourceEditorContext, ResourceEditorDraft, ResourceEditorFieldIssue } from '@omniviewdev/runtime';

export const providerTypes = ['slack','discord','msteams','rocket','generic','generic-hmac','github','gitlab','gitea','bitbucketserver','bitbucket','azuredevops','googlechat','googlepubsub','webex','sentry','azureeventhub','telegram','lark','matrix','opsgenie','alertmanager','grafana','githubdispatch','pagerduty','datadog','nats','zulip','otel'];
export const receiverTypes = ['generic','generic-hmac','github','gitlab','bitbucket','harbor','dockerhub','quay','gcr','nexus','acr','cdevents'];
export const targetKinds = ['Bucket','GitRepository','Kustomization','HelmRelease','HelmChart','HelmRepository','ImageRepository','ImagePolicy','ImageUpdateAutomation','OCIRepository'];
export const identityTypes = ['azureeventhub','azuredevops','googlepubsub'];
export const commitTypes = ['github','gitlab','gitea','bitbucketserver','bitbucket','azuredevops'];
export const durationPattern = /^([0-9]+(\.[0-9]+)?(ms|s|m|h))+$/;
export function validateNotification(draft: ResourceEditorDraft, context: ResourceEditorContext): ResourceEditorFieldIssue[] {
  const issues: ResourceEditorFieldIssue[] = [];
  const get = (...path: string[]) => draft.get(['spec', ...path]);
  const add = (path: (string|number)[], message: string) => issues.push({ path: ['spec', ...path], message });
  if (context.kind === 'Alert') {
    if (!get('providerRef','name')) add(['providerRef','name'], 'Choose a notification Provider.');
    const severity = get('eventSeverity');
    if (severity && severity !== 'info' && severity !== 'error') add(['eventSeverity'], 'Choose info or error.');
    const summary = get('summary');
    if (typeof summary === 'string' && summary.length > 255) add(['summary'], 'Summary must not exceed 255 characters.');
  } else {
    const type = get('type');
    if (typeof type !== 'string' || !(context.kind === 'Provider' ? providerTypes : receiverTypes).includes(type)) add(['type'], 'Choose a supported type.');
    if (context.kind === 'Receiver' && !get('secretRef','name')) add(['secretRef','name'], 'Choose a validation Secret.');
  }
  if (context.kind === 'Provider') {
    const rawType = get('type');
    const type = typeof rawType === 'string' ? rawType : '';
    if (get('serviceAccountName')) {
      if (!identityTypes.includes(type)) add(['serviceAccountName'], 'This provider does not support workload identity.');
      if (get('secretRef','name')) add(['serviceAccountName'], 'Use workload identity or static credentials, not both.');
      if (context.discovery.features.ObjectLevelWorkloadIdentity !== 'available') add(['serviceAccountName'], 'ObjectLevelWorkloadIdentity availability must be confirmed.');
    }
    if (get('commitStatusExpr') && !commitTypes.includes(type)) add(['commitStatusExpr'], 'Commit status expressions require a Git provider.');
    for (const field of ['address','channel','username']) {
      const value = get(field);
      if (typeof value === 'string' && value.length > 2048) add([field], 'Must not exceed 2048 characters.');
    }
  }
  const duration = context.kind === 'Provider' ? 'timeout' : 'interval';
  const durationValue = get(duration);
  if (context.kind !== 'Alert' && durationValue && (typeof durationValue !== 'string' || !(context.kind === 'Provider' ? /^([0-9]+(\.[0-9]+)?(ms|s|m))+$/ : durationPattern).test(durationValue))) add([duration], 'Enter a duration with supported units.');
  if (context.kind !== 'Provider') {
    const field = context.kind === 'Alert' ? 'eventSources' : 'resources';
    const rows = get(field);
    if (!Array.isArray(rows) || !rows.length) add([field], 'Add at least one target.');
    if (Array.isArray(rows)) rows.forEach((_, i) => {
      const read = (key: string) => draft.get(['spec',field,i,key]);
      if (!targetKinds.includes(String(read('kind')))) add([field,i,'kind'], 'Choose a Flux resource kind.');
      if (typeof read('name') !== 'string' || !String(read('name')).length || String(read('name')).length > 253) add([field,i,'name'], 'Enter a target name or *.');
      if (draft.has(['spec',field,i,'matchLabels']) && read('name') !== '*') add([field,i,'name'], 'Label selection requires wildcard name *.');
    });
  }
  return issues;
}
export function notificationReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext) {
  if (context.intent === 'create') return false;
  return context.intent === 'inspect' || context.ownership?.status !== 'application'
    || draft.has(['metadata','labels','kustomize.toolkit.fluxcd.io/name'])
    || draft.has(['metadata','labels','helm.toolkit.fluxcd.io/name']);
}
export function notificationUnavailable(draft: ResourceEditorDraft, context: ResourceEditorContext): string | null {
  const arrays = context.kind === 'Alert' ? ['eventSources','inclusionList','exclusionList'] : context.kind === 'Receiver' ? ['resources','events'] : [];
  for (const field of arrays) {
    const value = draft.get(['spec',field]);
    if (draft.has(['spec',field]) && !Array.isArray(value)) return 'This field shape requires source editing.';
    if (Array.isArray(value)) {
      const targets = field === 'eventSources' || field === 'resources';
      if (value.some(row => targets ? !row || typeof row !== 'object' || Array.isArray(row) : typeof row !== 'string')) return 'This field shape requires source editing.';
      if (targets) for (let index = 0; index < value.length; index++) {
        for (const key of ['kind','name','namespace','apiVersion']) {
          const path = ['spec',field,index,key];
          if (draft.has(path) && typeof draft.get(path) !== 'string') return 'This target scalar type requires source editing.';
        }
      }
    }
  }
  for (const field of ['type','channel','timeout','interval','serviceAccountName','commitStatusExpr','summary','resourceFilter','eventSeverity']) {
    if (draft.has(['spec',field]) && typeof draft.get(['spec',field]) !== 'string') return 'This scalar type requires source editing.';
  }
  if (draft.has(['spec','suspend']) && typeof draft.get(['spec','suspend']) !== 'boolean') return 'This scalar type requires source editing.';
  return null;
}
