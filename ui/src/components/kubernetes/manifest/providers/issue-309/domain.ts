import type { ResourceEditorDraft, ResourceEditorContext, ResourceEditorFieldIssue } from '@omniviewdev/runtime';
export type Field = { label: string; path: string; options?: readonly string[]; help?: string; reference?: string; when?: (draft: ResourceEditorDraft) => boolean };
const field = (label: string, path: string, extra: Partial<Field> = {}): Field => ({ label, path, ...extra });
export const value = (draft: ResourceEditorDraft, path: string) => draft.get(path.split('.'));
const provider = (name: string) => (draft: ResourceEditorDraft) => value(draft, 'spec.provider') === name;
export const common: Field[] = [field('Poll interval', 'spec.interval', { help: 'Duration, for example 5m. Source changes can change downstream deployments.' }), field('Operation timeout', 'spec.timeout'), field('Suspension', 'spec.suspend', { options: ['', 'true', 'false'], help: 'Suspension stops future source reconciliation; it does not undo downstream deployments.' }), field('Credential Secret', 'spec.secretRef.name', { reference: 'secrets' })];
export const fields: Record<string, Field[]> = {
 GitRepository: [field('Repository URL', 'spec.url'), field('Authentication provider', 'spec.provider', { options: ['', 'generic', 'azure', 'github'] }), field('Azure service account', 'spec.serviceAccountName', { reference: 'serviceaccounts', when: provider('azure'), help: 'Requires supported ObjectLevelWorkloadIdentity controller configuration.' }), ...['branch', 'tag', 'semver', 'name', 'commit'].map(key => field(`Git ${key}`, `spec.ref.${key}`, { help: 'Commit > name > semver > tag > branch. Existing combinations are preserved.' })), field('Signature verification', 'spec.verify.mode', { options: ['', 'HEAD', 'head', 'Tag', 'TagAndHEAD'] }), field('Trusted public key Secret', 'spec.verify.secretRef.name', { reference: 'secrets' }), field('Clone submodules', 'spec.recurseSubmodules', { options: ['', 'true', 'false'] }), field('Proxy Secret', 'spec.proxySecretRef.name', { reference: 'secrets' }), field('Ignore patterns', 'spec.ignore')],
 OCIRepository: [field('OCI URL', 'spec.url'), field('Registry provider', 'spec.provider', { options: ['', 'generic', 'aws', 'azure', 'gcp'] }), ...['tag', 'semver', 'semverFilter', 'digest'].map(key => field(`Image ${key}`, `spec.ref.${key}`, { help: 'Digest > semver > tag. Filters apply to semver.' })), field('Signature provider', 'spec.verify.provider', { options: ['', 'cosign', 'notation'] }), field('Verification key Secret', 'spec.verify.secretRef.name', { reference: 'secrets' }), field('Layer media type', 'spec.layerSelector.mediaType'), field('Layer operation', 'spec.layerSelector.operation', { options: ['', 'extract', 'copy'] }), field('Service account', 'spec.serviceAccountName', { reference: 'serviceaccounts', help: 'Requires compatible controller workload identity configuration.' }), field('TLS Secret', 'spec.certSecretRef.name', { reference: 'secrets' }), field('Proxy Secret', 'spec.proxySecretRef.name', { reference: 'secrets' }), field('Allow insecure registry', 'spec.insecure', { options: ['', 'true', 'false'] }), field('Ignore patterns', 'spec.ignore')],
 Bucket: [field('Bucket', 'spec.bucketName'), field('Endpoint', 'spec.endpoint'), field('Provider', 'spec.provider', { options: ['', 'generic', 'aws', 'gcp', 'azure'] }), field('Region', 'spec.region'), field('Object prefix', 'spec.prefix'), field('Service account', 'spec.serviceAccountName', { reference: 'serviceaccounts', help: 'Cannot coexist with credential Secret. Requires compatible workload identity configuration.' }), field('Allow HTTP', 'spec.insecure', { options: ['', 'true', 'false'] }), field('TLS Secret', 'spec.certSecretRef.name', { reference: 'secrets', when: provider('generic') }), field('Proxy Secret', 'spec.proxySecretRef.name', { reference: 'secrets' }), field('STS provider', 'spec.sts.provider', { options: ['', 'aws', 'ldap'], when: draft => ['aws', 'generic', undefined].includes(value(draft, 'spec.provider') as string | undefined) }), field('STS endpoint', 'spec.sts.endpoint'), field('STS credential Secret', 'spec.sts.secretRef.name', { reference: 'secrets', when: draft => value(draft, 'spec.sts.provider') === 'ldap' }), field('STS TLS Secret', 'spec.sts.certSecretRef.name', { reference: 'secrets', when: draft => value(draft, 'spec.sts.provider') === 'ldap' }), field('Ignore patterns', 'spec.ignore')],
 HelmRepository: [field('Repository type', 'spec.type', { options: ['', 'default', 'oci'] }), field('Repository URL', 'spec.url'), field('OCI provider', 'spec.provider', { options: ['', 'generic', 'aws', 'azure', 'gcp'], when: draft => value(draft, 'spec.type') === 'oci' }), field('Allow insecure registry', 'spec.insecure', { options: ['', 'true', 'false'], when: draft => value(draft, 'spec.type') === 'oci' }), field('TLS Secret', 'spec.certSecretRef.name', { reference: 'secrets' }), field('Send credentials across hosts', 'spec.passCredentials', { options: ['', 'true', 'false'], when: draft => value(draft, 'spec.type') !== 'oci', help: 'Enabling this can expose credentials to a different host referenced by the repository index.' })],
 HelmChart: [field('Chart name or path', 'spec.chart'), field('Source kind', 'spec.sourceRef.kind', { options: ['HelmRepository', 'GitRepository', 'Bucket'] }), field('Source name', 'spec.sourceRef.name'), field('Source API version', 'spec.sourceRef.apiVersion'), field('Chart version', 'spec.version', { when: draft => value(draft, 'spec.sourceRef.kind') === 'HelmRepository', help: 'Ignored for Git and Bucket sources.' }), field('Rebuild strategy', 'spec.reconcileStrategy', { options: ['', 'ChartVersion', 'Revision'] }), field('Ignore missing values files', 'spec.ignoreMissingValuesFiles', { options: ['', 'true', 'false'] }), field('OCI signature provider', 'spec.verify.provider', { options: ['', 'cosign', 'notation'], help: 'Only applies to OCI HelmRepository. Does not verify unbundled dependencies.' }), field('Verification key Secret', 'spec.verify.secretRef.name', { reference: 'secrets' })],
 ExternalArtifact: []
};
export const lists: Record<string, { label: string; path: string; columns: readonly { label: string; path: string }[] }[]> = {
 GitRepository: [{ label: 'Sparse checkout directories', path: 'spec.sparseCheckout', columns: [{ label: 'Directory', path: '' }] }, { label: 'Included repositories', path: 'spec.include', columns: [{ label: 'Repository', path: 'repository.name' }, { label: 'From path', path: 'fromPath' }, { label: 'To path', path: 'toPath' }] }],
 OCIRepository: [{ label: 'OIDC signature identities', path: 'spec.verify.matchOIDCIdentity', columns: [{ label: 'Issuer pattern', path: 'issuer' }, { label: 'Subject pattern', path: 'subject' }] }],
 HelmChart: [{ label: 'Ordered values files', path: 'spec.valuesFiles', columns: [{ label: 'Values file', path: '' }] }, { label: 'OIDC signature identities', path: 'spec.verify.matchOIDCIdentity', columns: [{ label: 'Issuer pattern', path: 'issuer' }, { label: 'Subject pattern', path: 'subject' }] }]
};
export function isReadOnly(draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
 return context.kind === 'ExternalArtifact' || (context.kind === 'HelmChart' && (context.ownership?.status !== 'application' || (Array.isArray(draft.get(['metadata', 'ownerReferences'])) && (draft.get(['metadata', 'ownerReferences']) as unknown[]).length > 0)));
}
export function validate(draft: ResourceEditorDraft, context: ResourceEditorContext): readonly ResourceEditorFieldIssue[] {
 if (isReadOnly(draft, context)) return [];
 const issues: ResourceEditorFieldIssue[] = [];
 const get = (path: string) => value(draft, `spec.${path}`);
 const error = (path: string, message: string) => issues.push({ path: path.split('.'), message });
 for (const key of context.kind === 'Bucket' ? ['bucketName', 'endpoint', 'interval'] : context.kind === 'HelmChart' ? ['chart', 'sourceRef.kind', 'sourceRef.name', 'interval'] : context.kind === 'HelmRepository' ? ['url'] : ['url', 'interval']) if (!get(key)) error(`spec.${key}`, 'Required.');
 for (const key of ['interval', 'timeout']) {
  const duration = get(key);
  if (duration && (typeof duration !== 'string' || !(key === 'timeout' ? /^([0-9]+(\.[0-9]+)?(ms|s|m))+$/ : /^([0-9]+(\.[0-9]+)?(ms|s|m|h))+$/).test(duration))) error(`spec.${key}`, 'Enter a duration such as 5m.');
 }
 const urlValue = get('url');
 if (urlValue) {
  const url = typeof urlValue === 'string' ? urlValue : '';
  const pattern = context.kind === 'GitRepository' ? /^(https?|ssh):\/\/.+/ : context.kind === 'OCIRepository' || get('type') === 'oci' ? /^oci:\/\/.+/ : /^https?:\/\/.+/;
  if (!pattern.test(url)) error('spec.url', 'Use a URL with the supported source scheme.');
  if (/^[a-z]+:\/\/[^/]*@/i.test(url)) error('spec.url', 'Use a credential Secret instead of URL user information.');
 }
 if (context.kind === 'GitRepository' && draft.has(['spec', 'verify']) && !get('verify.secretRef.name')) error('spec.verify.secretRef.name', 'Choose the trusted public key Secret.');
 if (get('verify.provider') === 'notation' && !get('verify.secretRef.name')) error('spec.verify.secretRef.name', 'Notation requires a verification Secret.');
 const identities = get('verify.matchOIDCIdentity');
 if (Array.isArray(identities)) {
  const rows: readonly unknown[] = identities;
  rows.forEach((identity, index) => {
   if (!identity || typeof identity !== 'object' || !('issuer' in identity) || typeof identity.issuer !== 'string' || !identity.issuer || !('subject' in identity) || typeof identity.subject !== 'string' || !identity.subject) issues.push({ path: ['spec', 'verify', 'matchOIDCIdentity', index], message: 'Issuer and subject are required.' });
  });
 }
 if (context.kind === 'GitRepository' && get('serviceAccountName') && get('provider') !== 'azure') error('spec.serviceAccountName', 'Git service account requires Azure provider.');
 if (context.kind === 'Bucket') {
  if (get('serviceAccountName') && (!get('provider') || get('provider') === 'generic')) error('spec.serviceAccountName', 'Generic Bucket provider does not support service accounts.');
  if (draft.has(['spec', 'sts']) && (!get('sts.provider') || !get('sts.endpoint'))) error('spec.sts.endpoint', 'STS provider and endpoint are required.');
  if (get('secretRef.name') && get('serviceAccountName')) error('spec.serviceAccountName', 'Choose credential Secret or service account, not both.');
  if (get('sts.provider') && !((get('provider') === 'aws' && get('sts.provider') === 'aws') || ((!get('provider') || get('provider') === 'generic') && get('sts.provider') === 'ldap'))) error('spec.sts.provider', 'STS provider does not match bucket provider.');
  if (get('sts.provider') === 'aws' && (get('sts.secretRef.name') || get('sts.certSecretRef.name'))) error('spec.sts.provider', 'AWS STS does not accept LDAP credential or TLS Secrets.');
  if (get('certSecretRef.name') && get('provider') && get('provider') !== 'generic') error('spec.certSecretRef.name', 'Bucket TLS Secret requires generic provider.');
 }
 return issues;
}
