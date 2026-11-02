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

func newTestStatefulSetResourcer() *StatefulSetResourcer {
	return NewStatefulSetResourcer(zap.NewNop().Sugar())
}

func newAppsStatefulSetClientSet(objects ...runtime.Object) *clients.ClientSet {
	fakeClient := fake.NewSimpleClientset(objects...)
	return &clients.ClientSet{
		KubeClient: fakeClient,
	}
}

func testStatefulSet(name, ns string, replicas int32, opts ...func(*appsv1.StatefulSet)) *appsv1.StatefulSet {
	sts := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
		},
		Spec: appsv1.StatefulSetSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": name},
			},
			Template: corev1PodTemplateSpec(name),
		},
	}
	for _, o := range opts {
		o(sts)
	}
	return sts
}

// ===================== GetActions =====================

func TestStatefulSetResourcer_GetActions(t *testing.T) {
	r := newTestStatefulSetResourcer()
	actions, err := r.GetActions(context.Background(), nil)
	require.NoError(t, err)
	require.Len(t, actions, 3)

	assert.Equal(t, "restart", actions[0].ID)
	assert.Equal(t, "rollout-restart", actions[1].ID)
	assert.False(t, actions[1].Streaming)
	assert.Equal(t, "scale", actions[2].ID)

	for _, a := range actions {
		assert.Equal(t, resource.ActionScopeInstance, a.Scope)
	}
	assert.True(t, actions[0].Streaming, "restart should be streaming")
	assert.False(t, actions[1].Streaming, "scale should not be streaming")
}

// ===================== Restart =====================

func TestStatefulSetResourcer_Restart(t *testing.T) {
	sts := testStatefulSet("redis", "default", 3)
	cs := newAppsStatefulSetClientSet(sts)
	r := newTestStatefulSetResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("rollout-restart", "redis", "default", nil))

	require.NoError(t, err)
	require.Equal(t, "map", result.Kind)
	assert.True(t, result.Map["success"].Bool)

	updated, err := cs.KubeClient.AppsV1().StatefulSets("default").Get(context.Background(), "redis", metav1.GetOptions{})
	require.NoError(t, err)
	ann := updated.Spec.Template.Annotations
	assert.Contains(t, ann, "kubectl.kubernetes.io/restartedAt")
}

func TestStatefulSetResourcer_Restart_NotFound(t *testing.T) {
	cs := newAppsStatefulSetClientSet()
	r := newTestStatefulSetResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("rollout-restart", "nonexistent", "default", nil))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "failed to restart statefulset")
}

// ===================== Scale =====================

func TestStatefulSetResourcer_Scale(t *testing.T) {
	sts := testStatefulSet("redis", "default", 1)
	cs := newAppsStatefulSetClientSet(sts)
	r := newTestStatefulSetResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("scale", "redis", "default", map[string]interface{}{"replicas": int64(3)}))

	require.NoError(t, err)
	require.Equal(t, "map", result.Kind)
	assert.True(t, result.Map["success"].Bool)
	assert.Contains(t, result.Map["message"].String, "scaled to 3")

	updated, err := cs.KubeClient.AppsV1().StatefulSets("default").Get(context.Background(), "redis", metav1.GetOptions{})
	require.NoError(t, err)
	assert.Equal(t, int32(3), *updated.Spec.Replicas)
}

func TestStatefulSetResourcer_Scale_ToZero(t *testing.T) {
	sts := testStatefulSet("redis", "default", 3)
	cs := newAppsStatefulSetClientSet(sts)
	r := newTestStatefulSetResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("scale", "redis", "default", map[string]interface{}{"replicas": float64(0)}))

	require.NoError(t, err)
	require.Equal(t, "map", result.Kind)

	updated, err := cs.KubeClient.AppsV1().StatefulSets("default").Get(context.Background(), "redis", metav1.GetOptions{})
	require.NoError(t, err)
	assert.Equal(t, int32(0), *updated.Spec.Replicas)
}

func TestStatefulSetResourcer_Scale_MissingParam(t *testing.T) {
	sts := testStatefulSet("redis", "default", 3)
	cs := newAppsStatefulSetClientSet(sts)
	r := newTestStatefulSetResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("scale", "redis", "default", map[string]interface{}{}))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "replicas:")
}

func TestStatefulSetResourcer_Scale_NotFound(t *testing.T) {
	cs := newAppsStatefulSetClientSet()
	r := newTestStatefulSetResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("scale", "nonexistent", "default", map[string]interface{}{"replicas": int64(3)}))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "failed to scale statefulset")
}

// ===================== Unknown Action =====================

func TestStatefulSetResourcer_UnknownAction(t *testing.T) {
	cs := newAppsStatefulSetClientSet()
	r := newTestStatefulSetResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("foo", "", "", nil))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "unknown action")
}

// ===================== StreamAction =====================

func TestStatefulSetResourcer_StreamAction_UnsupportedAction(t *testing.T) {
	r := newTestStatefulSetResourcer()
	stream := make(chan resource.ActionEvent, 10)

	err := r.StreamAction(context.Background(), nil, workloadActionRequest("scale", "", "", nil), stream)

	require.Error(t, err)
	var operationError *resource.ResourceOperationError
	require.ErrorAs(t, err, &operationError)
	assert.Equal(t, "UNSUPPORTED", operationError.Code)
}

func TestStatefulSetResourcer_StreamAction_Restart_NotFound(t *testing.T) {
	cs := newAppsStatefulSetClientSet()
	r := newTestStatefulSetResourcer()
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
