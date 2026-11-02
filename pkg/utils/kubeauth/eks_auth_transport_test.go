package kubeauth

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestEKSCachedTokenDoesNotSerializeHTTPRequests(t *testing.T) {
	t.Setenv("AWS_EC2_METADATA_DISABLED", "true")
	t.Setenv("AWS_CONFIG_FILE", filepath.Join(t.TempDir(), "config"))
	t.Setenv("AWS_SHARED_CREDENTIALS_FILE", filepath.Join(t.TempDir(), "credentials"))
	t.Setenv("AWS_ACCESS_KEY_ID", "synthetic")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "synthetic")
	entered := make(chan string, 2)
	release := make(chan struct{})
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		entered <- r.Header.Get("Authorization")
		select {
		case <-release:
			w.WriteHeader(http.StatusNoContent)
		case <-r.Context().Done():
		}
	}))
	defer server.Close()
	defer unblock()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	transport := &eksAuthTransport{
		ClusterName: "synthetic", Region: "us-east-1",
		token: "cached-token", expiresAt: time.Now().Add(time.Hour),
		Base: server.Client().Transport,
	}
	client := &http.Client{Transport: transport}
	results := make(chan error, 2)
	for range 2 {
		go func() {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
			if err == nil {
				var response *http.Response
				response, err = client.Do(req)
				if response != nil {
					io.Copy(io.Discard, response.Body)
					response.Body.Close()
				}
				if req.Header.Get("Authorization") != "" {
					t.Error("transport mutated the caller's request headers")
				}
			}
			results <- err
		}()
	}
	// Both authenticated requests must reach the real server before either
	// response is released. A token mutex held during RoundTrip deadlocks here.
	for range 2 {
		select {
		case authorization := <-entered:
			if authorization != "Bearer cached-token" {
				t.Fatalf("unexpected authorization %q", authorization)
			}
		case <-ctx.Done():
			t.Fatal("cached-token requests did not overlap")
		}
	}
	unblock()
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
}
