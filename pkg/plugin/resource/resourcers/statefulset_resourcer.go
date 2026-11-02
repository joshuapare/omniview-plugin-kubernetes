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

// StatefulSetResourcer wraps KubernetesResourcerBase for CRUD and adds
// statefulset-specific actions: restart, scale.
type StatefulSetResourcer struct {
	*KubernetesResourcerBase[MetaAccessor]
	log *zap.SugaredLogger
}

// NewStatefulSetResourcer creates a StatefulSetResourcer for apps::v1::StatefulSet.
func NewStatefulSetResourcer(logger *zap.SugaredLogger, opts ...Option) *StatefulSetResourcer {
	base := NewKubernetesResourcerBase[MetaAccessor](
		logger,
		appsv1.SchemeGroupVersion.WithResource("statefulsets"),
		opts...,
	)
	return &StatefulSetResourcer{
		KubernetesResourcerBase: base,
		log:                     logger.Named("StatefulSetResourcer"),
	}
}

// ResolveRelationships resolves runtime relationship instances for a StatefulSet.
func (s *StatefulSetResourcer) ResolveRelationships(
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
	sts, err := client.KubeClient.AppsV1().StatefulSets(namespace).Get(ctx, id, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get statefulset %s: %w", id, err)
	}

	var rels []resource.ResolvedRelationship
	byTarget := descriptorByTarget(s.DeclareRelationships())

	// Pod relationships via ownerRef.
	pods, err := listPodsByOwner(ctx, client, namespace, "StatefulSet", id, string(sts.UID))
	if err != nil {
		return nil, err
	}
	if len(pods) > 0 {
		targets := make([]resource.RelationshipTarget, 0, len(pods))
		for _, pod := range pods {
			target, err := makeRef(request, "k8s:/pods", pod.Name, namespace, string(pod.UID))
			if err != nil {
				return nil, err
			}
			targets = append(targets, target)
		}
		rels = append(rels, resource.ResolvedRelationship{
			Descriptor: byTarget["k8s:/pods"],
			Targets:    targets,
		})
	}

	// PVC relationships from volumeClaimTemplates.
	// StatefulSet PVC names follow the pattern: <template-name>-<statefulset-name>-<ordinal>
	if len(sts.Spec.VolumeClaimTemplates) > 0 {
		replicas := int32(1)
		if sts.Spec.Replicas != nil {
			replicas = *sts.Spec.Replicas
		}
		var targets []resource.RelationshipTarget
		for _, vct := range sts.Spec.VolumeClaimTemplates {
			for i := int32(0); i < replicas; i++ {
				pvcName := fmt.Sprintf("%s-%s-%d", vct.Name, id, i)
				target, err := makeRef(request, "k8s:/persistentvolumeclaims", pvcName, namespace)
				if err != nil {
					return nil, err
				}
				targets = append(targets, target)
			}
		}
		if len(targets) > 0 {
			rels = append(rels, resource.ResolvedRelationship{
				Descriptor: byTarget["k8s:/persistentvolumeclaims"],
				Targets:    targets,
			})
		}
	}

	// ConfigMap relationships from volumes.
	if cms := extractVolumeConfigMaps(sts.Spec.Template.Spec); len(cms) > 0 {
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
	if secrets := extractVolumeSecrets(sts.Spec.Template.Spec); len(secrets) > 0 {
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

func (s *StatefulSetResourcer) GetActions(
	_ context.Context,
	_ *clients.ClientSet,
) ([]resource.ActionDescriptor, error) {
	return []resource.ActionDescriptor{
		{
			ID:          "restart",
			Label:       "Rollout Restart",
			Description: "Restart all pods in this statefulset via a rolling update",
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
	}, nil
}

func (s *StatefulSetResourcer) ExecuteAction(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	switch input.Action {
	case "rollout-restart":
		return s.executeRestart(ctx, client, input)
	case "scale":
		return s.executeScale(ctx, client, input)
	default:
		return resource.Value{}, fmt.Errorf("unknown action: %s", input.Action)
	}
}

func (s *StatefulSetResourcer) StreamAction(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
	stream chan<- resource.ActionEvent,
) error {
	switch input.Action {
	case "restart":
		return s.streamRestart(ctx, client, input, stream)
	default:
		return &resource.ResourceOperationError{Code: "UNSUPPORTED", Title: "Unsupported operation", Message: "This action does not support streaming."}
	}
}

// ====================== ACTION IMPLEMENTATIONS ====================== //

func (s *StatefulSetResourcer) executeRestart(
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
	_, err := client.KubeClient.AppsV1().StatefulSets(namespace).Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to restart statefulset %s: %w", input.Reference.Address.ID, err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Rollout restart initiated for statefulset %s", input.Reference.Address.ID),
	})
}

func (s *StatefulSetResourcer) streamRestart(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
	stream chan<- resource.ActionEvent,
) error {
	namespace, scopeErr := nativeRequestNamespace(input.Reference.Address.Scope)
	if scopeErr != nil {
		return scopeErr
	}

	patch := fmt.Sprintf(
		`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
		time.Now().Format(time.RFC3339),
	)
	_, err := client.KubeClient.AppsV1().StatefulSets(namespace).Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return err
	}

	watcher, err := client.KubeClient.AppsV1().StatefulSets(namespace).Watch(
		ctx, metav1.ListOptions{
			FieldSelector: fmt.Sprintf("metadata.name=%s", input.Reference.Address.ID),
		},
	)
	if err != nil {
		return err
	}
	defer watcher.Stop()
	if input.Reference.Incarnation != nil {
		current, err := client.KubeClient.AppsV1().StatefulSets(namespace).Get(ctx, input.Reference.Address.ID, metav1.GetOptions{})
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
			sts, ok := event.Object.(*appsv1.StatefulSet)
			if !ok {
				continue
			}

			desired := int32(1)
			if sts.Spec.Replicas != nil {
				desired = *sts.Spec.Replicas
			}

			progress, err := nativeActionEventValue(map[string]interface{}{
				"ready":   sts.Status.ReadyReplicas,
				"desired": desired,
				"updated": sts.Status.UpdatedReplicas,
				"message": fmt.Sprintf("%d/%d replicas ready", sts.Status.ReadyReplicas, desired),
			})
			if err != nil {
				return err
			}
			select {
			case stream <- resource.ActionEvent{Type: "progress", Data: progress}:
			case <-ctx.Done():
				return ctx.Err()
			}

			if sts.Status.UpdatedReplicas == desired &&
				sts.Status.ReadyReplicas == desired &&
				sts.Status.Replicas == desired {
				complete, err := nativeActionEventValue(map[string]interface{}{
					"message": fmt.Sprintf("StatefulSet %s successfully restarted", input.Reference.Address.ID),
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

func (s *StatefulSetResourcer) executeScale(
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
	_, err := client.KubeClient.AppsV1().StatefulSets(namespace).Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to scale statefulset %s: %w", input.Reference.Address.ID, err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("StatefulSet %s scaled to %d replicas", input.Reference.Address.ID, replicaCount),
	})
}
