package resourcers

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	fakedynamic "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/cache"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
)

// newWatchableClientSet creates native clients; Watch acquires its own sources.
func newWatchableClientSet(gvrToListKind map[schema.GroupVersionResource]string, objects ...runtime.Object) *clients.ClientSet {
	scheme := runtime.NewScheme()
	dynamicClient := fakedynamic.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind, objects...)

	return &clients.ClientSet{
		DynamicClient: dynamicClient,
	}
}

func TestWatch_EmitsAddEvents(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cs := newWatchableClientSet(defaultGVRListKinds(),
		newTestPod("pod-a", "default"),
		newTestPod("pod-b", "default"))
	r := newBaseResourcer()
	sink := newRecordingSink()
	meta := testWatchTarget()

	done := make(chan error, 1)
	go func() {
		done <- r.Watch(ctx, cs, meta, testWatchRepresentation(), sink)
	}()

	sink.WaitForState(t, meta.Type, resource.WatchStateSynced, 5*time.Second)

	// The two pre-existing pods should be burst as ADDs after sync.
	sink.WaitForAdds(t, 2, 5*time.Second)

	cancel()
	err := <-done
	assert.NoError(t, err)
}

func TestWatch_EmitsDeleteEvents(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cs := newWatchableClientSet(defaultGVRListKinds(),
		newTestPod("doomed", "default"))
	r := newBaseResourcer()
	sink := newRecordingSink()
	meta := testWatchTarget()

	done := make(chan error, 1)
	go func() {
		done <- r.Watch(ctx, cs, meta, testWatchRepresentation(), sink)
	}()

	sink.WaitForState(t, meta.Type, resource.WatchStateSynced, 5*time.Second)

	// Delete the pod via the dynamic client.
	err := cs.DynamicClient.Resource(testGVR).Namespace("default").Delete(ctx, "doomed", metav1.DeleteOptions{})
	require.NoError(t, err)

	sink.WaitForDeletes(t, 1, 5*time.Second)

	cancel()
	<-done
}

func TestWatch_EmitsStateChanges(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cs := newWatchableClientSet(defaultGVRListKinds())
	r := newBaseResourcer()
	sink := newRecordingSink()
	meta := testWatchTarget()

	done := make(chan error, 1)
	go func() {
		done <- r.Watch(ctx, cs, meta, testWatchRepresentation(), sink)
	}()

	// Should see Syncing → Synced state transitions.
	sink.WaitForState(t, meta.Type, resource.WatchStateSyncing, 5*time.Second)
	sink.WaitForState(t, meta.Type, resource.WatchStateSynced, 5*time.Second)

	cancel()
	<-done
}

func TestWatch_CancelContextStops(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	cs := newWatchableClientSet(defaultGVRListKinds())
	r := newBaseResourcer()
	sink := newRecordingSink()
	meta := testWatchTarget()

	done := make(chan error, 1)
	go func() {
		done <- r.Watch(ctx, cs, meta, testWatchRepresentation(), sink)
	}()

	sink.WaitForState(t, meta.Type, resource.WatchStateSynced, 5*time.Second)

	// Cancel → Watch should return.
	cancel()

	select {
	case err := <-done:
		assert.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("Watch did not return after context cancellation")
	}
}

func TestWatch_NewObjectAfterSync(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cs := newWatchableClientSet(defaultGVRListKinds())
	r := newBaseResourcer()
	sink := newRecordingSink()
	meta := testWatchTarget()

	done := make(chan error, 1)
	go func() {
		done <- r.Watch(ctx, cs, meta, testWatchRepresentation(), sink)
	}()

	sink.WaitForState(t, meta.Type, resource.WatchStateSynced, 5*time.Second)

	// Create a new object after sync — should produce an ADD event.
	newPod := &unstructured.Unstructured{}
	newPod.SetGroupVersionKind(schema.GroupVersionKind{Group: "", Version: "v1", Kind: "Pod"})
	newPod.SetName("new-pod")
	newPod.SetNamespace("default")
	_, err := cs.DynamicClient.Resource(testGVR).Namespace("default").Create(ctx, newPod, metav1.CreateOptions{})
	require.NoError(t, err)

	sink.WaitForAdds(t, 1, 5*time.Second)

	cancel()
	<-done
}

