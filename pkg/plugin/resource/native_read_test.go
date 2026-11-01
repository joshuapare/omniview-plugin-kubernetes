package resource

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/rest"
	clienttesting "k8s.io/client-go/testing"
)

var nativeTestGVR = schema.GroupVersionResource{Group: "sample.example", Version: "v1", Resource: "widgets"}

func nativeTestRepresentation() resourcev2.Representation {
	return resourcev2.Representation{
		ID: "native", Revision: "native/v1",
		Schema: resourcev2.SchemaBinding{State: "absent"},
	}
}

func nativeTestObject(name, namespace string) *unstructured.Unstructured {
	object := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "sample.example/v1", "kind": "Widget",
		"metadata": map[string]any{"name": name},
	}}
	object.SetNamespace(namespace)
	object.SetUID(types.UID("native-uid"))
	object.SetResourceVersion("rv:opaque/9")
	return object
}

func nativeTestClient(objects ...runtime.Object) *dynamicfake.FakeDynamicClient {
	return dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{nativeTestGVR: "WidgetList"}, objects...)
}

// Use the real dynamic HTTP client when asserting ListOptions: client-go's
// fake dynamic client drops Limit and Continue from its recorded list actions.
func nativeTestHTTPClient(t *testing.T, handle func(*http.Request) *unstructured.UnstructuredList) dynamic.Interface {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		assert.Equal(t, http.MethodGet, request.Method)
		writer.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(writer).Encode(handle(request)))
	}))
	t.Cleanup(server.Close)
	client, err := dynamic.NewForConfig(&rest.Config{Host: server.URL})
	require.NoError(t, err)
	return client
}

func nativeTestGet(namespace string) resourcev2.GetRequest {
	scope := []resourcev2.ScopeEntry{}
	if namespace != "" {
		scope = append(scope, resourcev2.ScopeEntry{Dimension: "namespace", Value: namespace})
	}
	return resourcev2.GetRequest{
		Route: resourcev2.AccessRoute{Connection: "route"},
		Reference: resourcev2.ResourceReference{Address: resourcev2.ResourceAddress{
			Provider: "kubernetes", Authority: "authority", Type: "k8s:sample.example/widgets", ID: "native-name", Scope: scope,
		}},
		Representation: "native",
	}
}

func nativeTestEnumerate(scope resourcev2.QueryScope) resourcev2.EnumerateRequest {
	return resourcev2.EnumerateRequest{Target: resourcev2.ReadTarget{
		Route:    resourcev2.AccessRoute{Connection: "route"},
		Provider: "kubernetes", Authority: "authority", Type: "k8s:sample.example/widgets", Scope: scope, Representation: "native",
	}, PageSize: 2}
}

func nativeTestOneOf(namespaces ...string) resourcev2.QueryScope {
	if namespaces == nil {
		namespaces = []string{}
	}
	return resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeOneOf, Values: &namespaces}}
}

func nativeTestAny() resourcev2.QueryScope {
	return resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}
}

func nativeTestList(items ...*unstructured.Unstructured) *unstructured.UnstructuredList {
	list := &unstructured.UnstructuredList{Items: []unstructured.Unstructured{}}
	list.SetAPIVersion("sample.example/v1")
	list.SetKind("WidgetList")
	list.SetResourceVersion("list-revision")
	for _, item := range items {
		list.Items = append(list.Items, *item)
	}
	return list
}

