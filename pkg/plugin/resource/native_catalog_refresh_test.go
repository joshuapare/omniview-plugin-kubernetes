package resource

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/helm"
	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	sdktypes "github.com/omniviewdev/plugin-sdk/pkg/types"
	"github.com/omniviewdev/plugin-sdk/settings"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/discovery"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

// refreshHTTPFixture serves actual discovery documents, not FakeDiscovery's
// preassembled response. OpenAPI is unavailable unless a test installs it.
type refreshHTTPFixture struct {
	mu        sync.Mutex
	documents map[string]string
	requests  map[string]int
	fail      string
	hook      func(http.ResponseWriter, *http.Request) bool
}

func newRefreshHTTPFixture(t *testing.T) (*refreshHTTPFixture, *clients.ClientSet) {
	t.Helper()
	f := &refreshHTTPFixture{documents: map[string]string{}, requests: map[string]int{}}
	f.setVersions(t, "v1", "v2")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.requests[r.URL.Path]++
		body, ok := f.documents[r.URL.Path]
		fail, hook := f.fail, f.hook
		f.mu.Unlock()
		if hook != nil && hook(w, r) {
			return
		}
		if r.URL.Path == fail {
			http.Error(w, "discovery unavailable", http.StatusServiceUnavailable)
			return
		}
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	d, err := discovery.NewDiscoveryClientForConfig(&rest.Config{Host: server.URL})
	require.NoError(t, err)
	return f, &clients.ClientSet{DiscoveryClient: d, KubeClient: k8sfake.NewClientset(&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "kube-system", UID: types.UID("http-cluster-uid")}})}
}

func (f *refreshHTTPFixture) setVersions(t *testing.T, versions ...string) {
	t.Helper()
	encode := func(value any) string { data, err := json.Marshal(value); require.NoError(t, err); return string(data) }
	group := metav1.APIGroup{Name: "refresh.example"}
	documents := map[string]string{
		"/api":    encode(metav1.APIVersions{Versions: []string{"v1"}}),
		"/api/v1": encode(metav1.APIResourceList{GroupVersion: "v1", APIResources: []metav1.APIResource{{Name: "pods", Kind: "Pod", Namespaced: true, Verbs: metav1.Verbs{"get", "list"}}}}),
	}
	for _, version := range versions {
		gv := "refresh.example/" + version
		group.Versions = append(group.Versions, metav1.GroupVersionForDiscovery{GroupVersion: gv, Version: version})
		documents["/apis/"+gv] = encode(metav1.APIResourceList{GroupVersion: gv, APIResources: []metav1.APIResource{{Name: "widgets", Kind: "Widget", Namespaced: true, Verbs: metav1.Verbs{"get", "list"}}}})
	}
	if len(group.Versions) != 0 {
		group.PreferredVersion = group.Versions[0]
	}
	documents["/apis"] = encode(metav1.APIGroupList{Groups: []metav1.APIGroup{group}})
	f.mu.Lock()
	f.documents = documents
	f.mu.Unlock()
}

func (f *refreshHTTPFixture) count(path string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	if path != "" {
		return f.requests[path]
	}
	total := 0
	for _, count := range f.requests {
		total += count
	}
	return total
}

func refreshTestProvider() *kubernetesProvider {
	return &kubernetesProvider{catalogs: map[string]*nativeCatalogSnapshot{}, logger: zap.NewNop().Sugar(), connections: &kubeConnectionProvider{}, helmTypes: helm.HelmResourceTypes()}
}

func refreshTestContext(id string) (context.Context, sdktypes.Connection) {
	connection := sdktypes.Connection{ID: id}
	return resourcev2.WithSession(context.Background(), resourcev2.Session{Connection: &connection}), connection
}

func expireRefresh(p *kubernetesProvider, id string) {
	p.mu.Lock()
	p.catalogs[id].nextRefresh = time.Now().Add(-time.Second)
	p.mu.Unlock()
}

type refreshTimeoutSettings struct {
	settings.Provider
	read func() (any, error)
}

func (p refreshTimeoutSettings) GetSettingValue(string) (any, error) { return p.read() }

type refreshWaitContext struct {
	context.Context
	entered chan struct{}
	once    sync.Once
}

func (c *refreshWaitContext) Done() <-chan struct{} {
	c.once.Do(func() { close(c.entered) })
	return c.Context.Done()
}

