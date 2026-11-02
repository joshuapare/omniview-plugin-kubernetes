package resource

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/omniview/kubernetes/pkg/plugin/helm"
	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	sdktypes "github.com/omniviewdev/plugin-sdk/pkg/types"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	clienttesting "k8s.io/client-go/testing"
)

func TestNativeCatalogIndependentOperations(t *testing.T) {
	client := &fake.FakeDiscovery{Fake: &clienttesting.Fake{Resources: []*metav1.APIResourceList{
		{GroupVersion: "v1", APIResources: []metav1.APIResource{
			{Name: "pods", Kind: "Pod", Namespaced: true, Verbs: metav1.Verbs{"get", "list", "watch", "create", "update", "delete"}},
			{Name: "pods/log", Kind: "Pod", Namespaced: true, Verbs: metav1.Verbs{"get"}},
			{Name: "componentstatuses", Kind: "ComponentStatus", Verbs: metav1.Verbs{"get"}},
		}},
		{GroupVersion: "authentication.k8s.io/v1", APIResources: []metav1.APIResource{
			{Name: "tokenreviews", Kind: "TokenReview", Verbs: metav1.Verbs{"create"}},
		}},
		{GroupVersion: "example.k8s.io/v1", APIResources: []metav1.APIResource{
			{Name: "reports", Kind: "Report", Verbs: metav1.Verbs{"list"}},
		}},
	}}}
	bindings, coverage, err := discoverNativeTypes(context.Background(), client)
	require.NoError(t, err)
	require.Equal(t, "complete", coverage.Kind)
	require.Len(t, bindings, 4)

	pod := bindings["k8s:/pods"]
	require.Equal(t, []resourcev2.Dimension{{Name: "namespace", AllowEmpty: false}}, pod.Descriptor.IdentityDimensions)
	require.Equal(t, []resourcev2.Capability{
		{Operation: resourcev2.OperationGet, Scope: resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}},
		{Operation: resourcev2.OperationEnumerate, Scope: resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}},
		{Operation: resourcev2.OperationNativeQuery, Scope: resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}},
		{Operation: resourcev2.OperationCreate, Scope: resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}},
		{Operation: resourcev2.OperationMutationUpdate, Scope: resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}},
		{Operation: resourcev2.OperationDelete, Scope: resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}},
	}, pod.Descriptor.Capabilities)

	review := bindings["k8s:authentication.k8s.io/tokenreviews"]
	require.Equal(t, []resourcev2.Capability{{Operation: resourcev2.OperationCreate, Scope: resourcev2.QueryScope{}}}, review.Descriptor.Capabilities)
	component := bindings["k8s:/componentstatuses"]
	require.Equal(t, []resourcev2.Capability{{Operation: resourcev2.OperationGet, Scope: resourcev2.QueryScope{}}}, component.Descriptor.Capabilities)
	report, ok := bindings["k8s:example.k8s.io/reports"]
	require.True(t, ok, "custom groups must not be collapsed to a guessed short group")
	require.Equal(t, "example.k8s.io", report.GVR.Group)
	require.Equal(t, []resourcev2.Capability{
		{Operation: resourcev2.OperationEnumerate, Scope: resourcev2.QueryScope{}},
		{Operation: resourcev2.OperationNativeQuery, Scope: resourcev2.QueryScope{}},
	}, report.Descriptor.Capabilities)
}

func TestNativeCatalogSourceContinuityAndAcquisition(t *testing.T) {
	discovery := &fake.FakeDiscovery{Fake: &clienttesting.Fake{Resources: []*metav1.APIResourceList{
		{GroupVersion: "v1", APIResources: []metav1.APIResource{
			{Name: "pods", Kind: "Pod", Namespaced: true, Verbs: metav1.Verbs{"list", "watch"}},
			{Name: "events", Kind: "Event", Namespaced: true, Verbs: metav1.Verbs{"list", "watch"}},
			{Name: "configmaps", Kind: "ConfigMap", Namespaced: true, Verbs: metav1.Verbs{"list"}},
		}},
		{GroupVersion: "events.k8s.io/v1", APIResources: []metav1.APIResource{
			{Name: "events", Kind: "Event", Namespaced: true, Verbs: metav1.Verbs{"list", "watch"}},
		}},
	}}}
	bindings, coverage, err := discoverNativeTypes(context.Background(), discovery)
	require.NoError(t, err)
	p := &kubernetesProvider{logger: zap.NewNop().Sugar()}
	scope := resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}
	snapshot, err := p.assembleNativeCatalog(context.Background(), "route", nil, bindings, coverage, nil, nil, nil, scope)
	require.NoError(t, err)
	for _, tc := range []struct {
		token   string
		source  bool
		acquire bool
	}{
		{"k8s:/pods", true, true},
		{"k8s:/events", true, false},
		{"k8s:events.k8s.io/events", true, false},
		{"k8s:/configmaps", false, false},
	} {
		t.Run(tc.token, func(t *testing.T) {
			descriptor := snapshot.bindings[tc.token].Descriptor
			require.Equal(t, tc.acquire, descriptor.AcquireOnConnect)
			var found bool
			for _, capability := range descriptor.Capabilities {
				if capability.Operation == resourcev2.OperationSourceUpdates {
					found = true
					require.Equal(t, resourcev2.ContinuityBestEffort, capability.Guarantee)
					require.Equal(t, scope, capability.Scope)
				}
			}
			require.Equal(t, tc.source, found)
		})
	}
}

func TestNativeCatalogCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	client := &fake.FakeDiscovery{Fake: &clienttesting.Fake{}}
	_, _, err := discoverNativeTypes(ctx, client)
	require.ErrorIs(t, err, context.Canceled)
	require.Empty(t, client.Actions())
}

func TestNativeClusterIdentityUsesObservedUID(t *testing.T) {
	client := k8sfake.NewClientset(&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "kube-system", UID: types.UID("native-cluster-uid")}})
	identity, err := nativeClusterIdentity(context.Background(), client)
	require.NoError(t, err)
	require.NotNil(t, identity)
	require.Equal(t, "native-cluster-uid", *identity)
}

func TestNativeClusterIdentityUnknownWithoutAccess(t *testing.T) {
	client := k8sfake.NewClientset()
	client.PrependReactor("get", "namespaces", func(clienttesting.Action) (bool, runtime.Object, error) {
		return true, nil, k8serrors.NewForbidden(schema.GroupResource{Resource: "namespaces"}, "kube-system", nil)
	})
	identity, err := nativeClusterIdentity(context.Background(), client)
	require.NoError(t, err)
	require.Nil(t, identity)
}

type catalogRESTDiscovery struct {
	catalogDiscovery
	client rest.Interface
}

func (d catalogRESTDiscovery) RESTClient() rest.Interface { return d.client }

func TestNativeCatalogAuthorityHintIsObservedAndConnectionLocal(t *testing.T) {
	for _, observed := range []bool{false, true} {
		t.Run(map[bool]string{false: "forbidden", true: "observed"}[observed], func(t *testing.T) {
			server := httptest.NewServer(http.NotFoundHandler())
			defer server.Close()
			discoveryClient, err := discovery.NewDiscoveryClientForConfig(&rest.Config{Host: server.URL})
			require.NoError(t, err)
			d := catalogRESTDiscovery{
				catalogDiscovery: discoveryFixture(&metav1.APIResourceList{GroupVersion: "v1", APIResources: []metav1.APIResource{
					{Name: "pods", Kind: "Pod", Namespaced: true, Verbs: metav1.Verbs{"get"}},
				}}),
				client: discoveryClient.RESTClient(),
			}
			kube := k8sfake.NewClientset(&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "kube-system", UID: types.UID("observed-uid")}})
			if !observed {
				kube.PrependReactor("get", "namespaces", func(clienttesting.Action) (bool, runtime.Object, error) {
					return true, nil, k8serrors.NewForbidden(schema.GroupResource{Resource: "namespaces"}, "kube-system", nil)
				})
			}
			provider := &kubernetesProvider{
				catalogs: map[string]*nativeCatalogSnapshot{}, logger: zap.NewNop().Sugar(),
				connections: &kubeConnectionProvider{}, helmTypes: helm.HelmResourceTypes(),
			}
			connection := sdktypes.Connection{ID: "route"}
			ctx := resourcev2.WithSession(context.Background(), resourcev2.Session{Connection: &connection})
			err = provider.startNativeConnection(ctx, connection, &clients.ClientSet{
				DiscoveryClient: d, KubeClient: kube,
			})
			require.NoError(t, err)
			descriptors := map[string]resourcev2.ResourceType{}
			for _, descriptor := range provider.catalogs["route"].catalog.Types {
				descriptors[descriptor.Type] = descriptor
			}
			require.Contains(t, descriptors, "k8s:/pods")
			require.Contains(t, descriptors, "helm:releases")
			require.Contains(t, descriptors, "helm:repositories")
			require.Contains(t, descriptors, "helm:charts")
			require.Nil(t, descriptors["helm:repositories"].NativeAuthorityHint)
			require.Nil(t, descriptors["helm:charts"].NativeAuthorityHint)
			hint := descriptors["k8s:/pods"].NativeAuthorityHint
			if observed {
				require.NotNil(t, hint)
				require.Equal(t, "observed-uid", hint.ID)
				require.Equal(t, "kubernetes.namespace-uid.v1", hint.Scheme)
				require.Equal(t, resourcev2.ContinuityConnectionLocal, hint.Continuity)
				require.Equal(t, hint, descriptors["helm:releases"].NativeAuthorityHint)
			} else {
				require.Nil(t, hint, "forbidden UID access must not invent an endpoint-derived identity")
				require.Nil(t, descriptors["helm:releases"].NativeAuthorityHint)
			}
		})
	}
}