func TestNativeGetPreservesCanonicalBodyAndIdentity(t *testing.T) {
	object := nativeTestObject("native-name", "selected")
	object.Object["spec"] = map[string]any{
		"exact":  int64(9223372036854775807),
		"double": float64(3),
		"nested": []any{nil, true, "value"},
		"large":  strings.Repeat("x", 2<<20),
	}
	client := nativeTestClient(object)
	record, err := NativeGet(context.Background(), client, nativeTestGVR, true, nativeTestGet("selected"), nativeTestRepresentation())
	require.NoError(t, err)
	assert.Equal(t, nativeTestGet("selected").Reference.Address, record.Reference.Address)
	require.NotNil(t, record.Reference.Incarnation)
	assert.Equal(t, "native-uid", *record.Reference.Incarnation)
	require.NotNil(t, record.SourceRevision)
	assert.Equal(t, "rv:opaque/9", *record.SourceRevision)
	assert.Equal(t, "complete", record.Coverage.Kind)
	assert.Equal(t, nativeTestRepresentation(), record.Representation)
	spec := record.Body.Map["spec"]
	assert.Equal(t, "int64", spec.Map["exact"].Kind)
	assert.Equal(t, "9223372036854775807", spec.Map["exact"].Int)
	assert.Equal(t, "double", spec.Map["double"].Kind)
	assert.Equal(t, float64(3), spec.Map["double"].Double)
	assert.Equal(t, 2<<20, len(spec.Map["large"].String))
	assert.Equal(t, "null", spec.Map["nested"].List[0].Kind)
	require.Len(t, client.Actions(), 1)
	assert.Equal(t, nativeTestGVR, client.Actions()[0].GetResource())
	assert.Equal(t, "selected", client.Actions()[0].GetNamespace())
}

