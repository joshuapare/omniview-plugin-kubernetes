import { useEffect, useMemo, useState } from 'react';
import type { ResourceEditorContext, ResourceEditorPath, ResourceType } from '@omniviewdev/runtime';
import { ResourceClient } from '@omniviewdev/runtime/api';
import { PLUGIN_ID } from '@/pluginId';
import { catalogEditorContext } from './resourceEditorContext';

/** Installed schema evidence only; declarations never invent optional fields or feature gates. */
export function installedEditorSchemaPaths(document: unknown, root?: string): readonly ResourceEditorPath[] {
  const resolve = (reference: string): unknown => {
    if (!reference.startsWith('#/')) return reference === '#' ? document : undefined;
    let selected = document;
    for (const segment of reference.slice(2).split('/')) {
      if (!selected || typeof selected !== 'object') return undefined;
      selected = Reflect.get(selected, segment.replace(/~1/g, '/').replace(/~0/g, '~'));
    }
    return selected;
  };
  const paths: ResourceEditorPath[] = [];
  const walk = (schema: unknown, path: ResourceEditorPath, references: readonly string[], depth: number) => {
    if (!schema || typeof schema !== 'object' || depth > 48 || paths.length > 20000) return;
    const value = schema as Record<string, unknown>;
    if (typeof value.$ref === 'string' && !references.includes(value.$ref)) walk(resolve(value.$ref), path, [...references, value.$ref], depth + 1);
    if (value.properties && typeof value.properties === 'object') for (const [key, child] of Object.entries(value.properties)) { const next = [...path, key]; paths.push(next); walk(child, next, references, depth + 1); }
    if (value.items) { paths.push([...path, '*']); walk(value.items, [...path, '*'], references, depth + 1); }
    if (value.additionalProperties === true || value.additionalProperties && typeof value.additionalProperties === 'object') { paths.push([...path, '*']); walk(value.additionalProperties, [...path, '*'], references, depth + 1); }
    for (const combination of ['allOf', 'anyOf', 'oneOf']) if (Array.isArray(value[combination])) for (const child of value[combination]) walk(child, path, references, depth + 1);
  };
  walk(root ? resolve(root) : document, [], [], 0);
  return paths;
}

export function useCatalogEditorContext(source: string, resourceKey: string, connectionID: string, intent: ResourceEditorContext['intent'], descriptor?: ResourceType): ResourceEditorContext {
  const context = catalogEditorContext(source, resourceKey, connectionID, intent, descriptor);
  const representation = descriptor?.representations.find((entry) => entry.id === `kubernetes.object.v1/${context.group ? `${context.group}/` : ''}${context.version}`);
  const binding = representation?.schema;
  const key = JSON.stringify([connectionID, binding?.documentRef, binding?.root]);
  const [schema, setSchema] = useState<{ key: string; status: 'available' | 'unavailable'; paths?: readonly ResourceEditorPath[] }>();
  useEffect(() => {
    if (!binding?.documentRef || !connectionID) return;
    let active = true;
    let cancel: (() => unknown) | undefined;
    void Promise.resolve().then(() => { const pending = ResourceClient.GetSchemaDocument(PLUGIN_ID, { connection: connectionID }, binding.documentRef!); cancel = () => pending.cancel?.(); return pending; }).then((response) => { if (active) setSchema({ key, status: 'available', paths: installedEditorSchemaPaths(response.document, binding.root) }); }).catch(() => { if (active) setSchema({ key, status: 'unavailable' }); });
    return () => { active = false; void cancel?.(); };
  }, [key]);
  return useMemo(() => schema?.key === key ? { ...context, schema: { ...context.schema, status: schema.status, paths: schema.paths } } : context, [source, resourceKey, connectionID, intent, descriptor, schema, key]);
}
