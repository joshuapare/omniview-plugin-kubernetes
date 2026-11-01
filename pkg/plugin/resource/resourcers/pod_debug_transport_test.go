package resourcers

import (
	"context"
	"errors"
	"net"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	resourceplugin "github.com/omniviewdev/plugin-sdk/pkg/resource/v2/plugin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestPodDebugAmbiguousWritePreservesC02ErrorThroughGRPC(t *testing.T) {
	for _, replace := range []bool{false, true} {
		t.Run(map[bool]string{false: "unconfirmed", true: "replacement"}[replace], func(t *testing.T) {
			native := fake.NewSimpleClientset(debugPodFixture())
			var submissions atomic.Int32
			native.PrependReactor("update", "pods", func(action ktesting.Action) (bool, runtime.Object, error) {
				if action.GetSubresource() != "ephemeralcontainers" {
					return false, nil, nil
				}
				submissions.Add(1)
				pod := action.(ktesting.UpdateAction).GetObject().(*corev1.Pod).DeepCopy()
				assert.Equal(t, "original-uid", string(pod.UID))
				assert.Equal(t, "debugger-omniview-test", pod.Spec.EphemeralContainers[len(pod.Spec.EphemeralContainers)-1].Name)
				if replace {
					pod.UID = "replacement-uid"
					if err := native.Tracker().Update(corev1.SchemeGroupVersion.WithResource("pods"), pod, pod.Namespace); err != nil {
						return true, nil, err
					}
				}
				return true, nil, errors.New("secret native connection diagnostic after submitting")
			})
			pod := NewPodResourcer(zap.NewNop().Sugar())
			actions, err := pod.GetActions(context.Background(), &clients.ClientSet{KubeClient: native})
			require.NoError(t, err)
			representation := resource.Representation{ID: "debug-pod", Revision: "1", Schema: resource.SchemaBinding{State: "absent"}}
			descriptor := resource.ResourceType{
				Type: "k8s:/pods", IdentityDimensions: []resource.Dimension{{Name: "namespace"}}, QueryDimensions: []resource.Dimension{{Name: "namespace"}},
				Representations: []resource.Representation{representation}, DefaultRepresentation: representation.ID,
				Capabilities: []resource.Capability{{Operation: resource.OperationAction, Scope: resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeAny}}}},
			}
			controller, err := resource.NewController(resource.Config[clients.ClientSet]{
				Catalog: func(context.Context, resource.CatalogRequest) (resource.Catalog, error) {
					return resource.Catalog{Provider: "kubernetes", Revision: "debug-catalog", Types: []resource.ResourceType{descriptor}, Coverage: resource.Coverage{Kind: "complete", Paths: []string{}}}, nil
				},
				Registrations: []resource.Registration[clients.ClientSet]{{
					Type: descriptor.Type, Actions: actions,
					Action: func(ctx context.Context, _ *clients.ClientSet, request resource.ActionRequest) (resource.Value, error) {
						return pod.ExecuteAction(ctx, &clients.ClientSet{KubeClient: native}, request)
					},
				}},
			})
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, controller.Close()) })
			server := grpc.NewServer(resourceplugin.ServerOptions()...)
			resourceplugin.RegisterServer(server, controller)
			listener := bufconn.Listen(1 << 20)
			go func() { _ = server.Serve(listener) }()
			t.Cleanup(func() { server.Stop(); _ = listener.Close() })
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			connection, err := grpc.DialContext(ctx, "passthrough:///debug-outcome", grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }), grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithBlock())
			require.NoError(t, err)
			t.Cleanup(func() { _ = connection.Close() })
			client := resourceplugin.NewClient(connection)
			request := debugActionRequest(t, debugInput())
			uid := "original-uid"
			request.Reference.Incarnation = &uid
			catalog, err := client.Catalog(ctx, resource.CatalogRequest{Route: request.Route})
			require.NoError(t, err)
			ctx = resource.WithCatalogRevisionForRoute(ctx, "kubernetes", request.Route, catalog.Revision)
			_, err = client.Action(ctx, request)
			require.Error(t, err)
			assert.Equal(t, "PROVIDER_ERROR", resource.ErrorCode(err), "closed C02 classification must survive the actual resource wire")
			assert.NotContains(t, err.Error(), "secret native")
			assert.Equal(t, int32(1), submissions.Load(), "uncertain acceptance must never submit another container")
			assert.Equal(t, "original-uid", *request.Reference.Incarnation)
			assert.Equal(t, "debugger-omniview-test", request.Input.Map["name"].String)
			observed, getErr := native.CoreV1().Pods("debug-test").Get(context.Background(), "app", metav1.GetOptions{})
			require.NoError(t, getErr)
			if replace {
				assert.Equal(t, "replacement-uid", string(observed.UID))
			} else {
				assert.Equal(t, "original-uid", string(observed.UID))
				assert.Len(t, observed.Spec.EphemeralContainers, 1, "absence during inspection still does not prove the submitted write was rejected")
			}
			assert.Equal(t, int32(1), submissions.Load())
		})
	}
}