func TestNativeGetIncarnationAndOptionalTokens(t *testing.T) {
	t.Run("replacement", func(t *testing.T) {
		client := nativeTestClient(nativeTestObject("native-name", "selected"))
		request := nativeTestGet("selected")
		request.Reference.Incarnation = nativeOptionalToken("previous-uid")
		_, err := NativeGet(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
		assert.Equal(t, "RESET_REQUIRED", resourcev2.ErrorCode(err))
	})
	t.Run("same incarnation", func(t *testing.T) {
		client := nativeTestClient(nativeTestObject("native-name", "selected"))
		request := nativeTestGet("selected")
		request.Reference.Incarnation = nativeOptionalToken("native-uid")
		_, err := NativeGet(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
		require.NoError(t, err)
	})
	t.Run("absent tokens", func(t *testing.T) {
		object := nativeTestObject("native-name", "")
		object.SetUID("")
		object.SetResourceVersion("")
		client := nativeTestClient(object)
		record, err := NativeGet(context.Background(), client, nativeTestGVR, false, nativeTestGet(""), nativeTestRepresentation())
		require.NoError(t, err)
		assert.Nil(t, record.Reference.Incarnation)
		assert.Nil(t, record.SourceRevision)
		assert.Empty(t, record.Reference.Address.Scope)
	})
}

func TestNativeGetRejectsInvalidScopeBeforeAcquisition(t *testing.T) {
	cases := []struct {
		name       string
		namespaced bool
		scope      []resourcev2.ScopeEntry
	}{
		{"missing", true, nil},
		{"empty", true, []resourcev2.ScopeEntry{{Dimension: "namespace"}}},
		{"unknown", true, []resourcev2.ScopeEntry{{Dimension: "region", Value: "selected"}}},
		{"duplicate", true, []resourcev2.ScopeEntry{{Dimension: "namespace", Value: "selected"}, {Dimension: "namespace", Value: "selected"}}},
		{"cluster dimension", false, []resourcev2.ScopeEntry{{Dimension: "namespace", Value: "selected"}}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			client := nativeTestClient()
			request := nativeTestGet("selected")
			request.Reference.Address.Scope = test.scope
			_, err := NativeGet(context.Background(), client, nativeTestGVR, test.namespaced, request, nativeTestRepresentation())
			assert.Equal(t, "INVALID_REQUEST", resourcev2.ErrorCode(err))
			assert.Empty(t, client.Actions())
		})
	}
}

func TestNativeEnumerateUsesBoundedSourcePagination(t *testing.T) {
	var calls atomic.Int32
	client := nativeTestHTTPClient(t, func(request *http.Request) *unstructured.UnstructuredList {
		assert.Equal(t, "/apis/sample.example/v1/widgets", request.URL.Path)
		assert.Equal(t, "2", request.URL.Query().Get("limit"))
		if calls.Add(1) == 1 {
			assert.Empty(t, request.URL.Query().Get("continue"))
			list := nativeTestList(nativeTestObject("first", "a"), nativeTestObject("second", "b"))
			list.SetContinue("native-server-continuation")
			remaining := int64(100)
			list.SetRemainingItemCount(&remaining)
			return list
		}
		assert.Equal(t, "native-server-continuation", request.URL.Query().Get("continue"))
		return nativeTestList(nativeTestObject("third", "b"))
	})
	request := nativeTestEnumerate(nativeTestAny())
	page, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
	require.NoError(t, err)
	require.Len(t, page.Records, 2)
	assert.Equal(t, int32(1), calls.Load())
	assert.Equal(t, "unknown", page.Count.Kind)
	assert.Nil(t, page.Count.Value)
	assert.Equal(t, "complete", page.Coverage.Kind)
	assert.Equal(t, "bestEffort", page.Consistency)
	assert.Equal(t, "list-revision", *page.SourceRevision)
	require.NotNil(t, page.NextCursor)
	assert.NotEqual(t, "native-server-continuation", *page.NextCursor)
	assert.Equal(t, "a", page.Records[0].Reference.Address.Scope[0].Value)
	assert.Equal(t, request.Target.Type, page.Records[0].Reference.Address.Type)
	request.Cursor = page.NextCursor
	page, err = NativeEnumerate(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
	require.NoError(t, err)
	require.Len(t, page.Records, 1)
	assert.Nil(t, page.NextCursor)
	assert.Equal(t, "unknown", page.Count.Kind)
	assert.Equal(t, int32(2), calls.Load())
}

func TestNativeEnumerateSelectedNamespaces(t *testing.T) {
	var calls atomic.Int32
	client := nativeTestHTTPClient(t, func(request *http.Request) *unstructured.UnstructuredList {
		assert.Equal(t, "2", request.URL.Query().Get("limit"))
		switch calls.Add(1) {
		case 1:
			assert.Equal(t, "/apis/sample.example/v1/namespaces/a/widgets", request.URL.Path)
			assert.Empty(t, request.URL.Query().Get("continue"))
			list := nativeTestList(nativeTestObject("first", "a"))
			list.SetContinue("a-next")
			return list
		case 2:
			assert.Equal(t, "/apis/sample.example/v1/namespaces/a/widgets", request.URL.Path)
			assert.Equal(t, "a-next", request.URL.Query().Get("continue"))
			return nativeTestList()
		default:
			assert.Equal(t, "/apis/sample.example/v1/namespaces/b/widgets", request.URL.Path)
			assert.Empty(t, request.URL.Query().Get("continue"))
			return nativeTestList(nativeTestObject("last", "b"))
		}
	})
	request := nativeTestEnumerate(nativeTestOneOf("b", "a", "a"))
	for index := range 3 {
		page, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
		require.NoError(t, err)
		assert.Equal(t, int32(index+1), calls.Load(), "one native request per source page")
		assert.Nil(t, page.SourceRevision, "independent namespace lists have no common revision")
		assert.Equal(t, "bestEffort", page.Consistency)
		assert.Equal(t, "unknown", page.Count.Kind)
		if index < 2 {
			require.NotNil(t, page.NextCursor)
		} else {
			assert.Nil(t, page.NextCursor)
		}
		request.Cursor = page.NextCursor
		request.Target.Scope = nativeTestOneOf("a", "b")
	}
}

func TestNativeEnumerateEmptySelectionAndClusterScope(t *testing.T) {
	t.Run("empty oneOf", func(t *testing.T) {
		client := nativeTestClient()
		page, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, nativeTestEnumerate(nativeTestOneOf()), nativeTestRepresentation())
		require.NoError(t, err)
		assert.Empty(t, page.Records)
		assert.NotNil(t, page.Records)
		assert.Equal(t, "unknown", page.Count.Kind)
		assert.Nil(t, page.NextCursor)
		assert.Empty(t, client.Actions())
	})
	t.Run("cluster", func(t *testing.T) {
		client := nativeTestClient()
		client.PrependReactor("list", "widgets", func(action clienttesting.Action) (bool, runtime.Object, error) {
			assert.Empty(t, action.GetNamespace())
			return true, nativeTestList(nativeTestObject("cluster-name", "")), nil
		})
		page, err := NativeEnumerate(context.Background(), client, nativeTestGVR, false, nativeTestEnumerate(resourcev2.QueryScope{}), nativeTestRepresentation())
		require.NoError(t, err)
		require.Len(t, page.Records, 1)
		assert.Empty(t, page.Records[0].Reference.Address.Scope)
	})
}

func TestNativeEnumerateAcceptsMaximumSourcePageSize(t *testing.T) {
	var calls atomic.Int32
	client := nativeTestHTTPClient(t, func(request *http.Request) *unstructured.UnstructuredList {
		calls.Add(1)
		assert.Equal(t, "/apis/sample.example/v1/widgets", request.URL.Path)
		assert.Equal(t, "256", request.URL.Query().Get("limit"))
		assert.Empty(t, request.URL.Query().Get("continue"))
		return nativeTestList()
	})
	request := nativeTestEnumerate(nativeTestAny())
	request.PageSize = resourcev2.MaxPageRecords
	page, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
	require.NoError(t, err)
	assert.Empty(t, page.Records)
	assert.Equal(t, int32(1), calls.Load())
}

func TestNativeEnumerateRejectsInvalidScopeAndPageSize(t *testing.T) {
	empty := []string{""}
	values := []string{"a"}
	cases := []struct {
		name       string
		namespaced bool
		scope      resourcev2.QueryScope
		pageSize   uint32
	}{
		{"unknown", true, resourcev2.QueryScope{{Dimension: "region", Match: resourcev2.ScopeAny}}, 2},
		{"duplicate", true, append(nativeTestAny(), nativeTestAny()...), 2},
		{"missing values", true, resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeOneOf}}, 2},
		{"any values", true, resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny, Values: &values}}, 2},
		{"empty namespace", true, resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeOneOf, Values: &empty}}, 2},
		{"unknown selection", true, resourcev2.QueryScope{{Dimension: "namespace", Match: "prefix"}}, 2},
		{"cluster constraint", false, nativeTestAny(), 2},
		{"zero page", true, nativeTestAny(), 0},
		{"oversized page", true, nativeTestAny(), resourcev2.MaxPageRecords + 1},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			client := nativeTestClient()
			request := nativeTestEnumerate(test.scope)
			request.PageSize = test.pageSize
			_, err := NativeEnumerate(context.Background(), client, nativeTestGVR, test.namespaced, request, nativeTestRepresentation())
			assert.Equal(t, "INVALID_REQUEST", resourcev2.ErrorCode(err))
			assert.Empty(t, client.Actions())
		})
	}
}

