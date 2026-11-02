package resource

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"k8s.io/client-go/discovery"
)

func TestNativeDiscoveryParallelRequests(t *testing.T) {
	for _, cancelRequests := range []bool{false, true} {
		t.Run(fmt.Sprintf("cancel=%t", cancelRequests), func(t *testing.T) {
			f, client := newRefreshHTTPFixture(t)
			f.setVersions(t, "v1", "v2", "v3", "v4", "v5", "v6", "v7")
			entered := make(chan string, 8)
			release := make(chan struct{}, 8)
			var active, peak atomic.Int32
			f.mu.Lock()
			f.hook = func(w http.ResponseWriter, r *http.Request) bool {
				if r.URL.Path == "/api" || r.URL.Path == "/apis" {
					return false
				}
				n := active.Add(1)
				defer active.Add(-1)
				for old := peak.Load(); n > old; old = peak.Load() {
					if peak.CompareAndSwap(old, n) {
						break
					}
				}
				entered <- r.URL.Path
				select {
				case <-release:
					return false
				case <-r.Context().Done():
					return true
				}
			}
			f.mu.Unlock()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			t.Cleanup(func() { close(release) })
			type outcome struct {
				versions []string
				err      error
			}
			done := make(chan outcome, 1)
			go func() {
				_, lists, err := discoverNativeResources(ctx, client.DiscoveryClient)
				result := outcome{err: err}
				for _, list := range lists {
					result.versions = append(result.versions, list.GroupVersion)
				}
				done <- result
			}()
			for range nativeCatalogRequestConcurrency {
				select {
				case <-entered:
				case <-time.After(5 * time.Second):
					t.Fatal("discovery did not overlap four requests")
				}
			}
			if cancelRequests {
				cancel()
			} else {
				// Send tokens rather than closing: cleanup owns the close.
				for range 8 {
					release <- struct{}{}
				}
			}
			select {
			case result := <-done:
				if cancelRequests {
					require.ErrorIs(t, result.err, context.Canceled)
					require.Empty(t, result.versions)
				} else {
					require.NoError(t, result.err)
					require.Equal(t, []string{"v1", "refresh.example/v1", "refresh.example/v2", "refresh.example/v3", "refresh.example/v4", "refresh.example/v5", "refresh.example/v6", "refresh.example/v7"}, result.versions)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("discovery did not finish")
			}
			require.Equal(t, int32(nativeCatalogRequestConcurrency), peak.Load())
		})
	}
}

func TestNativeDiscoveryValidatesBeforeDispatch(t *testing.T) {
	f, client := newRefreshHTTPFixture(t)
	f.setVersions(t, "v1", "v1")
	_, _, err := discoverNativeResources(context.Background(), client.DiscoveryClient)
	require.ErrorContains(t, err, "duplicate")
	require.Equal(t, 0, f.count("/api/v1"))
	require.Equal(t, 0, f.count("/apis/refresh.example/v1"))
}

func TestNativeDiscoveryConcurrentAggregateBudget(t *testing.T) {
	f, client := newRefreshHTTPFixture(t)
	f.setVersions(t, "v1", "v2", "v3", "v4", "v5", "v6")
	f.mu.Lock()
	for path, document := range f.documents {
		if strings.HasPrefix(path, "/apis/refresh.example/") {
			f.documents[path] = document + strings.Repeat(" ", 3<<20)
		}
	}
	f.mu.Unlock()
	_, lists, err := discoverNativeResources(context.Background(), client.DiscoveryClient)
	var partial *discovery.ErrGroupDiscoveryFailed
	require.ErrorAs(t, err, &partial)
	require.NotEmpty(t, lists, "valid discovery remains available to partial-coverage consumers")
	accepted := 0
	for _, list := range lists {
		if strings.HasPrefix(list.GroupVersion, "refresh.example/") {
			accepted++
		}
	}
	require.LessOrEqual(t, accepted, 5, "workers must share one aggregate read allowance")
	for _, cause := range partial.Groups {
		require.ErrorContains(t, cause, "byte budget")
	}
}

func TestNativeDiscoveryMismatchFailsWithoutPartialResults(t *testing.T) {
	f, client := newRefreshHTTPFixture(t)
	f.mu.Lock()
	f.documents["/apis/refresh.example/v2"] = `{"groupVersion":"other.example/v2","resources":[]}`
	f.mu.Unlock()
	groups, lists, err := discoverNativeResources(context.Background(), client.DiscoveryClient)
	require.ErrorContains(t, err, "different group version")
	require.Nil(t, groups)
	require.Nil(t, lists)
}

func TestNativeDiscoveryPartialFailureKeepsOrderedResults(t *testing.T) {
	f, client := newRefreshHTTPFixture(t)
	f.mu.Lock()
	f.fail = "/apis/refresh.example/v1"
	f.mu.Unlock()
	_, lists, err := discoverNativeResources(context.Background(), client.DiscoveryClient)
	var partial *discovery.ErrGroupDiscoveryFailed
	require.ErrorAs(t, err, &partial)
	require.Len(t, partial.Groups, 1)
	require.Len(t, lists, 2)
	require.Equal(t, "v1", lists[0].GroupVersion)
	require.Equal(t, "refresh.example/v2", lists[1].GroupVersion)
}
