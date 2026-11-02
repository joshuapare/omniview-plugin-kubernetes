import { isAlias, isMap, isNode, isScalar, isSeq, parseAllDocuments, type Document } from 'yaml';
import { serviceFields, ingressFields, networkFormError, validateNetworkManifest } from './networkDraft';
import { configMapFields, secretFields, dataFormError, validateDataManifest } from './dataDraft';
import { pvcFields, pvcFormError, validatePVCManifest } from './pvcDraft';

export type WorkloadKind = 'Pod' | 'Deployment' | 'StatefulSet';
export type ManifestKind = WorkloadKind | 'Service' | 'Ingress' | 'ConfigMap' | 'Secret' | 'PersistentVolumeClaim';
export type ManifestPath = readonly (string | number)[];
export interface ManifestChange { path: ManifestPath; value?: unknown; remove?: boolean }
export interface ManifestDraft {
  document: Document.Parsed | null;
  kind: ManifestKind | null;
  error: string | null;
  formError: string | null;
}

const resourceKinds: Readonly<Record<string, ManifestKind>> = {
  'k8s:/pods': 'Pod',
  'k8s:apps/deployments': 'Deployment',
  'k8s:apps/statefulsets': 'StatefulSet',
  'k8s:/services': 'Service',
  'k8s:networking.k8s.io/ingresses': 'Ingress',
  'k8s:/configmaps': 'ConfigMap',
  'k8s:/secrets': 'Secret',
  'k8s:/persistentvolumeclaims': 'PersistentVolumeClaim',
};

export function supportedManifestKind(resourceKey: string): ManifestKind | null {
  return Object.hasOwn(resourceKinds, resourceKey) ? resourceKinds[resourceKey] : null;
}
const apiVersions: Record<ManifestKind, string> = {
  Pod: 'v1', Deployment: 'apps/v1', StatefulSet: 'apps/v1', Service: 'v1',
  Ingress: 'networking.k8s.io/v1', ConfigMap: 'v1', Secret: 'v1', PersistentVolumeClaim: 'v1',
};
const displayPath = (path: ManifestPath) => path.map(String).join('.') || 'manifest';
const safetyError = (path: ManifestPath) => new Error(`${displayPath(path)} cannot be safely edited in Form. Use YAML instead.`);

// Decode once before allowing Form rendering, including unowned alias subtrees.
const resolvedDocuments = new WeakMap<Document.Parsed, unknown>();
const aliasError = 'The manifest contains aliases that cannot be safely resolved. Use YAML instead.';

function parse(source: string): { document: Document.Parsed | null; error: string | null } {
  try {
    const documents = parseAllDocuments(source, { intAsBigInt: true, uniqueKeys: true });
    if (documents.length !== 1) return { document: null, error: 'Enter exactly one YAML resource document.' };
    const document = documents[0];
    if (document.errors.length) return { document: null, error: document.errors[0].message };
    if (!isMap(document.contents)) return { document: null, error: 'The manifest must be a YAML object.' };
    if (document.contents.items.some(({ key }) => !isScalar(key) || typeof key.value !== 'string')) {
      return { document: null, error: 'Manifest keys must be strings.' };
    }
    return { document, error: null };
  } catch (error) {
    return { document: null, error: error instanceof Error ? error.message : 'Invalid YAML.' };
  }
}

export type ManifestShape = 'string' | 'number' | 'integerOrString' | 'quantity' | 'boolean'
  | { fields: Record<string, ManifestShape> } | { item: ManifestShape } | { values: ManifestShape };
