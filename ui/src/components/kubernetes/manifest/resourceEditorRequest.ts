import { parse } from 'yaml';
import type { ResourceEditorContext } from '@omniviewdev/runtime';

/** This code runs only inside the host. Provider callbacks never receive its input or source. */
export function canonicalEditorRequest(source: string, protocol: string, context: ResourceEditorContext): unknown {
  const body = parse(source, { intAsBigInt: true }) as Record<string, unknown>;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request object.');
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {};
  const apiVersion = context.group ? `${context.group}/${context.version}` : context.version;
  if (protocol === 'kubernetes.review.v1') {
    const reviews: Record<string, string> = { TokenReview: 'authentication.k8s.io', SelfSubjectReview: 'authentication.k8s.io', SubjectAccessReview: 'authorization.k8s.io', SelfSubjectAccessReview: 'authorization.k8s.io', LocalSubjectAccessReview: 'authorization.k8s.io', SelfSubjectRulesReview: 'authorization.k8s.io' };
    if (reviews[context.kind] !== context.group || body.kind !== context.kind || body.apiVersion !== apiVersion || context.intent !== 'action') throw new Error('Review target does not match.');
    if (context.kind === 'TokenReview' && (!body.spec || typeof body.spec !== 'object' || typeof Reflect.get(body.spec, 'token') !== 'string' || !String(Reflect.get(body.spec, 'token')).trim())) throw new Error('A token is required for this review.');
    if (context.kind === 'LocalSubjectAccessReview' && !context.namespace) throw new Error('Select a namespace for this review.');
    return { apiVersion, kind: context.kind, ...(context.kind === 'LocalSubjectAccessReview' ? { metadata: { namespace: context.namespace } } : {}), ...(body.spec === undefined ? {} : { spec: body.spec }) };
  }
  if (!context.name || context.scope === 'Namespaced' && !context.namespace) throw new Error('Select an exact saved target.');
  if (metadata.name !== undefined && metadata.name !== context.name) throw new Error('Request name does not match target.');
  if (metadata.namespace !== undefined && metadata.namespace !== context.namespace) throw new Error('Request namespace does not match target.');
  if (protocol === 'kubernetes.service-account-token.v1') {
    if (body.kind !== 'TokenRequest' || body.apiVersion !== 'authentication.k8s.io/v1' || context.resource !== 'serviceaccounts/token') throw new Error('Invalid token request.');
    return { apiVersion: 'authentication.k8s.io/v1', kind: 'TokenRequest', spec: body.spec };
  }
  if (protocol === 'kubernetes.csr-approval.v1') {
    if (context.group !== 'certificates.k8s.io' || context.kind !== 'CertificateSigningRequest' || body.kind !== context.kind || body.apiVersion !== apiVersion) throw new Error('Invalid approval target.');
    if (!context.resourceVersion) throw new Error('Load the current approval revision first.');
    const status = body.status && typeof body.status === 'object' ? body.status as Record<string, unknown> : {};
    return { apiVersion, kind: context.kind, metadata: { name: context.name, resourceVersion: context.resourceVersion }, status: { conditions: status.conditions } };
  }
  if (protocol === 'kubernetes.pod-eviction.v1') {
    if (!['pods', 'pods/eviction', 'evictions'].includes(context.resource) || body.kind !== 'Eviction' || body.apiVersion !== 'policy/v1') throw new Error('Invalid eviction target.');
    return { apiVersion: 'policy/v1', kind: 'Eviction', metadata: { name: context.name, namespace: context.namespace }, ...(body.deleteOptions === undefined ? {} : { deleteOptions: body.deleteOptions }) };
  }
  if (protocol === 'kubernetes.scale.v1') {
    if (body.kind !== 'Scale' || body.apiVersion !== 'autoscaling/v1') throw new Error('Invalid scale request.');
    return { apiVersion: 'autoscaling/v1', kind: 'Scale', metadata: { name: context.name, ...(context.namespace ? { namespace: context.namespace } : {}), ...(context.resourceVersion ? { resourceVersion: context.resourceVersion } : {}) }, ...(body.spec === undefined ? {} : { spec: body.spec }) };
  }
  throw new Error('Canonical request protocol is not admitted.');
}
