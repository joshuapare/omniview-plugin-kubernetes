package resource

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"k8s.io/client-go/rest"
)

type nativeSchemaObservedBody struct {
	io.ReadCloser
	closed func()
}

func (b *nativeSchemaObservedBody) Close() error {
	err := b.ReadCloser.Close()
	b.closed()
	return err
}

type nativeSchemaObservedTransport struct {
	next    http.RoundTripper
	started func(string)
	closed  func(string)
}

func (t nativeSchemaObservedTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if t.started != nil {
		t.started(request.URL.Path)
	}
	response, err := t.next.RoundTrip(request)
	if err == nil {
		response.Body = &nativeSchemaObservedBody{
			ReadCloser: response.Body,
			closed:     func() { t.closed(request.URL.Path) },
		}
	}
	return response, err
}

func nativeSchemaObservedRESTClient(t *testing.T, handler http.Handler, started, closed func(string)) rest.Interface {
	t.Helper()
	client := nativeSchemaRESTClient(t, handler).(*rest.RESTClient)
	// client-go may reuse http.DefaultClient for an unmodified transport.
	// Instrument only this fixture, never the shared client used by other tests.
	httpClient := *client.Client
	client.Client = &httpClient
	next := client.Client.Transport
	if next == nil {
		next = http.DefaultTransport
	}
	client.Client.Transport = nativeSchemaObservedTransport{next: next, started: started, closed: closed}
	return client
}

func TestNativeSchemaRollingPrefetchBoundsBufferedDocuments(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	entered := make(chan string, 9)
	finished := make(chan string, 9)
	gates := make(map[string]chan struct{})
	bindings := make(map[string]nativeType)
	for _, group := range []string{"a", "b", "c", "d", "e", "f", "g", "h", "i"} {
		gates[group] = make(chan struct{})
		bindings[group] = schemaBudgetBinding(group)
	}
	budget := &nativeSchemaBudget{}
	documentBytes := len(schemaBudgetFixture("a"))
	started, stagingPeak := 0, 0
	var active, peak atomic.Int32
	client := nativeSchemaObservedRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		group := strings.Split(r.URL.Path, "/")[4]
		current := active.Add(1)
		defer active.Add(-1)
		for prior := peak.Load(); current > prior; prior = peak.Load() {
			if peak.CompareAndSwap(prior, current) {
				break
			}
		}
		entered <- group
		select {
		case <-gates[group]:
			_, _ = w.Write([]byte(schemaBudgetFixture(group)))
		case <-r.Context().Done():
		}
	}), func(_ string) {
		budget.mu.Lock()
		defer budget.mu.Unlock()
		started++
		// All fixtures have distinct content and equal length. Subtracting
		// retained documents counts both active reads and buffered responses.
		stagingPeak = max(stagingPeak, started-budget.used/documentBytes)
	}, func(path string) {
		finished <- strings.Split(path, "/")[4]
	})
	done := make(chan struct{})
	var result map[string]nativeSchemaDocument
	var failures map[string]error
	var lease *nativeSchemaLease
	go func() {
		defer close(done)
		result, failures, lease = fetchNativeSchemas(ctx, client, bindings, budget)
	}()
	defer func() {
		cancel()
		<-done
		result = nil
		lease.Release()
	}()
	readGroups := func(events <-chan string, count int) []string {
		t.Helper()
		groups := make([]string, 0, count)
		for range count {
			select {
			case group := <-events:
				groups = append(groups, group)
			case <-ctx.Done():
				t.Fatal("schema prefetch did not reach gated request")
			}
		}
		return groups
	}
	require.ElementsMatch(t, []string{"a", "b", "c", "d"}, readGroups(entered, 4), "first four requests must overlap")
	for _, group := range []string{"b", "c", "d"} {
		close(gates[group])
	}
	require.ElementsMatch(t, []string{"b", "c", "d"}, readGroups(finished, 3))
	close(gates["a"])
	require.ElementsMatch(t, []string{"e", "f", "g", "h"}, readGroups(entered, 4), "finished slots must refill without waiting for a batch")
	close(gates["e"])
	require.Equal(t, []string{"i"}, readGroups(entered, 1), "one finished document must refill one slot while other requests stay blocked")
	for _, group := range []string{"f", "g", "h", "i"} {
		close(gates[group])
	}
	select {
	case <-done:
	case <-ctx.Done():
		t.Fatal("schema prefetch did not drain")
	}
	require.Empty(t, failures)
	require.Len(t, result, len(bindings))
	require.Equal(t, int32(4), peak.Load())
	require.Equal(t, 4, stagingPeak, "in-flight and buffered documents share the same four staging slots")
	for group := range bindings {
		require.Equal(t, schemaBudgetFixture(group), string(result[group].Document))
	}
	result = nil
	lease.Release()
	require.Zero(t, budget.used, "completed acquisition lease must release all retained documents")
}