type Shape = ManifestShape;
const map = (fields: Record<string, Shape>): Shape => ({ fields });
const list = (item: Shape): Shape => ({ item });
const values = (value: Shape): Shape => ({ values: value });
const metadata = map({ name: 'string', generateName: 'string', namespace: 'string', labels: values('string'), annotations: values('string') });
const resources = map({ requests: values('quantity'), limits: values('quantity') });
const container = map({
  name: 'string', image: 'string', imagePullPolicy: 'string', command: list('string'), args: list('string'),
  workingDir: 'string', resources,
  env: list(map({ name: 'string', value: 'string', valueFrom: map({
    fieldRef: map({ apiVersion: 'string', fieldPath: 'string' }),
    resourceFieldRef: map({ containerName: 'string', resource: 'string', divisor: 'quantity' }),
    configMapKeyRef: map({ name: 'string', key: 'string' }), secretKeyRef: map({ name: 'string', key: 'string' }),
  }) })),
  ports: list(map({ name: 'string', containerPort: 'number', hostPort: 'number', hostIP: 'string', protocol: 'string' })),
  volumeMounts: list(map({ name: 'string', mountPath: 'string', subPath: 'string', subPathExpr: 'string' })),
});
const podSpec = map({
  containers: list(container), initContainers: list(container), ephemeralContainers: list(container),
  serviceAccountName: 'string', restartPolicy: 'string', nodeName: 'string', nodeSelector: values('string'),
  imagePullSecrets: list(map({ name: 'string' })),
  tolerations: list(map({ key: 'string', operator: 'string', value: 'string', effect: 'string', tolerationSeconds: 'number' })),
  volumes: list(map({
    name: 'string', emptyDir: map({ medium: 'string', sizeLimit: 'quantity' }),
    configMap: map({ name: 'string' }), secret: map({ secretName: 'string' }),
    persistentVolumeClaim: map({ claimName: 'string' }), hostPath: map({ path: 'string', type: 'string' }),
  })),
});
const selector = map({
  matchLabels: values('string'),
  matchExpressions: list(map({ key: 'string', operator: 'string', values: list('string') })),
});

function ownedShape(kind: ManifestKind): Shape {
  const fields = kind === 'Service' ? serviceFields : kind === 'Ingress' ? ingressFields
    : kind === 'ConfigMap' ? configMapFields : kind === 'Secret' ? secretFields
      : kind === 'PersistentVolumeClaim' ? pvcFields : null;
  if (fields) return map({ apiVersion: 'string', kind: 'string', metadata, ...fields });
  if (kind === 'Pod') return map({ apiVersion: 'string', kind: 'string', metadata, spec: podSpec });
  return map({ apiVersion: 'string', kind: 'string', metadata, spec: map({
    replicas: 'number', selector, serviceName: 'string',
    template: map({ metadata, spec: podSpec }),
    strategy: map({ type: 'string', rollingUpdate: map({ maxSurge: 'quantity', maxUnavailable: 'quantity' }) }),
    volumeClaimTemplates: list(map({ metadata, spec: map({
      storageClassName: 'string', accessModes: list('string'), resources,
    }) })),
  }) });
}

function checkShape(node: unknown, shape: Shape, path: ManifestPath): void {
  if (node === undefined) return;
  if (isAlias(node) || (isNode(node) && 'anchor' in node && node.anchor)) throw safetyError(path);
  if (typeof shape === 'string') {
    if (!isScalar(node)) throw safetyError(path);
    const value = node.value;
    const valid = shape === 'string' ? typeof value === 'string'
      : shape === 'boolean' ? typeof value === 'boolean'
        : shape === 'number' ? typeof value === 'bigint' || (typeof value === 'number' && Number.isInteger(value))
          : shape === 'integerOrString' ? typeof value === 'string' || typeof value === 'bigint' || (typeof value === 'number' && Number.isInteger(value))
            : typeof value === 'string' || typeof value === 'bigint' || (typeof value === 'number' && Number.isFinite(value));
    if (!valid) throw safetyError(path);
    return;
  }
  if ('item' in shape) {
    if (!isSeq(node)) throw safetyError(path);
    node.items.forEach((item, index) => checkShape(item, shape.item, [...path, index]));
    return;
  }
  if (!isMap(node)) throw safetyError(path);
  if (node.items.some(({ key }) => !isScalar(key) || typeof key.value !== 'string' || key.value === '<<')) throw safetyError(path);
  if ('values' in shape) {
    node.items.forEach(({ key, value }) => {
      if (isScalar(key)) checkShape(value, shape.values, [...path, String(key.value)]);
    });
  } else {
    Object.entries(shape.fields).forEach(([key, child]) => {
      if (node.has(key)) checkShape(node.get(key, true), child, [...path, key]);
    });
  }
}

