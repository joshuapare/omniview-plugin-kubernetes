package resourcers

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/stretchr/testify/require"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	fakedynamic "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/rest"
	k8stesting "k8s.io/client-go/testing"
)

type sourceTestEvent struct {
	observations []resource.SourceObservation
	changes      []resource.SourceChange
	coverage     resource.SourceCoverage
	continuity   string
	reset        *resource.SourceReset
	boundary     bool
}

type sourceTestEmitter struct {
	events chan sourceTestEvent
}

func (e *sourceTestEmitter) send(ctx context.Context, event sourceTestEvent) error {
	select {
	case e.events <- event:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (e *sourceTestEmitter) Snapshot(ctx context.Context, observations []resource.SourceObservation) error {
	return e.send(ctx, sourceTestEvent{observations: append([]resource.SourceObservation(nil), observations...)})
}
func (e *sourceTestEmitter) EndSnapshot(ctx context.Context, coverage resource.SourceCoverage, continuity string) error {
	return e.send(ctx, sourceTestEvent{boundary: true, coverage: coverage, continuity: continuity})
}
func (e *sourceTestEmitter) Changes(ctx context.Context, changes []resource.SourceChange, _ *resource.SourceCoverage) error {
	return e.send(ctx, sourceTestEvent{changes: append([]resource.SourceChange(nil), changes...)})
}
func (e *sourceTestEmitter) Reset(ctx context.Context, reason, message string) error {
	return e.send(ctx, sourceTestEvent{reset: &resource.SourceReset{Reason: reason, Message: message}})
}

func nextSourceTestEvent(t *testing.T, e *sourceTestEmitter) sourceTestEvent {
	t.Helper()
	select {
	case event := <-e.events:
		return event
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for source event")
		return sourceTestEvent{}
	}
}

func TestSourceSnapshotAndOrderedChanges(t *testing.T) {
	initial := newTestPodWithLabels("initial", "default", map[string]string{"app": "test"})
	initial.SetUID("initial-uid")
	initial.SetResourceVersion("1")
	cs := newFakeClientSet(defaultGVRListKinds(), initial)
	emitter := &sourceTestEmitter{events: make(chan sourceTestEvent, 32)}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- newBaseResourcer().Source(ctx, cs, resource.SourceRequest{Target: testWatchTarget(), Representation: testWatchRepresentation(), Limits: resource.SourceLimits{MaxBatchItems: resource.MaxSourceBatchItems}}, emitter)
	}()
	t.Cleanup(func() {
		cancel()
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			t.Error("source did not stop")
		}
	})

	var snapshot []resource.SourceObservation
	for {
		event := nextSourceTestEvent(t, emitter)
		if event.boundary {
			require.Equal(t, resource.EnumerationExhausted, event.coverage.Enumeration)
			require.Equal(t, resource.ConsistencyBestEffort, event.coverage.Consistency)
			require.Equal(t, []string{"informer cache readiness is not a point-in-time snapshot", "startup events are reconciled by key, not by native revision handoff"}, event.coverage.Limitations)
			require.Equal(t, resource.ContinuityBestEffort, event.continuity)
			break
		}
		require.LessOrEqual(t, len(event.observations), resource.MaxSourceBatchItems)
		snapshot = append(snapshot, event.observations...)
	}
	require.Len(t, snapshot, 1)
	require.Equal(t, "initial", snapshot[0].Record.Reference.Address.ID)
	require.Equal(t, "initial-uid", *snapshot[0].Record.Reference.Incarnation)
	require.Equal(t, "1", *snapshot[0].Record.SourceRevision)
	require.NotNil(t, snapshot[0].Metadata)
	require.Equal(t, map[string]string{"app": "test"}, snapshot[0].Metadata.Labels)

	pods := cs.DynamicClient.Resource(testGVR).Namespace("default")
	created := newTestPod("created", "default")
	created.SetUID("created-uid")
	created.SetResourceVersion("10")
	_, err := pods.Create(ctx, created, metav1.CreateOptions{})
	require.NoError(t, err)
	first := nextSourceTestEvent(t, emitter)
	require.Len(t, first.changes, 1)
	require.Equal(t, resource.SourceChangeUpsert, first.changes[0].Kind)
	require.Equal(t, "10", *first.changes[0].Observation.Record.SourceRevision)
	// A replay with unchanged identity and resource version must not emit an update.
	_, err = pods.Update(ctx, created.DeepCopy(), metav1.UpdateOptions{})
	require.NoError(t, err)
	changed := created.DeepCopy()
	changed.SetResourceVersion("11")
	_, err = pods.Update(ctx, changed, metav1.UpdateOptions{})
	require.NoError(t, err)
	second := nextSourceTestEvent(t, emitter)
	require.Len(t, second.changes, 1)
	require.Equal(t, resource.SourceChangeUpsert, second.changes[0].Kind)
	require.Equal(t, "11", *second.changes[0].Observation.Record.SourceRevision)
	require.NoError(t, pods.Delete(ctx, "created", metav1.DeleteOptions{}))
	third := nextSourceTestEvent(t, emitter)
	require.Len(t, third.changes, 1)
	require.Equal(t, resource.SourceChangeRemove, third.changes[0].Kind)
	require.Equal(t, "created", third.changes[0].Reference.Address.ID)
	require.Equal(t, "created-uid", *third.changes[0].Reference.Incarnation)
	require.Equal(t, "11", *third.changes[0].SourceRevision)
}

