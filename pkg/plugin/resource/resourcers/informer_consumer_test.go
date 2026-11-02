package resourcers

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/stretchr/testify/require"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	fakedynamic "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

const consumerTimeout = 5 * time.Second

func awaitConsumer(t *testing.T, done <-chan error) {
	t.Helper()
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(consumerTimeout):
		t.Fatal("consumer did not stop")
	}
}

func awaitNativeConsumerWatch(t *testing.T, started <-chan *watch.RaceFreeFakeWatcher) *watch.RaceFreeFakeWatcher {
	t.Helper()
	select {
	case w := <-started:
		return w
	case <-time.After(consumerTimeout):
		t.Fatal("native watch did not start")
		return nil
	}
}

func awaitConsumerAdd(t *testing.T, sink *recordingSink, name string) {
	t.Helper()
	require.Eventually(t, func() bool {
		sink.mu.Lock()
		defer sink.mu.Unlock()
		for _, event := range sink.Adds {
			if event.Record.Reference.Address.ID == name {
				return true
			}
		}
		return false
	}, consumerTimeout, 5*time.Millisecond, "missing add for %s", name)
}

func requireConsumerAddsOnce(t *testing.T, sink *recordingSink, names ...string) {
	t.Helper()
	sink.mu.Lock()
	defer sink.mu.Unlock()
	for _, name := range names {
		count := 0
		for _, event := range sink.Adds {
			if event.Record.Reference.Address.ID == name {
				count++
			}
		}
		require.Equal(t, 1, count, "unexpected add count for %s", name)
	}
}

// A blocked initial callback exposes the attachment/sync boundary without sleeps.
type blockingInitialSink struct {
	*recordingSink
	once    sync.Once
	entered chan struct{}
	release chan struct{}
	orderMu sync.Mutex
	order   []string
}

func (s *blockingInitialSink) OnAdd(p resource.WatchAddPayload) {
	s.once.Do(func() {
		close(s.entered)
		<-s.release
	})
	s.recordingSink.OnAdd(p)
	s.orderMu.Lock()
	s.order = append(s.order, "add:"+p.Record.Reference.Address.ID)
	s.orderMu.Unlock()
}

func (s *blockingInitialSink) OnUpdate(p resource.WatchUpdatePayload) {
	s.recordingSink.OnUpdate(p)
	s.orderMu.Lock()
	s.order = append(s.order, "update:"+p.Record.Reference.Address.ID)
	s.orderMu.Unlock()
}

func (s *blockingInitialSink) OnDelete(p resource.WatchDeletePayload) {
	s.recordingSink.OnDelete(p)
	s.orderMu.Lock()
	s.order = append(s.order, "delete:"+p.Reference.Address.ID)
	s.orderMu.Unlock()
}

func TestInformerConsumerAttachmentAndLateSubscriber(t *testing.T) {
	cs := newWatchableClientSet(defaultGVRListKinds(), newTestPod("initial", "default"))
	t.Cleanup(cs.ShutdownInformers)
	started := make(chan *watch.RaceFreeFakeWatcher, 4)
	cs.DynamicClient.(*fakedynamic.FakeDynamicClient).PrependWatchReactor("pods", func(k8stesting.Action) (bool, watch.Interface, error) {
		w := watch.NewRaceFreeFake()
		started <- w
		return true, w, nil
	})
	target := testWatchTarget()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	first := &blockingInitialSink{recordingSink: newRecordingSink(), entered: make(chan struct{}), release: make(chan struct{})}
	var release sync.Once
	t.Cleanup(func() { release.Do(func() { close(first.release) }) })
	firstDone := make(chan error, 1)
	go func() { firstDone <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), first) }()
	select {
	case <-first.entered:
	case <-time.After(consumerTimeout):
		t.Fatal("initial callback did not start")
	}
	w := awaitNativeConsumerWatch(t, started)
	w.Add(newTestPod("during-attachment", "default"))
	updated := newTestPod("initial", "default")
	updated.SetResourceVersion("updated-during-attachment")
	w.Modify(updated)
	w.Delete(updated)
	first.mu.Lock()
	synced := false
	for _, state := range first.states {
		synced = synced || state.State == resource.WatchStateSynced
	}
	first.mu.Unlock()
	require.False(t, synced, "sync must await initial handler delivery")
	release.Do(func() { close(first.release) })
	first.WaitForState(t, target.Type, resource.WatchStateSynced, consumerTimeout)
	awaitConsumerAdd(t, first.recordingSink, "initial")
	awaitConsumerAdd(t, first.recordingSink, "during-attachment")
	first.WaitForDeletes(t, 1, consumerTimeout)
	require.Eventually(t, func() bool {
		first.orderMu.Lock()
		defer first.orderMu.Unlock()
		return len(first.order) >= 4
	}, consumerTimeout, 5*time.Millisecond)
	first.orderMu.Lock()
	order := append([]string(nil), first.order...)
	first.orderMu.Unlock()
	require.Equal(t, []string{"add:initial", "add:during-attachment", "update:initial", "delete:initial"}, order)
	first.mu.Lock()
	updates := append([]resource.WatchUpdatePayload(nil), first.updates...)
	first.mu.Unlock()
	require.Len(t, updates, 1)
	require.NotNil(t, updates[0].Record.SourceRevision)
	require.Equal(t, "updated-during-attachment", *updates[0].Record.SourceRevision)

	late := newRecordingSink()
	lateCtx, lateCancel := context.WithCancel(context.Background())
	t.Cleanup(lateCancel)
	lateDone := make(chan error, 1)
	go func() { lateDone <- newBaseResourcer().Watch(lateCtx, cs, target, testWatchRepresentation(), late) }()
	late.WaitForState(t, target.Type, resource.WatchStateSynced, consumerTimeout)
	awaitConsumerAdd(t, late, "during-attachment")
	late.mu.Lock()
	lateAdds := append([]resource.WatchAddPayload(nil), late.Adds...)
	late.mu.Unlock()
	for _, event := range lateAdds {
		require.NotEqual(t, "initial", event.Record.Reference.Address.ID, "late subscriber must not replay deleted object")
	}
	cancel()
	awaitConsumer(t, firstDone)
	requireConsumerAddsOnce(t, first.recordingSink, "initial", "during-attachment")
	require.False(t, w.IsStopped())
	w.Add(newTestPod("after-first-cancel", "default"))
	awaitConsumerAdd(t, late, "after-first-cancel")
	lateCancel()
	awaitConsumer(t, lateDone)
	requireConsumerAddsOnce(t, late, "during-attachment", "after-first-cancel")
	require.True(t, w.IsStopped())
	select {
	case <-started:
		t.Fatal("late subscriber created a second native watch")
	default:
	}
}