function checkResolvedShape(value: unknown, shape: Shape, path: ManifestPath): string | null {
  // Kubernetes treats optional JSON null fields as unset; required fields are checked separately.
  if (value === undefined || value === null) return null;
  if (typeof shape === 'string') {
    const valid = shape === 'string' ? typeof value === 'string'
      : shape === 'boolean' ? typeof value === 'boolean'
        : shape === 'number' ? typeof value === 'bigint' || (typeof value === 'number' && Number.isInteger(value))
          : shape === 'integerOrString' ? typeof value === 'string' || typeof value === 'bigint' || (typeof value === 'number' && Number.isInteger(value))
            : typeof value === 'string' || typeof value === 'bigint' || (typeof value === 'number' && Number.isFinite(value));
    return valid ? null : `${displayPath(path)} must be ${shape === 'number' ? 'an integer' : shape === 'boolean' ? 'a boolean' : shape === 'integerOrString' ? 'an integer or string' : shape === 'quantity' ? 'a Kubernetes quantity' : 'a string'}.`;
  }
  if ('item' in shape) {
    if (!Array.isArray(value)) return `${displayPath(path)} must be a list.`;
    for (const [index, item] of value.entries()) {
      const error = checkResolvedShape(item, shape.item, [...path, index]);
      if (error) return error;
    }
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) return `${displayPath(path)} must be an object.`;
  const entries = 'values' in shape ? Object.entries(value).map(([key, child]) => [key, child, shape.values] as const)
    : Object.entries(shape.fields).map(([key, child]) => [key, Reflect.get(value, key), child] as const);
  for (const [key, child, childShape] of entries) {
    const error = checkResolvedShape(child, childShape, [...path, key]);
    if (error) return error;
  }
  return null;
}

export function inspectManifest(source: string, resourceKey?: string): ManifestDraft {
  const { document, error } = parse(source);
  if (!document) {
    const safeError = resourceKey === 'k8s:/secrets' ? 'Secret YAML is invalid. Credential values are hidden.' : error;
    return { document, error: safeError, kind: null, formError: safeError };
  }
  const value = document.get('kind');
  const kind = typeof value === 'string' && Object.hasOwn(apiVersions, value)
    && (!resourceKey || supportedManifestKind(resourceKey) === value) ? value as ManifestKind : null;
  let formError: string | null = null;
  try {
    resolvedDocuments.set(document, document.toJS({ maxAliasCount: 100 }));
  } catch {
    return { document, error, kind, formError: aliasError };
  }
  if (kind) {
    try {
      checkShape(document.contents, ownedShape(kind), []);
      if (document.get('apiVersion') !== apiVersions[kind]) formError = `Form supports ${apiVersions[kind]} ${kind} manifests. Use YAML instead.`;
    } catch (error) {
      formError = error instanceof Error ? error.message : 'Use YAML to edit this manifest safely.';
    }
  }
  const result: ManifestDraft = { document, error, kind, formError };
  if (!formError) {
    if (kind === 'Service' || kind === 'Ingress') result.formError = networkFormError(result);
    else if (kind === 'ConfigMap' || kind === 'Secret') result.formError = dataFormError(result);
    else if (kind === 'PersistentVolumeClaim') result.formError = pvcFormError(result);
  }
  return result;
}

function childAt(node: unknown, key: string | number, path: ManifestPath): unknown {
  if (isAlias(node) || (isNode(node) && 'anchor' in node && node.anchor)) throw safetyError(path);
  if (isMap(node) && typeof key === 'string') return node.get(key, true);
  if (isSeq(node) && typeof key === 'number' && Number.isSafeInteger(key) && key >= 0) return node.items[key];
  throw safetyError(path);
}

export function readManifestValue(draft: ManifestDraft, path: ManifestPath): unknown {
  if (!draft.document || draft.error || !resolvedDocuments.has(draft.document)) return undefined;
  let value = resolvedDocuments.get(draft.document);
  for (const key of path) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined;
    value = Reflect.get(value, key);
  }
  return value;
}

function assertValue(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint') return;
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return;
  if (typeof value !== 'object' || seen.has(value)) throw new Error('Manifest changes require lossless YAML values.');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error('Manifest changes require plain objects.');
  }
  seen.add(value);
  Object.values(value).forEach((entry) => assertValue(entry, seen));
  seen.delete(value);
}

