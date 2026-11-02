package resource

import (
	"context"
	"net"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	resourceplugin "github.com/omniviewdev/plugin-sdk/pkg/resource/v2/plugin"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	clienttesting "k8s.io/client-go/testing"
)

var boundaryGVR = schema.GroupVersionResource{Version: "v1", Resource: "pods"}

func boundaryRepresentation() resourcev2.Representation {
	return resourcev2.Representation{ID: "kubernetes.object.v1/v1", Revision: "kubernetes.object.v1/v1", Schema: resourcev2.SchemaBinding{State: "unavailable"}}
}
func boundaryObject(name, namespace string) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{"apiVersion": "v1", "kind": "Pod", "metadata": map[string]any{"name": name, "namespace": namespace, "uid": "uid-1", "resourceVersion": "opaque:9"}}}
}
func boundaryClient(objects ...runtime.Object) *dynamicfake.FakeDynamicClient {
	return dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{boundaryGVR: "PodList"}, objects...)
}
func boundaryGet() resourcev2.GetRequest {
	return resourcev2.GetRequest{Route: resourcev2.AccessRoute{Connection: "cluster"}, Reference: resourcev2.ResourceReference{Address: resourcev2.ResourceAddress{Provider: "kubernetes", Authority: "host-authority", Type: "k8s:/pods", ID: "native-name", Scope: []resourcev2.ScopeEntry{{Dimension: "namespace", Value: "selected"}}}}, Representation: boundaryRepresentation().ID}
}
func boundaryProvider(t *testing.T, client *dynamicfake.FakeDynamicClient) (*resourcev2.Controller[clients.ClientSet], *atomic.Int32) {
	t.Helper()
	representation := boundaryRepresentation()
	scope := resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}
	descriptor := resourcev2.ResourceType{Type: "k8s:/pods", IdentityDimensions: []resourcev2.Dimension{{Name: "namespace"}}, QueryDimensions: []resourcev2.Dimension{{Name: "namespace"}}, Representations: []resourcev2.Representation{representation}, DefaultRepresentation: representation.ID, Capabilities: []resourcev2.Capability{{Operation: resourcev2.OperationGet, Scope: scope}, {Operation: resourcev2.OperationEnumerate, Scope: scope}, {Operation: resourcev2.OperationCreate, Scope: scope}, {Operation: resourcev2.OperationMutationUpdate, Scope: scope}, {Operation: resourcev2.OperationDelete, Scope: scope}}}
	p := &kubernetesProvider{catalogs: map[string]*nativeCatalogSnapshot{"cluster": {catalog: resourcev2.Catalog{Provider: "kubernetes", Revision: "catalog-1", Coverage: resourcev2.Coverage{Kind: "complete", Paths: []string{}}, Types: []resourcev2.ResourceType{descriptor}}, bindings: map[string]nativeType{"k8s:/pods": {GVR: boundaryGVR, API: metav1.APIResource{Name: "pods", Kind: "Pod", Namespaced: true, Verbs: metav1.Verbs{"get", "list", "create", "update", "delete"}}, Descriptor: descriptor}}}}}
	snapshot := p.catalogs["cluster"]
	snapshot.registrations = map[string]resourcev2.Registration[clients.ClientSet]{"k8s:/pods": p.nativeRegistration(boundaryGet().Route, snapshot.bindings["k8s:/pods"])}
	destroyed := &atomic.Int32{}
	controller, err := resourcev2.NewController(resourcev2.Config[clients.ClientSet]{Catalog: p.catalog, ResolveRegistration: p.registration, ErrorClassifier: &kubeErrorClassifier{}, Lifecycle: &resourcev2.Lifecycle[clients.ClientSet]{
		LoadConnections: func(context.Context) ([]types.Connection, error) {
			return []types.Connection{{ID: "cluster", Name: "Cluster"}}, nil
		},
		CreateClient: func(context.Context, types.Connection) (*clients.ClientSet, error) {
			return &clients.ClientSet{DynamicClient: client}, nil
		},
		DestroyClient: func(context.Context, *clients.ClientSet) error { destroyed.Add(1); return nil },
	}})
	require.NoError(t, err)
	p.Controller = controller
	t.Cleanup(func() { require.NoError(t, controller.Close()) })
	_, err = controller.LoadConnections(context.Background())
	require.NoError(t, err)
	_, err = controller.StartConnection(context.Background(), "cluster")
	require.NoError(t, err)
	return controller, destroyed
}

