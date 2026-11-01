package resource

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/discovery/fake"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	clienttesting "k8s.io/client-go/testing"
)

func parityQuery(selector string) resourcev2.NativeQueryRequest {
	return resourcev2.NativeQueryRequest{
		Target:   nativeTestEnumerate(nil).Target,
		Language: "kubernetes-label-selector.v1",
		Query: resourcev2.Value{Kind: "map", Map: map[string]resourcev2.Value{
			"labelSelector": {Kind: "string", String: selector},
		}},
		PageSize: 2,
	}
}

func TestNativeParityLabelQueryBindsSelectorAndUsesAllNamespaces(t *testing.T) {
	var calls atomic.Int32
	client := nativeTestHTTPClient(t, func(request *http.Request) *unstructured.UnstructuredList {
		assert.Equal(t, "/apis/sample.example/v1/widgets", request.URL.Path)
		assert.Equal(t, "app in (api,worker),!disabled", request.URL.Query().Get("labelSelector"))
		assert.Equal(t, "2", request.URL.Query().Get("limit"))
		list := nativeTestList(nativeTestObject("native-name", "selected"))
		if calls.Add(1) == 1 {
			assert.Empty(t, request.URL.Query().Get("continue"))
			list.SetContinue("server-next")
		} else {
			assert.Equal(t, "server-next", request.URL.Query().Get("continue"))
		}
		return list
	})
	request := parityQuery("app in (api,worker),!disabled")
	page, err := NativeQuery(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
	require.NoError(t, err)
	require.NotNil(t, page.NextCursor)
	require.Len(t, page.Records, 1)
	assert.Equal(t, "selected", page.Records[0].Reference.Address.Scope[0].Value)
	request.Cursor = page.NextCursor
	changed := request
	changed.Query = parityQuery("app=other").Query
	_, err = NativeQuery(context.Background(), client, nativeTestGVR, true, changed, nativeTestRepresentation())
	require.Error(t, err)
	assert.Equal(t, int32(1), calls.Load(), "selector changes must fail before native acquisition")
	page, err = NativeQuery(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
	require.NoError(t, err)
	assert.Nil(t, page.NextCursor)
	assert.Equal(t, int32(2), calls.Load())
}

func TestNativeParityCollects500WithBoundedNativePages(t *testing.T) {
	assert.Equal(t, 256, int(resourcev2.MaxPageRecords))
	var calls atomic.Int32
	client := nativeTestHTTPClient(t, func(request *http.Request) *unstructured.UnstructuredList {
		assert.Equal(t, "/apis/sample.example/v1/widgets", request.URL.Path)
		list := nativeTestList()
		start, count := 0, 256
		if calls.Add(1) == 1 {
			assert.Equal(t, "256", request.URL.Query().Get("limit"))
			list.SetContinue("remaining-244")
		} else {
			start, count = 256, 244
			assert.Equal(t, "256", request.URL.Query().Get("limit"))
			assert.Equal(t, "remaining-244", request.URL.Query().Get("continue"))
		}
		for index := start; index < start+count; index++ {
			list.Items = append(list.Items, *nativeTestObject(fmt.Sprintf("widget-%03d", index), "selected"))
		}
		return list
	})
	request := nativeTestEnumerate(nil)
	request.PageSize = 256
	first, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
	require.NoError(t, err)
	require.Len(t, first.Records, 256)
	require.NotNil(t, first.NextCursor)
	request.Cursor = first.NextCursor
	second, err := NativeEnumerate(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
	require.NoError(t, err)
	require.Len(t, second.Records, 244)
	assert.Nil(t, second.NextCursor)
	assert.Equal(t, 500, len(first.Records)+len(second.Records))
	assert.Equal(t, "widget-256", second.Records[0].Reference.Address.ID)
	request.Cursor = nil
	request.PageSize = 500
	_, err = NativeEnumerate(context.Background(), client, nativeTestGVR, true, request, nativeTestRepresentation())
	require.Error(t, err)
	assert.Equal(t, int32(2), calls.Load(), "collection size must not raise the native page ceiling")
}

func TestNativeParityRepresentationProjection(t *testing.T) {
	object := nativeTestObject("native-name", "selected")
	object.Object["metadata"].(map[string]any)["managedFields"] = []any{map[string]any{"manager": "controller", "operation": "Apply"}}
	object.Object["spec"] = map[string]any{"value": "kept"}
	for _, model := range []bool{false, true} {
		t.Run(fmt.Sprintf("model=%t", model), func(t *testing.T) {
			representation := nativeTestRepresentation()
			representation.ID = "kubernetes.object.v1/sample.example/v1"
			if model {
				representation.ID = "kubernetes.model.v1/sample.example/v1"
			}
			request := nativeTestGet("selected")
			request.Representation = representation.ID
			record, err := NativeGet(context.Background(), nativeTestClient(object.DeepCopy()), nativeTestGVR, true, request, representation)
			require.NoError(t, err)
			assert.Equal(t, representation, record.Representation)
			_, managed := record.Body.Map["metadata"].Map["managedFields"]
			assert.Equal(t, !model, managed)
			assert.Equal(t, "kept", record.Body.Map["spec"].Map["value"].String)
			if model {
				assert.Equal(t, "partial", record.Coverage.Kind)
				assert.Equal(t, []string{"/metadata/managedFields"}, record.Coverage.Paths)
				assert.Equal(t, "Kubernetes model projection omits metadata.managedFields", record.Coverage.Reason)
			} else {
				assert.Equal(t, "complete", record.Coverage.Kind)
			}
		})
	}
	_, retained, err := unstructured.NestedSlice(object.Object, "metadata", "managedFields")
	require.NoError(t, err)
	assert.True(t, retained, "projection must not mutate the native object")
}

func TestNativeParityServedVersionsAndRequestedEndpoint(t *testing.T) {
	discovery := &fake.FakeDiscovery{Fake: &clienttesting.Fake{Resources: []*metav1.APIResourceList{}}}
	for _, version := range []string{"v1", "v2"} {
		discovery.Resources = append(discovery.Resources, &metav1.APIResourceList{
			GroupVersion: "sample.example/" + version,
			APIResources: []metav1.APIResource{{Name: "widgets", Kind: "Widget", Namespaced: true, Verbs: metav1.Verbs{"get", "list", "delete"}}},
		})
	}
	bindings, coverage, err := discoverNativeTypes(context.Background(), discovery)
	require.NoError(t, err)
	binding := bindings["k8s:sample.example/widgets"]
	require.Len(t, binding.Served, 2)
	for _, version := range []string{"v1", "v2"} {
		served, ok := binding.Served["sample.example/"+version]
		require.True(t, ok)
		expectedGVR := nativeTestGVR
		expectedGVR.Version = version
		assert.Equal(t, expectedGVR, served.GVR)
		assert.Equal(t, "widgets", served.API.Name)
	}
	provider := &kubernetesProvider{logger: zap.NewNop().Sugar()}
	snapshot, err := provider.assembleNativeCatalog(context.Background(), "route", &clients.ClientSet{}, bindings, coverage, nil, nil, nil, nativeTestAny())
	require.NoError(t, err)
	binding = snapshot.bindings["k8s:sample.example/widgets"]
	require.Len(t, binding.Descriptor.Representations, 4)
	expectedRepresentations := []string{
		"kubernetes.object.v1/sample.example/v1",
		"kubernetes.model.v1/sample.example/v1",
		"kubernetes.object.v1/sample.example/v2",
		"kubernetes.model.v1/sample.example/v2",
	}
	actualRepresentations := make([]string, 0, len(binding.Descriptor.Representations))
	for _, representation := range binding.Descriptor.Representations {
		actualRepresentations = append(actualRepresentations, representation.ID)
	}
	assert.ElementsMatch(t, expectedRepresentations, actualRepresentations)
	registration := provider.nativeRegistration(resourcev2.AccessRoute{Connection: "route"}, binding)
	require.NotNil(t, registration.Get)
	for _, representation := range binding.Descriptor.Representations {
		request := nativeTestGet("selected")
		request.Representation = representation.ID
		var path string
		server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			path = request.URL.Path
			object := nativeTestObject("native-name", "selected")
			writer.Header().Set("Content-Type", "application/json")
			assert.NoError(t, json.NewEncoder(writer).Encode(object))
		}))
		client, err := dynamic.NewForConfig(&rest.Config{Host: server.URL})
		require.NoError(t, err)
		record, err := registration.Get(context.Background(), &clients.ClientSet{DynamicClient: client}, request)
		server.Close()
		require.NoError(t, err)
		assert.Equal(t, representation.ID, record.Representation.ID)
		version := representation.ID[len(representation.ID)-2:]
		assert.Equal(t, "/apis/sample.example/"+version+"/namespaces/selected/widgets/native-name", path)
	}
}