func TestNativeRefreshSettingsFailureIsSharedAndCached(t *testing.T) {
	f, client := newRefreshHTTPFixture(t)
	p := refreshTestProvider()
	ctx, connection := refreshTestContext("settings-cluster")
	require.NoError(t, p.startNativeConnection(ctx, connection, client))
	t.Cleanup(func() { p.retireNativeCatalog(connection.ID) })
	before := f.count("")
	entered, release := make(chan struct{}), make(chan struct{})
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	t.Cleanup(unblock)
	reads := 0
	configured := resourcev2.WithSession(ctx, resourcev2.Session{
		Connection: &connection,
		PluginConfig: refreshTimeoutSettings{read: func() (any, error) {
			reads++
			close(entered)
			<-release
			return nil, errors.New("settings unavailable")
		}},
	})
	require.NoError(t, p.refreshNativeCatalog(configured, connection.ID, client), "cached success must not read settings")
	require.Zero(t, reads)
	expireRefresh(p, connection.ID)
	owner := make(chan error, 1)
	go func() { owner <- p.refreshNativeCatalog(configured, connection.ID, client) }()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("owned refresh did not read settings")
	}
	waitCtx := &refreshWaitContext{Context: configured, entered: make(chan struct{})}
	waiter := make(chan error, 1)
	go func() { waiter <- p.refreshNativeCatalog(waitCtx, connection.ID, client) }()
	select {
	case <-waitCtx.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("concurrent caller did not join owned refresh")
	}
	unblock()
	var ownerErr error
	select {
	case ownerErr = <-owner:
		require.Equal(t, "INVALID_REQUEST", resourcev2.ErrorCode(ownerErr))
	case <-time.After(5 * time.Second):
		t.Fatal("settings failure did not finish owned refresh")
	}
	select {
	case err := <-waiter:
		require.Same(t, ownerErr, err, "waiter must receive shared settings failure")
	case <-time.After(5 * time.Second):
		t.Fatal("settings failure did not release waiter")
	}
	require.Same(t, ownerErr, p.refreshNativeCatalog(ctx, connection.ID, client), "cached failure must remain visible without a new settings lookup")
	require.Equal(t, 1, reads)
	require.Equal(t, before, f.count(""), "settings failure must not start discovery")
}

func TestNativeHTTPRefreshObservesServedVersionsOnlyWhenEligible(t *testing.T) {
	f, client := newRefreshHTTPFixture(t)
	p := refreshTestProvider()
	ctx, connection := refreshTestContext("cluster-a")
	require.NoError(t, p.startNativeConnection(ctx, connection, client))
	t.Cleanup(func() { p.retireNativeCatalog(connection.ID) })
	original := p.catalogs[connection.ID]
	ids := []string{}
	for _, rep := range original.bindings["k8s:refresh.example/widgets"].Descriptor.Representations {
		ids = append(ids, rep.ID)
	}
	require.ElementsMatch(t, []string{"kubernetes.object.v1/refresh.example/v1", "kubernetes.model.v1/refresh.example/v1", "kubernetes.object.v1/refresh.example/v2", "kubernetes.model.v1/refresh.example/v2"}, ids)
	require.WithinDuration(t, time.Now().Add(30*time.Second), original.nextRefresh, 2*time.Second)
	before := f.count("")
	f.setVersions(t, "v2", "v3")
	f.mu.Lock()
	f.documents["/apis/refresh.example/v3"] = `{"groupVersion":"refresh.example/v3","resources":[{"name":"widgets","kind":"Widget","namespaced":true,"verbs":["get","list"]},{"name":"gadgets","kind":"Gadget","verbs":["get","list"]}]}`
	f.mu.Unlock()
	require.NoError(t, p.refreshNativeCatalog(ctx, connection.ID, client))
	require.Equal(t, before, f.count(""), "ineligible refresh must make no HTTP request")
	require.Same(t, original, p.catalogs[connection.ID])
	require.NotContains(t, original.bindings, "k8s:refresh.example/gadgets")
	expireRefresh(p, connection.ID)
	require.NoError(t, p.refreshNativeCatalog(ctx, connection.ID, client))
	updated := p.catalogs[connection.ID]
	require.NotSame(t, original, updated)
	require.Contains(t, updated.bindings, "k8s:refresh.example/gadgets")
	ids = nil
	for _, rep := range updated.bindings["k8s:refresh.example/widgets"].Descriptor.Representations {
		ids = append(ids, rep.ID)
	}
	require.ElementsMatch(t, []string{"kubernetes.object.v1/refresh.example/v2", "kubernetes.model.v1/refresh.example/v2", "kubernetes.object.v1/refresh.example/v3", "kubernetes.model.v1/refresh.example/v3"}, ids)
	openAPI := f.count("/openapi/v3/apis/refresh.example/v2")
	expireRefresh(p, connection.ID)
	require.NoError(t, p.refreshNativeCatalog(ctx, connection.ID, client))
	require.Same(t, updated, p.catalogs[connection.ID], "unchanged discovery and schemas must reuse snapshot")
	require.Equal(t, updated.catalog.Revision, p.catalogs[connection.ID].catalog.Revision)
	require.Greater(t, f.count("/openapi/v3/apis/refresh.example/v2"), openAPI, "every eligible refresh must revalidate schemas")
}

