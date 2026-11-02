package helm

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	"github.com/omniview/kubernetes/pkg/utils/kubeauth"
	sdkresource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart"
	helmrelease "helm.sh/helm/v3/pkg/release"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// The existing authenticated transport is deliberately distinguishable from
// kubeconfig bearer authentication. No AWS/exec credential provider is invoked.
type helmExistingAuthTransport struct{ base http.RoundTripper }

func (t *helmExistingAuthTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	copy := request.Clone(request.Context())
	copy.Header.Set("Authorization", "Bearer already-authenticated-transport")
	return t.base.RoundTrip(copy)
}

func TestHelmOperationContextCancelsNativeBackgroundRequestsWithoutPoisoningSharedClient(t *testing.T) {
	for _, operation := range []string{"reachability", "storage"} {
		t.Run(operation, func(t *testing.T) {
			t.Setenv("HELM_DRIVER", "secrets")
			testCtx, finish := context.WithTimeout(context.Background(), 15*time.Second)
			t.Cleanup(finish)
			entered, serverCanceled := make(chan struct{}), make(chan struct{})
			var held atomic.Bool
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer already-authenticated-transport" {
					http.Error(w, "existing authenticated transport was lost", http.StatusUnauthorized)
					return
				}
				target := (operation == "reachability" && r.URL.Path == "/version") || (operation == "storage" && strings.HasSuffix(r.URL.Path, "/secrets"))
				if target && held.CompareAndSwap(false, true) {
					close(entered)
					<-r.Context().Done()
					close(serverCanceled)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				switch {
				case r.URL.Path == "/version":
					fmt.Fprint(w, `{"major":"1","minor":"35","gitVersion":"v1.35.0"}`)
				case strings.HasSuffix(r.URL.Path, "/secrets"):
					fmt.Fprint(w, `{"apiVersion":"v1","kind":"SecretList","metadata":{},"items":[]}`)
				default:
					http.Error(w, "unexpected native Helm endpoint: "+r.URL.Path, http.StatusNotFound)
				}
			}))
			t.Cleanup(server.Close)
			lifetime, retire := context.WithCancel(testCtx)
			t.Cleanup(retire)
			dir := t.TempDir()
			ca := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw})
			path := filepath.Join(dir, "kubeconfig")
			config := fmt.Sprintf("apiVersion: v1\nkind: Config\nclusters:\n- name: owned\n  cluster:\n    server: %s\n    certificate-authority-data: %s\nusers:\n- name: owned\n  user:\n    token: kubeconfig-token-must-not-replace-transport\ncontexts:\n- name: owned\n  context:\n    cluster: owned\n    user: owned\ncurrent-context: owned\n", server.URL, base64.StdEncoding.EncodeToString(ca))
			require.NoError(t, os.WriteFile(path, []byte(config), 0600))
			bundle, err := kubeauth.LoadResourceKubeClients(lifetime, path, "owned")
			require.NoError(t, err)
			require.NotNil(t, bundle.HTTPClient)
			require.NotNil(t, bundle.HTTPClient.Transport)
			require.False(t, bundle.RestConfig.Insecure, "TLS verification must stay enabled")
			require.NotEmpty(t, bundle.RestConfig.CAData)
			// If Helm reconstructs authentication from this rest.Config instead of
			// using the supplied client, the real sentinel executable records it.
			marker := filepath.Join(dir, "exec-was-run")
			sentinel := filepath.Join(dir, "must-not-execute")
			require.NoError(t, os.WriteFile(sentinel, []byte("#!/bin/sh\nprintf executed > \"$HELM_EXEC_SENTINEL\"\nexit 97\n"), 0700))
			execConfig := &clientcmdapi.ExecConfig{Command: sentinel, APIVersion: "client.authentication.k8s.io/v1", InteractiveMode: clientcmdapi.NeverExecInteractiveMode, Env: []clientcmdapi.ExecEnvVar{{Name: "HELM_EXEC_SENTINEL", Value: marker}}}
			originalExec := *execConfig
			originalExec.Env = append([]clientcmdapi.ExecEnvVar(nil), execConfig.Env...)
			bundle.RestConfig.ExecProvider = execConfig
			existingTransport := &helmExistingAuthTransport{base: bundle.HTTPClient.Transport}
			bundle.HTTPClient.Transport = existingTransport
			originalTLS := bundle.RestConfig.TLSClientConfig
			originalTLS.CAData = append([]byte(nil), originalTLS.CAData...)
			originalTLS.CertData = append([]byte(nil), originalTLS.CertData...)
			originalTLS.KeyData = append([]byte(nil), originalTLS.KeyData...)
			originalTimeout := bundle.HTTPClient.Timeout
			t.Cleanup(func() {
				_, err := os.Stat(marker)
				if !os.IsNotExist(err) {
					t.Errorf("Helm reconstructed authentication and invoked exec sentinel: %v", err)
				}
			})
			operationCtx, cancelOperation := context.WithCancel(testCtx)
			t.Cleanup(cancelOperation)
			first, err := newActionConfig(operationCtx, bundle.RestConfig, bundle.HTTPClient, "owned")
			require.NoError(t, err)
			unrelated, err := newActionConfig(testCtx, bundle.RestConfig, bundle.HTTPClient, "owned")
			require.NoError(t, err)
			invoke := func(cfg *action.Configuration) error {
				if operation == "reachability" {
					return cfg.KubeClient.IsReachable()
				}
				_, err := cfg.Releases.List(func(*helmrelease.Release) bool { return true })
				return err
			}
			finished := make(chan error, 1)
			go func() { finished <- invoke(first) }()
			select {
			case <-entered:
			case <-testCtx.Done():
				t.Fatal("native Helm request did not enter owned TLS server: ", testCtx.Err())
			}
			// A separate operation sharing the original auth-aware client can
			// complete while the first operation's native Background call is held.
			require.NoError(t, invoke(unrelated))
			cancelOperation()
			select {
			case err := <-finished:
				require.Error(t, err, "Helm Background request survived operation cancellation")
			case <-testCtx.Done():
				t.Fatal("operation cancellation did not abort native Helm request: ", testCtx.Err())
			}
			select {
			case <-serverCanceled:
			case <-testCtx.Done():
				t.Fatal("owned TLS server did not observe Helm cancellation: ", testCtx.Err())
			}
			later, err := newActionConfig(testCtx, bundle.RestConfig, bundle.HTTPClient, "owned")
			require.NoError(t, err)
			require.NoError(t, later.KubeClient.IsReachable())
			_, err = later.Releases.List(func(*helmrelease.Release) bool { return true })
			require.NoError(t, err)
			require.NoError(t, invoke(unrelated), "canceled operation poisoned unrelated configuration")
			require.Same(t, existingTransport, bundle.HTTPClient.Transport, "original auth-aware transport mutated")
			require.Same(t, execConfig, bundle.RestConfig.ExecProvider, "original exec config mutated")
			require.Equal(t, originalTLS, bundle.RestConfig.TLSClientConfig, "original TLS config mutated")
			require.Equal(t, originalTimeout, bundle.HTTPClient.Timeout)
			require.Equal(t, originalExec, *bundle.RestConfig.ExecProvider, "original exec config fields mutated")
			require.Equal(t, "kubeconfig-token-must-not-replace-transport", bundle.RestConfig.BearerToken)
		})
	}
}

