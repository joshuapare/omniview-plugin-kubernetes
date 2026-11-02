package resourcers

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/httpstream"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
	"k8s.io/client-go/util/exec"
)

const (
	podExecOutputLimit           = 256 * 1024
	podExecDefaultTimeoutSeconds = 30
	podExecMaxTimeoutSeconds     = 100
	podDefaultContainerKey       = "kubectl.kubernetes.io/default-container"
)

func podExecActionDescriptor() resource.ActionDescriptor {
	return resource.ActionDescriptor{
		ID:    "exec",
		Label: "Run Command",
		Description: "Run one command in a pod container without a TTY and return stdout, stderr and exit code. " +
			"Each stream is capped at 256 KiB. On timeout (default 30s, max 100s) the stream closes; the remote process may keep running.",
		Icon:      "LuTerminal",
		Scope:     resource.ActionScopeInstance,
		Dangerous: true,
		ParamsSchema: &resource.Schema{
			Properties: map[string]resource.SchemaProperty{
				"command":   {Type: resource.SchemaArray, Description: "Program and arguments; no shell is implied"},
				"container": {Type: resource.SchemaString, Description: "Container name; defaults to the pod's default container"},
				"timeoutSeconds": {
					Type:        resource.SchemaInteger,
					Minimum:     resource.PtrFloat64(1),
					Maximum:     resource.PtrFloat64(podExecMaxTimeoutSeconds),
					Description: "Seconds before the stream is closed (default 30)",
				},
			},
			Required: []string{"command"},
		},
	}
}

type podExecParams struct {
	command   []string
	container string
	timeout   time.Duration
}

func decodePodExecParams(value resource.Value) (podExecParams, error) {
	invalid := func(message string) error { return resource.NewError("INVALID_REQUEST", message) }
	params, err := nativeActionParams(value)
	if err != nil {
		return podExecParams{}, invalid("Exec input must be an object.")
	}
	raw, ok := params["command"].([]any)
	if !ok || len(raw) == 0 {
		return podExecParams{}, invalid("Exec command must be a non-empty list of strings.")
	}
	out := podExecParams{command: make([]string, 0, len(raw)), timeout: podExecDefaultTimeoutSeconds * time.Second}
	for _, element := range raw {
		arg, ok := element.(string)
		if !ok {
			return podExecParams{}, invalid("Exec command must be a non-empty list of strings.")
		}
		out.command = append(out.command, arg)
	}
	if out.command[0] == "" {
		return podExecParams{}, invalid("Exec command program must be nonempty.")
	}
	if container, present := params["container"]; present && container != nil {
		name, ok := container.(string)
		if !ok {
			return podExecParams{}, invalid("Exec container must be a string.")
		}
		out.container = name
	}
	if timeout, present := params["timeoutSeconds"]; present && timeout != nil {
		seconds, err := nativeActionInteger(timeout, 1, podExecMaxTimeoutSeconds)
		if err != nil {
			return podExecParams{}, invalid("Exec timeoutSeconds must be an integer between 1 and 100.")
		}
		out.timeout = time.Duration(seconds) * time.Second
	}
	return out, nil
}

// podExecContainer selects the requested container, else the annotated default, else the first.
func podExecContainer(pod *corev1.Pod, requested string) (string, error) {
	if len(pod.Spec.Containers) == 0 {
		return "", resource.NewError("INVALID_REQUEST", "Pod has no containers.")
	}
	name := requested
	if name == "" {
		name = pod.Annotations[podDefaultContainerKey]
	}
	if name == "" {
		return pod.Spec.Containers[0].Name, nil
	}
	for _, container := range pod.Spec.Containers {
		if container.Name == name {
			return name, nil
		}
	}
	return "", resource.NewError("INVALID_REQUEST", fmt.Sprintf("Container %q is not in this pod.", name))
}

// cappedWriter keeps the first limit bytes and discards the rest.
type cappedWriter struct {
	mu        sync.Mutex
	limit     int
	buf       []byte
	truncated bool
}

func (w *cappedWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	room := w.limit - len(w.buf)
	if room >= len(p) {
		w.buf = append(w.buf, p...)
	} else {
		if room > 0 {
			w.buf = append(w.buf, p[:room]...)
		}
		w.truncated = true
	}
	return len(p), nil
}

