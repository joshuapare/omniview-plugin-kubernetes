package exec

import (
	"context"
	"errors"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/omniview/kubernetes/pkg/pluginid"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
	"github.com/omniviewdev/plugin-sdk/pkg/v1/exec"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8stypes "k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

type nativeFixture struct {
	ctx    *types.PluginContext
	opts   exec.SessionOptions
	pod    *corev1.Pod
	config clientcmdapi.Config
	path   string
	client *fake.Clientset
	active *rest.Config
	calls  int
}

func newNativeFixture(t *testing.T) *nativeFixture {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config with spaces;$(literal)")
	uid := "selected-uid"
	f := &nativeFixture{
		path: path,
		ctx: &types.PluginContext{Context: context.Background(), Connection: &types.Connection{
			ID:   "selected context;$(literal)",
			Data: map[string]interface{}{"kubeconfig": path, "cluster": "selected", "user": "selected"},
		}},
		opts: exec.SessionOptions{
			ResourcePlugin: pluginid.ResourceProvider, ResourceKey: "k8s:/pods", TTY: true,
			Reference: &resourcev2.ResourceReference{Address: resourcev2.ResourceAddress{
				Provider: pluginid.ResourceProvider, Authority: "host-issued-authority", Type: "k8s:/pods",
				Scope: []resourcev2.ScopeEntry{{Dimension: "namespace", Value: "chosen-namespace"}}, ID: "chosen-pod",
			}, Incarnation: &uid},
			Route:  &resourcev2.AccessRoute{Connection: "selected context;$(literal)"},
			Params: map[string]string{"container": "app"}, Command: []string{"/bin/sh", "-c", "printf '%s' '$literal;$(not-expanded)'", "", "space value"},
		},
		pod: &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "chosen-pod", Namespace: "chosen-namespace", UID: k8stypes.UID(uid)},
			Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "app"}, {Name: "sidecar"}},
				InitContainers:      []corev1.Container{{Name: "init"}},
				EphemeralContainers: []corev1.EphemeralContainer{{EphemeralContainerCommon: corev1.EphemeralContainerCommon{Name: "debug"}}}}},
		config: clientcmdapi.Config{
			Clusters: map[string]*clientcmdapi.Cluster{
				"selected": {Server: "https://selected.invalid"}, "wrong": {Server: "https://wrong.invalid"},
			},
			AuthInfos: map[string]*clientcmdapi.AuthInfo{
				"selected": {Token: "fixture-secret-must-stay-in-file"}, "wrong": {Token: "wrong-fixture-token"},
			},
			Contexts: map[string]*clientcmdapi.Context{
				"selected context;$(literal)": {Cluster: "selected", AuthInfo: "selected", Namespace: "wrong-default-namespace"},
				"wrong-current":               {Cluster: "wrong", AuthInfo: "wrong"},
			}, CurrentContext: "wrong-current",
		},
	}
	f.reload(t)
	f.client = fake.NewClientset(f.pod.DeepCopy())
	return f
}

func (f *nativeFixture) reload(t *testing.T) {
	t.Helper()
	require.NoError(t, clientcmd.WriteToFile(f.config, f.path))
	config, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: f.path},
		&clientcmd.ConfigOverrides{CurrentContext: f.ctx.Connection.ID},
	).ClientConfig()
	require.NoError(t, err)
	f.active = config
}

func (f *nativeFixture) provider(_ *types.PluginContext) (kubernetes.Interface, *rest.Config, error) {
	f.calls++
	return f.client, f.active, nil
}

func TestPodNativeCommandPreservesSelectedContextAndLiteralArgv(t *testing.T) {
	f := newNativeFixture(t)
	plan, err := podNativeCommandWithProvider(f.provider, f.ctx, f.opts)
	require.NoError(t, err)
	assert.Equal(t, "kubectl", plan.Executable)
	expected := []string{"--kubeconfig", f.path, "--context", f.ctx.Connection.ID, "--namespace", "chosen-namespace",
		"exec", "chosen-pod", "--container", "app", "--stdin", "--tty", "--"}
	assert.Equal(t, append(expected, f.opts.Command...), plan.Args)
	assert.Empty(t, plan.Env)
	assert.Empty(t, plan.Cwd)
	assert.NotContains(t, plan.Args, "fixture-secret-must-stay-in-file")
	assert.Equal(t, "https://selected.invalid", f.active.Host)
	require.Len(t, f.client.Actions(), 1)
	assert.Equal(t, "get", f.client.Actions()[0].GetVerb())
	assert.Equal(t, "chosen-namespace", f.client.Actions()[0].GetNamespace())
	assert.Equal(t, "chosen-pod", f.client.Actions()[0].(k8stesting.GetAction).GetName())
	assert.Equal(t, 1, f.calls)
}

