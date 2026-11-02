package resourcers

import (
	"context"
	"errors"
	"strings"
	"testing"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/util/exec"
)

func TestCappedWriterKeepsPrefix(t *testing.T) {
	w := &cappedWriter{limit: 5}
	n, err := w.Write([]byte("abc"))
	require.NoError(t, err)
	assert.Equal(t, 3, n)
	n, err = w.Write([]byte("defgh"))
	require.NoError(t, err)
	assert.Equal(t, 5, n, "writer must report full writes so the stream keeps draining")
	_, _ = w.Write([]byte("ijk"))
	out, truncated := w.result()
	assert.Equal(t, "abcde", out)
	assert.True(t, truncated)

	exact := &cappedWriter{limit: 3}
	_, _ = exact.Write([]byte("abc"))
	out, truncated = exact.result()
	assert.Equal(t, "abc", out)
	assert.False(t, truncated)

	big := &cappedWriter{limit: podExecOutputLimit}
	_, _ = big.Write([]byte(strings.Repeat("x", podExecOutputLimit+10)))
	out, truncated = big.result()
	assert.Len(t, out, podExecOutputLimit)
	assert.True(t, truncated)
}

func TestPodExecContainerSelection(t *testing.T) {
	pod := &corev1.Pod{Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "app"}, {Name: "sidecar"}}}}
	name, err := podExecContainer(pod, "")
	require.NoError(t, err)
	assert.Equal(t, "app", name)

	pod.Annotations = map[string]string{podDefaultContainerKey: "sidecar"}
	name, err = podExecContainer(pod, "")
	require.NoError(t, err)
	assert.Equal(t, "sidecar", name)

	name, err = podExecContainer(pod, "app")
	require.NoError(t, err)
	assert.Equal(t, "app", name)

	_, err = podExecContainer(pod, "missing")
	require.Error(t, err)

	_, err = podExecContainer(&corev1.Pod{}, "")
	require.Error(t, err)
}

func TestDecodePodExecParams(t *testing.T) {
	valid := func(params map[string]any) resource.Value {
		value, err := resource.ValueFromNative(params)
		require.NoError(t, err)
		return value
	}
	decoded, err := decodePodExecParams(valid(map[string]any{"command": []any{"sh", "-c", "echo hi"}}))
	require.NoError(t, err)
	assert.Equal(t, []string{"sh", "-c", "echo hi"}, decoded.command)
	assert.Equal(t, int64(30), int64(decoded.timeout.Seconds()))

	decoded, err = decodePodExecParams(valid(map[string]any{"command": []any{"ls"}, "container": "app", "timeoutSeconds": int64(100)}))
	require.NoError(t, err)
	assert.Equal(t, "app", decoded.container)
	assert.Equal(t, int64(100), int64(decoded.timeout.Seconds()))

	for name, params := range map[string]map[string]any{
		"missing command":  {},
		"empty command":    {"command": []any{}},
		"non-string arg":   {"command": []any{"ls", int64(1)}},
		"string command":   {"command": "ls"},
		"empty program":    {"command": []any{""}},
		"timeout too low":  {"command": []any{"ls"}, "timeoutSeconds": int64(0)},
		"timeout too high": {"command": []any{"ls"}, "timeoutSeconds": int64(101)},
		"bad container":    {"command": []any{"ls"}, "container": int64(1)},
	} {
		_, err := decodePodExecParams(valid(params))
		var opErr *resource.ResourceOperationError
		require.Truef(t, errors.As(err, &opErr), "%s: %v", name, err)
		assert.Equal(t, "INVALID_REQUEST", opErr.Code, name)
	}
	_, err = decodePodExecParams(resource.Value{Kind: "string", String: "ls"})
	require.Error(t, err)
}

func TestPodExecResult(t *testing.T) {
	stdout := &cappedWriter{limit: 16}
	_, _ = stdout.Write([]byte("hello\n"))
	value, err := podExecResult(exec.CodeExitError{Err: errors.New("exit 3"), Code: 3}, nil, stdout, &cappedWriter{limit: 16})
	require.NoError(t, err)
	native, err := resource.NativeFromValue(value)
	require.NoError(t, err)
	result := native.(map[string]any)
	assert.Equal(t, "hello\n", result["stdout"])
	assert.EqualValues(t, 3, result["exitCode"])
	assert.Equal(t, false, result["timedOut"])

	value, err = podExecResult(errors.New("stream closed"), context.DeadlineExceeded, &cappedWriter{limit: 1}, &cappedWriter{limit: 1})
	require.NoError(t, err)
	native, err = resource.NativeFromValue(value)
	require.NoError(t, err)
	result = native.(map[string]any)
	assert.Equal(t, true, result["timedOut"])
	assert.NotContains(t, result, "exitCode")

	_, err = podExecResult(errors.New("upgrade failed"), nil, &cappedWriter{limit: 1}, &cappedWriter{limit: 1})
	require.Error(t, err)
}

func TestPodExecResultEncodesNonUTF8Output(t *testing.T) {
	binary := &cappedWriter{limit: 16}
	_, _ = binary.Write([]byte{'a', 0xff, 'b'})
	// "é" is two bytes; a cap of 2 cuts it after its first byte.
	cut := &cappedWriter{limit: 2}
	_, _ = cut.Write([]byte("xé"))
	value, err := podExecResult(nil, nil, binary, cut)
	require.NoError(t, err)
	native, err := resource.NativeFromValue(value)
	require.NoError(t, err)
	result := native.(map[string]any)
	assert.Equal(t, "a\uFFFDb", result["stdout"])
	assert.Equal(t, false, result["stdoutTruncated"])
	assert.Equal(t, "x", result["stderr"])
	assert.Equal(t, true, result["stderrTruncated"])

	whole := &cappedWriter{limit: 3}
	_, _ = whole.Write([]byte("xé!"))
	out, truncated := whole.result()
	assert.Equal(t, "xé", out)
	assert.True(t, truncated)
}

func TestPodResourcerAdvertisesExec(t *testing.T) {
	actions, err := NewPodResourcer(zap.NewNop().Sugar()).GetActions(context.Background(), nil)
	require.NoError(t, err)
	var found *resource.ActionDescriptor
	for i := range actions {
		if actions[i].ID == "exec" {
			found = &actions[i]
		}
	}
	require.NotNil(t, found)
	assert.True(t, found.Dangerous)
	assert.False(t, found.Streaming)
	require.NotNil(t, found.ParamsSchema)
	assert.Equal(t, []string{"command"}, found.ParamsSchema.Required)
}

func TestPodExecRejectsInvalidParamsBeforeClientUse(t *testing.T) {
	request := workloadActionRequest("exec", "web", "default", map[string]any{"command": []any{}})
	request.Reference.Address.Provider = "kubernetes"
	request.Reference.Address.Type = "k8s:/pods"
	_, err := NewPodResourcer(zap.NewNop().Sugar()).ExecuteAction(context.Background(), nil, request)
	var opErr *resource.ResourceOperationError
	require.True(t, errors.As(err, &opErr), "%v", err)
	assert.Equal(t, "INVALID_REQUEST", opErr.Code)
}
