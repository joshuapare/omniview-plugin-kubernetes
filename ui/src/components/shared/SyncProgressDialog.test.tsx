import React from 'react';
import type * as Runtime from '@omniviewdev/runtime';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@omniviewdev/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof Runtime>();
  return {
    ...actual,
    useSourceStates: () => ({ summary: { types: {
      'wide-native': { state: 'following', count: { kind: 'exact', value: '9007199254740993' } },
      'unknown-native': { state: 'following', count: { kind: 'unknown' } },
      'estimated-native': { state: 'following', count: { kind: 'estimate', value: '9007199254740995' } },
      'zero-native': { state: 'following', count: { kind: 'exact', value: '0' } },
    } } }),
    useResourceTypes: () => ({ resourceTypes: { data: [] } }),
    useResourceGroups: () => ({ groups: { data: [] } }),
  };
});

import SyncProgressDialog from './SyncProgressDialog';

afterEach(cleanup);

describe('sync count presentation', () => {
  it('keeps wide counts exact and distinguishes unknown, estimated, and known zero', () => {
    render(<SyncProgressDialog open onClose={() => {}} clusterName="Owned fixture" pluginID="kubernetes" connectionID="fixture" />);
    expect(screen.getByText('9007199254740993')).toBeInTheDocument();
    expect(screen.getByText('~9007199254740995')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('0', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('9007199254740992')).not.toBeInTheDocument();
  });
});
