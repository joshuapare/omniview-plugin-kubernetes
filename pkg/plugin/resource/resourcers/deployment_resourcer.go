package resourcers

import (
	"context"
	"fmt"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8stypes "k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/watch"
)

// DeploymentResourcer wraps KubernetesResourcerBase for CRUD and adds
// deployment-specific actions: restart, scale, pause, resume.
type DeploymentResourcer struct {
	*KubernetesResourcerBase[MetaAccessor]
	log *zap.SugaredLogger
}

// NewDeploymentResourcer creates a DeploymentResourcer for apps::v1::Deployment.
func NewDeploymentResourcer(logger *zap.SugaredLogger, opts ...Option) *DeploymentResourcer {
	base := NewKubernetesResourcerBase[MetaAccessor](
		logger,
		appsv1.SchemeGroupVersion.WithResource("deployments"),
		opts...,
	)
	return &DeploymentResourcer{
		KubernetesResourcerBase: base,
		log:                     logger.Named("DeploymentResourcer"),
	}
}

// ResolveRelationships resolves runtime relationship instances for a Deployment.
func (d *DeploymentResourcer) ResolveRelationships(
	ctx context.Context,
	client *clients.ClientSet,
	request resource.RelationshipResolutionRequest,
) ([]resource.ResolvedRelationship, error) {
	source := request.Source
	id := source.Reference.Address.ID
	namespace, err := nativeRequestNamespace(source.Reference.Address.Scope)
	if err != nil {
		return nil, err
	}
	dep, err := client.KubeClient.AppsV1().Deployments(namespace).Get(ctx, id, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get deployment %s: %w", id, err)
	}

	var rels []resource.ResolvedRelationship
	byTarget := descriptorByTarget(d.DeclareRelationships())

	// ReplicaSet relationships via label selector.
	if dep.Spec.Selector != nil {
		selector, err := metav1.LabelSelectorAsSelector(dep.Spec.Selector)
		if err != nil {
			return nil, err
		}
		rsList, err := client.KubeClient.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{
			LabelSelector: selector.String(),
		})
		if err != nil {
			return nil, fmt.Errorf("failed to list replicasets for deployment %s: %w", id, err)
		}
		if len(rsList.Items) > 0 {
			targets := make([]resource.RelationshipTarget, 0, len(rsList.Items))
			for _, rs := range rsList.Items {
				// Only include ReplicaSets owned by this Deployment.
				for _, ref := range rs.OwnerReferences {
					if ref.Kind == "Deployment" && ref.Name == id && dep.UID != "" && ref.UID == dep.UID {
						target, err := makeRef(request, "k8s:apps/replicasets", rs.Name, namespace, string(rs.UID))
						if err != nil {
							return nil, err
						}
						targets = append(targets, target)
						break
					}
				}
			}
			if len(targets) > 0 {
				rels = append(rels, resource.ResolvedRelationship{
					Descriptor: byTarget["k8s:apps/replicasets"],
					Targets:    targets,
				})
			}
		}
	}

	// ConfigMap relationships from volumes.
	if cms := extractVolumeConfigMaps(dep.Spec.Template.Spec); len(cms) > 0 {
		targets := make([]resource.RelationshipTarget, 0, len(cms))
		for _, name := range cms {
			target, err := makeRef(request, "k8s:/configmaps", name, namespace)
			if err != nil {
				return nil, err
			}
			targets = append(targets, target)
		}
		rels = append(rels, resource.ResolvedRelationship{
			Descriptor: byTarget["k8s:/configmaps"],
			Targets:    targets,
		})
	}

	// Secret relationships from volumes.
	if secrets := extractVolumeSecrets(dep.Spec.Template.Spec); len(secrets) > 0 {
		targets := make([]resource.RelationshipTarget, 0, len(secrets))
		for _, name := range secrets {
			target, err := makeRef(request, "k8s:/secrets", name, namespace)
			if err != nil {
				return nil, err
			}
			targets = append(targets, target)
		}
		rels = append(rels, resource.ResolvedRelationship{
			Descriptor: byTarget["k8s:/secrets"],
			Targets:    targets,
		})
	}

	return rels, nil
}