func TestNativeHTTPRefreshSchemaOnlyCRDRevisionAndRecovery(t *testing.T) {
	for _, initiallyAvailable := range []bool{false, true} {
		t.Run(fmt.Sprintf("initiallyAvailable=%t", initiallyAvailable), func(t *testing.T) {
			f, client := newRefreshHTTPFixture(t)
			f.setVersions(t, "v1")
			setSchema := func(root, fieldType string) string {
				document := fmt.Sprintf(`{"openapi":"3.0.0","components":{"schemas":{%q:{"type":"object","x-kubernetes-group-version-kind":[{"group":"refresh.example","version":"v1","kind":"Widget"}],"properties":{"spec":{"type":"object","properties":{"value":{"type":%q}}}}}}}}`, root, fieldType)
				f.mu.Lock()
				f.documents["/openapi/v3/apis/refresh.example/v1"] = document
				f.mu.Unlock()
				return document
			}
			if initiallyAvailable {
				setSchema("native.Widget", "string")
			}
			p := refreshTestProvider()
			ctx, connection := refreshTestContext("schema-cluster")
			require.NoError(t, p.startNativeConnection(ctx, connection, client))
			t.Cleanup(func() { p.retireNativeCatalog(connection.ID) })
			original := p.catalogs[connection.ID]
			schemaBinding := func(snapshot *nativeCatalogSnapshot) resourcev2.SchemaBinding {
				return snapshot.bindings["k8s:refresh.example/widgets"].Descriptor.Representations[0].Schema
			}
			if initiallyAvailable {
				require.Equal(t, "available", schemaBinding(original).State)
			} else {
				require.Equal(t, "unavailable", schemaBinding(original).State)
			}
			document := setSchema("native.WidgetRevised", "integer")
			expireRefresh(p, connection.ID)
			require.NoError(t, p.refreshNativeCatalog(ctx, connection.ID, client))
			revised := p.catalogs[connection.ID]
			require.NotSame(t, original, revised)
			require.Equal(t, original.discoveryRevision, revised.discoveryRevision)
			require.Equal(t, original.identityHint, revised.identityHint, "schema-only changes must not change native authority")
			require.NotEqual(t, original.catalog.Revision, revised.catalog.Revision)
			binding := schemaBinding(revised)
			require.Equal(t, "available", binding.State)
			require.Equal(t, "#/components/schemas/native.WidgetRevised", binding.Root)
			require.NotNil(t, binding.DocumentRef)
			require.Equal(t, document, string(revised.documents[*binding.DocumentRef].Document))
			if initiallyAvailable {
				require.NotEqual(t, schemaBinding(original).Revision, binding.Revision)
			}
			retained := p.schemaBudget.used
			expireRefresh(p, connection.ID)
			require.NoError(t, p.refreshNativeCatalog(ctx, connection.ID, client))
			require.Same(t, revised, p.catalogs[connection.ID], "identical schema revalidation must retain snapshot")
			require.Equal(t, retained, p.schemaBudget.used, "discarded staged lease must not retain bytes")

			f.mu.Lock()
			delete(f.documents, "/openapi/v3/apis/refresh.example/v1")
			f.mu.Unlock()
			expireRefresh(p, connection.ID)
			require.NoError(t, p.refreshNativeCatalog(ctx, connection.ID, client))
			unavailable := p.catalogs[connection.ID]
			require.Equal(t, "unavailable", schemaBinding(unavailable).State)
			require.Equal(t, revised.discoveryRevision, unavailable.discoveryRevision)
			require.Equal(t, revised.identityHint, unavailable.identityHint)
			require.NotEqual(t, revised.catalog.Revision, unavailable.catalog.Revision)
			require.Zero(t, p.schemaBudget.used)

			setSchema("native.WidgetRevised", "integer")
			expireRefresh(p, connection.ID)
			require.NoError(t, p.refreshNativeCatalog(ctx, connection.ID, client))
			recovered := p.catalogs[connection.ID]
			require.Equal(t, "available", schemaBinding(recovered).State)
			require.Equal(t, revised.catalog.Revision, recovered.catalog.Revision)
			require.NotEqual(t, unavailable.catalog.Revision, recovered.catalog.Revision)
			require.Equal(t, original.discoveryRevision, recovered.discoveryRevision)
			require.Equal(t, original.identityHint, recovered.identityHint)
			require.Equal(t, retained, p.schemaBudget.used)
		})
	}
}

