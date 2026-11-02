import { isAlias, isMap, isNode, isScalar, isSeq, parseDocument, stringify } from 'yaml';
import type { ResourceEditorContext, ResourceEditorContribution, ResourceEditorDraft, ResourceEditorPatchRequest, ResourceEditorPatchResult, ResourceEditorPath } from '@omniviewdev/runtime';
import { inspectManifest, patchManifest, readManifestValue, type ManifestDraft } from './manifestDraft';
import { immutableEditorPaths, validateImmutableEditorFields } from './resourceEditorPolicy';

const opaque = new WeakSet<object>();
const noSensitivePaths: readonly ResourceEditorPath[] = [];
const safeAnnotation: Readonly<Record<string, true>> = { 'ingressclass.kubernetes.io/is-default-class': true, 'storageclass.kubernetes.io/is-default-class': true, 'storageclass.beta.kubernetes.io/is-default-class': true, 'apf.kubernetes.io/autoupdate-spec': true };
const marker = () => {
  const value = Object.create(null) as object;
  Object.defineProperty(value, 'toJSON', { value: () => { throw new Error('Hidden values cannot be serialized.'); } });
  Object.freeze(value); opaque.add(value); return value;
};
const prefix = (parent: ResourceEditorPath, path: ResourceEditorPath) => parent.length <= path.length && parent.every((key, index) => key === '*' || key === path[index]);
const overlaps = (left: ResourceEditorPath, right: ResourceEditorPath) => prefix(left, right) || prefix(right, left);
const identityPaths = [['apiVersion'], ['kind'], ['metadata', 'name'], ['metadata', 'namespace'], ['metadata', 'uid'], ['metadata', 'resourceVersion']] as const;
const safePath = (path: ResourceEditorPath) => path.length > 0 && path.every((key) => typeof key === 'string' ? !['__proto__', 'constructor', 'prototype', '<<'].includes(key) : Number.isSafeInteger(key) && key >= 0);

function assertValue(value: unknown, seen = new Set<object>()): void {
  if (value === null || ['string', 'boolean', 'bigint'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return;
  if (!value || typeof value !== 'object' || opaque.has(value) || seen.has(value)) throw new Error('Unsafe value');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('Unsafe value');
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) throw new Error('Sparse arrays cannot be submitted losslessly.');
    if (Object.keys(value).length !== value.length) throw new Error('Arrays cannot carry object properties.');
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe key');
    assertValue(child, seen);
  }
  seen.delete(value);
}

export function assertResourceEditorInput(value: unknown): void { assertValue(value); }

function project(value: unknown, sensitive: readonly ResourceEditorPath[], path: ResourceEditorPath = [], ancestors = new Set<object>()): unknown {
  if (path.at(-2) === 'metadata' && path.at(-1) === 'annotations' && (!value || typeof value !== 'object' || Array.isArray(value))) return marker();
  if (path.at(-3) === 'metadata' && path.at(-2) === 'annotations') {
    const key = path.at(-1);
    return typeof key === 'string' && Object.hasOwn(safeAnnotation, key) && (value === 'true' || value === 'false') ? value : marker();
  }
  if (sensitive.some((entry) => prefix(entry, path))) return marker();
  if (!value || typeof value !== 'object') return sensitive.some((entry) => prefix(path, entry)) ? marker() : value;
  if (ancestors.has(value)) return marker();
  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = value.map((child, index) => project(child, sensitive, [...path, index], ancestors));
    ancestors.delete(value);
    return Object.freeze(result);
  }
  const result: Record<string, unknown> = {};
  for (const key in value) if (Object.hasOwn(value, key)) Object.defineProperty(result, key, { value: project(Reflect.get(value, key), sensitive, [...path, key], ancestors), enumerable: true });
  ancestors.delete(value);
  return Object.freeze(result);
}

export function projectResourceEditorValue(value: unknown, sensitive: readonly ResourceEditorPath[] = noSensitivePaths): unknown { return project(value, sensitive); }

