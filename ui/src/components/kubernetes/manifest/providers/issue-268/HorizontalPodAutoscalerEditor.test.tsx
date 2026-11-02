import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceEditorController } from '../../resourceEditorController';
import HorizontalPodAutoscalerEditor from './HorizontalPodAutoscalerEditor';
import { hpaFixture, hpaFixtureContext } from './fixtures';
import { resourceEditors } from './index';

function BoundsFixture({ controller, report }: { controller: ResourceEditorController; report(error: string | null): void }) {
  const [, rerender] = useState(0);
  return <HorizontalPodAutoscalerEditor context={hpaFixtureContext} draft={controller.draft()} section="bounds" disabled={false} onValidityChange={report}
    patch={request => { const result = controller.patch(request, resourceEditors[0], hpaFixtureContext); if (result.status === 'accepted') rerender(count => count + 1); return result; }}
    references={{ list: async () => ({ status: 'ready', items: [] }) }} actions={{ execute: async () => ({ status: 'unavailable', message: 'Fixture has no live action.' }) }} />;
}
describe('HPA local field behavior', () => {
  it('retains partial numeric text and old source through a sibling edit', () => {
    const controller = new ResourceEditorController(hpaFixture, 'partial');
    const report = vi.fn();
    render(<BoundsFixture controller={controller} report={report} />);
    fireEvent.change(screen.getByLabelText('Maximum replicas'), { target: { value: '1e' } });
    expect((screen.getByLabelText('Maximum replicas') as HTMLInputElement).value).toBe('1e');
    expect(controller.draft().get(['spec', 'maxReplicas'])).toBe(12n);
    fireEvent.change(screen.getByLabelText('Minimum replicas'), { target: { value: '3' } });
    expect(controller.draft().get(['spec', 'minReplicas'])).toBe(3n);
    expect((screen.getByLabelText('Maximum replicas') as HTMLInputElement).value).toBe('1e');
    expect(report).toHaveBeenLastCalledWith(expect.stringContaining('whole number'));
    fireEvent.change(screen.getByLabelText('Maximum replicas'), { target: { value: '20' } });
    expect(controller.draft().get(['spec', 'maxReplicas'])).toBe(20n);
    expect(report).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByLabelText('Maximum replicas'), { target: { value: '1' } });
    expect(controller.draft().get(['spec', 'maxReplicas'])).toBe(20n);
    expect(report).toHaveBeenLastCalledWith('Maximum must not be below minimum.');
  });
  it('omits optional minimum without rewriting other fields', () => {
    const controller = new ResourceEditorController(hpaFixture, 'omit');
    render(<BoundsFixture controller={controller} report={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Minimum replicas'), { target: { value: '' } });
    expect(controller.draft().has(['spec', 'minReplicas'])).toBe(false);
    expect(controller.draft().get(['spec', 'maxReplicas'])).toBe(12n);
    expect(controller.getSource()).toContain('# capacity ceiling');
  });
});
