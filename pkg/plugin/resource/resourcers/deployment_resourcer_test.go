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
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
)

func newTestDeploymentResourcer() *DeploymentResourcer {
	return NewDeploymentResourcer(zap.NewNop().Sugar())
}

func newAppsDeploymentClientSet(objects ...runtime.Object) *clients.ClientSet {
	fakeClient := fake.NewSimpleClientset(objects...)
	return &clients.ClientSet{
		KubeClient: fakeClient,
	}
}

func testDeployment(name, ns string, replicas int32, opts ...func(*appsv1.Deployment)) *appsv1.Deployment {
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": name},
			},
			Template: corev1PodTemplateSpec(name),
		},
	}
	for _, o := range opts {
		o(dep)
	}
	return dep
}

func withPaused(dep *appsv1.Deployment) {
	dep.Spec.Paused = true
}

// corev1PodTemplateSpec returns a minimal PodTemplateSpec for testing.
func corev1PodTemplateSpec(name string) corev1.PodTemplateSpec {
	return corev1.PodTemplateSpec{
		ObjectMeta: metav1.ObjectMeta{
			Labels: map[string]string{"app": name},
		},
	}
}

// ===================== GetActions =====================

func TestDeploymentResourcer_GetActions(t *testing.T) {
	r := newTestDeploymentResourcer()
	actions, err := r.GetActions(context.Background(), nil)
	require.NoError(t, err)
	require.Len(t, actions, 5)

	ids := make([]string, len(actions))
	for i, a := range actions {
		ids[i] = a.ID
	}
	assert.Equal(t, "restart", ids[0])
	assert.True(t, actions[0].Streaming)
	assert.Equal(t, "rollout-restart", ids[1])
	assert.False(t, actions[1].Streaming)
	assert.NotNil(t, actions[1].ParamsSchema)
	assert.Equal(t, "scale", ids[2])
	assert.Equal(t, "pause", ids[3])
	assert.Equal(t, "resume", ids[4])

	for _, a := range actions {
		assert.Equal(t, resource.ActionScopeInstance, a.Scope)
	}
	assert.True(t, actions[0].Streaming, "restart should be streaming")
	assert.False(t, actions[1].Streaming, "scale should not be streaming")
	assert.False(t, actions[2].Streaming, "pause should not be streaming")
	assert.False(t, actions[3].Streaming, "resume should not be streaming")
}

// ===================== Restart =====================

func TestDeploymentResourcer_Restart(t *testing.T) {
	dep := testDeployment("nginx", "default", 3)
	cs := newAppsDeploymentClientSet(dep)
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("rollout-restart", "nginx", "default", nil))

	require.NoError(t, err)
	require.Equal(t, "map", result.Kind)
	assert.True(t, result.Map["success"].Bool)

	// Verify the restart annotation was set.
	updated, err := cs.KubeClient.AppsV1().Deployments("default").Get(context.Background(), "nginx", metav1.GetOptions{})
	require.NoError(t, err)
	ann := updated.Spec.Template.Annotations
	assert.Contains(t, ann, "kubectl.kubernetes.io/restartedAt")
}

func TestDeploymentResourcer_Restart_NotFound(t *testing.T) {
	cs := newAppsDeploymentClientSet()
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("rollout-restart", "nonexistent", "default", nil))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "failed to restart deployment")
}

// ===================== Scale =====================

func TestDeploymentResourcer_Scale(t *testing.T) {
	dep := testDeployment("nginx", "default", 3)
	cs := newAppsDeploymentClientSet(dep)
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("scale", "nginx", "default", map[string]interface{}{"replicas": float64(5)}))

	require.NoError(t, err)
	require.Equal(t, "map", result.Kind)
	assert.True(t, result.Map["success"].Bool)
	assert.Contains(t, result.Map["message"].String, "scaled to 5")

	updated, err := cs.KubeClient.AppsV1().Deployments("default").Get(context.Background(), "nginx", metav1.GetOptions{})
	require.NoError(t, err)
	assert.Equal(t, int32(5), *updated.Spec.Replicas)
}

