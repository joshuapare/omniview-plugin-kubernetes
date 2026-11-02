package resourcers

import (
	"context"
	"strings"
	"testing"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8stypes "k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/validation"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func testCronJob(name string) *batchv1.CronJob {
	return &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default", UID: k8stypes.UID("cj-uid")},
		Spec: batchv1.CronJobSpec{
			Schedule: "0 0 1 1 *",
			JobTemplate: batchv1.JobTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "smoke"}, Annotations: map[string]string{"team": "ops"}},
				Spec: batchv1.JobSpec{Template: corev1.PodTemplateSpec{Spec: corev1.PodSpec{
					RestartPolicy: corev1.RestartPolicyNever,
					Containers:    []corev1.Container{{Name: "main", Image: "busybox:1.37.0", Command: []string{"true"}}},
				}}},
			},
		},
	}
}

func TestCronJobResourcer_GetActions(t *testing.T) {
	actions, err := NewCronJobResourcer(zap.NewNop().Sugar()).GetActions(context.Background(), nil)
	require.NoError(t, err)
	require.Len(t, actions, 3)
	for i, id := range []string{"trigger", "suspend", "resume"} {
		assert.Equal(t, id, actions[i].ID)
		assert.NotNil(t, actions[i].ParamsSchema)
		assert.False(t, actions[i].Streaming)
	}
}

func TestCronJobResourcer_Trigger(t *testing.T) {
	name := strings.Repeat("a", 70)
	fakeClient := fake.NewClientset(testCronJob(name))
	r := NewCronJobResourcer(zap.NewNop().Sugar())

	result, err := r.ExecuteAction(context.Background(), &clients.ClientSet{KubeClient: fakeClient}, workloadActionRequest("trigger", name, "default", nil))
	require.NoError(t, err)
	jobName := result.Map["job"].String
	require.NotEmpty(t, jobName)
	assert.Equal(t, "default", result.Map["namespace"].String)

	job, err := fakeClient.BatchV1().Jobs("default").Get(context.Background(), jobName, metav1.GetOptions{})
	require.NoError(t, err)
	assert.LessOrEqual(t, len(job.Name), 63)
	assert.True(t, strings.HasPrefix(job.Name, strings.Repeat("a", 50)+"-manual-"))
	assert.Equal(t, "manual", job.Annotations["cronjob.kubernetes.io/instantiate"])
	assert.Equal(t, "ops", job.Annotations["team"])
	assert.Equal(t, "smoke", job.Labels["app"])
	require.Len(t, job.OwnerReferences, 1)
	owner := job.OwnerReferences[0]
	assert.Equal(t, "CronJob", owner.Kind)
	assert.Equal(t, "batch/v1", owner.APIVersion)
	assert.Equal(t, name, owner.Name)
	assert.Equal(t, k8stypes.UID("cj-uid"), owner.UID)
	require.NotNil(t, owner.Controller)
	assert.True(t, *owner.Controller)
	assert.Equal(t, "busybox:1.37.0", job.Spec.Template.Spec.Containers[0].Image)
}

func TestCronJobManualJobNameStaysDNS1123(t *testing.T) {
	// A '.' at index 49 would end the 50-character prefix in a non-alphanumeric.
	name := strings.Repeat("a", 48) + "-." + strings.Repeat("b", 20)
	job := cronJobManualJob(testCronJob(name))
	assert.True(t, strings.HasPrefix(job.Name, strings.Repeat("a", 48)+"-manual-"), job.Name)
	assert.LessOrEqual(t, len(job.Name), 63)
	assert.Empty(t, validation.IsDNS1123Subdomain(job.Name))
	assert.Empty(t, validation.IsDNS1123Label(job.Name))
}

func TestCronJobResourcer_TriggerIncarnationMismatch(t *testing.T) {
	fakeClient := fake.NewClientset(testCronJob("smoke-cron"))
	request := workloadActionRequest("trigger", "smoke-cron", "default", nil)
	other := "other-uid"
	request.Reference.Incarnation = &other
	_, err := NewCronJobResourcer(zap.NewNop().Sugar()).ExecuteAction(context.Background(), &clients.ClientSet{KubeClient: fakeClient}, request)
	require.Error(t, err)
	jobs, err := fakeClient.BatchV1().Jobs("default").List(context.Background(), metav1.ListOptions{})
	require.NoError(t, err)
	assert.Empty(t, jobs.Items)
}

func TestCronJobResourcer_SuspendResume(t *testing.T) {
	fakeClient := fake.NewClientset(testCronJob("smoke-cron"))
	cs := &clients.ClientSet{KubeClient: fakeClient}
	r := NewCronJobResourcer(zap.NewNop().Sugar())

	_, err := r.ExecuteAction(context.Background(), cs, workloadActionRequest("suspend", "smoke-cron", "default", nil))
	require.NoError(t, err)
	var patch k8stesting.PatchAction
	for _, action := range fakeClient.Actions() {
		if p, ok := action.(k8stesting.PatchAction); ok {
			patch = p
		}
	}
	require.NotNil(t, patch)
	assert.Equal(t, k8stypes.StrategicMergePatchType, patch.GetPatchType())
	assert.JSONEq(t, `{"spec":{"suspend":true}}`, string(patch.GetPatch()))
	cj, err := fakeClient.BatchV1().CronJobs("default").Get(context.Background(), "smoke-cron", metav1.GetOptions{})
	require.NoError(t, err)
	require.NotNil(t, cj.Spec.Suspend)
	assert.True(t, *cj.Spec.Suspend)

	_, err = r.ExecuteAction(context.Background(), cs, workloadActionRequest("resume", "smoke-cron", "default", nil))
	require.NoError(t, err)
	cj, err = fakeClient.BatchV1().CronJobs("default").Get(context.Background(), "smoke-cron", metav1.GetOptions{})
	require.NoError(t, err)
	require.NotNil(t, cj.Spec.Suspend)
	assert.False(t, *cj.Spec.Suspend)
}