func TestSourceOverflowResets(t *testing.T) {
	objects := make([]runtime.Object, 4097)
	for i := range objects {
		objects[i] = newTestPod(fmt.Sprintf("pod-%05d", i), "default")
	}
	cs := newFakeClientSet(defaultGVRListKinds(), objects...)
	emitter := &sourceTestEmitter{events: make(chan sourceTestEvent, 32)}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() {
		done <- newBaseResourcer().Source(ctx, cs, resource.SourceRequest{Target: testWatchTarget(), Representation: testWatchRepresentation(), Limits: resource.SourceLimits{MaxBatchItems: resource.MaxSourceBatchItems}}, emitter)
	}()
	for {
		event := nextSourceTestEvent(t, emitter)
		if event.reset != nil {
			require.Equal(t, resource.SourceResetOverflow, event.reset.Reason)
			require.Equal(t, "informer event queue exceeded 4096 items", event.reset.Message)
			break
		}
		require.False(t, event.boundary, "overflow must reset before snapshot boundary")
	}
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-ctx.Done():
		t.Fatal("source did not stop after reset")
	}
}

func TestSourceForbidden(t *testing.T) {
	cs := newFakeClientSet(defaultGVRListKinds())
	cs.DynamicClient.(*fakedynamic.FakeDynamicClient).PrependReactor("list", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, k8serrors.NewForbidden(testGVR.GroupResource(), "", fmt.Errorf("denied"))
	})
	emitter := &sourceTestEmitter{events: make(chan sourceTestEvent, 1)}
	err := newBaseResourcer().Source(context.Background(), cs, resource.SourceRequest{Target: testWatchTarget(), Representation: testWatchRepresentation(), Limits: resource.SourceLimits{MaxBatchItems: resource.MaxSourceBatchItems}}, emitter)
	require.Equal(t, "FORBIDDEN", resource.ErrorCode(err))
	require.Empty(t, emitter.events)
}

func TestSourceCanonicalProbeErrors(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		code string
	}{
		{"method not allowed", k8serrors.NewMethodNotSupported(testGVR.GroupResource(), "list"), "UNSUPPORTED"},
		{"timeout", fmt.Errorf("list timed out: %w", context.DeadlineExceeded), "TIMEOUT"},
		{"unknown", fmt.Errorf("native failure"), "PROVIDER_ERROR"},
		{"classified", resource.NewError("RESOURCE_LIMIT", "too large"), "RESOURCE_LIMIT"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cs := newFakeClientSet(defaultGVRListKinds())
			cs.DynamicClient.(*fakedynamic.FakeDynamicClient).PrependReactor("list", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
				return true, nil, tc.err
			})
			emitter := &sourceTestEmitter{events: make(chan sourceTestEvent, 1)}
			err := newBaseResourcer().Source(context.Background(), cs, resource.SourceRequest{Target: testWatchTarget(), Representation: testWatchRepresentation()}, emitter)
			require.Equal(t, tc.code, resource.ErrorCode(err))
			require.Empty(t, emitter.events)
		})
	}
}

