package resource

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/runtime/serializer"
	"k8s.io/client-go/rest"
)

func nativeSchemaRESTClient(t *testing.T, handler http.Handler) rest.Interface {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client, err := rest.UnversionedRESTClientFor(&rest.Config{
		Host:          server.URL,
		ContentConfig: rest.ContentConfig{NegotiatedSerializer: serializer.NewCodecFactory(runtime.NewScheme()).WithoutConversion()},
	})
	require.NoError(t, err)
	return client
}

func TestNativeSchemaKeepsExactDocumentAndRoot(t *testing.T) {
	const document = `{"openapi":"3.0.0","components":{"schemas":{"native.Pod":{"x-kubernetes-group-version-kind":[{"group":"","version":"v1","kind":"Pod"}],"properties":{"spec":{"$ref":"#/components/schemas/native.Spec"}}},"native.Spec":{"type":"object"},"native.Node":{"x-kubernetes-group-version-kind":[{"group":"","version":"v1","kind":"Node"}],"type":"object"}}}}`
	var calls atomic.Int32
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		require.Equal(t, "/openapi/v3/api/v1", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(document))
	}))
	bindings := map[string]nativeType{
		"core::v1::Pod":  {GVR: schema.GroupVersionResource{Version: "v1", Resource: "pods"}, API: metav1.APIResource{Kind: "Pod"}},
		"core::v1::Node": {GVR: schema.GroupVersionResource{Version: "v1", Resource: "nodes"}, API: metav1.APIResource{Kind: "Node"}},
	}
	budget := &nativeSchemaBudget{}
	result, failures, lease := fetchNativeSchemas(context.Background(), client, bindings, budget)
	defer lease.Release()
	require.Empty(t, failures)
	require.Equal(t, int32(1), calls.Load(), "fetch each group/version only once")
	require.Equal(t, document, string(result["core::v1::Pod"].Document))
	require.Equal(t, "#/components/schemas/native.Pod", result["core::v1::Pod"].Root)
	require.Equal(t, "#/components/schemas/native.Node", result["core::v1::Node"].Root)
	require.Equal(t, result["core::v1::Pod"].Revision, result["core::v1::Node"].Revision)
	require.NotEmpty(t, result["core::v1::Pod"].Revision)
	require.Equal(t, len(document), budget.used, "shared document is charged only once")
	require.True(t, &result["core::v1::Pod"].Document[0] == &result["core::v1::Node"].Document[0], "type entries share one allocation")
	require.Equal(t, len(document), cap(result["core::v1::Pod"].Document))
}