/** Update only addressed AST nodes; never reconstruct a parent from form values. */
export function patchManifest(source: string, changes: readonly ManifestChange[]): string {
  const { document, error } = parse(source);
  if (!document) throw new Error(error ?? 'Invalid YAML.');
  if (!changes.length) return source;
  for (const change of changes) {
    const { path } = change;
    if (!path.length) throw new Error('The manifest root cannot be replaced.');
    if (!change.remove) assertValue(change.value);
    let parent: unknown = document.contents;
    let missing = false;
    for (let index = 0; index < path.length - 1; index++) {
      const key = path[index];
      let child = childAt(parent, key, path.slice(0, index));
      if (child === undefined) {
        if (change.remove) { missing = true; break; }
        child = document.createNode(typeof path[index + 1] === 'number' ? [] : {});
        setChild(parent, key, child, path.slice(0, index + 1));
      }
      parent = child;
    }
    if (missing) continue;
    const key = path[path.length - 1];
    const current = childAt(parent, key, path.slice(0, -1));
    if (isAlias(current) || (isNode(current) && 'anchor' in current && current.anchor)) throw safetyError(path);
    if (change.remove) {
      if (isMap(parent)) parent.delete(key);
      else if (isSeq(parent)) parent.delete(key);
      continue;
    }
    if (isMap(current) || isSeq(current)) throw new Error(`${displayPath(path)} must be edited one field at a time.`);
    if (isScalar(current)) {
      if (change.value !== null && typeof change.value === 'object') throw safetyError(path);
      // Parsed YAML integers use bigint; numeric form inputs may use number.
      const currentType = typeof current.value === 'bigint' ? 'number' : typeof current.value;
      const nextType = typeof change.value === 'bigint' ? 'number' : typeof change.value;
      if (currentType !== nextType) {
        delete current.tag;
        delete current.format;
      }
      current.value = change.value;
    } else {
      setChild(parent, key, document.createNode(change.value), path);
    }
  }
  return document.toString({ lineWidth: 0 });
}

function setChild(parent: unknown, key: string | number, value: unknown, path: ManifestPath): void {
  if (isMap(parent) && typeof key === 'string') { parent.set(key, value); return; }
  if (isSeq(parent) && typeof key === 'number' && Number.isSafeInteger(key) && key >= 0 && key <= parent.items.length) {
    parent.set(key, value); return;
  }
  throw safetyError(path);
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const isDnsLabel = (value: unknown): value is string => typeof value === 'string' && value.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(value);
export const isDnsName = (value: unknown): value is string => typeof value === 'string' && value.length <= 253 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*$/.test(value);
const integer = (value: unknown): bigint | null => typeof value === 'bigint' ? value
  : typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : null;

export interface Quantity { coefficient: bigint; exponent: bigint }
/** Exact decimal representation also covers binary SI quantities without Number rounding. */
export function quantity(value: unknown): Quantity | null {
  if (!['string', 'number', 'bigint'].includes(typeof value)) return null;
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)([eE][+-]?\d+|[numkMGTPE]|[KMGTPE]i)?$/.exec(String(value));
  if (!match) return null;
  const [, sign, decimal, suffix = ''] = match;
  const [whole, fraction = ''] = decimal.split('.');
  let coefficient = BigInt((whole || '0') + fraction) * (sign === '-' ? -1n : 1n);
  let exponent = -BigInt(fraction.length);
  const powers: Record<string, number> = { n: -9, u: -6, m: -3, k: 3, M: 6, G: 9, T: 12, P: 15, E: 18 };
  if (/^[eE][+-]?\d+$/.test(suffix)) exponent += BigInt(suffix.slice(1));
  else if (suffix.endsWith('i')) coefficient *= 2n ** BigInt(('KMGTPE'.indexOf(suffix[0]) + 1) * 10);
  else exponent += BigInt(powers[suffix] ?? 0);
  return { coefficient, exponent };
}

export function isKubernetesQuantity(value: unknown): boolean {
  const parsed = quantity(value);
  return parsed !== null && parsed.coefficient >= 0n;
}

