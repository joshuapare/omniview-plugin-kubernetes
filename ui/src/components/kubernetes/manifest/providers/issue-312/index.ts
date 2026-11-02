import { lazy } from 'react';
import type { ResourceEditorContribution } from '@omniviewdev/runtime';
import { notificationReadOnly, notificationUnavailable, validateNotification } from './model';

const component = lazy(() => import('./NotificationForms'));
const group = 'notification.toolkit.fluxcd.io';
export const resourceEditors: readonly ResourceEditorContribution[] = [
  {
    contractVersion: 1, label: 'Flux Alert', targets: [{group,version:'v1beta3',kind:'Alert',resource:'alerts',scope:'Namespaced'}],
    ownershipPolicy: 'declarative',
    intents: ['create','edit','inspect'], sections: [{id:'configuration',label:'Events'},{id:'advanced',label:'Advanced'}],
    ownedPaths: ['providerRef','eventSeverity','eventSources','inclusionList','exclusionList','eventMetadata','summary','suspend'].map(field => ['spec',field]),
    component, validate: validateNotification, readOnly: notificationReadOnly, formUnavailable: notificationUnavailable,
  },
  {
    contractVersion: 1, label: 'Flux notification Provider', targets: [{group,version:'v1beta3',kind:'Provider',resource:'providers',scope:'Namespaced'}],
    intents: ['create','edit','inspect'], sections: [{id:'configuration',label:'Destination'},{id:'advanced',label:'Advanced'}],
    ownershipPolicy: 'declarative',
    ownedPaths: ['type','address','channel','secretRef','proxySecretRef','certSecretRef','timeout','serviceAccountName','commitStatusExpr','suspend'].map(field => ['spec',field]),
    sensitivePaths: [['spec','address'],['spec','proxy'],['spec','username']],
    component, validate: validateNotification, readOnly: notificationReadOnly, formUnavailable: notificationUnavailable,
  },
  {
    contractVersion: 1, label: 'Flux Receiver', targets: [{group,version:'v1',kind:'Receiver',resource:'receivers',scope:'Namespaced'}],
    intents: ['create','edit','inspect'], sections: [{id:'configuration',label:'Webhook'},{id:'advanced',label:'Advanced'},{id:'observations',label:'Readiness'}],
    ownedPaths: ['type','secretRef','events','resources','interval','resourceFilter','suspend'].map(field => ['spec',field]),
    ownershipPolicy: 'declarative',
    sensitivePaths: [['status','webhookPath']],
    component, validate: validateNotification, readOnly: notificationReadOnly, formUnavailable: notificationUnavailable,
  },
];