// ====================== ACTION INTERFACE ====================== //

func (d *DeploymentResourcer) GetActions(
	_ context.Context,
	_ *clients.ClientSet,
) ([]resource.ActionDescriptor, error) {
	return []resource.ActionDescriptor{
		{
			ID:          "restart",
			Label:       "Rollout Restart",
			Description: "Restart all pods in this deployment via a rolling update",
			Icon:        "LuRefreshCw",
			Scope:       resource.ActionScopeInstance,
			Dangerous:   true,
			Streaming:   true,
		},
		{
			ID:           "rollout-restart",
			Label:        "Rollout Restart",
			Description:  "Restart all pods via a rolling update and return immediately; read the object to follow the rollout.",
			Icon:         "LuRefreshCw",
			Scope:        resource.ActionScopeInstance,
			Dangerous:    true,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:          "scale",
			Label:       "Scale",
			Description: "Change the number of replicas",
			Icon:        "LuScaling",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{
				Properties: map[string]resource.SchemaProperty{
					"replicas": {Type: resource.SchemaInteger, Minimum: resource.PtrFloat64(0), Description: "Desired number of replicas"},
				},
				Required: []string{"replicas"},
			},
		},
		{
			ID:          "pause",
			Label:       "Pause Rollout",
			Description: "Pause the current rollout",
			Icon:        "LuPause",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:          "resume",
			Label:       "Resume Rollout",
			Description: "Resume a paused rollout",
			Icon:        "LuPlay",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
	}, nil
}

func (d *DeploymentResourcer) ExecuteAction(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	switch input.Action {
	case "rollout-restart":
		return d.executeRestart(ctx, client, input)
	case "scale":
		return d.executeScale(ctx, client, input)
	case "pause":
		return d.executePauseResume(ctx, client, input, true)
	case "resume":
		return d.executePauseResume(ctx, client, input, false)
	default:
		return resource.Value{}, fmt.Errorf("unknown action: %s", input.Action)
	}
}

func (d *DeploymentResourcer) StreamAction(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
	stream chan<- resource.ActionEvent,
) error {
	switch input.Action {
	case "restart":
		return d.streamRestart(ctx, client, input, stream)
	default:
		return &resource.ResourceOperationError{Code: "UNSUPPORTED", Title: "Unsupported operation", Message: "This action does not support streaming."}
	}
}

// ====================== ACTION IMPLEMENTATIONS ====================== //

// executeRestart patches the pod template annotation to trigger a rolling restart.
func (d *DeploymentResourcer) executeRestart(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	namespace, scopeErr := nativeRequestNamespace(input.Reference.Address.Scope)
	if scopeErr != nil {
		return resource.Value{}, scopeErr
	}
	patch := fmt.Sprintf(
		`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
		time.Now().Format(time.RFC3339),
	)
	_, err := client.KubeClient.AppsV1().Deployments(namespace).Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to restart deployment %s: %w", input.Reference.Address.ID, err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Rollout restart initiated for deployment %s", input.Reference.Address.ID),
	})
}

// streamRestart patches the annotation then watches for rollout completion.
func (d *DeploymentResourcer) streamRestart(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
	stream chan<- resource.ActionEvent,
) error {
	namespace, scopeErr := nativeRequestNamespace(input.Reference.Address.Scope)
	if scopeErr != nil {
		return scopeErr
	}

	// Patch to trigger restart.
	patch := fmt.Sprintf(
		`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
		time.Now().Format(time.RFC3339),
	)
	_, err := client.KubeClient.AppsV1().Deployments(namespace).Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return err
	}

	// Watch the deployment for rollout completion.
	watcher, err := client.KubeClient.AppsV1().Deployments(namespace).Watch(
		ctx, metav1.ListOptions{
			FieldSelector: fmt.Sprintf("metadata.name=%s", input.Reference.Address.ID),
		},
	)
	if err != nil {
		return err
	}
	defer watcher.Stop()
	if input.Reference.Incarnation != nil {
		current, err := client.KubeClient.AppsV1().Deployments(namespace).Get(ctx, input.Reference.Address.ID, metav1.GetOptions{})
		if err != nil {
			return err
		}
		if err := nativeActionObjectMatches(input, current); err != nil {
			return err
		}
	}
	select {
	case stream <- resource.ActionEvent{Type: "ready"}:
	case <-ctx.Done():
		return ctx.Err()
	}

	timeout := time.After(5 * time.Minute)
	for {
		select {
		case <-timeout:
			return &resource.ResourceOperationError{Code: "TIMEOUT", Title: "Timed out", Message: "The rollout restart exceeded its deadline."}

		case <-ctx.Done():
			return ctx.Err()

		case event, ok := <-watcher.ResultChan():
			if !ok {
				return fmt.Errorf("watch channel closed")
			}
			if object, ok := event.Object.(metav1.Object); ok {
				if err := nativeActionObjectMatches(input, object); err != nil {
					return err
				}
			}
			if event.Type != watch.Modified {
				continue
			}
			dep, ok := event.Object.(*appsv1.Deployment)
			if !ok {
				continue
			}

			desired := int32(1)
			if dep.Spec.Replicas != nil {
				desired = *dep.Spec.Replicas
			}

			progress, err := nativeActionEventValue(map[string]interface{}{
				"ready":   dep.Status.AvailableReplicas,
				"desired": desired,
				"updated": dep.Status.UpdatedReplicas,
				"message": fmt.Sprintf("%d/%d replicas ready", dep.Status.AvailableReplicas, desired),
			})
			if err != nil {
				return err
			}
			select {
			case stream <- resource.ActionEvent{Type: "progress", Data: progress}:
			case <-ctx.Done():
				return ctx.Err()
			}

			if dep.Status.UpdatedReplicas == desired &&
				dep.Status.AvailableReplicas == desired &&
				dep.Status.Replicas == desired {
				complete, err := nativeActionEventValue(map[string]interface{}{
					"message": fmt.Sprintf("Deployment %s successfully restarted", input.Reference.Address.ID),
				})
				if err != nil {
					return err
				}
				select {
				case stream <- resource.ActionEvent{Type: "complete", Data: complete}:
				case <-ctx.Done():
					return ctx.Err()
				}
				return nil
			}
		}
	}
}