func TestNativeHTTPRefreshClustersRemainIndependent(t *testing.T) {
	fa, ca := newRefreshHTTPFixture(t)
	fb, cb := newRefreshHTTPFixture(t)
	p := refreshTestProvider()
	a, ac := refreshTestContext("a")
	b, bc := refreshTestContext("b")
	require.NoError(t, p.startNativeConnection(a, ac, ca))
	require.NoError(t, p.startNativeConnection(b, bc, cb))
	t.Cleanup(func() { p.retireNativeCatalog("a"); p.retireNativeCatalog("b") })
	oldB, requestsB := p.catalogs["b"], fb.count("")
	fa.setVersions(t, "v3")
	expireRefresh(p, "a")
	require.NoError(t, p.refreshNativeCatalog(a, "a", ca))
	require.NoError(t, p.refreshNativeCatalog(b, "b", cb))
	require.Same(t, oldB, p.catalogs["b"])
	require.Equal(t, requestsB, fb.count(""))
	require.NotEqual(t, p.catalogs["a"].discoveryRevision, oldB.discoveryRevision)
}

func TestNativeHTTPDiscoveryFailureRetainsCatalogAndError(t *testing.T) {
	for _, path := range []string{"/api", "/apis"} {
		t.Run(path, func(t *testing.T) {
			f, client := newRefreshHTTPFixture(t)
			p := refreshTestProvider()
			ctx, connection := refreshTestContext("cluster")
			require.NoError(t, p.startNativeConnection(ctx, connection, client))
			t.Cleanup(func() { p.retireNativeCatalog("cluster") })
			original := p.catalogs["cluster"]
			f.mu.Lock()
			f.fail = path
			f.mu.Unlock()
			expireRefresh(p, "cluster")
			require.Error(t, p.refreshNativeCatalog(ctx, "cluster", client))
			require.Same(t, original, p.catalogs["cluster"])
			before := f.count("")
			require.Error(t, p.refreshNativeCatalog(ctx, "cluster", client))
			require.Equal(t, before, f.count(""))
			f.mu.Lock()
			f.fail = ""
			f.mu.Unlock()
			expireRefresh(p, "cluster")
			require.NoError(t, p.refreshNativeCatalog(ctx, "cluster", client))
		})
	}
}

func TestNativeHTTPDiscoveryCancellationReachesRequest(t *testing.T) {
	f, client := newRefreshHTTPFixture(t)
	entered, canceled := make(chan struct{}), make(chan struct{})
	f.mu.Lock()
	f.hook = func(w http.ResponseWriter, r *http.Request) bool {
		if r.URL.Path != "/api" {
			return false
		}
		close(entered)
		<-r.Context().Done()
		close(canceled)
		return true
	}
	f.mu.Unlock()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { _, _, err := discoverNativeResources(ctx, client.DiscoveryClient); done <- err }()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("HTTP discovery did not start")
	}
	cancel()
	select {
	case <-canceled:
	case <-time.After(5 * time.Second):
		t.Fatal("HTTP request did not receive cancellation")
	}
	select {
	case err := <-done:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(5 * time.Second):
		t.Fatal("discovery did not return")
	}
}

