package exec

import (
	"os"
	"path/filepath"
	"reflect"

	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
	"github.com/omniviewdev/plugin-sdk/pkg/utils"
	"github.com/omniviewdev/plugin-sdk/pkg/v1/exec"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// Native planning deliberately has its own interface seam: the streaming bundle
// contains a concrete clientset, while authoritative target tests use fake clients.
type nativeClientProvider func(*types.PluginContext) (kubernetes.Interface, *rest.Config, error)

func podNativeCommand(ctx *types.PluginContext, opts exec.SessionOptions) (*exec.NativeCommand, error) {
	return podNativeCommandWithProvider(func(bound *types.PluginContext) (kubernetes.Interface, *rest.Config, error) {
		bundle, err := defaultClientProvider(bound)
		if err != nil {
			return nil, nil, err
		}
		return bundle.Clientset, bundle.RestConfig, nil
	}, ctx, opts)
}

func podNativeCommandWithProvider(provider nativeClientProvider, ctx *types.PluginContext, opts exec.SessionOptions) (*exec.NativeCommand, error) {
	if err := exec.ValidateNativeCommandOptions(opts); err != nil {
		return nil, err
	}
	if ctx == nil || ctx.Context == nil || ctx.Connection == nil {
		return nil, resourcev2.NewError("INVALID_REQUEST", "Native exec requires the selected connection.")
	}
	podName, namespace, err := nativeExecTarget(ctx, opts, "k8s:/pods", true)
	if err != nil {
		return nil, err
	}
	if opts.Params["mode"] != "" && opts.Params["mode"] != "exec" {
		return nil, resourcev2.NewError("UNSUPPORTED", "Native terminals support ordinary Pod exec only, not attach or debug sessions.")
	}
	if opts.Reference.Incarnation == nil {
		return nil, resourcev2.NewError("INVALID_REQUEST", "Native Pod exec requires an explicit Pod UID.")
	}
	uid := *opts.Reference.Incarnation
	if supplied := opts.Params["pod_uid"]; supplied != "" && supplied != uid {
		return nil, resourcev2.NewError("RESET_REQUIRED", "Pod UID does not match the native exec target.")
	}
	container := opts.Params["container"]
	if container == "" {
		return nil, resourcev2.NewError("INVALID_REQUEST", "Native Pod exec requires an explicit container.")
	}

	path, expected, err := nativeKubeconfig(ctx.Connection)
	if err != nil {
		return nil, err
	}
	client, active, err := provider(ctx)
	if err != nil || client == nil || active == nil {
		return nil, resourcev2.NewError("UNAVAILABLE", "The selected Kubernetes client is unavailable for native exec.")
	}
	if !nativeAuthMatches(active, expected) {
		return nil, resourcev2.NewError("UNSUPPORTED", "Native exec requires bounded local-file credential authentication matching the selected kubeconfig; credential helpers and in-memory authentication are unsupported.")
	}
	pod, err := client.CoreV1().Pods(namespace).Get(ctx.Context, podName, metav1.GetOptions{})
	if err != nil {
		switch {
		case apierrors.IsNotFound(err):
			return nil, resourcev2.NewError("RESET_REQUIRED", "The selected Pod no longer exists.")
		case apierrors.IsForbidden(err), apierrors.IsUnauthorized(err):
			return nil, resourcev2.NewError("FORBIDDEN", "Kubernetes denied native exec target verification.")
		default:
			return nil, resourcev2.NewError("UNAVAILABLE", "The selected Pod could not be verified for native exec.")
		}
	}
	if pod.Name != podName || pod.Namespace != namespace || string(pod.UID) != uid || pod.DeletionTimestamp != nil {
		return nil, resourcev2.NewError("RESET_REQUIRED", "The selected Pod was deleted, replaced, or changed identity.")
	}
	found := false
	for _, candidate := range pod.Spec.Containers {
		if candidate.Name == container {
			found = true
			break
		}
	}
	if !found {
		return nil, resourcev2.NewError("INVALID_REQUEST", "The selected container is not an ordinary container in this Pod.")
	}

	command := opts.Command
	if len(command) == 0 {
		command = podExecHandler().DefaultCommand
	}
	args := make([]string, 0, 14+len(command))
	args = append(args, "--kubeconfig", path, "--context", ctx.Connection.ID, "--namespace", namespace,
		"exec", podName, "--container", container, "--stdin")
	if opts.TTY {
		args = append(args, "--tty")
	}
	args = append(args, "--")
	args = append(args, command...)
	plan := &exec.NativeCommand{Executable: "kubectl", Args: args}
	if err := exec.ValidateNativeCommand(plan); err != nil {
		return nil, err
	}
	return plan, nil
}

// Only the existing local file reference leaves the plugin. Never flatten a
// kubeconfig, copy credentials into flags/environment, or invoke an auth helper.
func nativeKubeconfig(connection *types.Connection) (string, *rest.Config, error) {
	unsupported := func() (string, *rest.Config, error) {
		return "", nil, resourcev2.NewError("UNSUPPORTED", "Native exec requires a reusable local kubeconfig and its selected context.")
	}
	value, ok := connection.GetDataKey("kubeconfig")
	path, valid := value.(string)
	if !ok || !valid || path == "" || connection.ID == "" {
		return unsupported()
	}
	path, err := utils.ExpandTilde(path)
	if err != nil {
		return unsupported()
	}
	path, err = filepath.Abs(path)
	if err != nil {
		return unsupported()
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return unsupported()
	}
	loader := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: path},
		&clientcmd.ConfigOverrides{CurrentContext: connection.ID},
	)
	raw, err := loader.RawConfig()
	if err != nil {
		return unsupported()
	}
	selected := raw.Contexts[connection.ID]
	if selected == nil || selected.Cluster == "" || raw.Clusters[selected.Cluster] == nil || raw.Clusters[selected.Cluster].Server == "" {
		return unsupported()
	}
	for key, actual := range map[string]string{"cluster": selected.Cluster, "user": selected.AuthInfo} {
		if observed, present := connection.GetDataKey(key); present && observed != actual {
			return unsupported()
		}
	}
	if auth := raw.AuthInfos[selected.AuthInfo]; auth != nil {
		// client-go credential helpers can outlive the request context. Keep
		// native planning bounded without starting or exporting helper auth.
		if auth.Exec != nil {
			return "", nil, resourcev2.NewError("UNSUPPORTED", "Native exec requires bounded local-file credential authentication; exec credential helpers are unsupported.")
		}
		if auth.AuthProvider != nil {
			return unsupported()
		}
	} else {
		return unsupported()
	}
	config, err := loader.ClientConfig()
	if err != nil {
		return unsupported()
	}
	return path, config, nil
}

func nativeAuthMatches(active, expected *rest.Config) bool {
	// Opaque callbacks and custom transports cannot be represented by a file
	// reference. Reject them instead of exporting credentials or guessing.
	if active.Transport != nil || active.WrapTransport != nil || active.Dial != nil || active.Proxy != nil ||
		active.ExecProvider != nil || active.AuthProvider != nil ||
		expected.Transport != nil || expected.WrapTransport != nil || expected.Dial != nil || expected.Proxy != nil ||
		expected.ExecProvider != nil || expected.AuthProvider != nil {
		return false
	}
	return active.Host == expected.Host && active.APIPath == expected.APIPath &&
		active.Username == expected.Username && active.Password == expected.Password &&
		active.BearerToken == expected.BearerToken && active.BearerTokenFile == expected.BearerTokenFile &&
		reflect.DeepEqual(active.TLSClientConfig, expected.TLSClientConfig) &&
		reflect.DeepEqual(active.Impersonate, expected.Impersonate)
}