/** Immutable projections never share objects with canonical YAML or another revision. */
export function createResourceEditorDraft(source: string, sessionID: string, revision: number, sensitive: readonly ResourceEditorPath[] = noSensitivePaths): ResourceEditorDraft {
  return draftFromManifest(inspectManifest(source), sessionID, revision, sensitive);
}

function draftFromManifest(parsed: ManifestDraft, sessionID: string, revision: number, sensitive: readonly ResourceEditorPath[]): ResourceEditorDraft {
  const root = project(readManifestValue(parsed, []), sensitive);
  const get = (path: ResourceEditorPath): unknown => {
    let value = root;
    for (const key of path) {
      if (!value || typeof value !== 'object' || opaque.has(value) || !Object.hasOwn(value, key)) return undefined;
      value = Reflect.get(value, key);
    }
    return value;
  };
  return Object.freeze({ sessionID, revision, get, has: (path: ResourceEditorPath) => get(path) !== undefined });
}

export interface ResourceEditorControllerSnapshot {
  readonly source: string;
  readonly revision: number;
  readonly sensitive: boolean;
  readonly readOnly: boolean;
  readonly protectedPaths: readonly ResourceEditorPath[];
  readonly fallback: boolean;
}

/** Canonical host-only source; contributors receive only draft and scoped patch capability. */
export class ResourceEditorController {
  readonly sessionID: string;
  revision = 0;
  private source: string;
  private manifest: ManifestDraft;
  private projection?: { paths: readonly ResourceEditorPath[]; draft: ResourceEditorDraft };
  private active = true;
  private readonly listeners = new Set<() => void>();
  private snapshot: ResourceEditorControllerSnapshot;
  constructor(source: string, sessionID = globalThis.crypto?.randomUUID?.() ?? `editor-${Date.now()}-${Math.random()}`) {
    this.source = source; this.manifest = inspectManifest(source); this.sessionID = sessionID;
    this.snapshot = { source, revision: 0, sensitive: false, readOnly: false, protectedPaths: [], fallback: false };
  }
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getSnapshot = () => this.snapshot;
  private publish(sensitive = this.snapshot.sensitive, readOnly = this.snapshot.readOnly, protectedPaths = this.snapshot.protectedPaths, fallback = this.snapshot.fallback) {
    this.snapshot = { source: this.source, revision: this.revision, sensitive, readOnly, protectedPaths, fallback };
    this.listeners.forEach((listener) => listener());
  }
  commitSafety(sensitive: boolean, readOnly?: boolean, paths?: readonly ResourceEditorPath[], fallback = false) {
    const nextSensitive = this.snapshot.sensitive || sensitive;
    const nextReadOnly = readOnly ?? this.snapshot.readOnly;
    let protectedPaths = this.snapshot.protectedPaths;
    for (const path of paths ?? []) {
      if (!protectedPaths.some((saved) => saved.length === path.length && saved.every((segment, index) => segment === path[index]))) protectedPaths = [...protectedPaths, Object.freeze([...path])];
    }
    const nextFallback = this.snapshot.fallback || fallback;
    if (nextSensitive !== this.snapshot.sensitive || nextReadOnly !== this.snapshot.readOnly || protectedPaths !== this.snapshot.protectedPaths || nextFallback !== this.snapshot.fallback) this.publish(nextSensitive, nextReadOnly, protectedPaths, nextFallback);
  }
  getSource() { return this.source; }
  isActive() { return this.active; }
  activate() { this.active = true; }
  syncSource(source: string) { if (this.source !== source) { this.source = source; this.manifest = inspectManifest(source); this.revision++; this.projection = undefined; this.publish(); } }
  invalidate() { this.revision++; this.projection = undefined; this.publish(); }
  dispose() { this.active = false; }
  draft(paths: readonly ResourceEditorPath[] = noSensitivePaths): ResourceEditorDraft {
    if (!this.projection || this.projection.paths !== paths) this.projection = { paths, draft: draftFromManifest(this.manifest, this.sessionID, this.revision, paths) };
    return this.projection.draft;
  }
  patch(request: ResourceEditorPatchRequest, contribution: ResourceEditorContribution, context: ResourceEditorContext): ResourceEditorPatchResult {
    if (!this.active || request.sessionID !== this.sessionID || request.expectedRevision !== this.revision) return { status: 'stale', message: 'This editor changed. Retry from the current draft.' };
    const draft = this.draft(contribution.sensitivePaths);
    try {
      if (context.intent === 'inspect' || contribution.readOnly?.(draft, context)) return { status: 'forbidden', message: 'This resource is inspection only.' };
    } catch { return { status: 'invalid', message: 'Editor admission is unavailable.' }; }
    if (context.discovery.status !== 'available' || context.intent === 'create' && context.capabilities.create !== 'available' || context.intent === 'edit' && context.capabilities.update !== 'available') return { status: 'forbidden', message: 'Authoring is not available for this target.' };
    for (const operation of request.operations) {
      if (!safePath(operation.path)) return { status: 'unsafe', message: 'This path cannot be edited safely.' };
      if (identityPaths.some((path) => overlaps(path, operation.path))) return { status: 'immutable', message: 'Resource identity belongs to the host.' };
      if (immutableEditorPaths(context).some((path) => overlaps(path, operation.path))) return { status: 'immutable', message: 'This field cannot change after resource creation.' };
      if (!contribution.ownedPaths.some((path) => prefix(path, operation.path))) return { status: 'forbidden', message: 'This editor does not own the requested field.' };
      if (context.schema.paths && !context.schema.paths.some((path) => path.length === operation.path.length && prefix(path, operation.path))) return { status: 'forbidden', message: 'Schema does not admit this field.' };
      try { if (operation.op !== 'remove') assertValue(operation.value); } catch { return { status: 'unsafe', message: 'Only exact values may be submitted. Hidden values cannot be written back.' }; }
    }
    try {
      let next = this.source;
      for (const operation of request.operations) {
        if (operation.op === 'insert') {
          const doc = parseDocument(next, { intAsBigInt: true });
          const sequence = doc.getIn([...operation.path], true);
          if (!isSeq(sequence) || !Number.isSafeInteger(operation.index) || operation.index < 0 || operation.index > sequence.items.length || sequence.anchor) throw new Error('Unsafe list');
          // Traversal through aliases/anchored ancestors is never an editable projection.
          for (let index = 1; index <= operation.path.length; index++) {
            const node = doc.getIn(operation.path.slice(0, index), true);
            if (isAlias(node) || (isNode(node) && 'anchor' in node && node.anchor)) throw new Error('Unsafe list');
          }
          sequence.items.splice(operation.index, 0, doc.createNode(operation.value));
          next = doc.toString({ lineWidth: 0 });
        } else if (operation.op === 'set') {
          next = reconcile(next, operation.path, operation.value, contribution.sensitivePaths ?? []);
        } else next = patchManifest(next, [{ path: operation.path, remove: true }]);
      }
      if (validateImmutableEditorFields(next, this.source, context)) return { status: 'immutable', message: 'These changes would modify an immutable field.' };
      this.syncSource(next);
      return { status: 'accepted', revision: this.revision };
    } catch { return { status: 'unsafe', message: 'These changes cannot be applied losslessly. Use YAML for this field.' }; }
  }
}

