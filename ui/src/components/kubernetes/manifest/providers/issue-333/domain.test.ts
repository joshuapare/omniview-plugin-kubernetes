import { describe, expect, it } from 'vitest';
import type { ResourceEditorContext } from '@omniviewdev/runtime';
import { ResourceEditorController } from '../../resourceEditorController';
import { validate } from './domain';

const context = (kind: string): ResourceEditorContext => ({
  group: 'postgresql.cnpg.io', version: 'v1', kind,
  resource: kind === 'ClusterImageCatalog' ? 'clusterimagecatalogs' : 'imagecatalogs',
  scope: kind === 'ClusterImageCatalog' ? 'Cluster' : 'Namespaced',
  connectionID: 'fixture', intent: 'create', ownership: { status: 'application' },
  capabilities: { create: 'available', update: 'available', delete: 'available', get: 'available', list: 'available', actions: {} },
  discovery: { status: 'available', features: {} }, schema: { status: 'available' },
});

function draft(kind: string, majors: readonly string[]) {
  return new ResourceEditorController(`apiVersion: postgresql.cnpg.io/v1\nkind: ${kind}\nmetadata: {name: database-images}\nspec:\n  images:\n${majors.map(major => `    - major: ${major}\n      image: registry.invalid/postgres:17`).join('\n')}\n`).draft();
}

describe.each(['ImageCatalog', 'ClusterImageCatalog'])('%s canonical image versions', kind => {
  it('admits distinct exact integers from canonical YAML', () => {
    const value = draft(kind, ['17', '18']);
    expect(value.get(['spec', 'images', 0, 'major'])).toBe(17n);
    expect(validate(value, context(kind))).toEqual([]);
  });

  it('rejects duplicate major versions', () => {
    expect(validate(draft(kind, ['17', '17']), context(kind))).toEqual([
      expect.objectContaining({ path: ['spec', 'images'] }),
    ]);
  });

  it.each(['9', '17.5', '9007199254740992', '"17"', 'null'])('rejects unsupported major scalar %s', major => {
    expect(validate(draft(kind, [major]), context(kind))).toEqual([
      expect.objectContaining({ path: ['spec', 'images'] }),
    ]);
  });
});
