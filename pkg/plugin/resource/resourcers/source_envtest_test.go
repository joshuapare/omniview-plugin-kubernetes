package resourcers

import (
	"context"
	"fmt"
	"net"
	"os"
	"testing"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	resourceplugin "github.com/omniviewdev/plugin-sdk/pkg/resource/v2/plugin"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"sigs.k8s.io/controller-runtime/pkg/envtest"
)

const envtestNamespace = "default"

var envtestConfigMaps = schema.GroupVersionResource{Version: "v1", Resource: "configmaps"}

type envtestSnapshotBarrier struct {
	resource.SourceEmitter
	done <-chan struct{}
}

func (b envtestSnapshotBarrier) EndSnapshot(ctx context.Context, coverage resource.SourceCoverage, continuity string) error {
	select {
	case <-b.done:
		return b.SourceEmitter.EndSnapshot(ctx, coverage, continuity)
	case <-ctx.Done():
		return ctx.Err()
	}
}

func startSourceEnvtest(t *testing.T) (*envtest.Environment, *rest.Config, kubernetes.Interface) {
	t.Helper()
	if os.Getenv("KUBEBUILDER_ASSETS") == "" {
		t.Skip("KUBEBUILDER_ASSETS is unset")
	}
	env := &envtest.Environment{}
	config, err := env.Start()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, env.Stop()) })
	client, err := kubernetes.NewForConfig(config)
	require.NoError(t, err)
	return env, config, client
}

func openEnvtestSource(t *testing.T, config *rest.Config, start chan<- struct{}, done <-chan struct{}) resource.SourceStream {
	t.Helper()
	dynamicClient, err := dynamic.NewForConfig(config)
	require.NoError(t, err)
	clientSet := &clients.ClientSet{DynamicClient: dynamicClient}
	base := NewKubernetesResourcerBase[*corev1.ConfigMap](zap.NewNop().Sugar(), envtestConfigMaps)
	scope := resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeAny}}
	representation := resource.Representation{ID: "native", Revision: "envtest", Schema: resource.SchemaBinding{State: "absent", Validation: "none", Unvalidated: []string{}}}
	controller, err := resource.NewController(resource.Config[struct{}]{
		Catalog: func(context.Context, resource.CatalogRequest) (resource.Catalog, error) {
			return resource.Catalog{Provider: "kubernetes", Revision: "envtest", Coverage: resource.Coverage{Kind: "complete", Paths: []string{}}, Types: []resource.ResourceType{{Type: "k8s:/configmaps", IdentityDimensions: []resource.Dimension{{Name: "namespace"}}, QueryDimensions: []resource.Dimension{{Name: "namespace"}}, Representations: []resource.Representation{representation}, DefaultRepresentation: "native", Capabilities: []resource.Capability{{Operation: resource.OperationSourceUpdates, Scope: scope, Guarantee: resource.ContinuityBestEffort}}}}}, nil
		},
		Registrations: []resource.Registration[struct{}]{{Type: "k8s:/configmaps", Source: func(ctx context.Context, _ *struct{}, request resource.SourceRequest, emit resource.SourceEmitter) error {
			if start != nil {
				close(start)
				emit = envtestSnapshotBarrier{SourceEmitter: emit, done: done}
			}
			return base.Source(ctx, clientSet, request, emit)
		}}},
	})
	require.NoError(t, err)
	t.Cleanup(func() { _ = controller.Close() })
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	server := grpc.NewServer()
	require.NoError(t, (&resourceplugin.GRPCPlugin{Impl: controller}).GRPCServer(nil, server))
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(server.Stop)
	conn, err := grpc.NewClient(listener.Addr().String(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	client := resourceplugin.NewClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	t.Cleanup(cancel)
	catalog, err := client.Catalog(ctx, resource.CatalogRequest{Route: resource.AccessRoute{Connection: "envtest"}})
	require.NoError(t, err)
	ctx = resource.WithCatalogRevision(ctx, catalog.Revision)
	namespaces := []string{envtestNamespace}
	stream, err := client.OpenSourceStream(ctx, resource.SourceOpenRequest{SessionID: "envtest", Generation: "envtest", Target: resource.ReadTarget{Route: resource.AccessRoute{Connection: "envtest"}, Provider: "kubernetes", Authority: "envtest", Type: "k8s:/configmaps", Representation: "native", Scope: resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeOneOf, Values: &namespaces}}}, Mode: resource.SourceModeSnapshotAndUpdates, Acquisition: resource.SourceAcquisition{Kind: resource.SourceAcquisitionEnumerate}, Limits: resource.SourceLimits{MaxFrameBytes: resource.MaxSourceFrameBytes, MaxBatchItems: resource.MaxSourceBatchItems}})
	require.NoError(t, err)
	t.Cleanup(stream.Close)
	return stream
}

func applyEnvtestChange(state map[string]string, change resource.SourceChange) {
	if change.Kind == resource.SourceChangeUpsert {
		record := change.Observation.Record
		state[record.Reference.Address.ID] = *record.Reference.Incarnation
	} else if change.Kind == resource.SourceChangeRemove && change.Reference.Incarnation != nil && state[change.Reference.Address.ID] == *change.Reference.Incarnation {
		delete(state, change.Reference.Address.ID)
	}
}