// result returns valid UTF-8: a rune cut at the cap is dropped and any other
// invalid byte sequence becomes U+FFFD, so the tagged Value always encodes.
func (w *cappedWriter) result() (string, bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	buf := w.buf
	if w.truncated {
		buf = trimPartialRune(buf)
	}
	return strings.ToValidUTF8(string(buf), "\uFFFD"), w.truncated
}

// trimPartialRune drops an incomplete multi-byte rune at the end of buf.
func trimPartialRune(buf []byte) []byte {
	for back := 1; back <= utf8.UTFMax && back <= len(buf); back++ {
		start := len(buf) - back
		if !utf8.RuneStart(buf[start]) {
			continue
		}
		if !utf8.FullRune(buf[start:]) {
			return buf[:start]
		}
		break
	}
	return buf
}

func (p *PodResourcer) executeExec(ctx context.Context, client *clients.ClientSet, input resource.ActionRequest) (resource.Value, error) {
	if input.TypeTarget != nil || input.Reference.Address.Provider != "kubernetes" || input.Reference.Address.Type != "k8s:/pods" {
		return resource.Value{}, resource.NewError("INVALID_REQUEST", "Exec requires an exact native Pod reference")
	}
	namespace, err := nativeRequestNamespace(input.Reference.Address.Scope)
	if err != nil {
		return resource.Value{}, err
	}
	if namespace == "" {
		return resource.Value{}, resource.NewError("INVALID_REQUEST", "Pod namespace is required")
	}
	params, err := decodePodExecParams(input.Input)
	if err != nil {
		return resource.Value{}, err
	}
	if client == nil || client.KubeClient == nil || client.RESTConfig == nil {
		return resource.Value{}, resource.NewError("UNAVAILABLE", "Kubernetes client is required")
	}
	pod, err := client.KubeClient.CoreV1().Pods(namespace).Get(ctx, input.Reference.Address.ID, metav1.GetOptions{})
	if err != nil {
		return resource.Value{}, err
	}
	if err := nativeActionObjectMatches(input, pod); err != nil {
		return resource.Value{}, err
	}
	container, err := podExecContainer(pod, params.container)
	if err != nil {
		return resource.Value{}, err
	}

	req := client.KubeClient.CoreV1().RESTClient().Post().Resource("pods").Name(pod.Name).Namespace(namespace).SubResource("exec")
	req.VersionedParams(&corev1.PodExecOptions{
		Command: params.command, Container: container, Stdout: true, Stderr: true, Stdin: false, TTY: false,
	}, scheme.ParameterCodec)
	spdy, err := remotecommand.NewSPDYExecutor(client.RESTConfig, "POST", req.URL())
	if err != nil {
		return resource.Value{}, err
	}
	ws, err := remotecommand.NewWebSocketExecutor(client.RESTConfig, "GET", req.URL().String())
	if err != nil {
		return resource.Value{}, err
	}
	executor, err := remotecommand.NewFallbackExecutor(ws, spdy, httpstream.IsUpgradeFailure)
	if err != nil {
		return resource.Value{}, err
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, params.timeout)
	defer cancel()
	stdout := &cappedWriter{limit: podExecOutputLimit}
	stderr := &cappedWriter{limit: podExecOutputLimit}
	streamErr := executor.StreamWithContext(timeoutCtx, remotecommand.StreamOptions{Stdout: stdout, Stderr: stderr})
	return podExecResult(streamErr, timeoutCtx.Err(), stdout, stderr)
}

func podExecResult(streamErr, timeoutErr error, stdout, stderr *cappedWriter) (resource.Value, error) {
	out, outTruncated := stdout.result()
	errOut, errTruncated := stderr.result()
	result := map[string]any{
		"stdout":          out,
		"stderr":          errOut,
		"stdoutTruncated": outTruncated,
		"stderrTruncated": errTruncated,
		"timedOut":        false,
	}
	var codeErr exec.CodeExitError
	switch {
	case errors.Is(timeoutErr, context.DeadlineExceeded):
		result["timedOut"] = true
	case streamErr == nil:
		result["exitCode"] = int64(0)
	case errors.As(streamErr, &codeErr):
		result["exitCode"] = int64(codeErr.Code)
	default:
		return resource.Value{}, streamErr
	}
	return resource.ValueFromNative(result)
}