func TestNativeSchemaPublishesCorrectedTimeAndSharesLeases(t *testing.T) {
	const raw = `{"components":{"schemas":{"native.Pod":{"x-kubernetes-group-version-kind":[{"group":"","version":"v1","kind":"Pod"}],"properties":{"name":{"type":"string","nullable":false}}},"io.k8s.apimachinery.pkg.apis.meta.v1.Time":{"type":"string","format":"date-time","nullable":false},"io.k8s.apimachinery.pkg.apis.meta.v1.MicroTime":{"type":"string","format":"date-time","maximum":9007199254740993},"other.Time":{"type":"string","nullable":false}}},"wide":9007199254740993}`
	source := []byte(raw)
	var parsed struct {
		Components struct {
			Schemas map[string]json.RawMessage `json:"schemas"`
		} `json:"components"`
	}
	require.NoError(t, json.Unmarshal(source, &parsed))
	corrected, err := correctNativeTimeSchemas(source)
	require.NoError(t, err)
	require.Equal(t, raw, string(source))
	require.NotEqual(t, raw, string(corrected))
	require.Contains(t, string(corrected), `"maximum":9007199254740993`)
	require.Contains(t, string(corrected), `"wide":9007199254740993`)
	require.NoError(t, json.Unmarshal(corrected, &parsed))
	for _, name := range []string{"io.k8s.apimachinery.pkg.apis.meta.v1.Time", "io.k8s.apimachinery.pkg.apis.meta.v1.MicroTime"} {
		var fields map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(parsed.Components.Schemas[name], &fields))
		require.Equal(t, "true", string(fields["nullable"]))
	}
	require.Contains(t, string(parsed.Components.Schemas["other.Time"]), `"nullable":false`)
	require.Contains(t, string(parsed.Components.Schemas["native.Pod"]), `"nullable":false`)
	again, err := correctNativeTimeSchemas(corrected)
	require.NoError(t, err)
	require.Equal(t, corrected, again)
	require.True(t, &corrected[0] == &again[0])

	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(source)
	}))
	bindings := map[string]nativeType{"pod": schemaBudgetBinding("")}
	budget := &nativeSchemaBudget{limit: len(corrected)}
	first, failures, lease := fetchNativeSchemas(context.Background(), client, bindings, budget)
	require.Empty(t, failures)
	require.Equal(t, corrected, []byte(first["pod"].Document))
	digest := sha256.Sum256(corrected)
	rawDigest := sha256.Sum256(source)
	require.Equal(t, hex.EncodeToString(digest[:]), first["pod"].Revision)
	require.NotEqual(t, rawDigest, digest)
	second, failures, secondLease := fetchNativeSchemas(context.Background(), client, bindings, budget)
	require.Empty(t, failures)
	require.Equal(t, first["pod"].Revision, second["pod"].Revision)
	require.True(t, &first["pod"].Document[0] == &second["pod"].Document[0])
	require.Equal(t, len(corrected), budget.used)
	lease.Release()
	require.Equal(t, len(corrected), budget.used)
	secondLease.Release()
	require.Zero(t, budget.used)
	require.Equal(t, raw, string(source))

	tooSmall := &nativeSchemaBudget{limit: len(corrected) - 1}
	result, failures, failedLease := fetchNativeSchemas(context.Background(), client, bindings, tooSmall)
	require.Empty(t, result)
	require.ErrorContains(t, failures["pod"], "budget exhausted")
	require.Zero(t, tooSmall.used)
	failedLease.Release()
}

func TestNativeSchemaCorrectionUsesExactSchemasCase(t *testing.T) {
	const raw = `{"components":{"schemas":{"native.Pod":{"x-kubernetes-group-version-kind":[{"group":"","version":"v1","kind":"Pod"}]},"io.k8s.apimachinery.pkg.apis.meta.v1.Time":{"type":"string","marker":"A","maximum":9007199254740993}},"Schemas":{"native.Pod":{"x-kubernetes-group-version-kind":[{"group":"","version":"v1","kind":"Pod"}]},"io.k8s.apimachinery.pkg.apis.meta.v1.Time":{"type":"string","marker":"B","maximum":9007199254740995}}},"wide":9007199254740997}`
	const original = `{"type":"string","marker":"A","maximum":9007199254740993}`
	const corrected = `{"marker":"A","maximum":9007199254740993,"nullable":true,"type":"string"}`
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(raw))
	}))
	result, failures, lease := fetchNativeSchemas(context.Background(), client, map[string]nativeType{"pod": schemaBudgetBinding("")}, &nativeSchemaBudget{})
	defer lease.Release()
	require.Empty(t, failures)
	require.Equal(t, strings.Replace(raw, original, corrected, 1), string(result["pod"].Document))
}

func TestNativeSchemaCorrectionRejectsNonobjectContainers(t *testing.T) {
	for _, document := range []string{
		`{"Components":{"schemas":{"native.Pod":{"x-kubernetes-group-version-kind":[{"group":"","version":"v1","kind":"Pod"}]},"io.k8s.apimachinery.pkg.apis.meta.v1.Time":{}}},"components":null}`,
		`{"components":{"schemas":null,"Schemas":{"native.Pod":{"x-kubernetes-group-version-kind":[{"group":"","version":"v1","kind":"Pod"}]},"io.k8s.apimachinery.pkg.apis.meta.v1.Time":{}}}}`,
	} {
		client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(document))
		}))
		budget := &nativeSchemaBudget{}
		result, failures, lease := fetchNativeSchemas(context.Background(), client, map[string]nativeType{"pod": schemaBudgetBinding("")}, budget)
		require.Empty(t, result)
		require.ErrorContains(t, failures["pod"], "time component location is invalid")
		require.Zero(t, budget.used)
		lease.Release()
	}
}

