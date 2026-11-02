import type { ResourceEditorActionResult, ResourceEditorPath } from '@omniviewdev/runtime';
import { projectResourceEditorValue } from './resourceEditorController';

/** Sensitive transport results stay host-private; providers receive only detached safe projections. */
export function projectEditorActionResult(result: ResourceEditorActionResult, protocol: string, sensitivePaths: readonly ResourceEditorPath[] = []): ResourceEditorActionResult {
  if (result.status !== 'ready') return { ...result, message: result.status === 'cancelled' ? 'Request cancelled.' : result.status === 'denied' ? 'Request denied by server policy.' : result.status === 'absent' ? 'Requested API or object is absent.' : 'Request unavailable. Check target and server policy.' };
  const masks: ResourceEditorPath[] = [...sensitivePaths, ...sensitivePaths.map((path) => ['items', '*', ...path])];
  if (protocol === 'kubernetes.review.v1') masks.push(['spec'], ['status', 'user'], ['status', 'userInfo'], ['status', 'reason'], ['status', 'evaluationError'], ['status', 'error']);
  if (protocol === 'kubernetes.service-account-token.v1') masks.push(['spec'], ['status', 'token']);
  return { status: 'ready', output: projectResourceEditorValue(result.output, masks), ...(result.sensitive ? { sensitive: true } : {}) };
}
