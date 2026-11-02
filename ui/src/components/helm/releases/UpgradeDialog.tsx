import { Button, Checkbox, Dialog, Stack, Text } from '@omniviewdev/base-ui';
import { jsonToValue, useExecuteAction, useResourceEditorModelPath } from '@omniviewdev/runtime';
import { ResourceClient } from '@omniviewdev/runtime/api';
import React from 'react';
import { stringify } from 'yaml';

import { PLUGIN_ID } from '@/pluginId';

import CodeEditor from '../../shared/CodeEditor';
import { helmActionData, helmValues } from '../values';

const dialogStyle: React.CSSProperties = { width: '80%', maxWidth: 800, maxHeight: '85vh' };
const valuesEditorStyle: React.CSSProperties = {
  height: 250,
  border: '1px solid var(--ov-color-border-default)',
  borderRadius: 4,
  overflow: 'hidden',
};
const dryRunEditorStyle: React.CSSProperties = {
  height: 200,
  border: '1px solid var(--ov-color-border-default)',
  borderRadius: 4,
  overflow: 'hidden',
};

interface Props {
  open: boolean;
  onClose: () => void;
  releaseName: string;
  namespace: string;
  chartRef: string;
  connectionID: string;
}

/** Data returned by the `dry-run-upgrade` action. */
interface DryRunUpgradeData {
  manifest?: string;
}

const UpgradeDialog: React.FC<Props> = ({
  open,
  onClose,
  releaseName,
  namespace,
  chartRef,
  connectionID,
}) => {
  const [values, setValues] = React.useState('');
  const [reuseValues, setReuseValues] = React.useState(true);
  const [dryRunManifest, setDryRunManifest] = React.useState<string | null>(null);
  const [valuesLoaded, setValuesLoaded] = React.useState(false);

  const editorPath = useResourceEditorModelPath({
    pluginID: PLUGIN_ID, route: { connection: connectionID }, type: 'helm:releases',
    key: `${namespace}/${releaseName}`, name: 'values',
  });
  const { executeAction, isExecuting } = useExecuteAction({ pluginID: PLUGIN_ID });
  const runAction = async (action: string, input = jsonToValue({})) => {
    const resolved = await ResourceClient.ResolveReference(PLUGIN_ID, {
      route: { connection: connectionID }, type: 'helm:releases', id: releaseName,
      scope: [{ dimension: 'namespace', value: namespace }],
    });
    return executeAction({ route: resolved.route, reference: resolved.reference, action, input });
  };

  // Load current values on open
  React.useEffect(() => {
    if (!open || !releaseName || valuesLoaded) return;

    void runAction('get-values', jsonToValue({ all: true }))
      .then((result) => {
        const data = helmActionData(result) as { values?: unknown } | undefined;
        setValues(data?.values ? stringify(data.values) : '');
        setValuesLoaded(true);
      })
      .catch(() => {
        setValuesLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, releaseName]);

  const handleDryRun = async () => {
    try {
      const result = await runAction('dry-run-upgrade', jsonToValue({
        chart: chartRef, reuse_values: reuseValues, values: helmValues(values),
      }));
      const dryRunData = helmActionData(result) as DryRunUpgradeData | undefined;
      setDryRunManifest(dryRunData?.manifest ?? 'No manifest generated');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Dry run failed';
      setDryRunManifest(`Error: ${message}`);
    }
  };

  const handleUpgrade = async () => {
    try {
      await runAction('upgrade', jsonToValue({
        chart: chartRef, reuse_values: reuseValues, values: helmValues(values),
      }));
      onClose();
    } catch (error: unknown) {
      setDryRunManifest(`Error: ${error instanceof Error ? error.message : 'Upgrade failed'}`);
    }
  };

  const handleClose = () => {
    setDryRunManifest(null);
    setValuesLoaded(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} size="xl" style={dialogStyle}>
      <Dialog.Title>Upgrade {releaseName}</Dialog.Title>
      <Dialog.Body>
        <Stack direction="column" spacing={4}>
          {/* Options */}
          <Stack direction="row" spacing={4} align="center">
            <Checkbox
              size="sm"
              checked={reuseValues}
              onCheckedChange={(checked) => setReuseValues(checked)}
            >
              Reuse existing values
            </Checkbox>
          </Stack>

          {/* Values editor */}
          <Stack direction="column" spacing={1}>
            <Text size="sm" tone="muted">
              Values (YAML)
            </Text>
            <div style={valuesEditorStyle}>
              <CodeEditor
                filename="values.yaml"
                path={editorPath}
                language="yaml"
                value={values}
                onChange={(v) => setValues(v)}
                height={250}
              />
            </div>
          </Stack>

          {/* Dry run preview */}
          {dryRunManifest !== null && (
            <Stack direction="column" spacing={1}>
              <Text size="sm" tone="muted">
                Dry Run Preview
              </Text>
              <div style={dryRunEditorStyle}>
                <CodeEditor
                  filename="manifest.yaml"
                  language="yaml"
                  value={dryRunManifest}
                  readOnly
                  height={200}
                />
              </div>
            </Stack>
          )}
        </Stack>
      </Dialog.Body>

      {/* Action buttons */}
      <Dialog.Footer>
        <Button size="sm" variant="outline" color="neutral" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="outline"
          color="neutral"
          disabled={isExecuting}
          onClick={() => void handleDryRun()}
        >
          Dry Run
        </Button>
        <Button
          size="sm"
          variant="solid"
          color="brand"
          disabled={isExecuting}
          onClick={() => void handleUpgrade()}
        >
          Upgrade
        </Button>
      </Dialog.Footer>
    </Dialog>
  );
};

export default UpgradeDialog;