func TestNativeSchemaCorrectionRespectsDocumentLimit(t *testing.T) {
	prefix := `{"components":{"schemas":{"native.Pod":{"x-kubernetes-group-version-kind":[{"group":"","version":"v1","kind":"Pod"}]},"io.k8s.apimachinery.pkg.apis.meta.v1.Time":{"type":"string"}}},"padding":"`
	suffix := `"}`
	document := prefix + strings.Repeat("x", maxNativeSchemaBytes-len(prefix)-len(suffix)) + suffix
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(document))
	}))
	budget := &nativeSchemaBudget{}
	result, failures, lease := fetchNativeSchemas(context.Background(), client, map[string]nativeType{"pod": schemaBudgetBinding("")}, budget)
	defer lease.Release()
	require.Empty(t, result)
	require.ErrorContains(t, failures["pod"], "document exceeds")
	require.Zero(t, budget.used)
}

func TestNativeSchemaFailureIsNotAbsence(t *testing.T) {
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	bindings := map[string]nativeType{"pod": {GVR: schema.GroupVersionResource{Version: "v1", Resource: "pods"}, API: metav1.APIResource{Kind: "Pod"}}}
	result, failures, lease := fetchNativeSchemas(context.Background(), client, bindings, &nativeSchemaBudget{})
	defer lease.Release()
	require.Empty(t, result)
	require.Error(t, failures["pod"])
}

func TestNativeSchemaCancellation(t *testing.T) {
	var calls atomic.Int32
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls.Add(1) }))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	bindings := map[string]nativeType{"pod": {GVR: schema.GroupVersionResource{Version: "v1", Resource: "pods"}, API: metav1.APIResource{Kind: "Pod"}}}
	result, failures, lease := fetchNativeSchemas(ctx, client, bindings, &nativeSchemaBudget{})
	defer lease.Release()
	require.Empty(t, result)
	require.ErrorIs(t, failures["pod"], context.Canceled)
	require.Zero(t, calls.Load())
}

func schemaBudgetFixture(group string) string {
	return fmt.Sprintf(`{"openapi":"3.0.0","components":{"schemas":{"native.Pod":{"x-kubernetes-group-version-kind":[{"group":%q,"version":"v1","kind":"Pod"}],"properties":{"spec":{"$ref":"#/components/schemas/native.Spec"}}},"native.Spec":{"type":"object"}}}}`, group)
}

func schemaBudgetBinding(group string) nativeType {
	return nativeType{GVR: schema.GroupVersionResource{Group: group, Version: "v1", Resource: "pods"}, API: metav1.APIResource{Kind: "Pod"}}
}