func TestPodNativeCommandWithoutTTYAndDefaultCommand(t *testing.T) {
	f := newNativeFixture(t)
	f.opts.TTY = false
	f.opts.Command = nil
	f.opts.Params["mode"] = "exec"
	plan, err := podNativeCommandWithProvider(f.provider, f.ctx, f.opts)
	require.NoError(t, err)
	assert.NotContains(t, plan.Args, "--tty")
	assert.Contains(t, plan.Args, "--stdin")
	assert.Equal(t, []string{"--", "/bin/bash"}, plan.Args[len(plan.Args)-2:])
	handler := podExecHandler()
	assert.NotNil(t, handler.NativeCommandHandler)
	assert.True(t, handler.ToProto().SupportsNativeCommand)
}

func TestPodNativeCommandRejectsTargetMismatch(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(*nativeFixture)
		code   string
	}{
		{"missing reference", func(f *nativeFixture) { f.opts.Reference = nil }, "INVALID_REQUEST"},
		{"missing route", func(f *nativeFixture) { f.opts.Route = nil }, "INVALID_REQUEST"},
		{"wrong route", func(f *nativeFixture) { f.opts.Route.Connection = "other" }, "INVALID_REQUEST"},
		{"wrong provider", func(f *nativeFixture) { f.opts.ResourcePlugin = "other" }, "INVALID_REQUEST"},
		{"node target", func(f *nativeFixture) {
			f.opts.ResourceKey = "k8s:/nodes"
			f.opts.Reference.Address.Type = "k8s:/nodes"
			f.opts.Reference.Address.Scope = nil
		}, "INVALID_REQUEST"},
		{"missing UID", func(f *nativeFixture) { f.opts.Reference.Incarnation = nil }, "INVALID_REQUEST"},
		{"wrong observed UID", func(f *nativeFixture) {
			f.opts.ResourceData = execResourceData(t, map[string]interface{}{"metadata": map[string]interface{}{"uid": "forged"}})
		}, "RESET_REQUIRED"},
		{"wrong parameter UID", func(f *nativeFixture) { f.opts.Params["pod_uid"] = "other" }, "RESET_REQUIRED"},
		{"replaced Pod", func(f *nativeFixture) { f.pod.UID = "replacement" }, "RESET_REQUIRED"},
		{"deleting Pod", func(f *nativeFixture) { now := metav1.Now(); f.pod.DeletionTimestamp = &now }, "RESET_REQUIRED"},
		{"wrong Pod name", func(f *nativeFixture) { f.pod.Name = "other" }, "RESET_REQUIRED"},
		{"wrong namespace", func(f *nativeFixture) { f.pod.Namespace = "other" }, "RESET_REQUIRED"},
		{"missing container", func(f *nativeFixture) { delete(f.opts.Params, "container") }, "INVALID_REQUEST"},
		{"unknown container", func(f *nativeFixture) { f.opts.Params["container"] = "not-present" }, "INVALID_REQUEST"},
		{"init container", func(f *nativeFixture) { f.opts.Params["container"] = "init" }, "INVALID_REQUEST"},
		{"ephemeral container", func(f *nativeFixture) { f.opts.Params["container"] = "debug" }, "INVALID_REQUEST"},
		{"attach", func(f *nativeFixture) { f.opts.Params["mode"] = "attach" }, "UNSUPPORTED"},
		{"debug", func(f *nativeFixture) { f.opts.Params["mode"] = "debug" }, "UNSUPPORTED"},
		{"ephemeral", func(f *nativeFixture) { f.opts.Params["mode"] = "ephemeral" }, "UNSUPPORTED"},
		{"NUL command", func(f *nativeFixture) { f.opts.Command = []string{"bad\x00command"} }, "INVALID_REQUEST"},
	} {
		t.Run(test.name, func(t *testing.T) {
			f := newNativeFixture(t)
			test.mutate(f)
			f.client.PrependReactor("get", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
				return true, f.pod.DeepCopy(), nil
			})
			plan, err := podNativeCommandWithProvider(f.provider, f.ctx, f.opts)
			assert.Nil(t, plan)
			assert.Equal(t, test.code, resourcev2.ErrorCode(err))
		})
	}
}