func TestNativeEnumerateCursorBindsSource(t *testing.T) {
	client := nativeTestClient()
	client.PrependReactor("list", "widgets", func(action clienttesting.Action) (bool, runtime.Object, error) {
		list := nativeTestList()
		list.SetContinue("native-next")
		return true, list, nil
	})
	original := nativeTestEnumerate(nativeTestOneOf("a", "b"))
	first, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, original, nativeTestRepresentation())
	require.NoError(t, err)
	require.NotNil(t, first.NextCursor)
	cases := []struct {
		name   string
		change func(*resourcev2.EnumerateRequest, *schema.GroupVersionResource, *bool)
	}{
		{"provider", func(r *resourcev2.EnumerateRequest, _ *schema.GroupVersionResource, _ *bool) {
			r.Target.Provider = "other"
		}},
		{"authority", func(r *resourcev2.EnumerateRequest, _ *schema.GroupVersionResource, _ *bool) {
			r.Target.Authority = "other"
		}},
		{"type", func(r *resourcev2.EnumerateRequest, _ *schema.GroupVersionResource, _ *bool) { r.Target.Type = "other" }},
		{"route", func(r *resourcev2.EnumerateRequest, _ *schema.GroupVersionResource, _ *bool) {
			r.Target.Route.Connection = "other"
		}},
		{"scope", func(r *resourcev2.EnumerateRequest, _ *schema.GroupVersionResource, _ *bool) {
			r.Target.Scope = nativeTestOneOf("b")
		}},
		{"page size", func(r *resourcev2.EnumerateRequest, _ *schema.GroupVersionResource, _ *bool) { r.PageSize = 1 }},
		{"GVR", func(_ *resourcev2.EnumerateRequest, g *schema.GroupVersionResource, _ *bool) { g.Resource = "other" }},
		{"namespace mode", func(r *resourcev2.EnumerateRequest, _ *schema.GroupVersionResource, n *bool) {
			*n = false
			r.Target.Scope = resourcev2.QueryScope{}
		}},
		{"malformed", func(r *resourcev2.EnumerateRequest, _ *schema.GroupVersionResource, _ *bool) {
			r.Cursor = nativeOptionalToken("not-a-source-cursor")
		}},
		{"empty", func(r *resourcev2.EnumerateRequest, _ *schema.GroupVersionResource, _ *bool) {
			value := ""
			r.Cursor = &value
		}},
		{"oversized", func(r *resourcev2.EnumerateRequest, _ *schema.GroupVersionResource, _ *bool) {
			value := strings.Repeat("x", nativeReadMaxCursorBytes+1)
			r.Cursor = &value
		}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			request, gvr, namespaced := original, nativeTestGVR, true
			request.Cursor = first.NextCursor
			test.change(&request, &gvr, &namespaced)
			before := len(client.Actions())
			_, err := NativeEnumerate(context.Background(), client, gvr, namespaced, request, nativeTestRepresentation())
			assert.Equal(t, "INVALID_REQUEST", resourcev2.ErrorCode(err))
			assert.Len(t, client.Actions(), before)
		})
	}
}