func TestWatch_AddPayloadCarriesMetadata(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Build an unstructured pod with uid, labels, and creationTimestamp.
	pod := &unstructured.Unstructured{Object: map[string]interface{}{
		"apiVersion": "v1",
		"kind":       "Pod",
		"metadata": map[string]interface{}{
			"name":              "meta-pod",
			"namespace":         "default",
			"uid":               "uid-abc-123",
			"creationTimestamp": "2026-01-15T10:30:00Z",
			"labels": map[string]interface{}{
				"app": "web",
				"env": "prod",
			},
		},
	}}

	cs := newWatchableClientSet(defaultGVRListKinds(), pod)
	r := newBaseResourcer()
	sink := newRecordingSink()
	meta := testWatchTarget()

	done := make(chan error, 1)
	go func() {
		done <- r.Watch(ctx, cs, meta, testWatchRepresentation(), sink)
	}()

	sink.WaitForState(t, meta.Type, resource.WatchStateSynced, 5*time.Second)
	sink.WaitForAdds(t, 1, 5*time.Second)

	cancel()
	require.NoError(t, <-done)
	// Cancellation retires handlers before inspecting recorded payloads.
	require.GreaterOrEqual(t, len(sink.Adds), 1)
	var payload resource.WatchAddPayload
	for _, a := range sink.Adds {
		if a.Record.Reference.Address.ID == "meta-pod" {
			payload = a
			break
		}
	}
	require.Equal(t, "meta-pod", payload.Record.Reference.Address.ID, "should find meta-pod in add events")
	assert.Equal(t, []resource.ScopeEntry{{Dimension: "namespace", Value: "default"}}, payload.Record.Reference.Address.Scope)
	require.NotNil(t, payload.Record.Reference.Incarnation)
	assert.Equal(t, "uid-abc-123", *payload.Record.Reference.Incarnation)
	assert.Equal(t, "web", payload.Metadata.Labels["app"])
	assert.Equal(t, "prod", payload.Metadata.Labels["env"])
	require.NotNil(t, payload.Metadata.CreatedAt, "CreatedAt should be non-nil")
	assert.Equal(t, 2026, payload.Metadata.CreatedAt.Year())

	assert.Equal(t, resource.BestEffortGuarantee, payload.Guarantee)
	assert.Equal(t, meta.Route, payload.Route)
	assert.Equal(t, meta.Authority, payload.Record.Reference.Address.Authority)
}

func TestWatch_SyncedStateHasResourceCount(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cs := newWatchableClientSet(defaultGVRListKinds(),
		newTestPod("a", "default"),
		newTestPod("b", "default"),
		newTestPod("c", "default"))
	r := NewKubernetesResourcerBase[MetaAccessor](zap.NewNop().Sugar(), testGVR)
	sink := newRecordingSink()
	meta := testWatchTarget()

	done := make(chan error, 1)
	go func() {
		done <- r.Watch(ctx, cs, meta, testWatchRepresentation(), sink)
	}()

	sink.WaitForState(t, meta.Type, resource.WatchStateSynced, 5*time.Second)

	// After synced, the 3 pre-existing pods should be burst as ADDs.
	sink.WaitForAdds(t, 3, 5*time.Second)
	assert.GreaterOrEqual(t, sink.StateCount(), 2, "should have at least Syncing + Synced states")

	cancel()
	<-done
	for _, state := range sink.states {
		if state.State == resource.WatchStateSynced {
			assert.Equal(t, "estimate", state.Count.Kind)
			require.NotNil(t, state.Count.Value)
			assert.Equal(t, "3", *state.Count.Value)
			assert.Equal(t, resource.BestEffortGuarantee, state.Guarantee)
		}
	}
}

// recordingSink records canonical payloads while native informers run.
type recordingSink struct {
	mu      sync.Mutex
	Adds    []resource.WatchAddPayload
	updates []resource.WatchUpdatePayload
	deletes []resource.WatchDeletePayload
	states  []resource.WatchStateEvent
}

