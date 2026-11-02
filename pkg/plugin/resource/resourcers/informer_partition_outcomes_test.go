package resourcers

import (
	"context"
	"fmt"
	"testing"
	"time"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/stretchr/testify/require"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	fakedynamic "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestInformerPartitionEmptySelection(t *testing.T) {
	cs := newWatchableClientSet(defaultGVRListKinds())
	t.Cleanup(cs.ShutdownInformers)
	target := testWatchTarget()
	values := []string{}
	target.Scope = resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeOneOf, Values: &values}}
	sink := newRecordingSink()
	err := newBaseResourcer().Watch(context.Background(), cs, target, testWatchRepresentation(), sink)
	require.Error(t, err)
	require.Equal(t, "INVALID_REQUEST", resource.ErrorCode(err))
	require.Empty(t, cs.DynamicClient.(*fakedynamic.FakeDynamicClient).Actions())
	require.Empty(t, sink.states)
}

// TestInformerPartitionOutcomes checks the aggregate state emitted by real Watch
// consumers when namespace informers succeed or fail independently.
func TestInformerPartitionOutcomes(t *testing.T) {
	for _, tc := range []struct {
		name       string
		namespaces []string
		objects    []runtime.Object
		failureNS  string
		failure    error
		state      resource.WatchState
		count      string
		code       string
	}{
		{name: "empty cluster", state: resource.WatchStateSynced, count: "0"},
		{name: "empty scoped namespace", namespaces: []string{"team-a"}, state: resource.WatchStateSynced, count: "0"},
		{name: "scoped count", namespaces: []string{"team-a", "team-b"}, objects: []runtime.Object{newTestPod("a", "team-a"), newTestPod("b", "team-b"), newTestPod("outside", "team-c")}, state: resource.WatchStateSynced, count: "2"},
		{name: "unsupported resource skipped", failure: apierrors.NewNotFound(testGVR.GroupResource(), ""), state: resource.WatchStateSkipped, code: "NOT_FOUND"},
		{name: "scoped forbidden", namespaces: []string{"team-a"}, failureNS: "team-a", failure: apierrors.NewForbidden(testGVR.GroupResource(), "", fmt.Errorf("denied")), state: resource.WatchStateForbidden, code: "FORBIDDEN"},
		{name: "scoped error", namespaces: []string{"team-a"}, failureNS: "team-a", failure: fmt.Errorf("list failed"), state: resource.WatchStateError, code: "UNKNOWN"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cs := newWatchableClientSet(defaultGVRListKinds(), tc.objects...)
			client := cs.DynamicClient.(*fakedynamic.FakeDynamicClient)
			if tc.failure != nil {
				client.PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
					if action.GetNamespace() == tc.failureNS {
						return true, nil, tc.failure
					}
					return false, nil, nil
				})
			}
			target := testWatchTarget()
			if tc.namespaces != nil {
				values := tc.namespaces
				target.Scope = resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeOneOf, Values: &values}}
			}
			ctx, cancel := context.WithCancel(context.Background())
			sink := newRecordingSink()
			done := make(chan error, 1)
			go func() { done <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), sink) }()
			t.Cleanup(func() {
				cancel()
				select {
				case <-done:
				case <-time.After(5 * time.Second):
					t.Error("watch did not stop")
				}
				cs.ShutdownInformers()
			})

			var terminal resource.WatchStateEvent
			require.Eventually(t, func() bool {
				sink.mu.Lock()
				defer sink.mu.Unlock()
				for _, event := range sink.states {
					if event.State == resource.WatchStateSynced || event.State == resource.WatchStateSkipped || event.State == resource.WatchStateForbidden || event.State == resource.WatchStateError {
						terminal = event
						return true
					}
				}
				return false
			}, 35*time.Second, 10*time.Millisecond)
			count := "<nil>"
			if terminal.Count.Value != nil {
				count = *terminal.Count.Value
			}
			t.Logf("observed state=%v count_kind=%s count=%s error_nil=%t", terminal.State, terminal.Count.Kind, count, terminal.Error == nil)
			require.Equal(t, target.Route, terminal.Route)
			require.Equal(t, target.Type, terminal.Type)
			require.Equal(t, resource.BestEffortGuarantee, terminal.Guarantee)
			require.Equal(t, tc.state, terminal.State, "aggregate state must disclose failed scoped partitions")
			if tc.state == resource.WatchStateSynced {
				require.Equal(t, "estimate", terminal.Count.Kind)
				require.NotNil(t, terminal.Count.Value)
				require.Equal(t, tc.count, *terminal.Count.Value)
				require.Nil(t, terminal.Error)
			} else {
				require.Equal(t, "unknown", terminal.Count.Kind)
				require.Nil(t, terminal.Count.Value)
				require.NotNil(t, terminal.Error)
				require.Equal(t, tc.code, terminal.Error.Code)
			}
		})
	}
}