// executeScale patches spec.replicas on the deployment.
func (d *DeploymentResourcer) executeScale(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	namespace, scopeErr := nativeRequestNamespace(input.Reference.Address.Scope)
	if scopeErr != nil {
		return resource.Value{}, scopeErr
	}
	params, paramsErr := nativeActionParams(input.Input)
	if paramsErr != nil {
		return resource.Value{}, paramsErr
	}
	replicas, parseErr := nativeActionInteger(params["replicas"], 0, 2147483647)
	if parseErr != nil {
		return resource.Value{}, fmt.Errorf("replicas: %w", parseErr)
	}
	replicaCount := int32(replicas)
	patch := fmt.Sprintf(`{"spec":{"replicas":%d}}`, replicaCount)
	_, err := client.KubeClient.AppsV1().Deployments(namespace).Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to scale deployment %s: %w", input.Reference.Address.ID, err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Deployment %s scaled to %d replicas", input.Reference.Address.ID, replicaCount),
	})
}

// executePauseResume patches spec.paused on the deployment.
func (d *DeploymentResourcer) executePauseResume(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
	paused bool,
) (resource.Value, error) {
	namespace, scopeErr := nativeRequestNamespace(input.Reference.Address.Scope)
	if scopeErr != nil {
		return resource.Value{}, scopeErr
	}
	patch := fmt.Sprintf(`{"spec":{"paused":%t}}`, paused)
	_, err := client.KubeClient.AppsV1().Deployments(namespace).Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		verb := "pause"
		if !paused {
			verb = "resume"
		}
		return resource.Value{}, fmt.Errorf("failed to %s deployment %s: %w", verb, input.Reference.Address.ID, err)
	}

	verb := "paused"
	if !paused {
		verb = "resumed"
	}
	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Deployment %s rollout %s", input.Reference.Address.ID, verb),
	})
}