func TestInformerConsumerConcurrentStartsAndReconnect(t *testing.T) {
	cs := newWatchableClientSet(defaultGVRListKinds())
	t.Cleanup(cs.ShutdownInformers)
	started := make(chan *watch.RaceFreeFakeWatcher, 8)
	cs.DynamicClient.(*fakedynamic.FakeDynamicClient).PrependWatchReactor("pods", func(k8stesting.Action) (bool, watch.Interface, error) {
		w := watch.NewRaceFreeFake()
		started <- w
		return true, w, nil
	})
	const consumers = 8
	target := testWatchTarget()
	start := make(chan struct{})
	sinks := make([]*recordingSink, consumers)
	cancels := make([]context.CancelFunc, consumers)
	done := make([]chan error, consumers)
	for i := range consumers {
		ctx, cancel := context.WithCancel(context.Background())
		cancels[i] = cancel
		t.Cleanup(cancel)
		sinks[i] = newRecordingSink()
		done[i] = make(chan error, 1)
		go func(i int) {
			<-start
			done[i] <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), sinks[i])
		}(i)
	}
	close(start)
	for _, sink := range sinks {
		sink.WaitForState(t, target.Type, resource.WatchStateSynced, consumerTimeout)
	}
	first := awaitNativeConsumerWatch(t, started)
	select {
	case <-started:
		t.Fatal("concurrent subscribers opened multiple native watches")
	default:
	}
	first.Add(newTestPod("before-reconnect", "default"))
	for _, sink := range sinks {
		awaitConsumerAdd(t, sink, "before-reconnect")
	}
	first.Stop()
	second := awaitNativeConsumerWatch(t, started)
	require.NotSame(t, first, second)
	second.Add(newTestPod("after-reconnect", "default"))
	for _, sink := range sinks {
		awaitConsumerAdd(t, sink, "after-reconnect")
	}
	for i := range consumers {
		cancels[i]()
		awaitConsumer(t, done[i])
	}
	require.True(t, second.IsStopped())
}

func TestInformerConsumerEmptyAndForbiddenScope(t *testing.T) {
	t.Run("empty namespace selection is invalid", func(t *testing.T) {
		cs := newWatchableClientSet(defaultGVRListKinds())
		t.Cleanup(cs.ShutdownInformers)
		target := testWatchTarget()
		values := []string{}
		target.Scope = resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeOneOf, Values: &values}}
		err := newBaseResourcer().Watch(context.Background(), cs, target, testWatchRepresentation(), newRecordingSink())
		require.Error(t, err)
		require.Equal(t, "INVALID_REQUEST", resource.ErrorCode(err))
		require.Empty(t, cs.DynamicClient.(*fakedynamic.FakeDynamicClient).Actions())
	})
	t.Run("forbidden all namespaces opens no watch", func(t *testing.T) {
		cs := newWatchableClientSet(defaultGVRListKinds())
		t.Cleanup(cs.ShutdownInformers)
		client := cs.DynamicClient.(*fakedynamic.FakeDynamicClient)
		client.PrependReactor("list", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, apierrors.NewForbidden(testGVR.GroupResource(), "", fmt.Errorf("denied"))
		})
		ctx, cancel := context.WithCancel(context.Background())
		t.Cleanup(cancel)
		target := testWatchTarget()
		sink := newRecordingSink()
		done := make(chan error, 1)
		go func() { done <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), sink) }()
		sink.WaitForState(t, target.Type, resource.WatchStateForbidden, consumerTimeout)
		cancel()
		awaitConsumer(t, done)
		for _, action := range client.Actions() {
			require.NotEqual(t, "watch", action.GetVerb())
		}
	})
}
