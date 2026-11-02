import type { ResourceEditorDraft, ResourceEditorPath } from '@omniviewdev/runtime';

export const admissionSensitivePaths: readonly ResourceEditorPath[] = [
  ['request', 'userInfo'], ['request', 'object'], ['request', 'oldObject'], ['request', 'options'],
  ['response', 'patch'], ['response', 'warnings'], ['response', 'auditAnnotations'],
  ['response', 'status', 'message'], ['response', 'status', 'details'], ['response', 'status', 'metadata'],
  ['metadata', 'annotations'],
];

const operations: Readonly<Record<string, true>> = { CREATE: true, UPDATE: true, DELETE: true, CONNECT: true };
const statusReasons: Readonly<Record<string, true>> = {
  Unknown: true, Unauthorized: true, Forbidden: true, NotFound: true, AlreadyExists: true, Conflict: true,
  Gone: true, Invalid: true, ServerTimeout: true, Timeout: true, TooManyRequests: true, BadRequest: true,
  MethodNotAllowed: true, NotAcceptable: true, RequestEntityTooLarge: true, UnsupportedMediaType: true,
  InternalError: true, Expired: true, ServiceUnavailable: true,
};
const supportedVersions: Readonly<Record<string, true>> = { 'admission.k8s.io/v1': true, 'admission.k8s.io/v1beta1': true };

/** Interpret only allowlisted leaves. Never traverse payloads or stringify free text. */
export function summarizeAdmissionReview(draft: ResourceEditorDraft) {
  const read = (path: ResourceEditorPath) => draft.get(path);
  const text = (path: ResourceEditorPath, fallback = 'Not supplied') => {
    if (!draft.has(path)) return fallback;
    const value = read(path);
    return typeof value === 'string' && value.length <= 253 && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
      ? value : value === '' ? '(empty)' : 'Unsupported value';
  };
  const request = draft.has(['request']) && read(['request']) !== null;
  const response = draft.has(['response']) && read(['response']) !== null;
  const version = read(['apiVersion']);
  const supported = typeof version === 'string' && Object.hasOwn(supportedVersions, version) && read(['kind']) === 'AdmissionReview';
  const requestUID = read(['request', 'uid']);
  const responseUID = read(['response', 'uid']);
  const correlated = request && response && typeof requestUID === 'string' && requestUID.length > 0 && requestUID === responseUID;
  const allowed = read(['response', 'allowed']);
  const operation = read(['request', 'operation']);
  const dryRun = read(['request', 'dryRun']);
  const reason = read(['response', 'status', 'reason']);
  const status = read(['response', 'status', 'status']);
  const code = read(['response', 'status', 'code']);
  const issues: string[] = [];
  if (!supported) issues.push('Unsupported envelope version or kind. Sensitive source remains withheld.');
  if (request && (typeof requestUID !== 'string' || requestUID.length === 0)) issues.push('Request UID is missing or invalid.');
  if (request && (typeof operation !== 'string' || !Object.hasOwn(operations, operation))) issues.push('Request operation is unsupported.');
  if (request && draft.has(['request', 'dryRun']) && typeof dryRun !== 'boolean') issues.push('Dry-run must be a boolean when supplied.');
  if (response && (typeof responseUID !== 'string' || responseUID.length === 0)) issues.push('Response UID is missing or invalid.');
  if (request && response && !correlated) issues.push('Request and response UIDs do not match. Do not treat these as one exchange.');
  if (response && typeof allowed !== 'boolean') issues.push('Response decision must be a boolean.');
  if (draft.has(['response', 'patch']) && read(['response', 'patchType']) !== 'JSONPatch') issues.push('Patch type is missing or unsupported. Patch remains withheld.');
  const qualified = (path: ResourceEditorPath, terminal: 'kind' | 'resource') =>
    [read([...path, 'group']) === '' ? '(core)' : text([...path, 'group'], '(core)'), text([...path, 'version']), text([...path, terminal])].join(' / ');
  const presence = (path: ResourceEditorPath) => draft.has(path) ? 'Withheld' : 'Not supplied';
  return {
    supported, request, response, correlated, issues,
    version: supported ? version : 'Unsupported envelope',
    operation: typeof operation === 'string' && Object.hasOwn(operations, operation) ? operation : 'Unsupported operation',
    requestUID: text(['request', 'uid']), responseUID: text(['response', 'uid']),
    targetKind: qualified(['request', 'kind'], 'kind'), targetResource: qualified(['request', 'resource'], 'resource'),
    subresource: text(['request', 'subResource'], 'None supplied'),
    originalKind: draft.has(['request', 'requestKind']) ? qualified(['request', 'requestKind'], 'kind') : 'Not supplied',
    originalResource: draft.has(['request', 'requestResource']) ? qualified(['request', 'requestResource'], 'resource') : 'Not supplied',
    originalSubresource: text(['request', 'requestSubResource'], 'None supplied'),
    name: text(['request', 'name'], 'Not supplied'), namespace: text(['request', 'namespace'], 'Not supplied'),
    dryRun: !draft.has(['request', 'dryRun']) ? 'Omitted (defaults to false)' : dryRun === true ? 'Yes' : dryRun === false ? 'No' : 'Unsupported value',
    decision: !response ? 'No response supplied' : allowed === true ? 'Allowed by this webhook' : allowed === false ? 'Denied by this webhook' : 'Unsupported decision',
    status: allowed === true ? 'Ignored for an allowed response' : status === 'Success' || status === 'Failure' ? status : draft.has(['response', 'status']) ? 'Supplied; free text withheld' : 'Not supplied',
    reason: typeof reason === 'string' && Object.hasOwn(statusReasons, reason) ? reason : draft.has(['response', 'status', 'reason']) ? 'Withheld / unrecognized' : 'Not supplied',
    code: (typeof code === 'bigint' && code >= 100n && code <= 599n) || (typeof code === 'number' && Number.isInteger(code) && code >= 100 && code <= 599) ? String(code) : draft.has(['response', 'status', 'code']) ? 'Unsupported value' : 'Not supplied',
    patchType: read(['response', 'patchType']) === 'JSONPatch' ? 'JSONPatch (RFC 6902)' : draft.has(['response', 'patchType']) ? 'Unsupported type' : 'Not supplied',
    payloads: [
      { label: 'Requester identity', path: 'request.userInfo', state: presence(['request', 'userInfo']) },
      { label: 'Incoming object', path: 'request.object', state: presence(['request', 'object']) },
      { label: 'Previous object', path: 'request.oldObject', state: presence(['request', 'oldObject']) },
      { label: 'Operation options', path: 'request.options', state: presence(['request', 'options']) },
      { label: 'Response patch bytes', path: 'response.patch', state: presence(['response', 'patch']) },
      { label: 'Warnings', path: 'response.warnings', state: presence(['response', 'warnings']) },
      { label: 'Audit annotations', path: 'response.auditAnnotations', state: presence(['response', 'auditAnnotations']) },
      { label: 'Status message', path: 'response.status.message', state: presence(['response', 'status', 'message']) },
      { label: 'Status details', path: 'response.status.details', state: presence(['response', 'status', 'details']) },
    ],
  };
}