func TestDeploymentResourcer_Scale_ToZero(t *testing.T) {
	dep := testDeployment("nginx", "default", 3)
	cs := newAppsDeploymentClientSet(dep)
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("scale", "nginx", "default", map[string]interface{}{"replicas": float64(0)}))

	require.NoError(t, err)
	require.Equal(t, "map", result.Kind)
	assert.True(t, result.Map["success"].Bool)

	updated, err := cs.KubeClient.AppsV1().Deployments("default").Get(context.Background(), "nginx", metav1.GetOptions{})
	require.NoError(t, err)
	assert.Equal(t, int32(0), *updated.Spec.Replicas)
}

func TestDeploymentResourcer_Scale_MissingParam(t *testing.T) {
	dep := testDeployment("nginx", "default", 3)
	cs := newAppsDeploymentClientSet(dep)
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("scale", "nginx", "default", map[string]interface{}{}))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "replicas:")
}

func TestDeploymentResourcer_Scale_NotFound(t *testing.T) {
	cs := newAppsDeploymentClientSet()
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("scale", "nonexistent", "default", map[string]interface{}{"replicas": float64(5)}))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "failed to scale deployment")
}

// ===================== Pause =====================

func TestDeploymentResourcer_Pause(t *testing.T) {
	dep := testDeployment("nginx", "default", 3)
	cs := newAppsDeploymentClientSet(dep)
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("pause", "nginx", "default", nil))

	require.NoError(t, err)
	require.Equal(t, "map", result.Kind)
	assert.True(t, result.Map["success"].Bool)
	assert.Contains(t, result.Map["message"].String, "paused")

	updated, err := cs.KubeClient.AppsV1().Deployments("default").Get(context.Background(), "nginx", metav1.GetOptions{})
	require.NoError(t, err)
	assert.True(t, updated.Spec.Paused)
}

func TestDeploymentResourcer_Pause_NotFound(t *testing.T) {
	cs := newAppsDeploymentClientSet()
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("pause", "nonexistent", "default", nil))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "failed to pause deployment")
}

// ===================== Resume =====================

func TestDeploymentResourcer_Resume(t *testing.T) {
	dep := testDeployment("nginx", "default", 3, withPaused)
	cs := newAppsDeploymentClientSet(dep)
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("resume", "nginx", "default", nil))

	require.NoError(t, err)
	require.Equal(t, "map", result.Kind)
	assert.True(t, result.Map["success"].Bool)
	assert.Contains(t, result.Map["message"].String, "resumed")
}

func TestDeploymentResourcer_Resume_NotFound(t *testing.T) {
	cs := newAppsDeploymentClientSet()
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("resume", "nonexistent", "default", nil))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "failed to resume deployment")
}

// ===================== Unknown Action =====================

func TestDeploymentResourcer_UnknownAction(t *testing.T) {
	cs := newAppsDeploymentClientSet()
	r := newTestDeploymentResourcer()

	result, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("foo", "", "", nil))

	require.Error(t, err)
	assert.Equal(t, resource.Value{}, result)
	assert.Contains(t, err.Error(), "unknown action: foo")
}

// ===================== StreamAction =====================

func TestDeploymentResourcer_StreamAction_UnsupportedAction(t *testing.T) {
	r := newTestDeploymentResourcer()
	stream := make(chan resource.ActionEvent, 10)

	err := r.StreamAction(context.Background(), nil, workloadActionRequest("scale", "", "", nil), stream)

	require.Error(t, err)
	var operationError *resource.ResourceOperationError
	require.ErrorAs(t, err, &operationError)
	assert.Equal(t, "UNSUPPORTED", operationError.Code)
}

func TestDeploymentResourcer_StreamAction_Restart_NotFound(t *testing.T) {
	cs := newAppsDeploymentClientSet()
	r := newTestDeploymentResourcer()
	stream := make(chan resource.ActionEvent, 10)

	err := r.StreamAction(context.Background(), cs, workloadActionRequest("restart", "nonexistent", "default", nil), stream)

	require.Error(t, err)

	// Failed native establishment emits neither readiness nor public progress.
	var events []resource.ActionEvent
	close(stream)
	for ev := range stream {
		events = append(events, ev)
	}
	assert.Empty(t, events)
}