function reconcile(source: string, path: ResourceEditorPath, value: unknown, sensitive: readonly ResourceEditorPath[]): string {
  const draft = inspectManifest(source);
  const node = draft.document?.getIn([...path], true);
  if ((isMap(node) || isSeq(node)) && sensitive.some((entry) => entry.length === path.length && prefix(entry, path))) {
    const document = draft.document!;
    for (let index = 1; index <= path.length; index++) {
      const parent = document.getIn(path.slice(0, index), true);
      if (isAlias(parent) || (isNode(parent) && 'anchor' in parent && parent.anchor)) throw new Error('Unsafe replacement');
    }
    const replacement = document.createNode(value);
    if (isNode(node)) { replacement.comment = node.comment; replacement.commentBefore = node.commentBefore; }
    document.setIn([...path], replacement);
    return document.toString({ lineWidth: 0 });
  }
  if (isMap(node) || isSeq(node)) {
    if (sensitive.some((entry) => overlaps(entry, path))) throw new Error('Cannot replace a sensitive projection');
    if (isMap(node) && value && typeof value === 'object' && !Array.isArray(value)) {
      let next = source;
      if (node.items.some((pair) => !isScalar(pair.key) || typeof pair.key.value !== 'string')) throw new Error('Unsafe map');
      // Omission is not deletion. Providers must remove an existing key explicitly.
      for (const [key, child] of Object.entries(value)) next = reconcile(next, [...path, key], child, sensitive);
      return next;
    }
    if (isSeq(node) && Array.isArray(value)) {
      if (unsafeCollectionNode(node)) throw new Error('Unsafe list');
      const previous = readManifestValue(draft, path);
      if (!Array.isArray(previous)) throw new Error('Unsafe list');
      const used = new Set<number>();
      const selected = value.map((entry, index) => {
        let match = previous.findIndex((candidate, candidateIndex) => !used.has(candidateIndex) && sameValue(candidate, entry));
        if (match < 0 && entry && typeof entry === 'object' && !Array.isArray(entry)) {
          const key = ['name', 'key', 'id'].find((field) => typeof Reflect.get(entry, field) === 'string');
          if (key) match = previous.findIndex((candidate, candidateIndex) => !used.has(candidateIndex) && candidate && typeof candidate === 'object' && Reflect.get(candidate, key) === Reflect.get(entry, key));
          if (match < 0 && previous.length === value.length && !used.has(index)) match = index;
          if (match < 0 && !key && index < previous.length) throw new Error('Use explicit row insertion or removal.');
        }
        if (match >= 0) { used.add(match); return node.items[match]; }
        return draft.document!.createNode(entry);
      });
      let next = source;
      if (selected.length !== node.items.length || selected.some((entry, index) => entry !== node.items[index])) {
        node.items = selected;
        next = draft.document!.toString({ lineWidth: 0 });
      }
      for (let index = 0; index < value.length; index++) next = reconcile(next, [...path, index], value[index], sensitive);
      return next;
    }
    throw new Error('Unsafe shape change');
  }
  if (readManifestValue(draft, path) === value) return source;
  return patchManifest(source, [{ path, value }]);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameValue(Reflect.get(left, key), Reflect.get(right, key)));
}