func newRecordingSink() *recordingSink { return &recordingSink{} }
func (s *recordingSink) OnAdd(p resource.WatchAddPayload) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Adds = append(s.Adds, p)
}
func (s *recordingSink) OnUpdate(p resource.WatchUpdatePayload) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.updates = append(s.updates, p)
}
func (s *recordingSink) OnDelete(p resource.WatchDeletePayload) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deletes = append(s.deletes, p)
}
func (s *recordingSink) OnStateChange(p resource.WatchStateEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.states = append(s.states, p)
}
func (s *recordingSink) WaitForState(t *testing.T, typ string, state resource.WatchState, timeout time.Duration) {
	t.Helper()
	require.Eventually(t, func() bool {
		s.mu.Lock()
		defer s.mu.Unlock()
		for _, event := range s.states {
			if event.Type == typ && event.State == state {
				return true
			}
		}
		return false
	}, timeout, time.Millisecond*5)
}
func (s *recordingSink) WaitForAdds(t *testing.T, count int, timeout time.Duration) {
	t.Helper()
	require.Eventually(t, func() bool { s.mu.Lock(); defer s.mu.Unlock(); return len(s.Adds) >= count }, timeout, time.Millisecond*5)
}
func (s *recordingSink) WaitForDeletes(t *testing.T, count int, timeout time.Duration) {
	t.Helper()
	require.Eventually(t, func() bool { s.mu.Lock(); defer s.mu.Unlock(); return len(s.deletes) >= count }, timeout, time.Millisecond*5)
}
func (s *recordingSink) StateCount() int { s.mu.Lock(); defer s.mu.Unlock(); return len(s.states) }

func TestWatch_UpdateAfterSync(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cs := newWatchableClientSet(defaultGVRListKinds(), newTestPod("pod-a", "default"))
	defer cs.ShutdownInformers()
	sink := newRecordingSink()
	target := testWatchTarget()
	done := make(chan error, 1)
	go func() { done <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), sink) }()
	sink.WaitForState(t, target.Type, resource.WatchStateSynced, 5*time.Second)
	pod, err := cs.DynamicClient.Resource(testGVR).Namespace("default").Get(ctx, "pod-a", metav1.GetOptions{})
	require.NoError(t, err)
	pod.SetLabels(map[string]string{"version": "next"})
	pod.SetResourceVersion("opaque-next")
	_, err = cs.DynamicClient.Resource(testGVR).Namespace("default").Update(ctx, pod, metav1.UpdateOptions{})
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		sink.mu.Lock()
		defer sink.mu.Unlock()
		for _, event := range sink.updates {
			if event.Record.SourceRevision != nil && *event.Record.SourceRevision == "opaque-next" {
				return true
			}
		}
		return false
	}, 5*time.Second, 5*time.Millisecond)
	cancel()
	require.NoError(t, <-done)
}

func TestWatch_ScopedNamespaces(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cs := newWatchableClientSet(defaultGVRListKinds(), newTestPod("included", "team-a"), newTestPod("excluded", "team-b"))
	target := testWatchTarget()
	namespaces := []string{"team-a"}
	target.Scope = resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeOneOf, Values: &namespaces}}
	sink := newRecordingSink()
	done := make(chan error, 1)
	go func() { done <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), sink) }()
	sink.WaitForState(t, target.Type, resource.WatchStateSynced, 5*time.Second)
	sink.WaitForAdds(t, 1, 5*time.Second)
	cancel()
	require.NoError(t, <-done)
	cs.ShutdownInformers()
	require.NotEmpty(t, sink.Adds)
	for _, event := range sink.Adds {
		assert.Equal(t, "included", event.Record.Reference.Address.ID)
		assert.Equal(t, []resource.ScopeEntry{{Dimension: "namespace", Value: "team-a"}}, event.Record.Reference.Address.Scope)
	}
}

func TestWatch_ForbiddenPreflight(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cs := newWatchableClientSet(defaultGVRListKinds())
	cs.DynamicClient.(*fakedynamic.FakeDynamicClient).PrependReactor("list", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, k8serrors.NewForbidden(testGVR.GroupResource(), "", fmt.Errorf("denied"))
	})
	target := testWatchTarget()
	sink := newRecordingSink()
	done := make(chan error, 1)
	go func() { done <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), sink) }()
	sink.WaitForState(t, target.Type, resource.WatchStateForbidden, 5*time.Second)
	cancel()
	require.NoError(t, <-done)
	require.Empty(t, sink.Adds)
	require.Len(t, sink.states, 1)
	assert.Equal(t, resource.BestEffortGuarantee, sink.states[0].Guarantee)
	require.NotNil(t, sink.states[0].Error)
	assert.Equal(t, "FORBIDDEN", sink.states[0].Error.Code)
}

