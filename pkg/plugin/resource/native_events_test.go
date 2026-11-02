package resource

import (
	"context"
	"errors"
	"testing"

	"github.com/omniview/kubernetes/pkg/plugin/helm"
	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/fake"
)

func TestGetResourceEventsWithoutHelperUsesBindingKind(t *testing.T) {
	const token = "k8s:kustomize.toolkit.fluxcd.io/kustomizations"
	gvr := schema.GroupVersionResource{Group: "kustomize.toolkit.fluxcd.io", Version: "v1", Resource: "kustomizations"}
	object := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "kustomize.toolkit.fluxcd.io/v1", "kind": "Kustomization",
		"metadata": map[string]any{"name": "cluster-apps", "namespace": "flux-system", "uid": "ks-uid", "resourceVersion": "1"},
	}}
	dynamicClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{gvr: "KustomizationList"}, object)
	kubeClient := fake.NewClientset(&corev1.Event{
		ObjectMeta:     metav1.ObjectMeta{Name: "cluster-apps.1", Namespace: "flux-system"},
		InvolvedObject: corev1.ObjectReference{Kind: "Kustomization", Name: "cluster-apps", Namespace: "flux-system"},
		Reason:         "ReconciliationSucceeded",
		Message:        "Reconciliation finished",
		Source:         corev1.EventSource{Component: "kustomize-controller"},
		Type:           "Normal",
	})

	representation := boundaryRepresentation()
	scope := resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}
	descriptor := resourcev2.ResourceType{Type: token, IdentityDimensions: []resourcev2.Dimension{{Name: "namespace"}}, QueryDimensions: []resourcev2.Dimension{{Name: "namespace"}}, Representations: []resourcev2.Representation{representation}, DefaultRepresentation: representation.ID, Capabilities: []resourcev2.Capability{{Operation: resourcev2.OperationGet, Scope: scope}}}
	binding := nativeType{GVR: gvr, API: metav1.APIResource{Name: "kustomizations", Kind: "Kustomization", Namespaced: true, Verbs: metav1.Verbs{"get"}}, Descriptor: descriptor}
	p := &kubernetesProvider{catalogs: map[string]*nativeCatalogSnapshot{"cluster": {catalog: resourcev2.Catalog{Provider: "kubernetes", Revision: "catalog-1", Coverage: resourcev2.Coverage{Kind: "complete", Paths: []string{}}, Types: []resourcev2.ResourceType{descriptor}}, bindings: map[string]nativeType{token: binding}}}}
	route := resourcev2.AccessRoute{Connection: "cluster"}
	snapshot := p.catalogs["cluster"]
	snapshot.registrations = map[string]resourcev2.Registration[clients.ClientSet]{token: p.nativeRegistration(route, binding)}
	controller, err := resourcev2.NewController(resourcev2.Config[clients.ClientSet]{Catalog: p.catalog, ResolveRegistration: p.registration, ErrorClassifier: &kubeErrorClassifier{}, Lifecycle: &resourcev2.Lifecycle[clients.ClientSet]{
		LoadConnections: func(context.Context) ([]types.Connection, error) {
			return []types.Connection{{ID: "cluster", Name: "Cluster"}}, nil
		},
		CreateClient: func(context.Context, types.Connection) (*clients.ClientSet, error) {
			return &clients.ClientSet{DynamicClient: dynamicClient, KubeClient: kubeClient}, nil
		},
		DestroyClient: func(context.Context, *clients.ClientSet) error { return nil },
	}})
	require.NoError(t, err)
	p.Controller = controller
	t.Cleanup(func() { require.NoError(t, controller.Close()) })
	_, err = controller.LoadConnections(context.Background())
	require.NoError(t, err)
	_, err = controller.StartConnection(context.Background(), "cluster")
	require.NoError(t, err)

	request := resourcev2.GetRequest{Route: route, Reference: resourcev2.ResourceReference{Address: resourcev2.ResourceAddress{Provider: "kubernetes", Authority: "host-authority", Type: token, ID: "cluster-apps", Scope: []resourcev2.ScopeEntry{{Dimension: "namespace", Value: "flux-system"}}}}, Representation: representation.ID}
	catalog, err := controller.Catalog(context.Background(), resourcev2.CatalogRequest{Route: route})
	require.NoError(t, err)
	ctx := resourcev2.WithCatalogRevisionForRoute(context.Background(), "kubernetes", route, catalog.Revision)
	events, err := p.GetResourceEvents(ctx, request, 20)
	require.NoError(t, err)
	require.Len(t, events, 1)
	require.Equal(t, "ReconciliationSucceeded", events[0].Reason)
	require.Equal(t, "kustomize-controller", events[0].Source)

	var listed bool
	for _, action := range kubeClient.Actions() {
		if action.GetVerb() == "list" && action.GetResource().Resource == "events" {
			listed = true
			require.Equal(t, "flux-system", action.GetNamespace())
		}
	}
	require.True(t, listed)

	missing := request
	missing.Reference.Address.Type = "k8s:example.com/absent"
	_, err = p.GetResourceEvents(ctx, missing, 20)
	require.Error(t, err)
}

func TestNativeEventKindDistinguishesUnboundCatalogTypes(t *testing.T) {
	snapshot := &nativeCatalogSnapshot{
		catalog: resourcev2.Catalog{Types: []resourcev2.ResourceType{{Type: "k8s:/pods"}, {Type: helm.ReleaseType}}},
		bindings: map[string]nativeType{
			"k8s:/pods":      {API: metav1.APIResource{Kind: "Pod"}},
			"k8s:example/no": {API: metav1.APIResource{}},
		},
	}
	kind, err := snapshot.nativeEventKind("k8s:/pods")
	require.NoError(t, err)
	require.Equal(t, "Pod", kind)

	for token, code := range map[string]string{
		helm.ReleaseType:         "UNSUPPORTED",
		"k8s:example/no":         "UNSUPPORTED",
		"k8s:example.com/absent": "NOT_FOUND",
	} {
		_, err := snapshot.nativeEventKind(token)
		var opErr *resourcev2.ResourceOperationError
		require.Truef(t, errors.As(err, &opErr), "%s: %v", token, err)
		require.Equal(t, code, opErr.Code, token)
	}
}