type helmMetadataFill struct{}

func (helmMetadataFill) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 'x'
	}
	return len(p), nil
}

// This enters through the actual ancillary API, including both native metadata
// enumerations and Helm's Secrets storage Get, rather than testing a helper or
// substituting an action engine.
func TestHelmEditorSchemasReuseExistingMetadataAuthLimitsAndLifetimes(t *testing.T) {
	t.Setenv("HELM_DRIVER", "secrets")
	testCtx, finish := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(finish)
	document := []byte(`{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"replicas":{"type":"integer"}}}`)
	installed := &helmrelease.Release{Name: "installed", Namespace: "selected", Version: 1, Chart: &chart.Chart{Metadata: &chart.Metadata{Name: "installed-chart", Version: "1.0.0"}, Schema: document}}
	raw, err := json.Marshal(installed)
	require.NoError(t, err)
	var compressed bytes.Buffer
	compressor := gzip.NewWriter(&compressed)
	_, err = compressor.Write(raw)
	require.NoError(t, err)
	require.NoError(t, compressor.Close())
	labels := map[string]string{"owner": "helm", "name": "installed", "version": "1", "status": "deployed"}
	metadata := metav1.ObjectMeta{Name: "sh.helm.release.v1.installed.v1", Namespace: "selected", Labels: labels}
	secret := corev1.Secret{TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "Secret"}, ObjectMeta: metadata, Type: "helm.sh/release.v1", Data: map[string][]byte{"release": []byte(base64.StdEncoding.EncodeToString(compressed.Bytes()))}}
	var metadataCalls, namedMetadataCalls, storageGets, requests atomic.Int64
	var holdNext, oversizeNext atomic.Bool
	entered, serverCanceled := make(chan struct{}, 4), make(chan struct{}, 4)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Header.Get("Authorization") != "Bearer already-authenticated-transport" {
			http.Error(w, "existing EKS-like authentication transport was lost", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/version":
			fmt.Fprint(w, `{"major":"1","minor":"35","gitVersion":"v1.35.0"}`)
		case (r.URL.Path == "/api/v1/secrets" || r.URL.Path == "/api/v1/namespaces/selected/secrets") && strings.Contains(r.Header.Get("Accept"), "as=PartialObjectMetadataList"):
			metadataCalls.Add(1)
			if strings.Contains(r.URL.Query().Get("labelSelector"), "name=installed") {
				namedMetadataCalls.Add(1)
			}
			if holdNext.CompareAndSwap(true, false) {
				entered <- struct{}{}
				<-r.Context().Done()
				serverCanceled <- struct{}{}
				return
			}
			if oversizeNext.CompareAndSwap(true, false) {
				fmt.Fprint(w, `{"apiVersion":"meta.k8s.io/v1","kind":"PartialObjectMetadataList","padding":"`)
				io.CopyN(w, helmMetadataFill{}, kubeauth.ResourceResponseLimit+1)
				fmt.Fprint(w, `"}`)
				return
			}
			json.NewEncoder(w).Encode(metav1.PartialObjectMetadataList{TypeMeta: metav1.TypeMeta{APIVersion: "meta.k8s.io/v1", Kind: "PartialObjectMetadataList"}, Items: []metav1.PartialObjectMetadata{{ObjectMeta: metadata}}})
		case r.URL.Path == "/api/v1/namespaces/selected/secrets/sh.helm.release.v1.installed.v1":
			storageGets.Add(1)
			json.NewEncoder(w).Encode(secret)
		default:
			http.Error(w, "unexpected installed-schema endpoint: "+r.URL.Path, http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)
	lifetime, retire := context.WithCancel(testCtx)
	t.Cleanup(retire)
	makeClient := func(lifetime context.Context) *clients.ClientSet {
		dir := t.TempDir()
		ca := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw})
		path := filepath.Join(dir, "kubeconfig")
		config := fmt.Sprintf("apiVersion: v1\nkind: Config\nclusters:\n- name: owned\n  cluster:\n    server: %s\n    certificate-authority-data: %s\nusers:\n- name: owned\n  user:\n    token: initial-source-token\ncontexts:\n- name: owned\n  context:\n    cluster: owned\n    user: owned\ncurrent-context: owned\n", server.URL, base64.StdEncoding.EncodeToString(ca))
		require.NoError(t, os.WriteFile(path, []byte(config), 0600))
		bundle, err := kubeauth.LoadResourceKubeClients(lifetime, path, "owned")
		require.NoError(t, err)
		require.False(t, bundle.RestConfig.Insecure)
		require.NotEmpty(t, bundle.RestConfig.CAData)
		marker := filepath.Join(dir, "exec-was-run")
		sentinel := filepath.Join(dir, "must-not-execute")
		require.NoError(t, os.WriteFile(sentinel, []byte("#!/bin/sh\nprintf executed > \"$HELM_EXEC_SENTINEL\"\nexit 97\n"), 0700))
		bundle.RestConfig.BearerToken = ""
		bundle.RestConfig.BearerTokenFile = ""
		bundle.RestConfig.ExecProvider = &clientcmdapi.ExecConfig{Command: sentinel, APIVersion: "client.authentication.k8s.io/v1", InteractiveMode: clientcmdapi.NeverExecInteractiveMode, Env: []clientcmdapi.ExecEnvVar{{Name: "HELM_EXEC_SENTINEL", Value: marker}}}
		bundle.HTTPClient.Transport = &helmExistingAuthTransport{base: bundle.HTTPClient.Transport}
		t.Cleanup(func() {
			_, err := os.Stat(marker)
			if !os.IsNotExist(err) {
				t.Errorf("metadata/schema acquisition reconstructed auth and executed sentinel: %v", err)
			}
		})
		return &clients.ClientSet{Clientset: bundle.Clientset, KubeClient: bundle.Clientset, DiscoveryClient: bundle.Discovery, DynamicClient: bundle.Dynamic, RESTConfig: bundle.RestConfig, HTTPClient: bundle.HTTPClient}
	}
	client := makeClient(lifetime)
	ancillary := NewHelmAncillary(zap.NewNop().Sugar())
	session := sdkresource.Session{Connection: &types.Connection{ID: "owned-cluster"}}
	acquire := func(ctx context.Context, client *clients.ClientSet) ([]sdkresource.EditorSchema, error) {
		return ancillary.GetEditorSchemas(sdkresource.WithSession(ctx, session), client)
	}
	assertInstalled := func(client *clients.ClientSet) {
		schemas, err := acquire(testCtx, client)
		require.NoError(t, err)
		require.Len(t, schemas, 1)
		require.Equal(t, "helm:releases", schemas[0].Type)
		require.Equal(t, "available", schemas[0].Binding.State)
		require.Equal(t, sdkresource.DialectJSONSchemaDraft07, schemas[0].Binding.Dialect)
		require.JSONEq(t, string(document), string(schemas[0].Binding.Document))
		require.Equal(t, "selected/installed", schemas[0].Key)
		require.Equal(t, "yaml", schemas[0].Language)
	}
	wait := func(event <-chan struct{}, description string) {
		select {
		case <-event:
		case <-testCtx.Done():
			t.Fatal(description, ": ", testCtx.Err())
		}
	}
	assertInstalled(client)
	require.Equal(t, int64(2), metadataCalls.Load(), "initial metadata plus exact latest-version metadata must reach native HTTP")
	require.Equal(t, int64(1), namedMetadataCalls.Load())
	require.Equal(t, int64(1), storageGets.Load())

	// Hold the metadata LIST itself, not the subsequent action.Get storage GET.
	holdNext.Store(true)
	operationCtx, cancelOperation := context.WithCancel(testCtx)
	t.Cleanup(cancelOperation)
	finished := make(chan error, 1)
	go func() { _, err := acquire(operationCtx, client); finished <- err }()
	wait(entered, "metadata LIST did not enter server")
	assertInstalled(client) // An unrelated operation shares the same source client.
	cancelOperation()
	select {
	case err := <-finished:
		require.Error(t, err)
	case <-testCtx.Done():
		t.Fatal("metadata LIST ignored operation cancellation")
	}
	wait(serverCanceled, "server did not observe metadata LIST cancellation")
	assertInstalled(client)

	beforeMetadata, beforeStorage := metadataCalls.Load(), storageGets.Load()
	oversizeNext.Store(true)
	_, err = acquire(testCtx, client)
	require.Equal(t, "RESOURCE_LIMIT", sdkresource.ErrorCode(err), "metadata must reuse the pre-materialization source guard: %v", err)
	require.Equal(t, beforeMetadata+1, metadataCalls.Load(), "oversized metadata must not retry or fall back")
	require.Equal(t, beforeStorage, storageGets.Load(), "oversized metadata must not proceed to storage Get")
	assertInstalled(client)

	holdNext.Store(true)
	go func() { _, err := acquire(testCtx, client); finished <- err }()
	wait(entered, "slot-lifetime metadata request did not enter server")
	retire()
	select {
	case err := <-finished:
		require.Error(t, err)
	case <-testCtx.Done():
		t.Fatal("metadata LIST ignored source slot cancellation")
	}
	wait(serverCanceled, "server did not observe source slot cancellation")
	beforeRequests := requests.Load()
	_, err = acquire(testCtx, client)
	require.Error(t, err)
	require.Equal(t, beforeRequests, requests.Load(), "retired source issued additional metadata HTTP")
	assertInstalled(makeClient(testCtx)) // A distinct source lifetime remains usable.
}