func TestNativeReadsRejectOutOfScopeResponses(t *testing.T) {
	client := nativeTestClient()
	client.PrependReactor("get", "widgets", func(action clienttesting.Action) (bool, runtime.Object, error) {
		return true, nativeTestObject("native-name", "unselected"), nil
	})
	_, err := NativeGet(context.Background(), client, nativeTestGVR, true, nativeTestGet("selected"), nativeTestRepresentation())
	assert.Equal(t, "INVALID_REQUEST", resourcev2.ErrorCode(err))
	client.PrependReactor("list", "widgets", func(action clienttesting.Action) (bool, runtime.Object, error) {
		return true, nativeTestList(nativeTestObject("native-name", "unselected")), nil
	})
	_, err = NativeEnumerate(context.Background(), client, nativeTestGVR, true, nativeTestEnumerate(nativeTestOneOf("selected")), nativeTestRepresentation())
	assert.Equal(t, "INVALID_REQUEST", resourcev2.ErrorCode(err))
}

func TestNativeEnumerateRejectsUnboundedAndStalledResponses(t *testing.T) {
	t.Run("server ignores limit", func(t *testing.T) {
		client := nativeTestClient()
		client.PrependReactor("list", "widgets", func(action clienttesting.Action) (bool, runtime.Object, error) {
			return true, nativeTestList(nativeTestObject("a", "ns"), nativeTestObject("b", "ns"), nativeTestObject("c", "ns")), nil
		})
		_, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, nativeTestEnumerate(nativeTestAny()), nativeTestRepresentation())
		assert.Equal(t, "RESOURCE_LIMIT", resourcev2.ErrorCode(err))
	})
	t.Run("stalled continuation", func(t *testing.T) {
		client := nativeTestClient()
		client.PrependReactor("list", "widgets", func(action clienttesting.Action) (bool, runtime.Object, error) {
			list := nativeTestList()
			list.SetContinue("same-token")
			return true, list, nil
		})
		request := nativeTestEnumerate(nativeTestAny())
		page, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
		require.NoError(t, err)
		request.Cursor = page.NextCursor
		_, err = NativeEnumerate(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
		assert.Equal(t, "RESET_REQUIRED", resourcev2.ErrorCode(err))
	})
}