func TestIntegrationNativeBoundaryThroughGRPC(t *testing.T) {
	object := boundaryObject("native-name", "selected")
	object.Object["spec"] = map[string]any{"exact": int64(9223372036854775807), "document": strings.Repeat("x", 2<<20), "unrelated": "preserved"}
	backend := boundaryClient(object, boundaryObject("native-name", "other"))
	controller, destroyed := boundaryProvider(t, backend)
	server := grpc.NewServer(resourceplugin.ServerOptions()...)
	resourceplugin.RegisterServer(server, controller)
	listener := bufconn.Listen(1 << 20)
	go server.Serve(listener)
	t.Cleanup(func() { server.Stop(); listener.Close() })
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	connection, err := grpc.DialContext(ctx, "passthrough:///native", grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }), grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithBlock())
	require.NoError(t, err)
	t.Cleanup(func() { connection.Close() })
	client := resourceplugin.NewClient(connection)
	request := boundaryGet()
	catalog, err := client.Catalog(ctx, resourcev2.CatalogRequest{Route: request.Route})
	require.NoError(t, err)
	ctx = resourcev2.WithCatalogRevisionForRoute(ctx, "kubernetes", request.Route, catalog.Revision)
	record, err := client.Get(ctx, request)
	require.NoError(t, err)
	require.Equal(t, request.Reference.Address, record.Reference.Address)
	require.Equal(t, boundaryRepresentation(), record.Representation)
	require.Equal(t, "9223372036854775807", record.Body.Map["spec"].Map["exact"].Int)
	require.Len(t, record.Body.Map["spec"].Map["document"].String, 2<<20)
	namespaces := []string{"selected"}
	page, err := client.Enumerate(ctx, resourcev2.EnumerateRequest{Target: resourcev2.ReadTarget{Route: request.Route, Provider: "kubernetes", Authority: "host-authority", Type: "k8s:/pods", Scope: resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeOneOf, Values: &namespaces}}, Representation: request.Representation}, PageSize: 256})
	require.NoError(t, err)
	require.Len(t, page.Records, 1)
	require.Equal(t, request.Reference.Address, page.Records[0].Reference.Address)
	mutation := resourcev2.MutationRequest{
		Route: request.Route, Reference: record.Reference, Operation: "update",
		Input: record.Body, ExpectedRevision: record.SourceRevision,
	}
	require.NotNil(t, mutation.ExpectedRevision)
	mutation.Input.Map["spec"].Map["exact"] = resourcev2.Value{Kind: "int64", Int: "9007199254740993"}
	updated, err := client.Mutate(ctx, mutation)
	require.NoError(t, err)
	require.Equal(t, "9007199254740993", updated.Body.Map["spec"].Map["exact"].Int)
	require.Equal(t, "preserved", updated.Body.Map["spec"].Map["unrelated"].String)
	require.Len(t, updated.Body.Map["spec"].Map["document"].String, 2<<20)
	backend.PrependReactor("update", "pods", func(action clienttesting.Action) (bool, runtime.Object, error) {
		object := action.(clienttesting.UpdateAction).GetObject().(*unstructured.Unstructured)
		require.Equal(t, *record.SourceRevision, object.GetResourceVersion())
		return true, nil, apierrors.NewConflict(boundaryGVR.GroupResource(), object.GetName(), nil)
	})
	_, err = client.Mutate(ctx, mutation)
	require.Equal(t, "CONFLICT", resourcev2.ErrorCode(err))
	deleted, err := client.Mutate(ctx, boundaryMutation(t, "delete"))
	require.NoError(t, err)
	require.Equal(t, "9007199254740993", deleted.Body.Map["spec"].Map["exact"].Int)
	request.Reference.Address.ID = "absent"
	_, err = client.Get(ctx, request)
	require.Equal(t, "NOT_FOUND", resourcev2.ErrorCode(err))
	_, err = client.Action(ctx, resourcev2.ActionRequest{Route: request.Route, Reference: request.Reference, Action: "unsupported", Input: resourcev2.Value{Kind: "null"}})
	require.Equal(t, "UNSUPPORTED", resourcev2.ErrorCode(err))
	canceled, stop := context.WithCancel(ctx)
	stop()
	_, err = client.Get(canceled, boundaryGet())
	require.Error(t, err)
	_, err = controller.StopConnection(ctx, "cluster")
	require.NoError(t, err)
	require.NoError(t, controller.Close())
	require.Equal(t, int32(1), destroyed.Load())
}
