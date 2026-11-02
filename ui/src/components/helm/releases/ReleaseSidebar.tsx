import { Button, Card, Chip, IconButton, Separator, Stack, Tabs, Text } from '@omniviewdev/base-ui';
import { DrawerContext, jsonToValue, useExecuteAction, useResourceEditorModelPath, useRightDrawer } from '@omniviewdev/runtime';
import { ResourceClient } from '@omniviewdev/runtime/api';
import React from 'react';
import { LuCircleArrowUp, LuUndo2, LuGitCompare } from 'react-icons/lu';
import { stringify, parse } from 'yaml';

import { PLUGIN_ID } from '@/pluginId';

import CodeEditor from '../../shared/CodeEditor';

import styles from './ReleaseSidebar.module.css';
import UpgradeDialog from './UpgradeDialog';
import { helmActionData } from '../values';

const metaRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 2fr' };
const metaValueStyle: React.CSSProperties = { fontWeight: 400 };
const editorBoxStyle: React.CSSProperties = {
  height: 400,
  border: '1px solid var(--ov-color-border-default)',
  borderRadius: 4,
  overflow: 'hidden',
};
const notesStyle: React.CSSProperties = {
  fontSize: 12,
  fontFamily: 'var(--ov-font-mono)',
  backgroundColor: 'var(--ov-color-bg-inset)',
  padding: 12,
  borderRadius: 4,
  overflow: 'auto',
  maxHeight: 400,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  margin: 0,
};
const headerCardStyle: React.CSSProperties = { padding: 12, borderRadius: 4 };
const itemCardStyle: React.CSSProperties = { padding: 8 };
const diffButtonRowStyle: React.CSSProperties = { marginBottom: 8 };
const blockTextStyle: React.CSSProperties = { display: 'block' };

// ── types ──

/** Shape of a Helm release as returned by the backend list/get APIs. */
interface HelmRelease {
  name?: string;
  namespace?: string;
  version?: bigint;
  info?: {
    status?: string;
    last_deployed?: string;
    description?: string;
  };
  chart?: {
    metadata?: {
      name?: string;
      version?: string;
      appVersion?: string;
    };
  };
}

/** Data returned by `get-values` action. */
interface ValuesActionData {
  [key: string]: unknown;
}

/** Data returned by `get-manifest` action. */
interface ManifestActionData {
  manifest?: string;
}

/** Data returned by `get-notes` action. */
interface NotesActionData {
  notes?: string;
}

/** A single Helm hook. */
interface HelmHook {
  name: string;
  kind: string;
  weight: string | bigint;
  events?: string[];
}

/** Data returned by `get-hooks` action. */
interface HooksActionData {
  hooks?: HelmHook[];
}

/** A single history revision. */
interface HelmRevision {
  version: bigint;
  info?: {
    status?: string;
    description?: string;
  };
}

/** Data returned by `get-history` action. */
interface HistoryActionData {
  revisions?: HelmRevision[];
}

/** Union of all possible per-tab cached data shapes. */
type TabDataEntry =
  | ValuesActionData
  | ManifestActionData
  | NotesActionData
  | HooksActionData
  | HistoryActionData
  | null;

interface Props {
  ctx: DrawerContext<HelmRelease>;
}

const statusColorMap: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  deployed: 'success',
  failed: 'danger',
  'pending-install': 'warning',
  'pending-upgrade': 'warning',
  'pending-rollback': 'warning',
  superseded: 'neutral',
  uninstalling: 'warning',
  uninstalled: 'neutral',
};

const MetaEntry: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={metaRowStyle}>
    <Text tone="muted" size="sm">
      {label}
    </Text>
    <Text style={metaValueStyle} size="sm">
      {value}
    </Text>
  </div>
);

// Native manifest navigation stays inside the Kubernetes adapter.
const kindToType: Record<string, string> = {
  'apps/Deployment': 'k8s:apps/deployments',
  '/Service': 'k8s:/services',
  '/ConfigMap': 'k8s:/configmaps',
  '/Secret': 'k8s:/secrets',
  '/ServiceAccount': 'k8s:/serviceaccounts',
  'networking.k8s.io/Ingress': 'k8s:networking.k8s.io/ingresses',
  '/PersistentVolumeClaim': 'k8s:/persistentvolumeclaims',
  'apps/StatefulSet': 'k8s:apps/statefulsets',
  'apps/DaemonSet': 'k8s:apps/daemonsets',
  'batch/Job': 'k8s:batch/jobs',
  'batch/CronJob': 'k8s:batch/cronjobs',
  'rbac.authorization.k8s.io/Role': 'k8s:rbac.authorization.k8s.io/roles',
  'rbac.authorization.k8s.io/RoleBinding': 'k8s:rbac.authorization.k8s.io/rolebindings',
  'rbac.authorization.k8s.io/ClusterRole': 'k8s:rbac.authorization.k8s.io/clusterroles',
  'rbac.authorization.k8s.io/ClusterRoleBinding': 'k8s:rbac.authorization.k8s.io/clusterrolebindings',
  'networking.k8s.io/NetworkPolicy': 'k8s:networking.k8s.io/networkpolicies',
  'autoscaling/HorizontalPodAutoscaler': 'k8s:autoscaling/horizontalpodautoscalers',
  'policy/PodDisruptionBudget': 'k8s:policy/poddisruptionbudgets',
  '/Namespace': 'k8s:/namespaces',
};