func TestNativeHTTPDiscoveryBudgets(t *testing.T) {
	t.Run("served versions", func(t *testing.T) {
		f, client := newRefreshHTTPFixture(t)
		versions := make([]string, maxNativeDiscoveryVersions)
		for i := range versions {
			versions[i] = fmt.Sprintf("v%d", i+1)
		}
		f.setVersions(t, versions...)
		_, _, err := discoverNativeResources(context.Background(), client.DiscoveryClient)
		require.ErrorContains(t, err, "served-version budget")
		require.Equal(t, 0, f.count("/api/v1"), "reject excessive versions before fetching resource lists")
	})
	t.Run("document bytes", func(t *testing.T) {
		f, client := newRefreshHTTPFixture(t)
		f.mu.Lock()
		f.documents["/api"] = strings.Repeat(" ", maxNativeDiscoveryDocumentBytes+1)
		f.mu.Unlock()
		_, _, err := discoverNativeResources(context.Background(), client.DiscoveryClient)
		require.ErrorContains(t, err, "byte budget")
		require.Equal(t, 0, f.count("/apis"))
	})
	t.Run("aggregate bytes", func(t *testing.T) {
		f, client := newRefreshHTTPFixture(t)
		f.setVersions(t, "v1", "v2", "v3", "v4", "v5", "v6")
		f.mu.Lock()
		for path, document := range f.documents {
			if strings.HasPrefix(path, "/apis/refresh.example/") {
				f.documents[path] = document + strings.Repeat(" ", 3<<20)
			}
		}
		f.mu.Unlock()
		_, _, err := discoverNativeResources(context.Background(), client.DiscoveryClient)
		require.ErrorContains(t, err, "byte budget")
	})
}

func TestNativeHTTPRefreshCoalescesAndFencesRetiredPublication(t *testing.T) {
	for _, retire := range []bool{false, true} {
		t.Run(fmt.Sprintf("retire=%t", retire), func(t *testing.T) {
			f, client := newRefreshHTTPFixture(t)
			p := refreshTestProvider()
			ctx, connection := refreshTestContext("cluster")
			require.NoError(t, p.startNativeConnection(ctx, connection, client))
			t.Cleanup(func() { p.retireNativeCatalog("cluster") })
			f.setVersions(t, "v3")
			entered, release := make(chan struct{}), make(chan struct{})
			var once sync.Once
			defer once.Do(func() { close(release) })
			f.mu.Lock()
			f.hook = func(w http.ResponseWriter, r *http.Request) bool {
				if r.URL.Path != "/api" {
					return false
				}
				close(entered)
				select {
				case <-release:
				case <-r.Context().Done():
				}
				return false
			}
			f.mu.Unlock()
			expireRefresh(p, "cluster")
			before := f.count("/api")
			done := make(chan error, 16)
			go func() { done <- p.refreshNativeCatalog(ctx, "cluster", client) }()
			select {
			case <-entered:
			case <-time.After(5 * time.Second):
				t.Fatal("refresh did not reach HTTP")
			}
			for i := 1; i < 16; i++ {
				go func() { done <- p.refreshNativeCatalog(ctx, "cluster", client) }()
			}
			if retire {
				p.retireNativeCatalog("cluster")
			}
			once.Do(func() { close(release) })
			for range 16 {
				select {
				case err := <-done:
					if retire {
						require.Error(t, err)
					} else {
						require.NoError(t, err)
					}
				case <-time.After(5 * time.Second):
					t.Fatal("refresh caller did not finish")
				}
			}
			require.Equal(t, before+1, f.count("/api"), "callers must share one discovery acquisition")
			if retire {
				require.NotContains(t, p.catalogs, "cluster")
			}
		})
	}
}

func TestNativeHTTPPartialDiscoveryIsExplicit(t *testing.T) {
	f, client := newRefreshHTTPFixture(t)
	f.mu.Lock()
	f.fail = "/apis/refresh.example/v2"
	f.mu.Unlock()
	p := refreshTestProvider()
	ctx, connection := refreshTestContext("partial")
	require.NoError(t, p.startNativeConnection(ctx, connection, client))
	t.Cleanup(func() { p.retireNativeCatalog("partial") })
	snapshot := p.catalogs["partial"]
	require.Equal(t, "partial", snapshot.catalog.Coverage.Kind)
	require.Contains(t, snapshot.bindings, "k8s:/pods")
	require.Contains(t, snapshot.bindings, "k8s:refresh.example/widgets")
	require.Len(t, snapshot.bindings["k8s:refresh.example/widgets"].Descriptor.Representations, 2)
}

func TestNativeHTTPInitialDiscoveryFailureDoesNotPublishEmptyCatalog(t *testing.T) {
	f, client := newRefreshHTTPFixture(t)
	f.mu.Lock()
	f.fail = "/apis"
	f.mu.Unlock()
	p := refreshTestProvider()
	ctx, connection := refreshTestContext("failed")
	require.Error(t, p.startNativeConnection(ctx, connection, client))
	require.NotContains(t, p.catalogs, connection.ID)
}