func TestNativeParityDeleteUsesObservedHTTPPreconditions(t *testing.T) {
	for _, expected := range []*string{nil, mutationToken("rv:opaque/9")} {
		t.Run(fmt.Sprintf("explicit=%t", expected != nil), func(t *testing.T) {
			var deletes atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				assert.Equal(t, "/apis/sample.example/v1/namespaces/selected/widgets/native-name", request.URL.Path)
				writer.Header().Set("Content-Type", "application/json")
				if request.Method == http.MethodGet {
					assert.NoError(t, json.NewEncoder(writer).Encode(nativeTestObject("native-name", "selected")))
					return
				}
				assert.Equal(t, http.MethodDelete, request.Method)
				deletes.Add(1)
				var options metav1.DeleteOptions
				assert.NoError(t, json.NewDecoder(request.Body).Decode(&options))
				if assert.NotNil(t, options.Preconditions) {
					if assert.NotNil(t, options.Preconditions.UID) {
						assert.Equal(t, "native-uid", string(*options.Preconditions.UID))
					}
					if assert.NotNil(t, options.Preconditions.ResourceVersion) {
						assert.Equal(t, "rv:opaque/9", *options.Preconditions.ResourceVersion)
					}
				}
				assert.NoError(t, json.NewEncoder(writer).Encode(&metav1.Status{TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "Status"}, Status: "Success"}))
			}))
			t.Cleanup(server.Close)
			client, err := dynamic.NewForConfig(&rest.Config{Host: server.URL})
			require.NoError(t, err)
			get := nativeTestGet("selected")
			request := resourcev2.MutationRequest{Route: get.Route, Reference: get.Reference, Operation: "delete", Input: resourcev2.Value{Kind: "null"}, ExpectedRevision: expected}
			_, err = NativeMutate(context.Background(), client, nativeTestGVR, true, []string{"delete"}, request, nativeTestRepresentation())
			require.NoError(t, err)
			assert.Equal(t, int32(1), deletes.Load())
		})
	}
}

