import { Button, Dialog, IconButton, Progress, Spinner, Text } from '@omniviewdev/base-ui';
import { useSourceStates, useResourceTypes, useResourceGroups } from '@omniviewdev/runtime';
import type { SourceSessionState } from '@omniviewdev/runtime';
import type { Count } from '@omniviewdev/runtime/models';
import { ResourceClient } from '@omniviewdev/runtime/api';
import React from 'react';
import { LuCircleCheck, LuCircleAlert, LuCircleSlash, LuX } from 'react-icons/lu';

import { useStableObject } from '../../hooks/useStableRef';

import styles from './SyncProgressDialog.module.css';

// ---------------------------------------------------------------------------
// Static styles
// ---------------------------------------------------------------------------

const spinnerStyle: React.CSSProperties = { width: 14, height: 14 };
const headerSpinnerStyle: React.CSSProperties = { width: 16, height: 16 };

const groupProgressWrapperStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' };
const groupProgressBarStyle: React.CSSProperties = { width: 48 };
const groupProgressCountStyle: React.CSSProperties = {
  color: 'var(--ov-color-fg-subtle)',
  minWidth: 28,
  textAlign: 'right',
  fontFamily: 'var(--ov-font-mono, monospace)',
};

const dialogStyle: React.CSSProperties = {
  maxWidth: 600,
  backgroundColor: 'var(--ov-color-bg-elevated)',
  border: '1px solid var(--ov-color-border-overlay)',
  borderRadius: 8,
  color: 'var(--ov-color-fg-default)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingInline: 16,
  paddingBlock: 12,
  borderBottom: '1px solid var(--ov-color-border-muted)',
};

const headerLeftStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };

const progressBarWrapperStyle: React.CSSProperties = {
  paddingInline: 16,
  paddingBlock: 8,
  borderBottom: '1px solid var(--ov-color-border-muted)',
};
const progressBarInnerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 };
const progressBarStyle: React.CSSProperties = { flex: 1 };
const progressPercentStyle: React.CSSProperties = { minWidth: 64, textAlign: 'right' };

const resourceListStyle: React.CSSProperties = { padding: 0, maxHeight: 400, overflowY: 'auto' };

const groupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  paddingInline: 16,
  paddingBlock: 6,
  backgroundColor: 'var(--ov-color-bg-inset)',
  borderBottom: '1px solid var(--ov-color-border-muted)',
};

const groupLabelStyle: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const kindTextStyle: React.CSSProperties = { flex: 1 };
const countTextStyle: React.CSSProperties = { fontFamily: 'var(--ov-font-mono, monospace)' };
const retryButtonStyle: React.CSSProperties = { minWidth: 0, fontSize: '0.625rem', paddingInline: 8, paddingBlock: 2 };

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  borderTop: '1px solid var(--ov-color-border-muted)',
  paddingInline: 16,
  paddingBlock: 8,
};

interface SyncProgressDialogProps {
  open: boolean;
  onClose: () => void;
  clusterName: string;
  pluginID: string;
  connectionID: string;
}

type ResourceItem = { key: string; kind: string; state: SourceSessionState; count?: Count };

const isTerminal = (s: SourceSessionState) =>
  s === 'following' || s === 'finished' || s === 'failed' || s === 'closed';

function StateIcon({ state }: { state: SourceSessionState }) {
  switch (state) {
    case 'opening':
    case 'snapshotting':
    case 'resetRequired':
      return <Spinner size="xs" color="brand" style={spinnerStyle} />;
    case 'following':
    case 'finished':
    case 'closed':
      return <LuCircleCheck size={14} color="var(--ov-color-success)" />;
    case 'failed':
      return <LuCircleAlert size={14} color="var(--ov-color-danger)" />;
    default:
      return <LuCircleSlash size={14} color="var(--ov-color-fg-subtle)" />;
  }
}

/** Per-group progress summary */
const GroupProgress = React.memo(function GroupProgress({ items }: { items: ResourceItem[] }) {
  const total = items.length;
  const done = items.filter((i) => isTerminal(i.state)).length;
  const allDone = total > 0 && done === total;
  const hasError = items.some((i) => i.state === 'failed');
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={groupProgressWrapperStyle}>
      <Progress
        value={percent}
        size="xs"
        color={hasError ? 'danger' : allDone ? 'success' : 'brand'}
        style={groupProgressBarStyle}
      />
      <Text size="xs" style={groupProgressCountStyle}>
        {done}/{total}
      </Text>
    </div>
  );
});

/**
 * Wrapper: returns null when closed to avoid all hook subscriptions / re-renders.
 */
export default function SyncProgressDialog(props: SyncProgressDialogProps) {
  if (!props.open) return null;
  return <SyncProgressDialogInner {...props} />;
}

