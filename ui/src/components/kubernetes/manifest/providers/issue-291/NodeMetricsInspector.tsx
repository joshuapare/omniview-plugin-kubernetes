import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import MetricsInspector from './MetricsInspector';

export default function NodeMetricsInspector(props: ResourceEditorFormProps) {
  return <MetricsInspector {...props} metricsKind="NodeMetrics" />;
}
