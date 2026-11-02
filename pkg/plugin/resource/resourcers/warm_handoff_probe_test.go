package resourcers

import (
	"context"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/watch"
	fakedynamic "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

// TestWarmInformerHandoffProbe exercises real resourcer watches and their shared
// client-go informer with a controlled native watch transport.
// Run: go test ./pkg/plugin/resource/resourcers -run '^TestWarmInformerHandoffProbe$' -count=1 -v
func TestWarmInformerHandoffProbe(t *testing.T) {
	initial := newTestPod("initial", "default")
	initial.SetResourceVersion("1")
	cs := newWatchableClientSet(defaultGVRListKinds(), initial)
	t.Cleanup(cs.ShutdownInformers)
	started := make(chan *watch.RaceFreeFakeWatcher, 4)
	cs.DynamicClient.(*fakedynamic.FakeDynamicClient).PrependWatchReactor("pods", func(k8stesting.Action) (bool, watch.Interface, error) {
		w := watch.NewRaceFreeFake()
		started <- w
		return true, w, nil
	})

	target := testWatchTarget()
	coldCtx, coldCancel := context.WithCancel(context.Background())
	t.Cleanup(coldCancel)
	cold := newRecordingSink()
	coldDone := make(chan error, 1)
	go func() { coldDone <- newBaseResourcer().Watch(coldCtx, cs, target, testWatchRepresentation(), cold) }()
	cold.WaitForState(t, target.Type, resource.WatchStateSynced, consumerTimeout)
	awaitConsumerAdd(t, cold, "initial")
	w := awaitNativeConsumerWatch(t, started)

	warmCtx, warmCancel := context.WithCancel(context.Background())
	t.Cleanup(warmCancel)
	warm := &blockingInitialSink{recordingSink: newRecordingSink(), entered: make(chan struct{}), release: make(chan struct{})}
	var release sync.Once
	t.Cleanup(func() { release.Do(func() { close(warm.release) }) })
	warmDone := make(chan error, 1)
	go func() { warmDone <- newBaseResourcer().Watch(warmCtx, cs, target, testWatchRepresentation(), warm) }()
	select {
	case <-warm.entered:
	case <-time.After(consumerTimeout):
		t.Fatal("warm initial callback did not start")
	}

	// Hold the warm subscriber's initial delivery while the shared informer
	// processes each native event. Each object becomes immutable after sending.
	added := newTestPod("added-during-handoff", "default")
	added.SetResourceVersion("2")
	w.Add(added)
	awaitConsumerAdd(t, cold, "added-during-handoff")
	updated := newTestPod("initial", "default")
	updated.SetResourceVersion("3")
	w.Modify(updated)
	require.Eventually(t, func() bool {
		cold.mu.Lock()
		defer cold.mu.Unlock()
		return len(cold.updates) == 1
	}, consumerTimeout, 5*time.Millisecond, "cold subscriber did not observe update")
	deleted := newTestPod("initial", "default")
	deleted.SetResourceVersion("4")
	w.Delete(deleted)
	cold.WaitForDeletes(t, 1, consumerTimeout)

	warm.mu.Lock()
	synced := false
	for _, state := range warm.states {
		synced = synced || state.State == resource.WatchStateSynced
	}
	warm.mu.Unlock()
	require.False(t, synced, "warm sync must await its initial delivery")
	release.Do(func() { close(warm.release) })
	warm.WaitForState(t, target.Type, resource.WatchStateSynced, consumerTimeout)
	warm.WaitForDeletes(t, 1, consumerTimeout)
	require.Eventually(t, func() bool {
		warm.orderMu.Lock()
		defer warm.orderMu.Unlock()
		return len(warm.order) == 4
	}, consumerTimeout, 5*time.Millisecond)
	warm.orderMu.Lock()
	order := append([]string(nil), warm.order...)
	warm.orderMu.Unlock()
	identities := make(map[string]bool)
	for _, event := range order {
		parts := strings.SplitN(event, ":", 2)
		if parts[0] == "delete" {
			delete(identities, parts[1])
		} else {
			identities[parts[1]] = true
		}
	}
	var resulting []string
	for id := range identities {
		resulting = append(resulting, id)
	}
	sort.Strings(resulting)
	t.Logf("warm event_order=%v resulting_identities=%v", order, resulting)
	require.Equal(t, []string{"added-during-handoff"}, resulting)
	require.Equal(t, []string{"add:initial", "add:added-during-handoff", "update:initial", "delete:initial"}, order)
	warm.mu.Lock()
	updates := append([]resource.WatchUpdatePayload(nil), warm.updates...)
	warm.mu.Unlock()
	require.Len(t, updates, 1)
	require.NotNil(t, updates[0].Record.SourceRevision)
	require.Equal(t, "3", *updates[0].Record.SourceRevision)
	coldCancel()
	awaitConsumer(t, coldDone)
	require.False(t, w.IsStopped(), "warm subscriber must retain the shared source")
	after := newTestPod("after-cold-cancel", "default")
	after.SetResourceVersion("5")
	w.Add(after)
	awaitConsumerAdd(t, warm.recordingSink, "after-cold-cancel")
	warm.orderMu.Lock()
	finalOrder := append([]string(nil), warm.order...)
	warm.orderMu.Unlock()
	t.Logf("after cold cancellation event_order=%v", finalOrder)
	select {
	case <-started:
		t.Fatal("warm subscriber created a second native watch")
	default:
	}
	warmCancel()
	awaitConsumer(t, warmDone)
	require.True(t, w.IsStopped())
}