func TestNativeParityDeleteRejectsMissingObservedTokensAndNamespace(t *testing.T) {
	for _, missing := range []string{"uid", "revision", "namespace"} {
		t.Run(missing, func(t *testing.T) {
			object := nativeTestObject("native-name", "selected")
			get := nativeTestGet("selected")
			switch missing {
			case "uid":
				object.SetUID("")
			case "revision":
				object.SetResourceVersion("")
			case "namespace":
				get.Reference.Address.Scope = nil
			}
			client := nativeTestClient(object)
			request := resourcev2.MutationRequest{Route: get.Route, Reference: get.Reference, Operation: "delete", Input: resourcev2.Value{Kind: "null"}}
			_, err := NativeMutate(context.Background(), client, nativeTestGVR, true, []string{"delete"}, request, nativeTestRepresentation())
			require.Error(t, err)
			for _, action := range client.Actions() {
				assert.NotEqual(t, "delete", action.GetVerb())
			}
			if missing == "namespace" {
				assert.Empty(t, client.Actions())
				_, err = NativeGet(context.Background(), client, nativeTestGVR, true, get, nativeTestRepresentation())
				require.Error(t, err)
				assert.Empty(t, client.Actions())
			}
		})
	}
}

func TestNativeParityConfiguredNamespaceScopeBoundsFiniteAdmission(t *testing.T) {
	discovery := &fake.FakeDiscovery{Fake: &clienttesting.Fake{Resources: []*metav1.APIResourceList{{
		GroupVersion: "sample.example/v1",
		APIResources: []metav1.APIResource{{Name: "widgets", Kind: "Widget", Namespaced: true, Verbs: metav1.Verbs{"get", "list", "delete"}}},
	}}}}
	bindings, coverage, err := discoverNativeTypes(context.Background(), discovery)
	require.NoError(t, err)
	provider := &kubernetesProvider{logger: zap.NewNop().Sugar()}
	scope := nativeTestOneOf("selected")
	snapshot, err := provider.assembleNativeCatalog(context.Background(), "route", &clients.ClientSet{}, bindings, coverage, nil, nil, nil, scope)
	require.NoError(t, err)
	descriptor := snapshot.bindings["k8s:sample.example/widgets"].Descriptor
	for _, capability := range descriptor.Capabilities {
		assert.Equal(t, scope, capability.Scope)
	}
	var nativeCalls atomic.Int32
	registration := snapshot.registrations[descriptor.Type]
	registration.Enumerate = func(context.Context, *clients.ClientSet, resourcev2.EnumerateRequest) (resourcev2.SourcePage, error) {
		nativeCalls.Add(1)
		return resourcev2.SourcePage{}, nil
	}
	controller, err := resourcev2.NewController(resourcev2.Config[clients.ClientSet]{
		Catalog: func(context.Context, resourcev2.CatalogRequest) (resourcev2.Catalog, error) {
			return snapshot.catalog, nil
		},
		Registrations: []resourcev2.Registration[clients.ClientSet]{registration},
	})
	require.NoError(t, err)
	catalog, err := controller.Catalog(context.Background(), resourcev2.CatalogRequest{Route: resourcev2.AccessRoute{Connection: "route"}})
	require.NoError(t, err)
	request := nativeTestEnumerate(nativeTestAny())
	request.Target.Representation = descriptor.DefaultRepresentation
	ctx := resourcev2.WithCatalogRevisionForRoute(context.Background(), "kubernetes", request.Target.Route, catalog.Revision)
	_, err = controller.Enumerate(ctx, request)
	require.Error(t, err)
	assert.Zero(t, nativeCalls.Load(), "all-namespace omission must not widen configured namespace selection")
}