export function compareQuantity(left: Quantity, right: Quantity): number {
  if (left.coefficient === 0n || right.coefficient === 0n) return left.coefficient === right.coefficient ? 0 : left.coefficient === 0n ? -1 : 1;
  const a = left.coefficient.toString();
  const b = right.coefficient.toString();
  const orderA = BigInt(a.length) + left.exponent;
  const orderB = BigInt(b.length) + right.exponent;
  if (orderA !== orderB) return orderA < orderB ? -1 : 1;
  const width = Math.max(a.length, b.length);
  const normalizedA = a.padEnd(width, '0');
  const normalizedB = b.padEnd(width, '0');
  return normalizedA === normalizedB ? 0 : normalizedA < normalizedB ? -1 : 1;
}

function validateResources(value: unknown, path: string): string | null {
  const resource = object(value);
  for (const field of ['requests', 'limits']) {
    for (const [name, amount] of Object.entries(object(resource[field]))) {
      const parsed = quantity(amount);
      if (!parsed || parsed.coefficient < 0n) return `${path}.${field}.${name} must be a non-negative Kubernetes quantity.`;
    }
  }
  const limits = object(resource.limits);
  for (const [name, amount] of Object.entries(object(resource.requests))) {
    if (limits[name] === undefined) continue;
    const request = quantity(amount);
    const limit = quantity(limits[name]);
    if (request && limit && compareQuantity(request, limit) > 0) return `${path}.requests.${name} must not exceed its limit.`;
  }
  return null;
}

function validateSelector(spec: ObjectValue): string | null {
  const selector = object(spec.selector);
  const labels = object(object(object(spec.template).metadata).labels);
  const matchLabels = object(selector.matchLabels);
  const expressions = array(selector.matchExpressions);
  if (!Object.keys(matchLabels).length && !expressions.length) return 'spec.selector must select the Pod template labels.';
  for (const [key, value] of Object.entries(matchLabels)) {
    if (labels[key] !== value) return `spec.selector.matchLabels.${key} must match the Pod template label.`;
  }
  for (const entry of expressions) {
    const expression = object(entry);
    const key = typeof expression.key === 'string' ? expression.key : '';
    const selected = labels[key];
    const choices = array(expression.values);
    const present = Object.hasOwn(labels, key);
    if (!key) return 'Selector expressions require a label key.';
    switch (expression.operator) {
      case 'In':
        if (!choices.length || !present || !choices.includes(selected)) return `Selector In expression for ${key} must match the Pod template labels.`;
        break;
      case 'NotIn':
        if (!choices.length || (present && choices.includes(selected))) return `Selector NotIn expression for ${key} must match the Pod template labels.`;
        break;
      case 'Exists':
        if (choices.length || !present) return `Selector Exists expression for ${key} must match the Pod template labels.`;
        break;
      case 'DoesNotExist':
        if (choices.length || present) return `Selector DoesNotExist expression for ${key} must match the Pod template labels.`;
        break;
      default: return `Selector expression for ${key} has an invalid operator.`;
    }
  }
  return null;
}