function unsafeCollectionNode(node: unknown): boolean {
  if (isAlias(node) || isNode(node) && 'anchor' in node && !!node.anchor) return true;
  if (isSeq(node)) return node.items.some(unsafeCollectionNode);
  if (isMap(node)) return node.items.some((pair) => unsafeCollectionNode(pair.key) || unsafeCollectionNode(pair.value));
  return false;
}

/** Sensitive fallback intentionally excludes comments, annotations and unknown fields. */
export function resourceEditorPreview(source: string): string {
  const draft = inspectManifest(source);
  if (!draft.document || draft.error) return '# Sensitive YAML is invalid. Values are hidden.\n';
  const get = (path: ResourceEditorPath) => readManifestValue(draft, path);
  const scalar = (value: unknown) => typeof value === 'string' ? value : undefined;
  return stringify({ apiVersion: scalar(get(['apiVersion'])), kind: scalar(get(['kind'])), metadata: { name: scalar(get(['metadata', 'name'])), namespace: scalar(get(['metadata', 'namespace'])) }, hidden: 'Sensitive source omitted. Explicit raw access is required.' });
}

/** Full display-only projection: comments are excluded and opaque values stay non-mutating placeholders. */
export function inspectResourceEditorProjection(source: string, paths: readonly ResourceEditorPath[]) {
  const draft = inspectManifest(source);
  if (draft.error || !draft.document) return { sensitive: paths.length > 0, preview: '# Sensitive YAML is invalid. Values are hidden.\n' };
  let sensitive = false;
  const display = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if (opaque.has(value)) { sensitive = true; return '[REDACTED]'; }
    if (Array.isArray(value)) return value.map(display);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, display(child)]));
  };
  const value = display(project(readManifestValue(draft, []), paths));
  return { sensitive, preview: stringify(value, { lineWidth: 0 }) };
}