/** Shape of a parsed YAML Kubernetes resource document. */
interface ParsedK8sResource {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
  };
}

/**
 * Parse a YAML manifest string into individual resource documents.
 */
function parseManifestResources(
  manifest: string,
): Array<{ apiGroup: string; kind: string; name: string; namespace?: string }> {
  if (!manifest) return [];
  const docs = manifest.split(/^---$/m).filter((d) => d.trim());
  const resources: Array<{ apiGroup: string; kind: string; name: string; namespace?: string }> = [];
  for (const doc of docs) {
    try {
      // yaml.parse returns `any` by design; cast to the expected K8s resource shape
      const parsed = parse(doc) as ParsedK8sResource | null;
      if (parsed?.apiVersion && parsed.kind && parsed.metadata?.name) {
        resources.push({
          apiGroup: parsed.apiVersion.includes('/') ? parsed.apiVersion.split('/')[0] : '',
          kind: parsed.kind,
          name: parsed.metadata.name,
          namespace: parsed.metadata.namespace,
        });
      }
    } catch {
      // skip unparseable documents
    }
  }
  return resources;
}

/**
 * Renders a sidebar for a Helm Release resource.
 */
export const ReleaseSidebar: React.FC<Props> = ({ ctx }) => (
  <ReleaseSidebarContent
    key={JSON.stringify([ctx.resource?.key ?? '', String(ctx.data?.version ?? 0n)])}
    ctx={ctx}
  />
);

