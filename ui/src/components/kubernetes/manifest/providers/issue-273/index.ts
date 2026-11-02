import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { GROUP, systemOwned, unavailable, validate } from './model';

const RoleEditor = lazy(() => import('./RbacRoleForm'));
const BindingEditor = lazy(() => import('./RbacBindingForm'));

export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    label: 'Role permissions',
    targets: [{ group: GROUP, version: 'v1', kind: 'Role', resource: 'roles', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'],
    sections: [{ id: 'permissions', label: 'Permissions' }],
    ownedPaths: [['rules']],
    component: RoleEditor,
    validate,
    formUnavailable: unavailable,
    readOnly: (draft, context) => systemOwned(draft) || context.ownership?.status === 'system' || context.ownership?.status === 'controller',
  },
  {
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    label: 'ClusterRole permissions',
    targets: [{ group: GROUP, version: 'v1', kind: 'ClusterRole', resource: 'clusterroles', scope: 'Cluster' }],
    intents: ['create', 'edit', 'inspect'],
    sections: [{ id: 'permissions', label: 'Permissions' }],
    ownedPaths: [['rules'], ['aggregationRule']],
    component: RoleEditor,
    validate,
    formUnavailable: unavailable,
    readOnly: (draft, context) => systemOwned(draft) || context.ownership?.status === 'system' || context.ownership?.status === 'controller',
  },
  {
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    label: 'RoleBinding grant',
    targets: [{ group: GROUP, version: 'v1', kind: 'RoleBinding', resource: 'rolebindings', scope: 'Namespaced' }],
    intents: ['create', 'edit', 'inspect'],
    sections: [{ id: 'grant', label: 'Role and subjects' }],
    ownedPaths: [['roleRef'], ['subjects']],
    component: BindingEditor,
    validate,
    formUnavailable: unavailable,
    readOnly: (draft, context) => systemOwned(draft) || context.ownership?.status === 'system' || context.ownership?.status === 'controller',
  },
  {
    contractVersion: 1,
    ownershipPolicy: 'declarative',
    label: 'ClusterRoleBinding grant',
    targets: [{ group: GROUP, version: 'v1', kind: 'ClusterRoleBinding', resource: 'clusterrolebindings', scope: 'Cluster' }],
    intents: ['create', 'edit', 'inspect'],
    sections: [{ id: 'grant', label: 'Role and subjects' }],
    ownedPaths: [['roleRef'], ['subjects']],
    component: BindingEditor,
    validate,
    formUnavailable: unavailable,
    readOnly: (draft, context) => systemOwned(draft) || context.ownership?.status === 'system' || context.ownership?.status === 'controller',
  },
];