func receiveEnvtestFrame(t *testing.T, stream resource.SourceStream, state map[string]string) resource.SourceFrame {
	t.Helper()
	frame, err := stream.Recv()
	require.NoError(t, err)
	require.Nil(t, frame.Failed)
	require.Nil(t, frame.Reset)
	if frame.Snapshot != nil {
		for _, observation := range frame.Snapshot.Observations {
			record := observation.Record
			require.NotNil(t, record.Reference.Incarnation)
			state[record.Reference.Address.ID] = *record.Reference.Incarnation
		}
	}
	if frame.Changes != nil {
		for _, change := range frame.Changes.Changes {
			applyEnvtestChange(state, change)
		}
	}
	return frame
}

func TestSourceBestEffortConvergesUnderChurn(t *testing.T) {
	_, config, client := startSourceEnvtest(t)
	ctx := context.Background()
	started, done := make(chan struct{}), make(chan struct{})
	writerResult := make(chan error, 1)
	go func() {
		<-started
		defer close(done)
		objects := client.CoreV1().ConfigMaps(envtestNamespace)
		for i := range 200 {
			name := fmt.Sprintf("churn-%03d", i)
			object, err := objects.Create(ctx, &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: name}, Data: map[string]string{"value": "initial"}}, metav1.CreateOptions{})
			if err == nil {
				object.Data["value"] = "updated"
				_, err = objects.Update(ctx, object, metav1.UpdateOptions{})
			}
			if err == nil && i%2 == 0 {
				err = objects.Delete(ctx, name, metav1.DeleteOptions{})
			}
			if err != nil {
				writerResult <- err
				return
			}
		}
		_, err := objects.Create(ctx, &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "churn-complete"}}, metav1.CreateOptions{})
		writerResult <- err
	}()
	stream := openEnvtestSource(t, config, started, done)
	state := map[string]string{}
	ended := false
	for !ended || state["churn-complete"] == "" {
		frame := receiveEnvtestFrame(t, stream, state)
		if frame.SnapshotEnd != nil {
			ended = true
			require.Equal(t, resource.ContinuityBestEffort, frame.SnapshotEnd.Continuity)
			require.Equal(t, resource.EnumerationExhausted, frame.SnapshotEnd.Coverage.Enumeration)
			require.Equal(t, resource.ConsistencyBestEffort, frame.SnapshotEnd.Coverage.Consistency)
			require.Equal(t, []string{"informer cache readiness is not a point-in-time snapshot", "startup events are reconciled by key, not by native revision handoff"}, frame.SnapshotEnd.Coverage.Limitations)
		}
	}
	require.NoError(t, <-writerResult)
	list, err := client.CoreV1().ConfigMaps(envtestNamespace).List(ctx, metav1.ListOptions{})
	require.NoError(t, err)
	actual := map[string]string{}
	for _, item := range list.Items {
		actual[item.Name] = string(item.UID)
	}
	require.Equal(t, actual, state)
}

func TestSourceRecreateUsesIncarnation(t *testing.T) {
	_, config, client := startSourceEnvtest(t)
	ctx := context.Background()
	objects := client.CoreV1().ConfigMaps(envtestNamespace)
	old, err := objects.Create(ctx, &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "recreated"}}, metav1.CreateOptions{})
	require.NoError(t, err)
	stream := openEnvtestSource(t, config, nil, nil)
	state := map[string]string{}
	for {
		frame := receiveEnvtestFrame(t, stream, state)
		if frame.SnapshotEnd != nil {
			break
		}
	}
	require.Equal(t, string(old.UID), state[old.Name])
	require.NoError(t, objects.Delete(ctx, old.Name, metav1.DeleteOptions{}))
	for state[old.Name] != "" {
		receiveEnvtestFrame(t, stream, state)
	}
	current, err := objects.Create(ctx, &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: old.Name}}, metav1.CreateOptions{})
	require.NoError(t, err)
	require.NotEqual(t, old.UID, current.UID)
	for state[old.Name] != string(current.UID) {
		receiveEnvtestFrame(t, stream, state)
	}
	oldUID := string(old.UID)
	ref := resource.ResourceReference{Address: resource.ResourceAddress{ID: old.Name}, Incarnation: &oldUID}
	applyEnvtestChange(state, resource.SourceChange{Kind: resource.SourceChangeRemove, Reference: &ref})
	require.Equal(t, string(current.UID), state[old.Name])
}

func TestSourceForbiddenFailsOpen(t *testing.T) {
	env, _, _ := startSourceEnvtest(t)
	user, err := env.AddUser(envtest.User{Name: "source-forbidden"}, nil)
	require.NoError(t, err)
	stream := openEnvtestSource(t, user.Config(), nil, nil)
	for {
		frame, err := stream.Recv()
		require.NoError(t, err)
		if frame.Failed != nil {
			require.Equal(t, "FORBIDDEN", frame.Failed.Code)
			break
		}
		require.Nil(t, frame.SnapshotEnd)
		require.Nil(t, frame.Reset)
	}
}