func TestNativeSchemaParallelCancellationDrainsRequestsAndStaging(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	entered := make(chan struct{}, 8)
	closed := make(chan struct{}, 8)
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/openapi/v3/apis/z/v1" {
			_, _ = w.Write([]byte(schemaBudgetFixture("z")))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		entered <- struct{}{}
		<-r.Context().Done()
		closed <- struct{}{}
	}))
	bindings := make(map[string]nativeType)
	for _, group := range []string{"a", "b", "c", "d", "e", "f", "g", "h"} {
		bindings[group] = schemaBudgetBinding(group)
	}
	budget := &nativeSchemaBudget{}
	done := make(chan struct{})
	var result map[string]nativeSchemaDocument
	var failures map[string]error
	go func() {
		defer close(done)
		var lease *nativeSchemaLease
		result, failures, lease = fetchNativeSchemas(ctx, client, bindings, budget)
		lease.Release()
	}()
	defer func() {
		cancel()
		<-done
	}()
	for range 4 {
		select {
		case <-entered:
		case <-time.After(5 * time.Second):
			t.Fatal("schema requests did not overlap before cancellation")
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("canceled schema acquisition did not drain workers")
	}
	for range 4 {
		select {
		case <-closed:
		case <-time.After(5 * time.Second):
			t.Fatal("canceled schema request left its response body open")
		}
	}
	require.Empty(t, entered, "cancellation must not launch queued group versions")
	require.Empty(t, result)
	require.Len(t, failures, len(bindings))
	for group := range bindings {
		require.ErrorIs(t, failures[group], context.Canceled)
	}
	require.Zero(t, budget.used)

	// A subsequent connection must acquire the same provider staging gate.
	recoveryCtx, recoveryCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer recoveryCancel()
	recovered, recoveryFailures, recoveryLease := fetchNativeSchemas(recoveryCtx, client, map[string]nativeType{"z": schemaBudgetBinding("z")}, budget)
	defer recoveryLease.Release()
	require.Empty(t, recoveryFailures)
	require.Len(t, recovered, 1)
}

func TestNativeSchemaParallelBudgetKeepsSortedRetention(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	laterCompleted := make(chan struct{})
	client := nativeSchemaObservedRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		group := strings.Split(r.URL.Path, "/")[4]
		if group == "a" {
			select {
			case <-laterCompleted:
			case <-r.Context().Done():
				return
			}
		}
		_, _ = w.Write([]byte(schemaBudgetFixture(group)))
	}), nil, func(path string) {
		if path == "/openapi/v3/apis/b/v1" {
			close(laterCompleted)
		}
	})
	first := schemaBudgetFixture("a")
	budget := &nativeSchemaBudget{limit: len(first)}
	result, failures, lease := fetchNativeSchemas(ctx, client, map[string]nativeType{
		"a": schemaBudgetBinding("a"), "b": schemaBudgetBinding("b"),
	}, budget)
	defer lease.Release()
	require.Len(t, result, 1)
	require.Equal(t, first, string(result["a"].Document), "network completion order must not change retained-budget winners")
	require.NotContains(t, failures, "a")
	require.ErrorContains(t, failures["b"], "budget exhausted")
	require.Equal(t, len(first), budget.used)
}
