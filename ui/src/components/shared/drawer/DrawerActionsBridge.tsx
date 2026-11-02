import {
  useConfirmationModal,
  useExec,
  useExecuteAction,
  useLogs,
  useNativeExec,
  useResourceMutations,
  useRightDrawer,
  useStreamAction,
  jsonToValue,
} from '@omniviewdev/runtime';
import React from 'react';

import { useDebugActions } from '../../../features/debug/useDebugActions';
import { useClusterPreferences } from '../../../hooks/useClusterPreferences';
import ScaleModal from '../../kubernetes/actions/ScaleModal';

import { type DrawerActionDeps, registerDrawerActionDeps, registryKey, type ScaleTarget } from './actionDeps';

import { PLUGIN_ID } from '@/pluginId';


/** Mounts the hook-backed handlers that drawer actions use; see `actionDeps.ts`. */
type BridgeProps = {
  connectionID: string;
  resourceKey: string;
};

export const useDrawerActionExecution = ({ connectionID, resourceKey }: BridgeProps) => {
  const { show } = useConfirmationModal();
  const { mutate } = useResourceMutations({ pluginID: PLUGIN_ID });
  const { createLogSession } = useLogs({ pluginID: PLUGIN_ID });
  const { createSession } = useExec({ pluginID: PLUGIN_ID });
  const { openNativeSession, isSupported: nativeExecAvailable, isPending: nativeExecPending } = useNativeExec({ pluginID: PLUGIN_ID, resourceKey });
  const { executeAction, isExecuting } = useExecuteAction({ pluginID: PLUGIN_ID });
  const { startStreamAction } = useStreamAction({ pluginID: PLUGIN_ID });
  const { closeDrawer } = useRightDrawer();
  const { connectionOverrides } = useClusterPreferences(PLUGIN_ID);
  const nodeShellConfig = connectionOverrides[connectionID]?.nodeShellConfig;
  const debugTransport = React.useMemo(() => ({ executeAction, createExecSession: createSession }), [executeAction, createSession]);
  const debug = useDebugActions(connectionID, debugTransport);

  const [scaleTarget, setScaleTarget] = React.useState<ScaleTarget | null>(null);

  const deps = React.useMemo<DrawerActionDeps>(
    () => ({
      show,
      mutate,
      createLogSession,
      createExecSession: createSession,
      nativeExecAvailable,
      nativeExecPending,
      openNativeSession,
      executeAction,
      startStreamAction,
      closeDrawer,
      openScale: setScaleTarget,
      nodeShellConfig,
      startDebug: debug.startDebug,
      openDebugOptions: debug.openDebugOptions,
    }),
    [show, mutate, createLogSession, createSession, nativeExecAvailable, nativeExecPending, openNativeSession, executeAction, startStreamAction, closeDrawer, nodeShellConfig, debug.startDebug, debug.openDebugOptions],
  );


  const dialogs = scaleTarget ? (
    <ScaleModal
      open
      onClose={() => setScaleTarget(null)}
      onConfirm={(replicas) => {
        void executeAction({
          action: 'scale',
          reference: scaleTarget.resource.reference,
          route: scaleTarget.resource.route,
          input: jsonToValue({ replicas }),
        }).then(() => {
          setScaleTarget(null);
          closeDrawer();
        });
      }}
      resourceType={resourceKey}
      resourceName={scaleTarget.name}
      currentReplicas={scaleTarget.replicas}
      isExecuting={isExecuting}
    />
  ) : null;
  return { deps, dialogs: <>{dialogs}{debug.dialogs}</>, isReady: debug.isReady, isBusy: scaleTarget !== null || isExecuting || debug.isBusy || nativeExecPending };
};

const DrawerActionsBridge: React.FC<BridgeProps> = (props) => {
  const { deps, dialogs } = useDrawerActionExecution(props);
  React.useEffect(
    () => registerDrawerActionDeps(registryKey(props.connectionID, props.resourceKey), deps),
    [props.connectionID, props.resourceKey, deps],
  );
  return dialogs;
};

export default DrawerActionsBridge;