func TestWatchHandler_TombstoneAndCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	target := testWatchTarget()
	sink := newRecordingSink()
	handler := makeEventHandler(ctx, target, testWatchRepresentation(), sink)
	pod := newTestPod("retired", "default")
	pod.SetUID("native-incarnation")
	handler.OnDelete(cache.DeletedFinalStateUnknown{Key: "default/retired", Obj: pod})
	require.Len(t, sink.deletes, 1)
	deleted := sink.deletes[0]
	assert.Equal(t, target.Route, deleted.Route)
	assert.Equal(t, target.Authority, deleted.Reference.Address.Authority)
	require.NotNil(t, deleted.Reference.Incarnation)
	assert.Equal(t, "native-incarnation", *deleted.Reference.Incarnation)
	require.NotNil(t, deleted.LastKnown)
	assert.Equal(t, resource.BestEffortGuarantee, deleted.Guarantee)
	cancel()
	handler.OnAdd(pod, false)
	handler.OnUpdate(pod, pod)
	handler.OnDelete(pod)
	assert.Empty(t, sink.Adds)
	assert.Empty(t, sink.updates)
	assert.Len(t, sink.deletes, 1)
}

func TestWatch_InvalidScope(t *testing.T) {
	target := testWatchTarget()
	target.Scope = resource.QueryScope{{Dimension: "native-location", Match: resource.ScopeAny}}
	err := newBaseResourcer().Watch(context.Background(), newWatchableClientSet(defaultGVRListKinds()), target, testWatchRepresentation(), newRecordingSink())
	require.Error(t, err)
	assert.Equal(t, "INVALID_REQUEST", resource.ErrorCode(err))
}

func TestWatch_ScopedRestartAcquiresFreshSource(t *testing.T) {
	cs := newWatchableClientSet(defaultGVRListKinds(), newTestPod("stable", "team-a"))
	defer cs.ShutdownInformers()
	target := testWatchTarget()
	namespaces := []string{"team-a"}
	target.Scope = resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeOneOf, Values: &namespaces}}
	for range 2 {
		ctx, cancel := context.WithCancel(context.Background())
		sink := newRecordingSink()
		done := make(chan error, 1)
		go func() { done <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), sink) }()
		sink.WaitForState(t, target.Type, resource.WatchStateSynced, 5*time.Second)
		sink.WaitForAdds(t, 1, 5*time.Second)
		cancel()
		require.NoError(t, <-done)
		require.NotEmpty(t, sink.Adds)
		assert.Equal(t, "stable", sink.Adds[0].Record.Reference.Address.ID)
	}
}

func TestWatch_ConsumerRetirementStopsNativeWatch(t *testing.T) {
	for _, namespace := range []string{"", "team-a"} {
		name := namespace
		if name == "" {
			name = "all-namespaces"
		}
		t.Run(name, func(t *testing.T) {
			cs := newWatchableClientSet(defaultGVRListKinds())
			defer cs.ShutdownInformers()
			started := make(chan *watch.RaceFreeFakeWatcher, 4)
			cs.DynamicClient.(*fakedynamic.FakeDynamicClient).PrependWatchReactor("pods", func(action k8stesting.Action) (bool, watch.Interface, error) {
				if action.GetNamespace() != namespace {
					return true, nil, fmt.Errorf("unexpected native namespace %q", action.GetNamespace())
				}
				w := watch.NewRaceFreeFake()
				started <- w
				return true, w, nil
			})
			target := testWatchTarget()
			if namespace != "" {
				values := []string{namespace}
				target.Scope = resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeOneOf, Values: &values}}
			}
			startConsumer := func() (context.CancelFunc, <-chan error, *recordingSink) {
				ctx, cancel := context.WithCancel(context.Background())
				t.Cleanup(cancel)
				sink := newRecordingSink()
				done := make(chan error, 1)
				go func() { done <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), sink) }()
				sink.WaitForState(t, target.Type, resource.WatchStateSynced, 5*time.Second)
				return cancel, done, sink
			}
			nextWatch := func() *watch.RaceFreeFakeWatcher {
				select {
				case w := <-started:
					return w
				case <-time.After(5 * time.Second):
					t.Fatal("native watch did not start")
					return nil
				}
			}
			waitConsumer := func(done <-chan error) {
				select {
				case err := <-done:
					require.NoError(t, err)
				case <-time.After(5 * time.Second):
					t.Fatal("consumer did not retire")
				}
			}
			cancelFirst, firstDone, _ := startConsumer()
			firstWatch := nextWatch()
			cancelSecond, secondDone, secondSink := startConsumer()
			cancelFirst()
			waitConsumer(firstDone)
			require.False(t, firstWatch.IsStopped(), "remaining consumer still owns this source")
			firstWatch.Add(newTestPod("still-live", namespace))
			secondSink.WaitForAdds(t, 1, 5*time.Second)
			cancelSecond()
			waitConsumer(secondDone)
			require.True(t, firstWatch.IsStopped(), "last consumer must stop the actual native watch")
			select {
			case <-started:
				t.Fatal("shared consumers created duplicate native watches")
			default:
			}
			_, thirdDone, thirdSink := startConsumer()
			thirdWatch := nextWatch()
			require.NotSame(t, firstWatch, thirdWatch, "later consumer must start a fresh native watch")
			thirdSink.mu.Lock()
			adds := len(thirdSink.Adds)
			thirdSink.mu.Unlock()
			require.Zero(t, adds, "retired cache must not replay stale objects")
			cs.ShutdownInformers()
			waitConsumer(thirdDone)
			require.True(t, thirdWatch.IsStopped(), "connection shutdown must stop native watches")
		})
	}
}

