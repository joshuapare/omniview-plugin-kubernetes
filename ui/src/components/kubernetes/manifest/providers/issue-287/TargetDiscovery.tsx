import { Button } from '@omniviewdev/base-ui';
import { useEffect, useRef, useState } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorChoice } from '../../editor-controls';
import { migrationTargets, type MigrationTarget } from './discovery';

export default function TargetDiscovery({ form, disabled, group, resource, onSelect }: {
  form: ResourceEditorFormProps; disabled: boolean; group: string; resource: string;
  onSelect(target: MigrationTarget): void;
}) {
  const [targets, setTargets] = useState<readonly MigrationTarget[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const { actions, draft, context } = form;
  useEffect(() => {
    generation.current++;
    active.current?.abort();
    setLoading(false);
    return () => { generation.current++; active.current?.abort(); };
  }, [draft.sessionID, draft.revision, context.connectionID, actions]);
  useEffect(() => {
    setTargets([]);
    setNotice(null);
  }, [draft.sessionID, context.connectionID]);

  async function discover() {
    if (disabled || loading) return;
    active.current?.abort();
    const abort = new AbortController();
    active.current = abort;
    const current = ++generation.current;
    setLoading(true);
    setNotice(null);
    try {
      const results = await Promise.all((['/api', '/apis'] as const).map(endpoint => actions.execute({
        protocol: 'kubernetes.discovery.v1', input: { endpoint, version: 'v2' },
        sessionID: draft.sessionID, generation: draft.revision, signal: abort.signal,
      })));
      if (abort.signal.aborted || generation.current !== current) return;
      const failed = results.find(result => result.status !== 'ready');
      if (failed && failed.status !== 'ready') {
        setTargets([]);
        setNotice(failed.status === 'denied' ? 'Target discovery denied. Exact manual targets remain available.'
          : failed.status === 'absent' ? 'Negotiated target discovery is not served. Enter the exact target manually.'
            : 'Target discovery unavailable. Exact manual targets remain available.');
        return;
      }
      const all = results.flatMap(result => result.status === 'ready' ? [migrationTargets(result.output)] : []);
      if (all.some(items => items === null)) {
        setTargets([]);
        setNotice('Unsupported discovery response. Enter the exact target manually.');
        return;
      }
      const unique = new Map<string, MigrationTarget>();
      for (const items of all) for (const target of items ?? []) unique.set(JSON.stringify([target.group, target.resource]), target);
      setTargets([...unique.values()]);
      setNotice(unique.size ? null : 'No current list/update-capable base resources reported.');
    } catch {
      if (!abort.signal.aborted && generation.current === current) {
        setTargets([]);
        setNotice('Target discovery unavailable. Exact manual targets remain available.');
      }
    } finally {
      if (!abort.signal.aborted && generation.current === current) setLoading(false);
    }
  }
  const chosen = targets.findIndex(target => target.group === group && target.resource === resource);
  return <div style={{ display: 'grid', gap: 8 }}>
    <div><Button size="sm" variant="outline" disabled={disabled || loading} onClick={() => void discover()}>{loading ? 'Discovering targets…' : 'Discover targets'}</Button></div>
    {targets.length > 0 && <EditorChoice label="Discovered target" value={chosen < 0 ? '' : String(chosen)} disabled={disabled}
      help="Current discovery advertises list/update support, not your RBAC permission, storage backing, or migrator health. Selection atomically changes the group and plural."
      options={[{ value: '', label: 'Choose discovered target' }, ...targets.map((target, index) => ({ value: String(index), label: `${target.group || 'core'} / ${target.resource}` }))]}
      onChange={value => { if (value !== '') { const target = targets[Number(value)]; if (target) onSelect(target); } }} />}
    {notice && <span role="status">{notice}</span>}
  </div>;
}