// A release revision owns its cached reads and diff/upgrade dialog state.
const ReleaseSidebarContent: React.FC<Props> = ({ ctx }) => {
  // Per-action cached tab data
  const [tabData, setTabData] = React.useState<Record<string, TabDataEntry>>({});
  const tabCacheRef = React.useRef<Record<string, TabDataEntry>>({});
  const [activeTab, setActiveTab] = React.useState('0');
  const [showManifestDiff, setShowManifestDiff] = React.useState(false);
  const [prevManifest, setPrevManifest] = React.useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = React.useState(false);

  const connectionID = ctx.resource?.route.connection ?? '';
  const releaseName = ctx.resource?.reference.address.id ?? '';
  const namespace = ctx.resource?.reference.address.scope.find((entry) => entry.dimension === 'namespace')?.value ?? '';
  const valuesPath = useResourceEditorModelPath({
    pluginID: PLUGIN_ID, route: ctx.resource?.route ?? { connection: connectionID }, type: 'helm:releases',
    key: `${namespace}/${releaseName}`, name: 'values-preview',
  });
  const { executeAction, isExecuting } = useExecuteAction({ pluginID: PLUGIN_ID });
  const resource = ctx.resource;
  const runAction = React.useCallback((action: string, input = jsonToValue({})) => {
    if (!resource) return Promise.reject(new Error('Release reference is unavailable'));
    return executeAction({ route: resource.route, reference: resource.reference, action, input });
  }, [executeAction, resource]);
  const { showResourceSidebar } = useRightDrawer();
  const executeReleaseRead = React.useEffectEvent(runAction);

  // Reads commit only after external completion, never from the effect body.
  // Failed actions remain retryable when the user revisits the tab.
  React.useEffect(() => {
    const tabActions = [
      'get-values',
      'get-manifest',
      'get-notes',
      'get-hooks',
      'get-history',
      'get-manifest',
    ];
    const actionID = tabActions[Number(activeTab)];
    if (!actionID || !connectionID || !releaseName || tabCacheRef.current[actionID]) return;
    let cancelled = false;
    void executeReleaseRead(actionID)
      .then((result) => {
        if (cancelled) return;
        const entry = helmActionData(result) as TabDataEntry;
        tabCacheRef.current[actionID] = entry;
        setTabData((prev) => ({ ...prev, [actionID]: entry }));
      })
      .catch(() => {
        if (cancelled) return;
        setTabData((prev) => ({ ...prev, [actionID]: null }));
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, connectionID, releaseName, namespace]);

  // Load previous revision manifest for diff
  const loadPrevManifest = React.useCallback(async () => {
    const revision = ctx.data?.version ?? 0n;
    if (revision <= 1) return;
    try {
      const result = await runAction('get-manifest', jsonToValue({ revision: revision - 1n }));
      const manifestData = helmActionData(result) as ManifestActionData | undefined;
      setPrevManifest(manifestData?.manifest ?? '');
    } catch {
      setPrevManifest('# Failed to load previous revision manifest');
    }
  }, [runAction, ctx.data?.version]);

  const handleToggleDiff = React.useCallback(() => {
    if (!showManifestDiff && prevManifest === null) {
      void loadPrevManifest();
    }
    setShowManifestDiff((prev) => !prev);
  }, [showManifestDiff, prevManifest, loadPrevManifest]);

  if (!ctx.data || !ctx.resource) {
    return null;
  }

  const data = ctx.data;
  const status = data.info?.status ?? 'unknown';
  const chartName = data.chart?.metadata?.name ?? '';
  const chartVersion = data.chart?.metadata?.version ?? '';
  const appVersion = data.chart?.metadata?.appVersion ?? '';
  const revision = data.version ?? 0n;
  const lastDeployed = data.info?.last_deployed ?? '';

  const manifestEntry = tabData['get-manifest'] as ManifestActionData | null | undefined;
  const currentManifest = manifestEntry?.manifest ?? '';
  const manifestResources = parseManifestResources(currentManifest);

  const valuesEntry = tabData['get-values'] as ValuesActionData | null | undefined;
  const notesEntry = tabData['get-notes'] as NotesActionData | null | undefined;
  const hooksEntry = tabData['get-hooks'] as HooksActionData | null | undefined;
  const historyEntry = tabData['get-history'] as HistoryActionData | null | undefined;

  return (
    <Stack direction="column" spacing={4} style={{ width: '100%' }}>
      {/* Header card */}
      <Card style={headerCardStyle} variant="outline">
        <Stack direction="column" spacing={2}>
          <Stack direction="row" justify="between" align="center">
            <Text weight="semibold" size="lg">
              {releaseName}
            </Text>
            <Chip size="sm" variant="soft" color={statusColorMap[status] ?? 'neutral'}>
              {status}
            </Chip>
          </Stack>
          <Separator />
          <MetaEntry label="Namespace" value={namespace} />
          <MetaEntry label="Chart" value={`${chartName}-${chartVersion}`} />
          <MetaEntry label="App Version" value={appVersion} />
          <MetaEntry label="Revision" value={String(revision)} />
          {lastDeployed && <MetaEntry label="Updated" value={lastDeployed} />}
        </Stack>
      </Card>

      {/* Action buttons */}
      <Stack direction="row" spacing={2}>
        <IconButton
          size="sm"
          variant="outline"
          color="brand"
          disabled={isExecuting}
          onClick={() => setShowUpgrade(true)}
          title="Upgrade Release"
          aria-label="Upgrade Release"
        >
          <LuCircleArrowUp />
        </IconButton>
        {revision > 1 && (
          <IconButton
            size="sm"
            variant="outline"
            color="warning"
            disabled={isExecuting}
            onClick={() =>
              void runAction('rollback', jsonToValue({ revision: revision - 1n }))
            }
            title="Rollback Release"
            aria-label="Rollback Release"
          >
            <LuUndo2 />
          </IconButton>
        )}
      </Stack>

      {/* Tabs */}
      <Tabs.Root variant="flat" value={activeTab} onValueChange={(v) => setActiveTab(String(v))}>
        <Tabs.List aria-label="Release details">
          <Tabs.Tab value="0">Values</Tabs.Tab>
          <Tabs.Tab value="1">Manifest</Tabs.Tab>
          <Tabs.Tab value="2">Notes</Tabs.Tab>
          <Tabs.Tab value="3">Hooks</Tabs.Tab>
          <Tabs.Tab value="4">History</Tabs.Tab>
          <Tabs.Tab value="5">Resources</Tabs.Tab>
          <Tabs.Indicator />
        </Tabs.List>
      </Tabs.Root>

      {/* Values - Monaco editor */}
      {activeTab === '0' && (
        <div style={editorBoxStyle}>
          <CodeEditor
            filename="values.yaml"
            path={valuesPath}
            language="yaml"
            value={valuesEntry ? stringify(valuesEntry.values ?? {}) : '# Loading...'}
            readOnly
            height={400}
          />
        </div>
      )}

      {/* Manifest - Monaco with diff toggle */}
      {activeTab === '1' && (
        <div>
          {revision > 1 && (
            <Stack direction="row" spacing={2} style={diffButtonRowStyle}>
              <Button
                size="sm"
                variant={showManifestDiff ? 'solid' : 'outline'}
                color="neutral"
                disabled={isExecuting}
                onClick={handleToggleDiff}
                startDecorator={<LuGitCompare size={14} />}
              >
                {showManifestDiff ? 'Hide Diff' : 'Diff with Previous'}
              </Button>
            </Stack>
          )}
          <div style={editorBoxStyle}>
            <CodeEditor
              filename="manifest.yaml"
              language="yaml"
              value={currentManifest || '# Loading...'}
              readOnly
              diff={showManifestDiff && prevManifest !== null}
              original={prevManifest ?? ''}
              height={400}
            />
          </div>
        </div>
      )}

      {/* Notes */}
      {activeTab === '2' && <pre style={notesStyle}>{notesEntry?.notes ?? 'No release notes'}</pre>}

      {/* Hooks */}
      {activeTab === '3' &&
        (hooksEntry?.hooks?.length ? (
          <Stack direction="column" spacing={2}>
            {hooksEntry.hooks.map((hook) => (
              <Card key={hook.name} variant="outline" style={itemCardStyle}>
                <Text weight="semibold" size="sm" style={blockTextStyle}>
                  {hook.name}
                </Text>
                <Text size="xs" tone="muted" style={blockTextStyle}>
                  Kind: {hook.kind} | Weight: {String(hook.weight)}
                </Text>
                {hook.events && (
                  <Stack direction="row" spacing={1} wrap style={{ marginTop: 4 }}>
                    {hook.events.map((e) => (
                      <Chip key={e} size="sm" variant="soft">
                        {e}
                      </Chip>
                    ))}
                  </Stack>
                )}
              </Card>
            ))}
          </Stack>
        ) : (
          <Text size="sm" tone="muted">
            No hooks
          </Text>
        ))}

      {/* History */}
      {activeTab === '4' &&
        (historyEntry?.revisions?.length ? (
          <Stack direction="column" spacing={2}>
            {historyEntry.revisions.map((rev) => (
              <Card key={String(rev.version)} variant="outline" style={itemCardStyle}>
                <Stack direction="row" justify="between" align="center">
                  <Text weight="semibold" size="sm">
                    Revision {String(rev.version)}
                  </Text>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={statusColorMap[rev.info?.status ?? ''] ?? 'neutral'}
                  >
                    {rev.info?.status ?? ''}
                  </Chip>
                </Stack>
                <Text size="xs" tone="muted" style={blockTextStyle}>
                  {rev.info?.description ?? ''}
                </Text>
                {rev.version !== revision && (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    color="warning"
                    disabled={isExecuting}
                    onClick={() =>
                      void runAction('rollback', jsonToValue({ revision: rev.version }))
                    }
                    title={`Rollback to revision ${rev.version}`}
                    aria-label={`Rollback to revision ${rev.version}`}
                    style={{ marginTop: 4 }}
                  >
                    <LuUndo2 size={14} />
                  </IconButton>
                )}
              </Card>
            ))}
          </Stack>
        ) : (
          <Text size="sm" tone="muted">
            No history
          </Text>
        ))}

      {/* Resources - parsed from manifest */}
      {activeTab === '5' &&
        (manifestResources.length > 0 ? (
          <Stack direction="column" spacing={1}>
            {manifestResources.map((res) => (
              <Card
                key={`${res.apiGroup}/${res.kind}/${res.namespace ?? namespace}/${res.name}`}
                className={styles.resourceCard}
                variant="outline"
                onClick={() => {
                  const type = kindToType[`${res.apiGroup}/${res.kind}`];
                  if (!type) return;
                  const clusterScoped = ['Namespace', 'ClusterRole', 'ClusterRoleBinding'].includes(res.kind);
                  void ResourceClient.ResolveReference(PLUGIN_ID, {
                    route: ctx.resource!.route, type, id: res.name,
                    scope: clusterScoped ? [] : [{ dimension: 'namespace', value: res.namespace ?? namespace }],
                  }).then((resolved) => showResourceSidebar({
                    pluginID: PLUGIN_ID, reference: resolved.reference, route: resolved.route,
                    representation: resolved.representation, targetId: resolved.targetId, resourceName: res.name,
                  })).catch((err: unknown) => {
                    console.error('[ReleaseSidebar] Failed to open resource sidebar', err);
                  });
                }}
              >
                <Stack direction="row" spacing={2} align="center">
                  <Chip size="sm" variant="soft" color="neutral">
                    {res.kind}
                  </Chip>
                  <Text size="sm" weight="semibold">
                    {res.name}
                  </Text>
                  {res.namespace && (
                    <Text size="xs" tone="subtle">
                      {res.namespace}
                    </Text>
                  )}
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <Text size="sm" tone="muted">
            {manifestEntry ? 'No resources found in manifest' : 'Loading manifest...'}
          </Text>
        ))}

      {/* Upgrade Dialog */}
      <UpgradeDialog
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        releaseName={releaseName}
        namespace={namespace}
        chartRef={`${chartName}`}
        connectionID={connectionID}
      />
    </Stack>
  );
};

ReleaseSidebar.displayName = 'ReleaseSidebar';
export default ReleaseSidebar;
