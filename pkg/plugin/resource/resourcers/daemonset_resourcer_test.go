package resourcers

import (
	"context"
	"testing"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
)

func newTestDaemonSetResourcer() *DaemonSetResourcer {
	return NewDaemonSetResourcer(zap.NewNop().Sugar())
}

func newAppsDaemonSetClientSet(objects ...runtime.Object) *clients.ClientSet {
	fakeClient := fake.NewSimpleClientset(objects...)
	return &clients.ClientSet{
		KubeClient: fakeClient,
	}
}

func testDaemonSet(name, ns string, opts ...func(*appsv1.DaemonSet)) *appsv1.DaemonSet {
	ds := &appsv1.DaemonSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
		},
		Spec: appsv1.DaemonSetSpec{
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": name},
			},
			Template: corev1PodTemplateSpec(name),
		},
	}
	for _, o := range opts {
		o(ds)
	}
	return ds
}

// ===================== GetActions =====================

func TestDaemonSetResourcer_GetActions(t *testing.T) {
	r := newTestDaemonSetResourcer()
	actions, err := r.GetActions(context.Background(), nil)
	require.NoError(t, err)
	require.Len(t, actions, 2)

	assert.Equal(t, "restart", actions[0].ID)
	assert.Equal(t, resource.ActionScopeInstance, actions[0].Scope)
	assert.True(t, actions[0].Streaming)
	assert.Equal(t, "rollout-restart", actions[1].ID)
	assert.False(t, actions[1].Streaming)
	assert.NotNil(t, actions[1].ParamsSchema)
}

// ===================== Restart =====================

func TestDaemonSetResourcer_Restart(t *testing.T) {
	ds := testDaemonSet("fluentd", "kube-system")
	cs := newAppsDaemonSetClientSet(ds)
	r := newTestDaemonSetResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("rollout-restart", "fluentd", "kube-system", nil))

	require.NoError(t, err)
	require.Equal(t, "map", result.Kind)
	assert.True(t, result.Map["success"].Bool)

	updated, err := cs.KubeClient.AppsV1().DaemonSets("kube-system").Get(context.Background(), "fluentd", metav1.GetOptions{})
	require.NoError(t, err)
	ann := updated.Spec.Template.Annotations
	assert.Contains(t, ann, "kubectl.kubernetes.io/restartedAt")
}

func TestDaemonSetResourcer_Restart_NotFound(t *testing.T) {
	cs := newAppsDaemonSetClientSet()
	r := newTestDaemonSetResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("rollout-restart", "nonexistent", "default", nil))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "failed to restart daemonset")
}

// ===================== Unknown Action =====================

func TestDaemonSetResourcer_UnknownAction(t *testing.T) {
	cs := newAppsDaemonSetClientSet()
	r := newTestDaemonSetResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("foo", "", "", nil))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "unknown action")
}

// ===================== StreamAction =====================

func TestDaemonSetResourcer_StreamAction_UnsupportedAction(t *testing.T) {
	r := newTestDaemonSetResourcer()
	stream := make(chan resource.ActionEvent, 10)

	err := r.StreamAction(context.Background(), nil, workloadActionRequest("foo", "", "", nil), stream)

	require.Error(t, err)
	var operationError *resource.ResourceOperationError
	require.ErrorAs(t, err, &operationError)
	assert.Equal(t, "UNSUPPORTED", operationError.Code)
}

func TestDaemonSetResourcer_StreamAction_Restart_NotFound(t *testing.T) {
	cs := newAppsDaemonSetClientSet()
	r := newTestDaemonSetResourcer()
	stream := make(chan resource.ActionEvent, 10)

	err := r.StreamAction(context.Background(), cs, workloadActionRequest("restart", "nonexistent", "default", nil), stream)

	require.Error(t, err)

	var events []resource.ActionEvent
	close(stream)
	for ev := range stream {
		events = append(events, ev)
	}
	assert.Empty(t, events)
}