func TestNativeReadsEnforceResourceWireBudgets(t *testing.T) {
	t.Run("document body", func(t *testing.T) {
		object := nativeTestObject("native-name", "ns")
		object.Object["spec"] = map[string]any{"large": strings.Repeat("x", resourcev2.MaxDocumentBytes+1)}
		client := nativeTestClient(object)
		record, err := NativeGet(context.Background(), client, nativeTestGVR, true, nativeTestGet("ns"), nativeTestRepresentation())
		assert.Equal(t, "RESOURCE_LIMIT", resourcev2.ErrorCode(err))
		assert.Empty(t, record.Body.Kind)
	})
	t.Run("aggregate page", func(t *testing.T) {
		payload := strings.Repeat("x", resourcev2.MaxPageBodyBytes/3+1)
		objects := make([]*unstructured.Unstructured, 0, 3)
		for _, name := range []string{"a", "b", "c"} {
			object := nativeTestObject(name, "ns")
			object.Object["spec"] = map[string]any{"large": payload}
			objects = append(objects, object)
		}
		client := nativeTestClient()
		client.PrependReactor("list", "widgets", func(action clienttesting.Action) (bool, runtime.Object, error) {
			return true, nativeTestList(objects...), nil
		})
		request := nativeTestEnumerate(nativeTestAny())
		request.PageSize = 3
		page, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
		assert.Equal(t, "RESOURCE_LIMIT", resourcev2.ErrorCode(err))
		assert.Empty(t, page.Records, "over-budget acquisition must not return partial success")
		assert.Len(t, client.Actions(), 1)
	})
}

func TestNativeReadsCancellationAndSourceErrors(t *testing.T) {
	for _, enumerate := range []bool{false, true} {
		for _, during := range []bool{false, true} {
			ctx, cancel := context.WithCancel(context.Background())
			client := nativeTestClient()
			if during {
				client.PrependReactor("*", "widgets", func(action clienttesting.Action) (bool, runtime.Object, error) {
					cancel()
					if action.GetVerb() == "get" {
						return true, nativeTestObject("native-name", "ns"), nil
					}
					return true, nativeTestList(), nil
				})
			} else {
				cancel()
			}
			var err error
			if enumerate {
				_, err = NativeEnumerate(ctx, client, nativeTestGVR, true, nativeTestEnumerate(nativeTestAny()), nativeTestRepresentation())
			} else {
				_, err = NativeGet(ctx, client, nativeTestGVR, true, nativeTestGet("ns"), nativeTestRepresentation())
			}
			assert.True(t, errors.Is(err, context.Canceled))
			if !during {
				assert.Empty(t, client.Actions())
			}
			cancel()
		}
	}
	t.Run("source forbidden", func(t *testing.T) {
		client := nativeTestClient()
		denied := apierrors.NewForbidden(nativeTestGVR.GroupResource(), "native-name", errors.New("denied"))
		client.PrependReactor("*", "widgets", func(action clienttesting.Action) (bool, runtime.Object, error) { return true, nil, denied })
		_, err := NativeGet(context.Background(), client, nativeTestGVR, true, nativeTestGet("ns"), nativeTestRepresentation())
		assert.Same(t, denied, err)
		_, err = NativeEnumerate(context.Background(), client, nativeTestGVR, true, nativeTestEnumerate(nativeTestAny()), nativeTestRepresentation())
		assert.Same(t, denied, err)
	})
	t.Run("expired source continuation", func(t *testing.T) {
		client := nativeTestClient()
		expired := apierrors.NewResourceExpired("The native continuation expired")
		client.PrependReactor("list", "widgets", func(action clienttesting.Action) (bool, runtime.Object, error) {
			return true, nil, expired
		})
		page, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, nativeTestEnumerate(nativeTestAny()), nativeTestRepresentation())
		assert.Same(t, expired, err)
		assert.Empty(t, page.Records)
		assert.Len(t, client.Actions(), 1, "expired acquisition must not restart as a fresh list")
	})
}