func assertWatchStateWire(t *testing.T, event resource.WatchStateEvent, state resource.WatchState, code string) {
	t.Helper()
	wire, err := resource.ToProtoWatchStateEvent(event)
	require.NoError(t, err)
	received, err := resource.FromProtoWatchStateEvent(wire)
	require.NoError(t, err)
	require.Equal(t, state, received.State)
	require.NotNil(t, received.Error)
	require.Equal(t, code, received.Error.Code)
	require.Equal(t, event.Route, received.Route)
	require.Equal(t, event.Type, received.Type)
}

func TestWatchFailureStatesCrossUpdateAdapter(t *testing.T) {
	target := testWatchTarget()
	for _, tc := range []struct {
		name string
		err  error
		code string
	}{
		{"timeout", fmt.Errorf("cache sync timed out: %w", context.DeadlineExceeded), "TIMEOUT"},
		{"native failure", fmt.Errorf("native failure"), "PROVIDER_ERROR"},
		{"forbidden", k8serrors.NewForbidden(testGVR.GroupResource(), "", fmt.Errorf("denied")), "FORBIDDEN"},
		{"unauthorized", k8serrors.NewUnauthorized("denied"), "UNAUTHORIZED"},
		{"not found", k8serrors.NewNotFound(testGVR.GroupResource(), ""), "NOT_FOUND"},
		{"method not allowed", k8serrors.NewMethodNotSupported(testGVR.GroupResource(), "list"), "UNSUPPORTED"},
		{"classified failure", resource.NewError("RESOURCE_LIMIT", "too large"), "RESOURCE_LIMIT"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			event := watchStateEvent(target, resource.WatchStateError, 0, tc.err)
			assertWatchStateWire(t, event, resource.WatchStateError, tc.code)
		})
	}

	t.Run("method not allowed", func(t *testing.T) {
		cs := newWatchableClientSet(defaultGVRListKinds())
		cs.DynamicClient.(*fakedynamic.FakeDynamicClient).PrependReactor("list", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, k8serrors.NewMethodNotSupported(testGVR.GroupResource(), "list")
		})
		sink := newRecordingSink()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		done := make(chan error, 1)
		go func() { done <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), sink) }()
		sink.WaitForState(t, target.Type, resource.WatchStateSkipped, 5*time.Second)
		cancel()
		require.NoError(t, <-done)
		require.Len(t, sink.states, 1)
		assertWatchStateWire(t, sink.states[0], resource.WatchStateSkipped, "UNSUPPORTED")
	})

	t.Run("record conversion", func(t *testing.T) {
		var nested any = "value"
		for range resource.MaxValueDepth + 1 {
			nested = []any{nested}
		}
		for _, tc := range []struct {
			name string
			body any
			code string
		}{
			{"oversized", nested, "RESOURCE_LIMIT"},
			{"unsupported", make(chan int), "UNSUPPORTED"},
		} {
			t.Run(tc.name, func(t *testing.T) {
				pod := newTestPod("pod", "default")
				pod.Object["spec"] = tc.body
				sink := newRecordingSink()
				makeEventHandler(context.Background(), target, testWatchRepresentation(), sink).AddFunc(pod)
				require.Len(t, sink.states, 1)
				assertWatchStateWire(t, sink.states[0], resource.WatchStateError, tc.code)
			})
		}
	})
}
