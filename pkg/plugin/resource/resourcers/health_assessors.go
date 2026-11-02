package resourcers

import (
	"context"
	"fmt"
	"k8s.io/apimachinery/pkg/runtime"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
)

// ====================== NODE HEALTH ====================== //

func (n *NodeResourcer) AssessHealth(_ context.Context, _ *clients.ClientSet, _ resource.GetRequest, data resource.Value) (*resource.ResourceHealth, error) {
	var node corev1.Node
	if err := decodeHealthValue(data, &node); err != nil {
		return nil, fmt.Errorf("failed to unmarshal node: %w", err)
	}

	health := &resource.ResourceHealth{Status: resource.HealthUnknown}

	isReady := false
	isNotReady := false
	var notReadyMsg string
	hasPressure := false
	var pressureType string
	var pressureMsg string

	for _, c := range node.Status.Conditions {
		lt := c.LastTransitionTime.Time
		health.Conditions = append(health.Conditions, resource.HealthCondition{
			Type:               string(c.Type),
			Status:             string(c.Status),
			Reason:             c.Reason,
			Message:            c.Message,
			LastTransitionTime: &lt,
		})

		switch c.Type {
		case corev1.NodeReady:
			if c.Status == corev1.ConditionTrue {
				isReady = true
			} else {
				isNotReady = true
				notReadyMsg = c.Message
			}
		case corev1.NodeMemoryPressure, corev1.NodeDiskPressure, corev1.NodePIDPressure:
			if c.Status == corev1.ConditionTrue {
				hasPressure = true
				pressureType = string(c.Type)
				pressureMsg = c.Message
			}
		}
	}

	// Determine final status with priority: NotReady > Pressure > Ready
	switch {
	case isNotReady:
		health.Status = resource.HealthUnhealthy
		health.Reason = "NotReady"
		health.Message = notReadyMsg
	case hasPressure:
		health.Status = resource.HealthDegraded
		health.Reason = pressureType
		health.Message = pressureMsg
	case isReady:
		health.Status = resource.HealthHealthy
		health.Reason = "Ready"
	}

	return health, nil
}

func (n *NodeResourcer) GetEvents(ctx context.Context, client *clients.ClientSet, request resource.GetRequest, limit uint32) ([]resource.ResourceEvent, error) {
	return NativeKindEvents(ctx, client, request, "Node", limit)
}

// ====================== DEPLOYMENT HEALTH ====================== //

func (d *DeploymentResourcer) AssessHealth(_ context.Context, _ *clients.ClientSet, _ resource.GetRequest, data resource.Value) (*resource.ResourceHealth, error) {
	var dep appsv1.Deployment
	if err := decodeHealthValue(data, &dep); err != nil {
		return nil, fmt.Errorf("failed to unmarshal deployment: %w", err)
	}

	health := &resource.ResourceHealth{Status: resource.HealthUnknown}

	desired := int32(1)
	if dep.Spec.Replicas != nil {
		desired = *dep.Spec.Replicas
	}

	if dep.Status.AvailableReplicas == desired {
		health.Status = resource.HealthHealthy
		health.Reason = "Available"
		health.Message = fmt.Sprintf("%d/%d replicas available", dep.Status.AvailableReplicas, desired)
	} else if dep.Status.AvailableReplicas > 0 {
		health.Status = resource.HealthDegraded
		health.Reason = "PartiallyAvailable"
		health.Message = fmt.Sprintf("%d/%d replicas available", dep.Status.AvailableReplicas, desired)
	} else {
		health.Status = resource.HealthUnhealthy
		health.Reason = "Unavailable"
		health.Message = fmt.Sprintf("0/%d replicas available", desired)
	}

	for _, c := range dep.Status.Conditions {
		lt := c.LastTransitionTime.Time
		health.Conditions = append(health.Conditions, resource.HealthCondition{
			Type:               string(c.Type),
			Status:             string(c.Status),
			Reason:             c.Reason,
			Message:            c.Message,
			LastTransitionTime: &lt,
		})
	}

	return health, nil
}

func (d *DeploymentResourcer) GetEvents(ctx context.Context, client *clients.ClientSet, request resource.GetRequest, limit uint32) ([]resource.ResourceEvent, error) {
	return NativeKindEvents(ctx, client, request, "Deployment", limit)
}

// ====================== STATEFULSET HEALTH ====================== //