func TestPodNativeCommandClassifiesPodGetFailures(t *testing.T) {
	for _, test := range []struct {
		name  string
		cause error
		code  string
	}{
		{"deleted", apierrors.NewNotFound(schema.GroupResource{Resource: "pods"}, "chosen-pod"), "RESET_REQUIRED"},
		{"forbidden", apierrors.NewForbidden(schema.GroupResource{Resource: "pods"}, "chosen-pod", errors.New("private diagnostic")), "FORBIDDEN"},
		{"unauthorized", apierrors.NewUnauthorized("private diagnostic"), "FORBIDDEN"},
		{"unavailable", errors.New("private diagnostic"), "UNAVAILABLE"},
	} {
		t.Run(test.name, func(t *testing.T) {
			f := newNativeFixture(t)
			f.client.PrependReactor("get", "pods", func(k8stesting.Action) (bool, runtime.Object, error) {
				return true, nil, test.cause
			})
			plan, err := podNativeCommandWithProvider(f.provider, f.ctx, f.opts)
			assert.Nil(t, plan)
			require.Error(t, err)
			assert.Equal(t, test.code, resourcev2.ErrorCode(err))
			assert.NotContains(t, err.Error(), "private diagnostic")
		})
	}
}

func TestPodNativeCommandRejectsNonReusableConnectionAuth(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(*nativeFixture)
	}{
		{"no local reference", func(f *nativeFixture) { delete(f.ctx.Connection.Data, "kubeconfig") }},
		{"wrong reference type", func(f *nativeFixture) { f.ctx.Connection.Data["kubeconfig"] = []string{f.path} }},
		{"missing file", func(f *nativeFixture) { f.ctx.Connection.Data["kubeconfig"] = filepath.Join(t.TempDir(), "missing") }},
		{"directory reference", func(f *nativeFixture) { f.ctx.Connection.Data["kubeconfig"] = t.TempDir() }},
		{"missing selected context", func(f *nativeFixture) {
			delete(f.config.Contexts, f.ctx.Connection.ID)
			require.NoError(t, clientcmd.WriteToFile(f.config, f.path))
		}},
		{"missing explicit server", func(f *nativeFixture) {
			f.config.Clusters["selected"].Server = ""
			require.NoError(t, clientcmd.WriteToFile(f.config, f.path))
		}},
		{"missing selected auth", func(f *nativeFixture) {
			delete(f.config.AuthInfos, "selected")
			require.NoError(t, clientcmd.WriteToFile(f.config, f.path))
		}},
		{"changed selected cluster", func(f *nativeFixture) { f.ctx.Connection.Data["cluster"] = "other" }},
		{"changed selected user", func(f *nativeFixture) { f.ctx.Connection.Data["user"] = "other" }},
		{"inline token override", func(f *nativeFixture) { f.active.BearerToken = "in-memory-secret-must-not-export" }},
		{"inline key override", func(f *nativeFixture) { f.active.KeyData = []byte("in-memory-secret-key") }},
		{"endpoint override", func(f *nativeFixture) { f.active.Host = "https://other.invalid" }},
		{"impersonation override", func(f *nativeFixture) { f.active.Impersonate.UserName = "other" }},
		{"in-memory exec provider", func(f *nativeFixture) {
			f.active.ExecProvider = &clientcmdapi.ExecConfig{Command: "must-not-run"}
		}},
		{"custom transport", func(f *nativeFixture) { f.active.Transport = http.DefaultTransport }},
		{"custom wrapper", func(f *nativeFixture) {
			f.active.WrapTransport = func(rt http.RoundTripper) http.RoundTripper { return rt }
		}},
		{"configured proxy", func(f *nativeFixture) {
			f.config.Clusters["selected"].ProxyURL = "http://fixture-proxy.invalid"
			f.reload(t)
		}},
		{"legacy auth provider", func(f *nativeFixture) {
			f.config.AuthInfos["selected"] = &clientcmdapi.AuthInfo{AuthProvider: &clientcmdapi.AuthProviderConfig{Name: "gcp"}}
			require.NoError(t, clientcmd.WriteToFile(f.config, f.path))
		}},
		{"SDK rewritten EKS auth", func(f *nativeFixture) {
			f.config.AuthInfos["selected"] = &clientcmdapi.AuthInfo{Exec: &clientcmdapi.ExecConfig{
				Command: "aws", Args: []string{"eks", "get-token", "--cluster-name", "fixture"},
				APIVersion: "client.authentication.k8s.io/v1", InteractiveMode: clientcmdapi.NeverExecInteractiveMode,
			}}
			require.NoError(t, clientcmd.WriteToFile(f.config, f.path))
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			f := newNativeFixture(t)
			test.mutate(f)
			plan, err := podNativeCommandWithProvider(f.provider, f.ctx, f.opts)
			assert.Nil(t, plan)
			require.Error(t, err)
			assert.Equal(t, "UNSUPPORTED", resourcev2.ErrorCode(err))
			assert.NotContains(t, err.Error(), "in-memory-secret")
			assert.NotContains(t, err.Error(), f.path)
			assert.Empty(t, f.client.Actions(), "unsupported auth must fail before target access")
		})
	}
}

