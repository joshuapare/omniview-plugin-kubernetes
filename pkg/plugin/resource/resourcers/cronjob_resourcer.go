package resourcers

import (
	"context"
	"fmt"
	"strings"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"go.uber.org/zap"
	batchv1 "k8s.io/api/batch/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8stypes "k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/rand"
)

// cronJobManualJobPrefixLimit keeps generated Job names within 63 characters:
// 50 + len("-manual-") + 5 random characters.
const cronJobManualJobPrefixLimit = 50

// CronJobResourcer wraps KubernetesResourcerBase and adds CronJob actions:
// trigger (run now), suspend and resume.
type CronJobResourcer struct {
	*KubernetesResourcerBase[MetaAccessor]
	log *zap.SugaredLogger
}

// NewCronJobResourcer creates a CronJobResourcer for batch::v1::CronJob.
func NewCronJobResourcer(logger *zap.SugaredLogger, opts ...Option) *CronJobResourcer {
	base := NewKubernetesResourcerBase[MetaAccessor](
		logger,
		batchv1.SchemeGroupVersion.WithResource("cronjobs"),
		opts...,
	)
	return &CronJobResourcer{
		KubernetesResourcerBase: base,
		log:                     logger.Named("CronJobResourcer"),
	}
}

func (c *CronJobResourcer) GetActions(
	_ context.Context,
	_ *clients.ClientSet,
) ([]resource.ActionDescriptor, error) {
	return []resource.ActionDescriptor{
		{
			ID:           "trigger",
			Label:        "Run Now",
			Description:  "Create a Job from this CronJob's job template immediately",
			Icon:         "LuPlay",
			Scope:        resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:           "suspend",
			Label:        "Suspend",
			Description:  "Stop scheduling new Jobs for this CronJob",
			Icon:         "LuPause",
			Scope:        resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:           "resume",
			Label:        "Resume",
			Description:  "Resume scheduling Jobs for this CronJob",
			Icon:         "LuPlay",
			Scope:        resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
	}, nil
}

func (c *CronJobResourcer) ExecuteAction(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	switch input.Action {
	case "trigger":
		return c.executeTrigger(ctx, client, input)
	case "suspend":
		return c.executeSuspend(ctx, client, input, true)
	case "resume":
		return c.executeSuspend(ctx, client, input, false)
	default:
		return resource.Value{}, fmt.Errorf("unknown action: %s", input.Action)
	}
}

func (c *CronJobResourcer) executeTrigger(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	namespace, scopeErr := nativeRequestNamespace(input.Reference.Address.Scope)
	if scopeErr != nil {
		return resource.Value{}, scopeErr
	}
	cj, err := client.KubeClient.BatchV1().CronJobs(namespace).Get(ctx, input.Reference.Address.ID, metav1.GetOptions{})
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get cronjob %s: %w", input.Reference.Address.ID, err)
	}
	if err := nativeActionObjectMatches(input, cj); err != nil {
		return resource.Value{}, err
	}
	job := cronJobManualJob(cj)
	created, err := client.KubeClient.BatchV1().Jobs(namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to create job from cronjob %s: %w", cj.Name, err)
	}
	return resource.ValueFromNative(map[string]interface{}{
		"success":   true,
		"message":   fmt.Sprintf("Job %s created from cronjob %s", created.Name, cj.Name),
		"job":       created.Name,
		"namespace": created.Namespace,
	})
}

// cronJobManualJob builds a manual Job from the CronJob's job template, like
// `kubectl create job --from=cronjob/<name>`, except that the owner reference
// is a controller reference (Controller and BlockOwnerDeletion set).
func cronJobManualJob(cj *batchv1.CronJob) *batchv1.Job {
	prefix := cj.Name
	if len(prefix) > cronJobManualJobPrefixLimit {
		// Trimming '.' and '-' keeps the truncated prefix DNS-1123 valid.
		prefix = strings.TrimRight(prefix[:cronJobManualJobPrefixLimit], ".-")
	}
	annotations := make(map[string]string, len(cj.Spec.JobTemplate.Annotations)+1)
	for key, value := range cj.Spec.JobTemplate.Annotations {
		annotations[key] = value
	}
	annotations["cronjob.kubernetes.io/instantiate"] = "manual"
	labels := make(map[string]string, len(cj.Spec.JobTemplate.Labels))
	for key, value := range cj.Spec.JobTemplate.Labels {
		labels[key] = value
	}
	return &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:            prefix + "-manual-" + rand.String(5),
			Namespace:       cj.Namespace,
			Labels:          labels,
			Annotations:     annotations,
			OwnerReferences: []metav1.OwnerReference{*metav1.NewControllerRef(cj, batchv1.SchemeGroupVersion.WithKind("CronJob"))},
		},
		Spec: *cj.Spec.JobTemplate.Spec.DeepCopy(),
	}
}

func (c *CronJobResourcer) executeSuspend(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
	suspend bool,
) (resource.Value, error) {
	namespace, scopeErr := nativeRequestNamespace(input.Reference.Address.Scope)
	if scopeErr != nil {
		return resource.Value{}, scopeErr
	}
	patch := fmt.Sprintf(`{"spec":{"suspend":%t}}`, suspend)
	verb, done := "suspend", "suspended"
	if !suspend {
		verb, done = "resume", "resumed"
	}
	_, err := client.KubeClient.BatchV1().CronJobs(namespace).Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to %s cronjob %s: %w", verb, input.Reference.Address.ID, err)
	}
	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("CronJob %s %s", input.Reference.Address.ID, done),
	})
}