func (s *StatefulSetResourcer) AssessHealth(_ context.Context, _ *clients.ClientSet, _ resource.GetRequest, data resource.Value) (*resource.ResourceHealth, error) {
	var sts appsv1.StatefulSet
	if err := decodeHealthValue(data, &sts); err != nil {
		return nil, fmt.Errorf("failed to unmarshal statefulset: %w", err)
	}

	health := &resource.ResourceHealth{Status: resource.HealthUnknown}

	desired := int32(1)
	if sts.Spec.Replicas != nil {
		desired = *sts.Spec.Replicas
	}

	if sts.Status.ReadyReplicas == desired {
		health.Status = resource.HealthHealthy
		health.Reason = "Ready"
		health.Message = fmt.Sprintf("%d/%d replicas ready", sts.Status.ReadyReplicas, desired)
	} else if sts.Status.ReadyReplicas > 0 {
		health.Status = resource.HealthDegraded
		health.Reason = "PartiallyReady"
		health.Message = fmt.Sprintf("%d/%d replicas ready", sts.Status.ReadyReplicas, desired)
	} else {
		health.Status = resource.HealthUnhealthy
		health.Reason = "NotReady"
		health.Message = fmt.Sprintf("0/%d replicas ready", desired)
	}

	for _, c := range sts.Status.Conditions {
		lt := c.LastTransitionTime.Time
		health.Conditions = append(health.Conditions, resource.HealthCondition{
			Type:               string(c.Type),
			Status:             string(c.Status),
			Reason:             c.Reason,
			Message:            c.Message,
			LastTransitionTime: &lt,
		})
	}

	return health, nil
}

func (s *StatefulSetResourcer) GetEvents(ctx context.Context, client *clients.ClientSet, request resource.GetRequest, limit uint32) ([]resource.ResourceEvent, error) {
	return NativeKindEvents(ctx, client, request, "StatefulSet", limit)
}

// ====================== DAEMONSET HEALTH ====================== //

func (d *DaemonSetResourcer) AssessHealth(_ context.Context, _ *clients.ClientSet, _ resource.GetRequest, data resource.Value) (*resource.ResourceHealth, error) {
	var ds appsv1.DaemonSet
	if err := decodeHealthValue(data, &ds); err != nil {
		return nil, fmt.Errorf("failed to unmarshal daemonset: %w", err)
	}

	health := &resource.ResourceHealth{Status: resource.HealthUnknown}

	desired := ds.Status.DesiredNumberScheduled

	if ds.Status.NumberReady == desired && desired > 0 {
		health.Status = resource.HealthHealthy
		health.Reason = "Ready"
		health.Message = fmt.Sprintf("%d/%d nodes ready", ds.Status.NumberReady, desired)
	} else if ds.Status.NumberReady > 0 {
		health.Status = resource.HealthDegraded
		health.Reason = "PartiallyReady"
		health.Message = fmt.Sprintf("%d/%d nodes ready", ds.Status.NumberReady, desired)
	} else if desired == 0 {
		health.Status = resource.HealthHealthy
		health.Reason = "NoScheduled"
		health.Message = "No nodes scheduled"
	} else {
		health.Status = resource.HealthUnhealthy
		health.Reason = "NotReady"
		health.Message = fmt.Sprintf("0/%d nodes ready", desired)
	}

	for _, c := range ds.Status.Conditions {
		lt := c.LastTransitionTime.Time
		health.Conditions = append(health.Conditions, resource.HealthCondition{
			Type:               string(c.Type),
			Status:             string(c.Status),
			Reason:             c.Reason,
			Message:            c.Message,
			LastTransitionTime: &lt,
		})
	}

	return health, nil
}

func (d *DaemonSetResourcer) GetEvents(ctx context.Context, client *clients.ClientSet, request resource.GetRequest, limit uint32) ([]resource.ResourceEvent, error) {
	return NativeKindEvents(ctx, client, request, "DaemonSet", limit)
}

func decodeHealthValue(value resource.Value, target interface{}) error {
	native, err := resource.NativeFromValue(value)
	if err != nil {
		return err
	}
	object, ok := native.(map[string]interface{})
	if !ok {
		return resource.NewError("INVALID_REQUEST", "Kubernetes health body must be an object")
	}
	return runtime.DefaultUnstructuredConverter.FromUnstructured(object, target)
}

// NativeKindEvents returns recent core events whose involved object is the
// requested resource of the given Kubernetes kind.
func NativeKindEvents(ctx context.Context, client *clients.ClientSet, request resource.GetRequest, kind string, limit uint32) ([]resource.ResourceEvent, error) {
	namespace, err := nativeRequestNamespace(request.Reference.Address.Scope)
	if err != nil {
		return nil, err
	}
	return getK8sEvents(ctx, client, namespace, nativeEventSelector(request, kind), limit)
}

func nativeEventSelector(request resource.GetRequest, kind string) string {
	selector := fmt.Sprintf("involvedObject.name=%s,involvedObject.kind=%s", request.Reference.Address.ID, kind)
	if request.Reference.Incarnation != nil {
		selector += ",involvedObject.uid=" + *request.Reference.Incarnation
	}
	return selector
}