func TestSourceCanonicalConversionErrors(t *testing.T) {
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
			cs := newFakeClientSet(defaultGVRListKinds())
			watcher := watch.NewRaceFreeFake()
			cs.DynamicClient.(*fakedynamic.FakeDynamicClient).PrependWatchReactor("pods", func(k8stesting.Action) (bool, watch.Interface, error) {
				return true, watcher, nil
			})
			emitter := &sourceTestEmitter{events: make(chan sourceTestEvent, 1)}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := make(chan error, 1)
			go func() {
				done <- newBaseResourcer().Source(ctx, cs, resource.SourceRequest{Target: testWatchTarget(), Representation: testWatchRepresentation()}, emitter)
			}()
			require.True(t, nextSourceTestEvent(t, emitter).boundary)
			pod := newTestPod("pod", "default")
			pod.Object["spec"] = tc.body
			watcher.Add(pod)
			select {
			case err := <-done:
				require.Equal(t, tc.code, resource.ErrorCode(err))
			case <-time.After(10 * time.Second):
				t.Fatal("source did not report conversion error")
			}
		})
	}
}
func TestSourceLivenessProbe(t *testing.T) {
	oldInterval := sourceLivenessInterval
	sourceLivenessInterval = 20 * time.Millisecond
	defer func() { sourceLivenessInterval = oldInterval }()
	requests := make(chan struct{}, 8)
	responses := make(chan int, 8)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests <- struct{}{}
		select {
		case status := <-responses:
			w.WriteHeader(status)
		case <-r.Context().Done():
		}
	}))
	defer server.Close()
	cs := newFakeClientSet(defaultGVRListKinds())
	cs.RESTConfig = &rest.Config{Host: server.URL}
	cs.HTTPClient = server.Client()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	emitters := []*sourceTestEmitter{
		{events: make(chan sourceTestEvent, 16)},
		{events: make(chan sourceTestEvent, 16)},
	}
	done := make(chan error, len(emitters))
	for _, emitter := range emitters {
		go func() {
			done <- newBaseResourcer().Source(ctx, cs, resource.SourceRequest{Target: testWatchTarget(), Representation: testWatchRepresentation(), Limits: resource.SourceLimits{MaxBatchItems: resource.MaxSourceBatchItems}}, emitter)
		}()
	}
	defer func() {
		cancel()
		for range emitters {
			select {
			case <-done:
			case <-time.After(10 * time.Second):
				t.Error("source did not stop")
			}
		}
	}()
	for _, emitter := range emitters {
		require.True(t, nextSourceTestEvent(t, emitter).boundary)
	}
	nextProbe := func() {
		t.Helper()
		select {
		case <-requests:
		case <-time.After(5 * time.Second):
			t.Fatal("liveness probe did not run")
		}
	}
	nextProbe()
	select {
	case <-requests:
		t.Fatal("sessions started separate health probes")
	case <-time.After(100 * time.Millisecond):
	}
	responses <- http.StatusTooManyRequests
	nextProbe()
	for _, emitter := range emitters {
		require.Empty(t, emitter.events, "one failed probe must not reset")
	}
	responses <- http.StatusOK
	nextProbe()
	responses <- http.StatusTooManyRequests
	nextProbe()
	for _, emitter := range emitters {
		require.Empty(t, emitter.events, "success must clear the failure count")
	}
	responses <- http.StatusTooManyRequests
	for _, emitter := range emitters {
		event := nextSourceTestEvent(t, emitter)
		require.NotNil(t, event.reset)
		require.Equal(t, resource.SourceResetContinuityLost, event.reset.Reason)
		require.Equal(t, "Kubernetes API is unreachable; informer events are not being delivered", event.reset.Message)
	}
}
