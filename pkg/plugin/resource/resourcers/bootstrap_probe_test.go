package resourcers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

// TestInformerBootstrapProbe exercises real Watch over a controlled HTTP API.
// Run: go test ./pkg/plugin/resource/resourcers -run '^TestInformerBootstrapProbe$' -count=1 -v
func TestInformerBootstrapProbe(t *testing.T) {
	for _, n := range []int{300, 3000} {
		for _, scoped := range []bool{false, true} {
			name := fmt.Sprintf("objects=%d/scoped=%t", n, scoped)
			t.Run(name, func(t *testing.T) {
				items := make([]map[string]interface{}, 0, n)
				expected := make(map[string]bool, n)
				for i := 0; i < n; i++ {
					id := fmt.Sprintf("probe-%04d", i)
					expected[id] = true
					items = append(items, map[string]interface{}{
						"apiVersion": "v1", "kind": "Pod",
						"metadata": map[string]interface{}{
							"name": id, "namespace": "default", "uid": "uid-" + id, "resourceVersion": "1",
							"creationTimestamp": "2026-01-15T10:30:00Z",
							"labels":            map[string]interface{}{"app": "web", "tier": "frontend", "environment": "production"},
							"annotations":       map[string]interface{}{"prometheus.io/scrape": "true", "prometheus.io/port": "8080"},
						},
						"spec": map[string]interface{}{
							"nodeName": "worker-01", "serviceAccountName": "web", "restartPolicy": "Always",
							"containers": []interface{}{map[string]interface{}{
								"name": "web", "image": "registry.example.com/web:1.2.3",
								"ports":     []interface{}{map[string]interface{}{"name": "http", "containerPort": 8080, "protocol": "TCP"}},
								"env":       []interface{}{map[string]interface{}{"name": "ENVIRONMENT", "value": "production"}},
								"resources": map[string]interface{}{"requests": map[string]interface{}{"cpu": "100m", "memory": "128Mi"}, "limits": map[string]interface{}{"cpu": "500m", "memory": "512Mi"}},
							}},
						},
						"status": map[string]interface{}{
							"phase": "Running", "podIP": "10.42.0.10", "hostIP": "10.0.0.10",
							"startTime":         "2026-01-15T10:30:01Z",
							"conditions":        []interface{}{map[string]interface{}{"type": "Ready", "status": "True", "lastTransitionTime": "2026-01-15T10:30:05Z"}},
							"containerStatuses": []interface{}{map[string]interface{}{"name": "web", "ready": true, "restartCount": 0, "image": "registry.example.com/web:1.2.3", "imageID": "sha256:0123456789abcdef", "state": map[string]interface{}{"running": map[string]interface{}{"startedAt": "2026-01-15T10:30:03Z"}}}},
						},
					})
				}
				list, err := json.Marshal(map[string]interface{}{"apiVersion": "v1", "kind": "PodList", "metadata": map[string]interface{}{"resourceVersion": "1"}, "items": items})
				if err != nil {
					t.Fatal(err)
				}
				var lists, watches atomic.Int64
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path != "/api/v1/pods" && r.URL.Path != "/api/v1/namespaces/default/pods" {
						http.Error(w, "unexpected path", http.StatusNotFound)
						return
					}
					w.Header().Set("Content-Type", "application/json")
					if r.URL.Query().Get("watch") == "true" {
						watches.Add(1)
						w.WriteHeader(http.StatusOK)
						if r.URL.Query().Get("sendInitialEvents") == "true" {
							encoder := json.NewEncoder(w)
							for _, item := range items {
								_ = encoder.Encode(map[string]interface{}{"type": "ADDED", "object": item})
							}
							_ = encoder.Encode(map[string]interface{}{"type": "BOOKMARK", "object": map[string]interface{}{"apiVersion": "v1", "kind": "Pod", "metadata": map[string]interface{}{"resourceVersion": "1", "annotations": map[string]interface{}{"k8s.io/initial-events-end": "true"}}}})
						}
						w.(http.Flusher).Flush()
						<-r.Context().Done()
						return
					}
					lists.Add(1)
					_, _ = w.Write(list)
				}))
				defer server.Close()
				dc, err := dynamic.NewForConfig(&rest.Config{Host: server.URL})
				if err != nil {
					t.Fatal(err)
				}
				cs := &clients.ClientSet{DynamicClient: dc}
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				target := testWatchTarget()
				if scoped {
					values := []string{"default"}
					target.Scope = resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeOneOf, Values: &values}}
				}
				type run struct {
					sink  *recordingSink
					done  chan error
					start time.Time
				}
				start := func() run {
					r := run{sink: newRecordingSink(), done: make(chan error, 1), start: time.Now()}
					go func() { r.done <- newBaseResourcer().Watch(ctx, cs, target, testWatchRepresentation(), r.sink) }()
					return r
				}
				report := func(label string, r run) {
					r.sink.WaitForState(t, target.Type, resource.WatchStateSynced, 30*time.Second)
					synced := time.Since(r.start)
					r.sink.WaitForAdds(t, n, 30*time.Second)
					elapsed := time.Since(r.start)
					r.sink.mu.Lock()
					counts := make(map[string]int, n)
					bytes := 0
					encodeStart := time.Now()
					for _, event := range r.sink.Adds {
						counts[event.Record.Reference.Address.ID]++
						encoded, err := json.Marshal(event)
						if err != nil {
							r.sink.mu.Unlock()
							t.Fatal(err)
						}
						bytes += len(encoded)
					}
					encodeElapsed := time.Since(encodeStart)
					adds := len(r.sink.Adds)
					r.sink.mu.Unlock()
					missing, unexpected, duplicates := []string{}, []string{}, []string{}
					for id := range expected {
						if counts[id] == 0 {
							missing = append(missing, id)
						}
						if counts[id] > 1 {
							duplicates = append(duplicates, id)
						}
					}
					for id := range counts {
						if !expected[id] {
							unexpected = append(unexpected, id)
						}
					}
					sort.Strings(missing)
					sort.Strings(unexpected)
					sort.Strings(duplicates)
					t.Logf("%s expected_ids=probe-0000..probe-%04d expected_count=%d unique_ids=%d adds=%d duplicate_ids=%d missing=%v unexpected=%v encoded_json_bytes=%d encode_and_count=%s watch_start_to_synced=%s watch_start_to_all_adds=%s", label, n-1, n, len(counts), adds, len(duplicates), missing, unexpected, bytes, encodeElapsed, synced, elapsed)
					if len(missing) != 0 || len(unexpected) != 0 || len(duplicates) != 0 {
						t.Errorf("%s initial IDs differ from expected", label)
					}
				}
				t.Logf("fixture=controlled-http list_bytes=%d", len(list))
				first := start()
				report("cold", first)
				second := start()
				report("warm-shared", second)
				t.Logf("transport list_requests=%d watch_requests=%d", lists.Load(), watches.Load())
				cancel()
				for _, r := range []run{first, second} {
					if err := <-r.done; err != nil {
						t.Error(err)
					}
				}
			})
		}
	}
}