func TestNativeSchemaBudgetAcrossGroupsAndConnections(t *testing.T) {
	first, second := schemaBudgetFixture("a"), schemaBudgetFixture("b")
	var calls atomic.Int32
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		switch r.URL.Path {
		case "/openapi/v3/apis/a/v1":
			_, _ = w.Write([]byte(first))
		case "/openapi/v3/apis/b/v1":
			_, _ = w.Write([]byte(second))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	budget := &nativeSchemaBudget{limit: len(first) + len(second) - 1}
	result, failures, lease := fetchNativeSchemas(context.Background(), client, map[string]nativeType{
		"a": schemaBudgetBinding("a"), "b": schemaBudgetBinding("b"),
	}, budget)
	require.Equal(t, first, string(result["a"].Document))
	require.NotContains(t, result, "b", "unavailable schemas must not inherit another group's document")
	require.ErrorContains(t, failures["b"], "budget exhausted")
	require.Equal(t, len(first), budget.used)
	require.Equal(t, int32(2), calls.Load())

	other, otherFailures, otherLease := fetchNativeSchemas(context.Background(), client, map[string]nativeType{"b": schemaBudgetBinding("b")}, budget)
	require.Empty(t, other, "another connection shares the provider budget")
	require.ErrorContains(t, otherFailures["b"], "budget exhausted")
	require.Equal(t, len(first), budget.used)
	otherLease.Release()
	require.Equal(t, len(first), budget.used)

	// Drop the first snapshot before releasing its accounting, as teardown and
	// replacement do in the provider.
	result = nil
	lease.Release()
	lease.Release()
	require.Zero(t, budget.used, "release is idempotent")
	replacement, replacementFailures, replacementLease := fetchNativeSchemas(context.Background(), client, map[string]nativeType{"b": schemaBudgetBinding("b")}, budget)
	require.Empty(t, replacementFailures)
	require.Equal(t, second, string(replacement["b"].Document))
	require.Equal(t, len(second), budget.used)
	replacement = nil
	replacementLease.Release()
	require.Zero(t, budget.used)
}

func TestNativeSchemaBudgetExactBoundaryAndFailedReplacement(t *testing.T) {
	document := schemaBudgetFixture("a")
	var invalid, changed atomic.Bool
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if invalid.Load() {
			_, _ = w.Write([]byte(`{"components":{},"components":{}}`))
			return
		}
		if changed.Load() {
			_, _ = w.Write([]byte(strings.ReplaceAll(document, "native.Spec", "native.Other")))
			return
		}
		_, _ = w.Write([]byte(document))
	}))
	budget := &nativeSchemaBudget{limit: len(document)}
	bindings := map[string]nativeType{"a": schemaBudgetBinding("a")}
	result, failures, lease := fetchNativeSchemas(context.Background(), client, bindings, budget)
	require.Empty(t, failures)
	require.Len(t, result, 1)
	require.Equal(t, budget.limit, budget.used)
	duplicate, duplicateFailures, duplicateLease := fetchNativeSchemas(context.Background(), client, bindings, budget)
	require.Empty(t, duplicateFailures)
	require.Equal(t, document, string(duplicate["a"].Document))
	require.True(t, &result["a"].Document[0] == &duplicate["a"].Document[0], "duplicate leases share cached allocation")
	require.Equal(t, budget.limit, budget.used, "identical content must fit a full budget")
	changed.Store(true)
	blocked, blockedFailures, blockedLease := fetchNativeSchemas(context.Background(), client, bindings, budget)
	require.Empty(t, blocked)
	require.ErrorContains(t, blockedFailures["a"], "budget exhausted")
	blockedLease.Release()
	blockedLease.Release()
	require.Equal(t, budget.limit, budget.used, "failed leases cannot release cached content")
	result = nil
	lease.Release()
	lease.Release()
	require.Equal(t, budget.limit, budget.used, "duplicate lease must retain cached bytes after original release")
	require.Equal(t, document, string(duplicate["a"].Document))
	stillBlocked, stillBlockedFailures, stillBlockedLease := fetchNativeSchemas(context.Background(), client, bindings, budget)
	require.Empty(t, stillBlocked)
	require.ErrorContains(t, stillBlockedFailures["a"], "budget exhausted")
	stillBlockedLease.Release()
	duplicate = nil
	duplicateLease.Release()
	duplicateLease.Release()
	require.Zero(t, budget.used, "only the final lease releases cached bytes; release is idempotent")
	changed.Store(false)
	invalid.Store(true)
	failed, failedErrors, failedLease := fetchNativeSchemas(context.Background(), client, bindings, budget)
	require.Empty(t, failed)
	require.Error(t, failedErrors["a"], "duplicate JSON keys stay invalid")
	failedLease.Release()
	require.Zero(t, budget.used, "failed replacement must not retain bytes")
	invalid.Store(false)
	recovered, recoveredErrors, recoveredLease := fetchNativeSchemas(context.Background(), client, bindings, budget)
	require.Len(t, recovered, 1)
	require.Empty(t, recoveredErrors)
	recoveredLease.Release()
}