function SyncProgressDialogInner({
  open,
  onClose,
  clusterName,
  pluginID,
  connectionID,
}: SyncProgressDialogProps) {
  const route = { connection: connectionID };
  const { summary } = useSourceStates({ pluginID, route });
  const { resourceTypes } = useResourceTypes({ pluginID, route });
  const { groups: resourceGroups } = useResourceGroups({ pluginID, route });

  const resources = useStableObject(summary?.types ?? {});
  const { watchedTotal, watchedDone } = React.useMemo(() => {
    const statuses = Object.values(resources);
    return {
      watchedTotal: statuses.length,
      watchedDone: statuses.filter((status) => isTerminal(status.state)).length,
    };
  }, [resources]);

  // Group opaque types using the provider's presentation catalog.
  const grouped = React.useMemo(() => {
    const groups: Record<string, ResourceItem[]> = {};

    for (const [key, status] of Object.entries(resources)) {
      const kind = resourceTypes.data?.find((type) => type.type === key)?.displayName ?? key;
      const label = resourceGroups.data?.find((group) => group.resources.includes(key))?.name ?? 'Resources';
      if (!groups[label]) groups[label] = [];
      groups[label].push({ key, kind, state: status.state, count: status.count });
    }

    // Sort items within each group
    for (const items of Object.values(groups)) {
      items.sort((a, b) => a.kind.localeCompare(b.kind));
    }

    // Sort groups alphabetically, but put "Core" first
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Core') return -1;
      if (b === 'Core') return 1;
      return a.localeCompare(b);
    });
  }, [resources, resourceTypes.data, resourceGroups.data]);

  const watchedAllDone = watchedTotal > 0 && watchedDone === watchedTotal;
  const percent = watchedTotal > 0 ? Math.round((watchedDone / watchedTotal) * 100) : 0;

  const handleRetry = React.useCallback(
    async () => {
      try {
        await ResourceClient.RetryConnectionSources(pluginID, { connection: connectionID });
      } catch (err) {
        console.error('Failed to retry sources:', err);
      }
    },
    [pluginID, connectionID],
  );

  return (
    <Dialog open={open} onClose={onClose} size="lg" style={dialogStyle} aria-label={`Sync progress for ${clusterName}`}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={headerLeftStyle}>
          {!watchedAllDone && <Spinner size="sm" color="brand" style={headerSpinnerStyle} />}
          {watchedAllDone && <LuCircleCheck size={16} color="var(--ov-color-success)" />}
          <Text weight="semibold" size="sm">
            {watchedAllDone ? `Synced "${clusterName}"` : `Syncing "${clusterName}"`}
          </Text>
        </div>
        <IconButton size="sm" variant="ghost" color="neutral" aria-label="Close" onClick={onClose}>
          <LuX size={16} />
        </IconButton>
      </div>

      {/* Progress bar */}
      <div style={progressBarWrapperStyle}>
        <div style={progressBarInnerStyle}>
          <Progress
            value={percent}
            size="sm"
            color={watchedAllDone ? 'success' : 'brand'}
            style={progressBarStyle}
          />
          <Text size="xs" tone="muted" style={progressPercentStyle}>
            {percent}%&ensp;{watchedDone}/{watchedTotal}
          </Text>
        </div>
      </div>

      {/* Resource list */}
      <div style={resourceListStyle}>
        {grouped.map(([groupLabel, items]) => (
          <div key={groupLabel}>
            {/* Group header with progress */}
            <div style={groupHeaderStyle}>
              <Text size="xs" weight="semibold" tone="muted" style={groupLabelStyle}>
                {groupLabel}
              </Text>
              <GroupProgress items={items} />
            </div>
            {items.map(({ key, kind, state, count }) => (
              <div
                key={key}
                className={
                  state === 'closed'
                    ? `${styles.Row} ${styles.RowFaded}`
                    : styles.Row
                }
              >
                <StateIcon state={state} />
                <Text size="xs" style={kindTextStyle}>
                  {kind}
                </Text>
                {(state === 'following' || state === 'finished') && (
                  <Text size="xs" tone="subtle" style={countTextStyle}>
                    {count?.kind === 'exact' ? count.value : count?.kind === 'estimate' ? `~${count.value}` : 'Unknown'}
                  </Text>
                )}
                {state === 'failed' && (
                  <Button
                    variant="soft"
                    size="xs"
                    color="danger"
                    onClick={() => { void handleRetry(); }}
                    style={retryButtonStyle}
                  >
                    Retry
                  </Button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        <Button variant="soft" size="sm" color="neutral" onClick={onClose}>
          Dismiss
        </Button>
      </div>
    </Dialog>
  );
}
