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

// DaemonSetResourcer wraps KubernetesResourcerBase for CRUD and adds
// daemonset-specific actions: restart.
type DaemonSetResourcer struct {
	*KubernetesResourcerBase[MetaAccessor]
	log *zap.SugaredLogger
}

// NewDaemonSetResourcer creates a DaemonSetResourcer for apps::v1::DaemonSet.
func NewDaemonSetResourcer(logger *zap.SugaredLogger, opts ...Option) *DaemonSetResourcer {
	base := NewKubernetesResourcerBase[MetaAccessor](
		logger,
		appsv1.SchemeGroupVersion.WithResource("daemonsets"),
		opts...,
	)
	return &DaemonSetResourcer{
		KubernetesResourcerBase: base,
		log:                     logger.Named("DaemonSetResourcer"),
	}
}

// ResolveRelationships resolves runtime relationship instances for a DaemonSet.
func (d *DaemonSetResourcer) ResolveRelationships(
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
	ds, err := client.KubeClient.AppsV1().DaemonSets(namespace).Get(ctx, id, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get daemonset %s: %w", id, err)
	}

	var rels []resource.ResolvedRelationship
	byTarget := descriptorByTarget(d.DeclareRelationships())

	// Pod relationships via ownerRef.
	pods, err := listPodsByOwner(ctx, client, namespace, "DaemonSet", id, string(ds.UID))
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

	// ConfigMap relationships from volumes.
	if cms := extractVolumeConfigMaps(ds.Spec.Template.Spec); len(cms) > 0 {
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
	if secrets := extractVolumeSecrets(ds.Spec.Template.Spec); len(secrets) > 0 {
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

func (d *DaemonSetResourcer) GetActions(
	_ context.Context,
	_ *clients.ClientSet,
) ([]resource.ActionDescriptor, error) {
	return []resource.ActionDescriptor{
		{
			ID:          "restart",
			Label:       "Rollout Restart",
			Description: "Restart all pods in this daemonset via a rolling update",
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
	}, nil
}

func (d *DaemonSetResourcer) ExecuteAction(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	switch input.Action {
	case "rollout-restart":
		return d.executeRestart(ctx, client, input)
	default:
		return resource.Value{}, fmt.Errorf("unknown action: %s", input.Action)
	}
}

func (d *DaemonSetResourcer) StreamAction(
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

func (d *DaemonSetResourcer) executeRestart(
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
	_, err := client.KubeClient.AppsV1().DaemonSets(namespace).Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to restart daemonset %s: %w", input.Reference.Address.ID, err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Rollout restart initiated for daemonset %s", input.Reference.Address.ID),
	})
}

func (d *DaemonSetResourcer) streamRestart(
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
	_, err := client.KubeClient.AppsV1().DaemonSets(namespace).Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return err
	}

	watcher, err := client.KubeClient.AppsV1().DaemonSets(namespace).Watch(
		ctx, metav1.ListOptions{
			FieldSelector: fmt.Sprintf("metadata.name=%s", input.Reference.Address.ID),
		},
	)
	if err != nil {
		return err
	}
	defer watcher.Stop()
	if input.Reference.Incarnation != nil {
		current, err := client.KubeClient.AppsV1().DaemonSets(namespace).Get(ctx, input.Reference.Address.ID, metav1.GetOptions{})
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
			ds, ok := event.Object.(*appsv1.DaemonSet)
			if !ok {
				continue
			}

			desired := ds.Status.DesiredNumberScheduled

			progress, err := nativeActionEventValue(map[string]interface{}{
				"ready":   ds.Status.NumberReady,
				"desired": desired,
				"updated": ds.Status.UpdatedNumberScheduled,
				"message": fmt.Sprintf("%d/%d nodes ready", ds.Status.NumberReady, desired),
			})
			if err != nil {
				return err
			}
			select {
			case stream <- resource.ActionEvent{Type: "progress", Data: progress}:
			case <-ctx.Done():
				return ctx.Err()
			}

			if ds.Status.UpdatedNumberScheduled == desired &&
				ds.Status.NumberReady == desired &&
				ds.Status.NumberAvailable == desired {
				complete, err := nativeActionEventValue(map[string]interface{}{
					"message": fmt.Sprintf("DaemonSet %s successfully restarted", input.Reference.Address.ID),
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