/** Local checks only; API admission and immutable resource identity remain the caller's responsibility. */
export function validateManifest(source: string, resourceKey?: string, editing = false, baselineSource?: string): string | null {
  const draft = inspectManifest(source, resourceKey);
  if (draft.error || !draft.document) return draft.error ?? 'Invalid YAML.';
  if (!resolvedDocuments.has(draft.document)) return aliasError;
  const root = object(resolvedDocuments.get(draft.document));
  if (typeof root.apiVersion !== 'string' || !root.apiVersion.trim()) return 'apiVersion is required.';
  if (typeof root.kind !== 'string' || !root.kind.trim()) return 'kind is required.';
  const expected = resourceKey ? supportedManifestKind(resourceKey) : null;
  if (expected && root.kind !== expected) return `kind must be ${expected} for this resource type.`;
  const meta = object(root.metadata);
  if (typeof meta.name !== 'string' || !meta.name.trim()) return 'metadata.name is required.';
  if (meta.namespace !== undefined && meta.namespace !== '' && !isDnsLabel(meta.namespace)) return 'metadata.namespace must be a valid DNS label (up to 63 characters).';
  const baseline = editing && baselineSource ? inspectManifest(baselineSource, resourceKey) : undefined;
  if (baseline?.document && (readManifestValue(baseline, ['apiVersion']) !== root.apiVersion
    || readManifestValue(baseline, ['kind']) !== root.kind
    || ['name', 'namespace', 'uid', 'resourceVersion'].some((key) => readManifestValue(baseline, ['metadata', key]) !== meta[key]))) {
    return 'Resource identity and revision cannot change during edit.';
  }
  if (!draft.kind) return null;
  if (typeof meta.namespace !== 'string' || !meta.namespace) return 'metadata.namespace is required.';
  if (!isDnsName(meta.name)) return 'metadata.name must be a valid DNS subdomain (up to 253 characters).';
  // Form schemas cover stable versions only; other native versions stay YAML-only.
  // Their admission belongs to the selected resource API, not the stable form schema.
  if (root.apiVersion !== apiVersions[draft.kind]) return null;
  // A structure unsafe for form traversal may still be valid YAML (for example aliases).
  // Validate resolved values rather than requiring a form-compatible representation.
  const shapeError = checkResolvedShape(root, ownedShape(draft.kind), []);
  if (shapeError) return shapeError;
  if (draft.kind === 'Service' || draft.kind === 'Ingress') return validateNetworkManifest(draft, editing, baseline);
  if (draft.kind === 'ConfigMap' || draft.kind === 'Secret') return validateDataManifest(draft, editing, baseline);
  if (draft.kind === 'PersistentVolumeClaim') return validatePVCManifest(draft, editing, baseline);
  const spec = object(root.spec);
  const podSpec = draft.kind === 'Pod' ? spec : object(object(spec.template).spec);
  if (draft.kind !== 'Pod') {
    if (spec.replicas !== undefined && spec.replicas !== null) {
      const count = integer(spec.replicas);
      if (count === null || count < 0n || count > 2147483647n) return 'spec.replicas must be an integer from 0 to 2147483647.';
    }
    const selectorError = validateSelector(spec);
    if (selectorError) return selectorError;
    if (draft.kind === 'StatefulSet' && spec.serviceName !== undefined && spec.serviceName !== null
      && spec.serviceName !== '' && !isDnsName(spec.serviceName)) return 'spec.serviceName must be a valid DNS subdomain.';
  }
  if (!Array.isArray(podSpec.containers) || !podSpec.containers.length) return 'Add at least one container.';
  const names = new Set<string>();
  for (const field of ['containers', 'initContainers', 'ephemeralContainers']) {
    for (const [index, entry] of array(podSpec[field]).entries()) {
      const container = object(entry);
      const path = `${draft.kind === 'Pod' ? 'spec' : 'spec.template.spec'}.${field}.${index}`;
      if (!isDnsLabel(container.name)) return `${path}.name must be a valid DNS label.`;
      if (names.has(container.name)) return `Container name ${container.name} must be unique.`;
      names.add(container.name);
      if (typeof container.image !== 'string' || !container.image) return `${path}.image is required.`;
      if (draft.kind === 'Pod' && /\s/.test(container.image)) return `${path}.image cannot contain whitespace.`;
      for (const [portIndex, portValue] of array(container.ports).entries()) {
        const port = object(portValue);
        for (const field of ['containerPort', 'hostPort']) {
          if (field === 'hostPort' && port[field] === undefined) continue;
          const number = integer(port[field]);
          if (number === null || number < (field === 'hostPort' ? 0n : 1n) || number > 65535n) return `${path}.ports.${portIndex}.${field} must be an integer from ${field === 'hostPort' ? 0 : 1} to 65535.`;
        }
      }
      const error = validateResources(container.resources, `${path}.resources`);
      if (error) return error;
    }
  }
  if (draft.kind === 'StatefulSet') {
    for (const [index, claimValue] of array(spec.volumeClaimTemplates).entries()) {
      const claim = object(claimValue);
      if (!isDnsName(object(claim.metadata).name)) return `spec.volumeClaimTemplates.${index}.metadata.name must be a valid DNS subdomain.`;
      const error = validateResources(object(claim.spec).resources, `spec.volumeClaimTemplates.${index}.spec.resources`);
      if (error) return error;
    }
  }
  return null;
}