func TestPodNativeCommandRejectsExecAuthBeforeClientAcquisition(t *testing.T) {
	f := newNativeFixture(t)
	f.config.AuthInfos["selected"] = &clientcmdapi.AuthInfo{Exec: &clientcmdapi.ExecConfig{
		Command:    filepath.Join(t.TempDir(), "does-not-exist-must-not-run"),
		Args:       []string{"arg with spaces", "$(literal)"},
		Env:        []clientcmdapi.ExecEnvVar{{Name: "FIXTURE_SECRET", Value: "fixture-exec-secret"}},
		APIVersion: "client.authentication.k8s.io/v1", InteractiveMode: clientcmdapi.NeverExecInteractiveMode,
	}}
	require.NoError(t, clientcmd.WriteToFile(f.config, f.path))
	plan, err := podNativeCommandWithProvider(f.provider, f.ctx, f.opts)
	require.Error(t, err)
	assert.Nil(t, plan)
	assert.Equal(t, "UNSUPPORTED", resourcev2.ErrorCode(err))
	assert.Contains(t, err.Error(), "bounded local-file credential authentication")
	assert.NotContains(t, err.Error(), "fixture-exec-secret")
	assert.NotContains(t, err.Error(), f.config.AuthInfos["selected"].Exec.Command)
	assert.Zero(t, f.calls, "exec auth must fail before constructing a client or acquiring credentials")
	assert.Empty(t, f.client.Actions())
}

func TestPodNativeCommandPreservesStaticCredentialFileReferences(t *testing.T) {
	for name, auth := range map[string]*clientcmdapi.AuthInfo{
		"token":       {Token: "fixture-static-token"},
		"certificate": {ClientCertificateData: []byte("fixture-certificate"), ClientKeyData: []byte("fixture-private-key")},
		"basic":       {Username: "fixture-user", Password: "fixture-password"},
	} {
		t.Run(name, func(t *testing.T) {
			f := newNativeFixture(t)
			f.config.AuthInfos["selected"] = auth
			f.reload(t)
			plan, err := podNativeCommandWithProvider(f.provider, f.ctx, f.opts)
			require.NoError(t, err)
			assert.Contains(t, plan.Args, f.path)
			assert.Empty(t, plan.Env)
			for _, secret := range []string{"fixture-static-token", "fixture-certificate", "fixture-private-key", "fixture-user", "fixture-password"} {
				assert.NotContains(t, plan.Args, secret)
			}
		})
	}
}
