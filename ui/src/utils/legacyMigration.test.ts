import { beforeEach, describe, expect, it } from 'vitest';
import { legacyBackupPrefix, migrateColumnPreferences, migratePagePath } from './legacyMigration';

const prefix = '/_plugin/kubernetes/cluster/prod/resources/';

describe('legacy Kubernetes page paths', () => {
  it.each([
    ['core::v1::Pod', 'k8s:/pods'],
    ['core_v1_Pod', 'k8s:/pods'],
    ['networking_v1_Ingress', 'k8s:networking.k8s.io/ingresses'],
    ['helm_v1_Release', 'helm:releases'],
    ['apps::v1::Deployment', 'k8s:apps/deployments'],
    ['networking.k8s.io::v1::Ingress', 'k8s:networking.k8s.io/ingresses'],
  ])('converts %s without losing suffix', (legacy, canonical) => {
    expect(migratePagePath(`${prefix}${encodeURIComponent(legacy)}?search=api#result`)).toEqual({
      kind: 'migrated', path: `${prefix}${encodeURIComponent(canonical)}?search=api#result`,
    });
  });
  it('reports unknown legacy GVK without guessing', () => {
    expect(migratePagePath(`${prefix}example.io::v1::Widget`)).toEqual({
      kind: 'unconvertible', reason: 'Unknown legacy Kubernetes resource type: example.io::v1::Widget',
    });
  });
  it.each(['k8s%3A%2Fpods', encodeURIComponent('k8s:opaque::v1::Pod'), 'custom%3Aprovider%2Fwidgets', 'metrics', 'helm%3Areleases'])('leaves opaque and non-resource segments %s unchanged', segment => {
    expect(migratePagePath(prefix + segment)).toEqual({ kind: 'unchanged' });
  });
  it.each(['core_v1_', 'core::v1::', 'core%XX'])('reports malformed resource segment %s', segment => {
    expect(migratePagePath(prefix + segment).kind).toBe('unconvertible');
  });
  it('does not assume an unregistered legacy version maps to the same resource', () => {
    expect(migratePagePath(prefix + 'apps_v2_Deployment').kind).toBe('unconvertible');
  });
  it('does not modify contributed pages or other route shapes', () => {
    expect(migratePagePath(`${prefix}page/core::v1::Pod`)).toEqual({ kind: 'unchanged' });
  });
});

describe('legacy column preferences', () => {
  beforeEach(() => localStorage.clear());
  it.each(['column-visibility', 'column-filters', 'column-sizing', 'label-cols', 'annotation-cols', 'toolbar-filter-values'])('backs up and copies %s exactly', suffix => {
    const old = `kubernetes-prod-core::v1::Pod-${suffix}`;
    const next = `kubernetes-prod-k8s:/pods-${suffix}`;
    localStorage.setItem(old, '{"name":false}');
    expect(migrateColumnPreferences(localStorage, ['prod'])).toEqual([]);
    expect(localStorage.getItem(legacyBackupPrefix + old)).toBe('{"name":false}');
    expect(localStorage.getItem(old)).toBe('{"name":false}');
    expect(localStorage.getItem(next)).toBe('{"name":false}');
  });
  it('never overwrites canonical preferences or the original backup on reload', () => {
    const old = 'kubernetes-prod-core::v1::Pod-column-visibility';
    const next = 'kubernetes-prod-k8s:/pods-column-visibility';
    localStorage.setItem(old, 'original');
    migrateColumnPreferences(localStorage, ['prod']);
    localStorage.setItem(old, 'changed');
    localStorage.setItem(next, 'user choice');
    migrateColumnPreferences(localStorage, ['prod']);
    expect(localStorage.getItem(legacyBackupPrefix + old)).toBe('original');
    expect(localStorage.getItem(next)).toBe('user choice');
    expect(localStorage.length).toBe(3);
  });
  it('migrates historical short group names', () => {
    localStorage.setItem('kubernetes-networking::v1::Ingress-label-cols', '{"team":true}');
    expect(migrateColumnPreferences(localStorage, [])).toEqual([]);
    expect(localStorage.getItem('kubernetes-k8s:networking.k8s.io/ingresses-label-cols')).toBe('{"team":true}');
  });
  it('migrates only the selected host profile and keeps its backup in that profile', () => {
    const profile = 'omniview:instance:v1:dev%2Fone:';
    const other = 'omniview:instance:v1:dev-two:';
    const old = 'kubernetes-prod-core::v1::Pod-column-visibility';
    localStorage.setItem(profile + old, 'selected');
    localStorage.setItem(other + old, 'other');
    expect(migrateColumnPreferences(localStorage, ['prod'], profile)).toEqual([]);
    expect(localStorage.getItem(profile + legacyBackupPrefix + old)).toBe('selected');
    expect(localStorage.getItem(profile + 'kubernetes-prod-k8s:/pods-column-visibility')).toBe('selected');
    expect(localStorage.getItem(other + 'kubernetes-prod-k8s:/pods-column-visibility')).toBeNull();
  });
  it('backs up and reports unknown GVK without creating a guessed destination', () => {
    const old = 'kubernetes-prod-example.io::v1::Widget-label-cols';
    localStorage.setItem(old, '{}');
    expect(migrateColumnPreferences(localStorage, ['prod'])).toEqual([old]);
    expect(localStorage.getItem(legacyBackupPrefix + old)).toBe('{}');
    expect(localStorage.length).toBe(2);
  });

  it.each([['prod'], ['prod', 'prod-example']])('does not turn an unknown or ambiguous group into a guessed connection using %j', (...connectionIDs) => {
    const old = 'kubernetes-prod-example-core::v1::Pod-column-visibility';
    localStorage.setItem(old, 'original');
    expect(migrateColumnPreferences(localStorage, connectionIDs)).toEqual([old]);
    expect(localStorage.getItem(old)).toBe('original');
    expect(localStorage.getItem(legacyBackupPrefix + old)).toBe('original');
    expect(localStorage.getItem('kubernetes-prod-example-k8s:/pods-column-visibility')).toBeNull();
    expect(localStorage.length).toBe(2);
  });

  it('uses the complete unique configured connection prefix rather than splitting its hyphens', () => {
    const old = 'kubernetes-prod-example-core::v1::Pod-column-visibility';
    localStorage.setItem(old, 'original');
    expect(migrateColumnPreferences(localStorage, ['prod-example'])).toEqual([]);
    expect(localStorage.getItem('kubernetes-prod-example-k8s:/pods-column-visibility')).toBe('original');
    expect(localStorage.getItem(old)).toBe('original');
  });

  it('retains and reports legacy keys whose connection is no longer configured', () => {
    const old = 'kubernetes-deleted-core::v1::Pod-column-visibility';
    localStorage.setItem(old, 'original');
    expect(migrateColumnPreferences(localStorage, ['prod'])).toEqual([old]);
    expect(localStorage.getItem(old)).toBe('original');
    expect(localStorage.getItem(legacyBackupPrefix + old)).toBe('original');
    expect(localStorage.getItem('kubernetes-deleted-k8s:/pods-column-visibility')).toBeNull();
  });

  it('does not reclassify a current opaque type containing legacy delimiters', () => {
    const key = 'kubernetes-prod-k8s:opaque::v1::Pod-column-visibility';
    localStorage.setItem(key, 'current');
    expect(migrateColumnPreferences(localStorage, ['prod'])).toEqual([]);
    expect(localStorage.getItem(key)).toBe('current');
    expect(localStorage.length).toBe(1);
  });
});