func TestNativeSchemaUnmappedDocumentDoesNotConsumeBudget(t *testing.T) {
	document := schemaBudgetFixture("different")
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(document))
	}))
	budget := &nativeSchemaBudget{limit: len(document)}
	result, failures, lease := fetchNativeSchemas(context.Background(), client, map[string]nativeType{"a": schemaBudgetBinding("a")}, budget)
	defer lease.Release()
	require.Empty(t, result)
	require.ErrorContains(t, failures["a"], "root unavailable")
	require.Zero(t, budget.used)
}

func TestNativeSchemaDocumentLimitSurvivesAggregateBudget(t *testing.T) {
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(strings.Repeat(" ", maxNativeSchemaBytes+1)))
	}))
	budget := &nativeSchemaBudget{}
	result, failures, lease := fetchNativeSchemas(context.Background(), client, map[string]nativeType{"a": schemaBudgetBinding("a")}, budget)
	defer lease.Release()
	require.Empty(t, result)
	require.ErrorContains(t, failures["a"], "document exceeds")
	require.Zero(t, budget.used)
	require.Equal(t, 32<<20, maxNativeRetainedSchemaBytes)
}

func TestNativeSchemaReleaseAndQueuedCancellationDuringFetch(t *testing.T) {
	document := schemaBudgetFixture("a")
	held := make(chan struct{})
	unblock := make(chan struct{})
	var calls atomic.Int32
	client := nativeSchemaRESTClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path == "/openapi/v3/apis/b/v1" {
			close(held)
			select {
			case <-unblock:
			case <-r.Context().Done():
				return
			}
			_, _ = w.Write([]byte(schemaBudgetFixture("b")))
			return
		}
		_, _ = w.Write([]byte(document))
	}))
	budget := &nativeSchemaBudget{limit: 2 * len(document)}
	result, failures, firstLease := fetchNativeSchemas(context.Background(), client, map[string]nativeType{"a": schemaBudgetBinding("a")}, budget)
	require.Empty(t, failures)
	require.Len(t, result, 1)
	defer firstLease.Release()
	result = nil

	fetchDone := make(chan struct{})
	heldCtx, cancelHeld := context.WithCancel(context.Background())
	go func() {
		defer close(fetchDone)
		_, _, lease := fetchNativeSchemas(heldCtx, client, map[string]nativeType{"b": schemaBudgetBinding("b")}, budget)
		lease.Release()
	}()
	defer func() {
		cancelHeld()
		close(unblock)
		<-fetchDone
	}()
	select {
	case <-held:
	case <-time.After(5 * time.Second):
		t.Fatal("second connection did not start its HTTP request")
	}

	released := make(chan struct{})
	go func() {
		firstLease.Release()
		close(released)
	}()
	select {
	case <-released:
	case <-time.After(5 * time.Second):
		t.Fatal("snapshot release blocked behind another connection's HTTP request")
	}
	budget.mu.Lock()
	used := budget.used
	budget.mu.Unlock()
	require.Zero(t, used)

	queuedCtx, cancelQueued := context.WithCancel(context.Background())
	defer cancelQueued()
	queued := make(chan struct{})
	cancelResult := make(chan error, 1)
	go func() {
		close(queued)
		_, failures, lease := fetchNativeSchemas(queuedCtx, client, map[string]nativeType{"c": schemaBudgetBinding("c")}, budget)
		lease.Release()
		cancelResult <- failures["c"]
	}()
	<-queued
	cancelQueued()
	select {
	case err := <-cancelResult:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(5 * time.Second):
		t.Fatal("queued schema fetch ignored cancellation")
	}
	require.Equal(t, int32(2), calls.Load(), "queued canceled connection must not issue HTTP")
}
