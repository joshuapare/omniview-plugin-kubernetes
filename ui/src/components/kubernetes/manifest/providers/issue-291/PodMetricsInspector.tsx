import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import MetricsInspector from './MetricsInspector';

export default function PodMetricsInspector(props: ResourceEditorFormProps) {
  return <MetricsInspector {...props} metricsKind="PodMetrics" />;
}
