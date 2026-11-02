package resource

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/helm"
	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	"github.com/omniview/kubernetes/pkg/plugin/resource/resourcers"
	"github.com/omniview/kubernetes/pkg/utils/kubeauth"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/release"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

func TestNativeActionRegistrationPreservesPatchOnlyNodePermission(t *testing.T) {
	var gets, writes atomic.Int32
	var mu sync.Mutex
	unschedulable := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Header.Get("Authorization") != "Bearer owned-action-fixture" {
			http.Error(w, "fixture authentication required", http.StatusUnauthorized)
			return
		}
		if r.Method == http.MethodGet {
			gets.Add(1)
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(metav1.Status{Status: "Failure", Reason: metav1.StatusReasonForbidden, Code: http.StatusForbidden})
			return
		}
		if r.Method != http.MethodPatch || r.URL.Path != "/api/v1/nodes/worker" {
			t.Errorf("unexpected native request: %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
			return
		}
		var patch struct {
			Metadata struct {
				UID string `json:"uid"`
			} `json:"metadata"`
			Spec struct {
				Unschedulable bool `json:"unschedulable"`
			} `json:"spec"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&patch); err != nil {
			t.Errorf("decode native patch: %v", err)
			http.Error(w, "invalid patch", http.StatusBadRequest)
			return
		}
		if patch.Metadata.UID != "observed-node-uid" {
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(metav1.Status{Status: "Failure", Reason: metav1.StatusReasonInvalid, Code: http.StatusUnprocessableEntity, Message: "metadata.uid is immutable"})
			return
		}
		mu.Lock()
		unschedulable = patch.Spec.Unschedulable
		mu.Unlock()
		writes.Add(1)
		_ = json.NewEncoder(w).Encode(corev1.Node{TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "Node"}, ObjectMeta: metav1.ObjectMeta{Name: "worker", UID: "observed-node-uid"}, Spec: corev1.NodeSpec{Unschedulable: patch.Spec.Unschedulable}})
	}))
	t.Cleanup(server.Close)
	native, err := kubernetes.NewForConfig(&rest.Config{Host: server.URL, BearerToken: "owned-action-fixture"})
	require.NoError(t, err)
	p := &kubernetesProvider{helpers: map[string]any{"k8s:/nodes": resourcers.NewNodeResourcer(zap.NewNop().Sugar())}}
	route := resourcev2.AccessRoute{Connection: "owned-cluster"}
	binding := nativeType{GVR: corev1.SchemeGroupVersion.WithResource("nodes"), API: metav1.APIResource{Name: "nodes", Kind: "Node", Verbs: metav1.Verbs{"patch"}}, Descriptor: resourcev2.ResourceType{Type: "k8s:/nodes", Representations: []resourcev2.Representation{boundaryRepresentation()}}}
	registration := p.nativeRegistration(route, binding)
	require.Nil(t, registration.Get)
	require.NotNil(t, registration.Action)
	uid := "observed-node-uid"
	request := resourcev2.ActionRequest{Route: route, Reference: resourcev2.ResourceReference{Address: resourcev2.ResourceAddress{Provider: "kubernetes", Authority: "fixture-host-authority", Type: "k8s:/nodes", ID: "worker", Scope: []resourcev2.ScopeEntry{}}, Incarnation: &uid}, Action: "cordon", Input: resourcev2.Value{Kind: "null"}}
	client := &clients.ClientSet{KubeClient: native}
	_, err = registration.Action(context.Background(), client, request)
	require.NoError(t, err)
	request.Action = "uncordon"
	_, err = registration.Action(context.Background(), client, request)
	require.NoError(t, err)
	staleUID := "replaced-node-uid"
	request.Reference.Incarnation = &staleUID
	request.Action = "cordon"
	_, err = registration.Action(context.Background(), client, request)
	require.True(t, apierrors.IsInvalid(err), "stale incarnation must fail native atomic metadata check: %v", err)
	require.Zero(t, gets.Load(), "PATCH-only node actions must not acquire GET permission")
	require.Equal(t, int32(2), writes.Load())
	mu.Lock()
	require.False(t, unschedulable, "failed stale-incarnation patch must not mutate replacement")
	mu.Unlock()
}

func TestNativeRelationshipsAdmitWholeRouteCatalog(t *testing.T) {
	route := resourcev2.AccessRoute{Connection: "owned-cluster"}
	podType := resourcev2.ResourceType{Type: "k8s:/pods", DefaultRepresentation: boundaryRepresentation().ID, Representations: []resourcev2.Representation{boundaryRepresentation()}}
	catalogTypes := append([]resourcev2.ResourceType{podType}, helm.HelmResourceTypes()...)
	catalogTypes = append(catalogTypes, auditResourceType())
	p := &kubernetesProvider{
		catalogs: map[string]*nativeCatalogSnapshot{route.Connection: {
			catalog:  resourcev2.Catalog{Provider: "kubernetes", Revision: "relationship-catalog", Coverage: resourcev2.Coverage{Kind: "complete"}, Types: catalogTypes},
			bindings: map[string]nativeType{podType.Type: {Descriptor: podType}},
		}},
		relationships: resourcers.RelationshipTable(),
	}
	controller, err := resourcev2.NewController(resourcev2.Config[clients.ClientSet]{Catalog: p.catalog, Lifecycle: &resourcev2.Lifecycle[clients.ClientSet]{
		LoadConnections: func(context.Context) ([]types.Connection, error) {
			return []types.Connection{{ID: route.Connection, Name: "Owned cluster"}}, nil
		},
		CreateClient: func(context.Context, types.Connection) (*clients.ClientSet, error) {
			return &clients.ClientSet{}, nil
		},
		DestroyClient: (&kubeConnectionProvider{logger: zap.NewNop().Sugar()}).DestroyClient,
	}})
	require.NoError(t, err)
	p.Controller = controller
	t.Cleanup(func() { require.NoError(t, controller.Close()) })
	_, err = controller.LoadConnections(context.Background())
	require.NoError(t, err)
	_, err = controller.StartConnection(context.Background(), route.Connection)
	require.NoError(t, err)
	for _, descriptor := range catalogTypes {
		t.Run(descriptor.Type, func(t *testing.T) {
			declarations, err := p.GetRelationships(context.Background(), route, descriptor.Type)
			require.NoError(t, err, "catalogued static types must not poison route graph bootstrap")
			require.NotNil(t, declarations)
			if descriptor.Type == podType.Type {
				require.NotEmpty(t, declarations, "native Pod relationships remain declared")
			} else {
				require.Empty(t, declarations, "admitted types without relationship declarations")
			}
		})
	}
	_, err = p.GetRelationships(context.Background(), route, "not-in-route-catalog")
	require.Equal(t, "NOT_FOUND", resourcev2.ErrorCode(err))
	_, err = p.GetRelationships(context.Background(), resourcev2.AccessRoute{Connection: "other-cluster"}, podType.Type)
	require.Error(t, err, "catalog membership must not bypass the connection lease")
}

func TestNativeEditorSchemasIncludeInstalledHelmValuesSchema(t *testing.T) {
	t.Setenv("HELM_DRIVER", "secrets")
	schema := []byte(`{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"replicas":{"type":"integer"}}}`)
	installed := &release.Release{Name: "installed", Namespace: "selected", Version: 1, Chart: &chart.Chart{Metadata: &chart.Metadata{Name: "fixture-chart", Version: "1.0.0"}, Schema: schema}}
	raw, err := json.Marshal(installed)
	require.NoError(t, err)
	var compressed bytes.Buffer
	compressor := gzip.NewWriter(&compressed)
	_, err = compressor.Write(raw)
	require.NoError(t, err)
	require.NoError(t, compressor.Close())
	secret := &corev1.Secret{TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "Secret"}, ObjectMeta: metav1.ObjectMeta{Name: "sh.helm.release.v1.installed.v1", Namespace: "selected", Labels: map[string]string{"owner": "helm", "name": "installed", "version": "1", "status": "deployed"}}, Type: "helm.sh/release.v1", Data: map[string][]byte{"release": []byte(base64.StdEncoding.EncodeToString(compressed.Bytes()))}}
	var nativeGets atomic.Int32
	var oversized atomic.Bool
	var oversizedGets atomic.Int32
	var blocked atomic.Bool
	entered, retired := make(chan struct{}), make(chan struct{})
	var enteredOnce, retiredOnce sync.Once
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Header.Get("Authorization") != "Bearer owned-schema-fixture" {
			http.Error(w, "fixture authentication required", http.StatusUnauthorized)
			return
		}
		switch r.URL.Path {
		case "/version":
			_, _ = fmt.Fprint(w, `{"major":"1","minor":"32","gitVersion":"v1.32.0"}`)
		case "/api/v1/secrets", "/api/v1/namespaces/selected/secrets":
			_ = json.NewEncoder(w).Encode(corev1.SecretList{TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "SecretList"}, Items: []corev1.Secret{*secret}})
		case "/api/v1/namespaces/selected/secrets/sh.helm.release.v1.installed.v1":
			nativeGets.Add(1)
			if blocked.Load() {
				enteredOnce.Do(func() { close(entered) })
				<-r.Context().Done()
				retiredOnce.Do(func() { close(retired) })
				return
			}
			if oversized.Load() {
				oversizedGets.Add(1)
				_, _ = fmt.Fprint(w, `{"data":{"release":"`)
				chunk := bytes.Repeat([]byte("A"), 32<<10)
				for written := 0; written <= kubeauth.ResourceResponseLimit; written += len(chunk) {
					if _, err := w.Write(chunk); err != nil {
						return
					}
				}
				_, _ = fmt.Fprint(w, `"}}`)
				return
			}
			_ = json.NewEncoder(w).Encode(secret)
		default:
			t.Errorf("unexpected Helm native request: %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	route := resourcev2.AccessRoute{Connection: "owned-cluster"}
	configPath := filepath.Join(t.TempDir(), "config")
	config := fmt.Sprintf("apiVersion: v1\nkind: Config\nclusters:\n- name: owned\n  cluster:\n    server: %s\n    insecure-skip-tls-verify: true\ncontexts:\n- name: owned-cluster\n  context:\n    cluster: owned\n    user: owned\ncurrent-context: owned-cluster\nusers:\n- name: owned\n  user:\n    token: owned-schema-fixture\n", server.URL)
	require.NoError(t, os.WriteFile(configPath, []byte(config), 0600))
	p := &kubernetesProvider{catalogs: map[string]*nativeCatalogSnapshot{route.Connection: {catalog: resourcev2.Catalog{Provider: "kubernetes", Revision: "editor-catalog", Coverage: resourcev2.Coverage{Kind: "complete"}, Types: []resourcev2.ResourceType{{Type: "k8s:/pods", DefaultRepresentation: boundaryRepresentation().ID, Representations: []resourcev2.Representation{boundaryRepresentation()}}}}}}, helmAncillary: helm.NewHelmAncillary(zap.NewNop().Sugar())}
	controller, err := resourcev2.NewController(resourcev2.Config[clients.ClientSet]{Catalog: p.catalog, Lifecycle: &resourcev2.Lifecycle[clients.ClientSet]{
		LoadConnections: func(context.Context) ([]types.Connection, error) {
			return []types.Connection{{ID: route.Connection, Name: "Owned cluster"}}, nil
		},
		CreateClient: func(ctx context.Context, _ types.Connection) (*clients.ClientSet, error) {
			bundle, err := kubeauth.LoadResourceKubeClients(ctx, configPath, route.Connection)
			if err != nil {
				return nil, err
			}
			// Synthetic EKS shape: authentication survives only in the existing
			// transport, not in returned config fields that Helm could rebuild.
			bundle.RestConfig.BearerToken = ""
			bundle.RestConfig.BearerTokenFile = ""
			bundle.RestConfig.ExecProvider = nil
			bundle.RestConfig.AuthProvider = nil
			return &clients.ClientSet{KubeClient: bundle.Clientset, RESTConfig: bundle.RestConfig, HTTPClient: bundle.HTTPClient}, nil
		},
		DestroyClient: (&kubeConnectionProvider{logger: zap.NewNop().Sugar()}).DestroyClient,
	}})
	require.NoError(t, err)
	p.Controller = controller
	t.Cleanup(func() { require.NoError(t, controller.Close()) })
	_, err = controller.LoadConnections(context.Background())
	require.NoError(t, err)
	_, err = controller.StartConnection(context.Background(), route.Connection)
	require.NoError(t, err)
	schemas, err := p.GetEditorSchemas(context.Background(), route)
	require.NoError(t, err)
	require.Equal(t, int32(1), nativeGets.Load())
	require.Len(t, schemas, 1, "catalog types are host-derived; the provider returns only Helm auxiliary schemas")
	require.Equal(t, "helm:releases", schemas[0].Type)
	require.Equal(t, "selected/installed", schemas[0].Key)
	require.Equal(t, "yaml", schemas[0].Language)
	require.Equal(t, "available", schemas[0].Binding.State)
	require.JSONEq(t, string(schema), string(schemas[0].Binding.Document))
	oversized.Store(true)
	schemas, err = p.GetEditorSchemas(context.Background(), route)
	require.Equal(t, "RESOURCE_LIMIT", resourcev2.ErrorCode(err), "the Helm response guard failure is returned unchanged")
	require.Empty(t, schemas)
	require.Equal(t, int32(1), oversizedGets.Load(), "oversized native payloads must not trigger retries or an unbounded fallback client")
	oversized.Store(false)
	blocked.Store(true)
	requestCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	canceled := make(chan error, 1)
	go func() { _, err := p.GetEditorSchemas(requestCtx, route); canceled <- err }()
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("native Helm storage request did not start")
	}
	cancel()
	select {
	case err := <-canceled:
		require.Error(t, err)
	case <-time.After(3 * time.Second):
		t.Fatal("Helm storage ignored caller cancellation")
	}
	select {
	case <-retired:
	case <-time.After(3 * time.Second):
		t.Fatal("native Helm HTTP request did not retire")
	}
	blocked.Store(false)
	schemas, err = p.GetEditorSchemas(context.Background(), route)
	require.NoError(t, err, "one canceled request must not poison later Helm configurations")
	require.Len(t, schemas, 1)
}
