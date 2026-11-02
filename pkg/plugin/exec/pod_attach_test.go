package exec

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/omniview/kubernetes/pkg/utils/kubeauth"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
	sdkexec "github.com/omniviewdev/plugin-sdk/pkg/v1/exec"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// A real REST client and rejecting upgrade endpoint expose transport selection
// without requiring a cluster or substituting a fake stream implementation.
func TestPodAttachUsesAttachTransportAndExactContainer(t *testing.T) {
	pod := attachPodFixture()
	pod.Status.EphemeralContainerStatuses[0].State = corev1.ContainerState{Running: &corev1.ContainerStateRunning{}}
	var mu sync.Mutex
	var streams []string
	var methods []string
	var queries []map[string][]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/v1/namespaces/debug-test/pods/app" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(pod)
			return
		}
		mu.Lock()
		streams = append(streams, r.URL.Path)
		methods = append(methods, r.Method)
		queries = append(queries, r.URL.Query())
		mu.Unlock()
		http.Error(w, "test upgrade rejected", http.StatusBadRequest)
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	err := runAttachFixture(t, ctx, server.URL, "original-uid")
	require.Error(t, err, "stream upgrade failures must reach the caller")
	mu.Lock()
	defer mu.Unlock()
	require.NotEmpty(t, streams)
	for index, path := range streams {
		assert.Equal(t, "/api/v1/namespaces/debug-test/pods/app/attach", path, "attach must not launch a new exec process")
		assert.Equal(t, []string{"debugger-omniview-selected"}, queries[index]["container"])
		assert.Empty(t, queries[index]["command"], "attach must not execute SessionOptions.Command")
	}
	assert.Equal(t, http.MethodGet, methods[0], "try WebSocket before SPDY")
	assert.Contains(t, methods, http.MethodPost, "upgrade failure must attempt SPDY fallback")
}

func attachPodFixture() *corev1.Pod {
	return &corev1.Pod{
		TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "Pod"},
		ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "debug-test", UID: "original-uid", ResourceVersion: "17"},
		Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "app"}}, EphemeralContainers: []corev1.EphemeralContainer{{EphemeralContainerCommon: corev1.EphemeralContainerCommon{Name: "debugger-omniview-selected", Image: "busybox:1.37.0"}, TargetContainerName: "app"}}},
		Status: corev1.PodStatus{Phase: corev1.PodRunning, EphemeralContainerStatuses: []corev1.ContainerStatus{
			{Name: "debugger-omniview-selected", State: corev1.ContainerState{Waiting: &corev1.ContainerStateWaiting{Reason: "ContainerCreating"}}},
			{Name: "other-debugger", State: corev1.ContainerState{Running: &corev1.ContainerStateRunning{}}},
		}},
	}
}

func runAttachFixture(t *testing.T, ctx context.Context, host, uid string) error {
	t.Helper()
	// Exercise attachment readiness and cancellation without unrelated client throttling.
	config := &rest.Config{Host: host, QPS: -1}
	client, err := kubernetes.NewForConfig(config)
	require.NoError(t, err)
	provider := func(_ *types.PluginContext) (*kubeauth.KubeClientBundle, error) {
		return &kubeauth.KubeClientBundle{Clientset: client, RestConfig: config}, nil
	}
	pluginCtx := testPluginContext()
	pluginCtx.Context = ctx
	terminal, err := os.CreateTemp(t.TempDir(), "attach-terminal")
	require.NoError(t, err)
	defer terminal.Close()
	stop := make(chan error, 4)
	resize := make(chan sdkexec.SessionResizeInput)
	defer close(resize)
	err = podHandlerWithProvider(provider, pluginCtx, sdkexec.SessionOptions{
		ResourceData: execResourceData(t, map[string]interface{}{"metadata": map[string]interface{}{"name": "app", "namespace": "debug-test", "uid": "original-uid"}}),
		Params:       map[string]string{"mode": "attach", "container": "debugger-omniview-selected", "pod_uid": uid},
		Command:      []string{"must-not-execute"},
	}, terminal, stop, resize)
	if err != nil {
		return err
	}
	select {
	case err = <-stop:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestPodAttachRejectsStaleOrUnavailableExactContainer(t *testing.T) {
	tests := []struct {
		name   string
		change func(*corev1.Pod)
		uid    string
		want   string
	}{
		{"replaced Pod", func(p *corev1.Pod) { p.UID = "replacement-uid" }, "original-uid", "UID"},
		{"missing original UID", func(p *corev1.Pod) {}, "", "UID"},
		{"terminated selected container", func(p *corev1.Pod) {
			p.Status.EphemeralContainerStatuses[0].State = corev1.ContainerState{Terminated: &corev1.ContainerStateTerminated{Reason: "Completed", ExitCode: 0}}
		}, "original-uid", "Completed"},
		{"image failure", func(p *corev1.Pod) {
			p.Status.EphemeralContainerStatuses[0].State = corev1.ContainerState{Waiting: &corev1.ContainerStateWaiting{Reason: "ImagePullBackOff", Message: "registry access denied"}}
		}, "original-uid", "ImagePullBackOff"},
		{"unknown debug entry", func(p *corev1.Pod) { p.Spec.EphemeralContainers = nil; p.Status.EphemeralContainerStatuses = nil }, "original-uid", "debugger-omniview-selected"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pod := attachPodFixture()
			tt.change(pod)
			var mu sync.Mutex
			streamCount := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.HasSuffix(r.URL.Path, "/attach") || strings.HasSuffix(r.URL.Path, "/exec") {
					mu.Lock()
					streamCount++
					mu.Unlock()
					http.Error(w, "unexpected stream before validation", http.StatusBadRequest)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(pod)
			}))
			defer server.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
			defer cancel()
			err := runAttachFixture(t, ctx, server.URL, tt.uid)
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.want)
			mu.Lock()
			defer mu.Unlock()
			assert.Zero(t, streamCount, "invalid identity or unavailable selected container must never open a stream")
		})
	}
}

func TestPodAttachWaitsCancellablyForSelectedContainerNotPodPhase(t *testing.T) {
	pod := attachPodFixture()
	var mu sync.Mutex
	streamCount, podReads := 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/attach") || strings.HasSuffix(r.URL.Path, "/exec") {
			mu.Lock()
			streamCount++
			mu.Unlock()
			http.Error(w, "unexpected stream while selected container is waiting", http.StatusBadRequest)
			return
		}
		mu.Lock()
		podReads++
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(pod)
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	err := runAttachFixture(t, ctx, server.URL, "original-uid")
	require.Error(t, err)
	assert.ErrorIs(t, err, context.DeadlineExceeded)
	mu.Lock()
	defer mu.Unlock()
	assert.Positive(t, podReads, "attachment must fetch fresh identity and selected status")
	assert.Zero(t, streamCount, "Pod Running and another running debugger do not imply selected container readiness")
}
