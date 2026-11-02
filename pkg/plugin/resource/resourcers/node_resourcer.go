package resourcers

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	policyv1 "k8s.io/api/policy/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	k8stypes "k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/kubernetes"
)

// NodeResourcer wraps KubernetesResourcerBase for CRUD and adds node-specific
// actions: cordon, uncordon, drain, add-taint, remove-taint, get-conditions.
type NodeResourcer struct {
	// Embed base for all CRUD operations (uses MetaAccessor which corev1.Node satisfies).
	*KubernetesResourcerBase[MetaAccessor]
	log *zap.SugaredLogger
}

// NewNodeResourcer creates a NodeResourcer for core::v1::Node.
func NewNodeResourcer(logger *zap.SugaredLogger, opts ...Option) *NodeResourcer {
	base := NewKubernetesResourcerBase[MetaAccessor](
		logger,
		corev1.SchemeGroupVersion.WithResource("nodes"),
		opts...,
	)
	return &NodeResourcer{
		KubernetesResourcerBase: base,
		log:                     logger.Named("NodeResourcer"),
	}
}

// ResolveRelationships resolves runtime relationship instances for a Node.
func (n *NodeResourcer) ResolveRelationships(
	ctx context.Context,
	client *clients.ClientSet,
	request resource.RelationshipResolutionRequest,
) ([]resource.ResolvedRelationship, error) {
	source := request.Source
	id := source.Reference.Address.ID
	if _, err := nativeRequestNamespace(source.Reference.Address.Scope); err != nil {
		return nil, err
	}
	podList, err := client.KubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		FieldSelector: fields.SelectorFromSet(fields.Set{"spec.nodeName": id}).String(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pods on node %s: %w", id, err)
	}

	if len(podList.Items) == 0 {
		return nil, nil
	}

	targets := make([]resource.RelationshipTarget, 0, len(podList.Items))
	for _, pod := range podList.Items {
		target, err := makeRef(request, "k8s:/pods", pod.Name, pod.Namespace, string(pod.UID))
		if err != nil {
			return nil, err
		}
		targets = append(targets, target)
	}

	byTarget := descriptorByTarget(n.DeclareRelationships())
	desc, ok := byTarget["k8s:/pods"]
	if !ok {
		return nil, fmt.Errorf("missing relationship descriptor for k8s:/pods")
	}

	return []resource.ResolvedRelationship{
		{
			Descriptor: desc,
			Targets:    targets,
		},
	}, nil
}

// ====================== ACTION INTERFACE ====================== //

func (n *NodeResourcer) GetActions(
	_ context.Context,
	_ *clients.ClientSet,
) ([]resource.ActionDescriptor, error) {
	return []resource.ActionDescriptor{
		{
			ID:          "cordon",
			Label:       "Cordon Node",
			Description: "Mark the node as unschedulable",
			Icon:        "LuShieldBan",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:          "uncordon",
			Label:       "Uncordon Node",
			Description: "Mark the node as schedulable",
			Icon:        "LuShieldCheck",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:          "drain",
			Label:       "Drain Node",
			Description: "Safely evict all pods from the node",
			Icon:        "LuArrowDownToLine",
			Scope:       resource.ActionScopeInstance,
			Dangerous:   true,
			ParamsSchema: &resource.Schema{
				Properties: map[string]resource.SchemaProperty{
					"gracePeriodSeconds": {Type: resource.SchemaInteger, Description: "Seconds to wait for graceful termination (handler default 30); -1 uses each pod's native termination grace period"},
					"ignoreDaemonSets":   {Type: resource.SchemaBoolean, Description: "Ignore DaemonSet-managed pods (handler default true)"},
					"deleteEmptyDirData": {Type: resource.SchemaBoolean, Description: "Delete pods using emptyDir volumes (handler default true)"},
					"force":              {Type: resource.SchemaBoolean, Description: "Force-delete pods that fail eviction (handler default false)"},
				},
			},
		},
		{
			ID:          "add-taint",
			Label:       "Add Taint",
			Description: "Add a taint to the node",
			Icon:        "LuTag",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{
				Properties: map[string]resource.SchemaProperty{
					"key":    {Type: resource.SchemaString, Description: "Taint key"},
					"value":  {Type: resource.SchemaString, Description: "Taint value"},
					"effect": {Type: resource.SchemaString, Enum: []string{"NoSchedule", "PreferNoSchedule", "NoExecute"}, Description: "Taint effect"},
				},
				Required: []string{"key", "effect"},
			},
		},
		{
			ID:          "remove-taint",
			Label:       "Remove Taint",
			Description: "Remove a taint from the node",
			Icon:        "LuTagX",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{
				Properties: map[string]resource.SchemaProperty{
					"key":    {Type: resource.SchemaString, Description: "Taint key to remove"},
					"effect": {Type: resource.SchemaString, Enum: []string{"NoSchedule", "PreferNoSchedule", "NoExecute"}, Description: "Taint effect to match (optional)"},
				},
				Required: []string{"key"},
			},
		},
		{
			ID:          "get-conditions",
			Label:       "Get Conditions",
			Description: "Get node status conditions",
			Icon:        "LuHeartPulse",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
	}, nil
}

func (n *NodeResourcer) ExecuteAction(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	if _, err := nativeRequestNamespace(input.Reference.Address.Scope); err != nil {
		return resource.Value{}, err
	}
	switch input.Action {
	case "cordon":
		return n.executeCordon(ctx, client, input, true)
	case "uncordon":
		return n.executeCordon(ctx, client, input, false)
	case "drain":
		return n.executeDrain(ctx, client, input)
	case "add-taint":
		return n.executeAddTaint(ctx, client, input)
	case "remove-taint":
		return n.executeRemoveTaint(ctx, client, input)
	case "get-conditions":
		return n.executeGetConditions(ctx, client, input)
	default:
		return resource.Value{}, fmt.Errorf("unknown action: %s", input.Action)
	}
}

func (n *NodeResourcer) StreamAction(
	_ context.Context,
	_ *clients.ClientSet,
	_ resource.ActionRequest,
	_ chan<- resource.ActionEvent,
) error {
	return &resource.ResourceOperationError{Code: "UNSUPPORTED", Title: "Unsupported operation", Message: "Streaming actions are not supported for this resource."}
}

// ====================== ACTION IMPLEMENTATIONS ====================== //

// executeCordon patches spec.unschedulable on the node.
func (n *NodeResourcer) executeCordon(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
	unschedulable bool,
) (resource.Value, error) {
	patch := fmt.Sprintf(`{"spec":{"unschedulable":%t}}`, unschedulable)
	_, err := client.KubeClient.CoreV1().Nodes().Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to patch node %s: %w", input.Reference.Address.ID, err)
	}

	verb := "cordoned"
	if !unschedulable {
		verb = "uncordoned"
	}
	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Node %s %s", input.Reference.Address.ID, verb),
	})
}

// executeDrain cordons the node, then evicts all non-DaemonSet, non-mirror pods.
func (n *NodeResourcer) executeDrain(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, paramsErr := nativeActionParams(input.Input)
	if paramsErr != nil {
		return resource.Value{}, paramsErr
	}
	// Parse optional params.
	gracePeriod := int64(30)
	if v, ok := params["gracePeriodSeconds"]; ok {
		var err error
		gracePeriod, err = nativeActionInteger(v, -1, math.MaxInt64)
		if err != nil {
			return resource.Value{}, fmt.Errorf("gracePeriodSeconds: %w", err)
		}
	}
	// Kubernetes uses each pod's terminationGracePeriodSeconds when this option
	// is absent. Only -1 selects that behavior; other negatives remain invalid.
	var nativeGracePeriod *int64
	if gracePeriod != -1 {
		nativeGracePeriod = &gracePeriod
	}
	ignoreDaemonSets := true
	if v, ok := params["ignoreDaemonSets"].(bool); ok {
		ignoreDaemonSets = v
	}
	deleteEmptyDirData := true
	if v, ok := params["deleteEmptyDirData"].(bool); ok {
		deleteEmptyDirData = v
	}
	force, _ := params["force"].(bool)

	// Step 1: Cordon the node.
	cordonPatch := `{"spec":{"unschedulable":true}}`
	_, err := client.KubeClient.CoreV1().Nodes().Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, cordonPatch), metav1.PatchOptions{},
	)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to cordon node %s: %w", input.Reference.Address.ID, err)
	}

	// Step 2: List pods on this node.
	podList, err := client.KubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		FieldSelector: fields.SelectorFromSet(fields.Set{"spec.nodeName": input.Reference.Address.ID}).String(),
	})
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to list pods on node %s: %w", input.Reference.Address.ID, err)
	}

	// Step 3: Evict pods, skipping DaemonSet-managed and mirror pods.
	var evictErrors []any
	evicted := 0
	for i := range podList.Items {
		pod := &podList.Items[i]

		// Skip mirror pods (static pods).
		if _, isMirror := pod.Annotations[corev1.MirrorPodAnnotationKey]; isMirror {
			continue
		}

		// Skip DaemonSet pods if requested.
		if ignoreDaemonSets && isDaemonSetPod(pod) {
			continue
		}

		// Skip pods in Succeeded or Failed phase — they're already done.
		if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			continue
		}

		// Evict the pod.
		eviction := &policyv1.Eviction{
			ObjectMeta: metav1.ObjectMeta{
				Name:      pod.Name,
				Namespace: pod.Namespace,
			},
			DeleteOptions: &metav1.DeleteOptions{
				GracePeriodSeconds: nativeGracePeriod,
				Preconditions:      nativePodUIDPreconditions(pod),
			},
		}
		if err := client.KubeClient.PolicyV1().Evictions(pod.Namespace).Evict(ctx, eviction); err != nil {
			if force {
				// Force-delete the pod.
				zero := int64(0)
				if delErr := client.KubeClient.CoreV1().Pods(pod.Namespace).Delete(ctx, pod.Name, metav1.DeleteOptions{
					GracePeriodSeconds: &zero,
					Preconditions:      nativePodUIDPreconditions(pod),
				}); delErr != nil {
					evictErrors = append(evictErrors, fmt.Sprintf("%s/%s: force-delete failed: %v", pod.Namespace, pod.Name, delErr))
					continue
				}
			} else {
				evictErrors = append(evictErrors, fmt.Sprintf("%s/%s: %v", pod.Namespace, pod.Name, err))
				continue
			}
		}
		evicted++
	}

	_ = deleteEmptyDirData // used by kubectl drain for filtering — we evict all non-DS pods

	msg := fmt.Sprintf("Node %s drained: %d pods evicted", input.Reference.Address.ID, evicted)
	if len(evictErrors) > 0 {
		msg += fmt.Sprintf(", %d failed", len(evictErrors))
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": len(evictErrors) == 0,
		"message": msg,
		"data": map[string]interface{}{
			"evicted": evicted,
			"errors":  evictErrors,
		},
	})
}

// isDaemonSetPod checks if a pod is managed by a DaemonSet.
func isDaemonSetPod(pod *corev1.Pod) bool {
	for _, ref := range pod.OwnerReferences {
		if ref.Kind == "DaemonSet" {
			return true
		}
	}
	return false
}

// executeAddTaint appends a taint to the node's spec.taints.
func (n *NodeResourcer) executeAddTaint(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, paramsErr := nativeActionParams(input.Input)
	if paramsErr != nil {
		return resource.Value{}, paramsErr
	}
	key, _ := params["key"].(string)
	value, _ := params["value"].(string)
	effect, _ := params["effect"].(string)

	if key == "" {
		return resource.Value{}, fmt.Errorf("taint key is required")
	}
	if effect == "" {
		return resource.Value{}, fmt.Errorf("taint effect is required (NoSchedule, PreferNoSchedule, NoExecute)")
	}

	// Get the current node to read existing taints.
	node, err := client.KubeClient.CoreV1().Nodes().Get(ctx, input.Reference.Address.ID, metav1.GetOptions{})
	if err == nil {
		if err := nativeActionObjectMatches(input, node); err != nil {
			return resource.Value{}, err
		}
	}
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get node %s: %w", input.Reference.Address.ID, err)
	}

	// Check for duplicate.
	for _, t := range node.Spec.Taints {
		if t.Key == key && string(t.Effect) == effect {
			return resource.ValueFromNative(map[string]interface{}{
				"success": true,
				"message": fmt.Sprintf("Taint %s:%s already exists on node %s", key, effect, input.Reference.Address.ID),
			})
		}
	}

	newTaint := corev1.Taint{
		Key:    key,
		Value:  value,
		Effect: corev1.TaintEffect(effect),
	}
	node.Spec.Taints = append(node.Spec.Taints, newTaint)

	taintsJSON, err := json.Marshal(node.Spec.Taints)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to marshal taints: %w", err)
	}

	patch := fmt.Sprintf(`{"spec":{"taints":%s}}`, taintsJSON)
	_, err = client.KubeClient.CoreV1().Nodes().Patch(
		ctx, input.Reference.Address.ID, k8stypes.StrategicMergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to add taint to node %s: %w", input.Reference.Address.ID, err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Taint %s=%s:%s added to node %s", key, value, effect, input.Reference.Address.ID),
	})
}

// executeRemoveTaint removes a taint matching key+effect from the node.
func (n *NodeResourcer) executeRemoveTaint(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, paramsErr := nativeActionParams(input.Input)
	if paramsErr != nil {
		return resource.Value{}, paramsErr
	}
	key, _ := params["key"].(string)
	effect, _ := params["effect"].(string)

	if key == "" {
		return resource.Value{}, fmt.Errorf("taint key is required")
	}

	node, err := client.KubeClient.CoreV1().Nodes().Get(ctx, input.Reference.Address.ID, metav1.GetOptions{})
	if err == nil {
		if err := nativeActionObjectMatches(input, node); err != nil {
			return resource.Value{}, err
		}
	}
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get node %s: %w", input.Reference.Address.ID, err)
	}

	filtered := make([]corev1.Taint, 0, len(node.Spec.Taints))
	removed := false
	for _, t := range node.Spec.Taints {
		if t.Key == key && (effect == "" || string(t.Effect) == effect) {
			removed = true
			continue
		}
		filtered = append(filtered, t)
	}

	if !removed {
		return resource.ValueFromNative(map[string]interface{}{
			"success": true,
			"message": fmt.Sprintf("Taint %s not found on node %s", key, input.Reference.Address.ID),
		})
	}

	taintsJSON, err := json.Marshal(filtered)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to marshal taints: %w", err)
	}

	// Use MergePatch (not strategic merge) so that the full taints array is replaced.
	patch := fmt.Sprintf(`{"spec":{"taints":%s}}`, taintsJSON)
	_, err = client.KubeClient.CoreV1().Nodes().Patch(
		ctx, input.Reference.Address.ID, k8stypes.MergePatchType,
		nativeActionPatch(input, patch), metav1.PatchOptions{},
	)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to remove taint from node %s: %w", input.Reference.Address.ID, err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Taint %s removed from node %s", key, input.Reference.Address.ID),
	})
}

// executeGetConditions returns the node's status conditions in a structured format.
func (n *NodeResourcer) executeGetConditions(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	node, err := client.KubeClient.CoreV1().Nodes().Get(ctx, input.Reference.Address.ID, metav1.GetOptions{})
	if err == nil {
		if err := nativeActionObjectMatches(input, node); err != nil {
			return resource.Value{}, err
		}
	}
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get node %s: %w", input.Reference.Address.ID, err)
	}

	conditions := make([]interface{}, 0, len(node.Status.Conditions))
	for _, c := range node.Status.Conditions {
		conditions = append(conditions, map[string]interface{}{
			"type":               string(c.Type),
			"status":             string(c.Status),
			"reason":             c.Reason,
			"message":            c.Message,
			"lastHeartbeatTime":  c.LastHeartbeatTime.Format(time.RFC3339),
			"lastTransitionTime": c.LastTransitionTime.Format(time.RFC3339),
		})
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"conditions": conditions,
		},
	})
}

// WaitForPodRunning polls until the pod is in Running phase or timeout.
// Used by the node shell handler for debug pod readiness.
func WaitForPodRunning(ctx context.Context, client kubernetes.Interface, namespace, name string, timeout time.Duration) error {
	return wait.PollUntilContextTimeout(ctx, 2*time.Second, timeout, true, func(ctx context.Context) (bool, error) {
		pod, err := client.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return false, nil
		}
		return pod.Status.Phase == corev1.PodRunning, nil
	})
}

// nativeActionParams decodes canonical values without losing integer intent.
func nativeActionParams(value resource.Value) (map[string]any, error) {
	native, err := resource.NativeFromValue(value)
	if err != nil {
		return nil, err
	}
	if native == nil {
		return nil, nil
	}
	params, ok := native.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("action input must be an object")
	}
	return params, nil
}

func nativeActionInteger(value any, minimum, maximum int64) (int64, error) {
	var number int64
	switch v := value.(type) {
	case int64:
		number = v
	case uint64:
		if v > uint64(maximum) {
			return 0, fmt.Errorf("integer exceeds native range")
		}
		number = int64(v)
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) || math.Trunc(v) != v || v < float64(minimum) || v >= 9223372036854775808.0 {
			return 0, fmt.Errorf("expected an integer in native range")
		}
		number = int64(v)
	default:
		return 0, fmt.Errorf("expected an integer")
	}
	if number < minimum || number > maximum {
		return 0, fmt.Errorf("integer exceeds native range")
	}
	return number, nil
}

// nativeActionEventValue encodes internally constructed event payloads.
func nativeActionEventValue(payload any) (*resource.Value, error) {
	value, err := resource.ValueFromNative(payload)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

// nativeActionPatch pins native mutations to the requested incarnation.
func nativeActionPatch(request resource.ActionRequest, patch string) []byte {
	if request.Reference.Incarnation == nil {
		return []byte(patch)
	}
	uid, _ := json.Marshal(*request.Reference.Incarnation)
	return []byte("{\"metadata\":{\"uid\":" + string(uid) + "}," + patch[1:])
}

func nativeActionObjectMatches(request resource.ActionRequest, object metav1.Object) error {
	if request.Reference.Incarnation != nil && string(object.GetUID()) != *request.Reference.Incarnation {
		return resource.NewError("CONFLICT", "resource incarnation changed")
	}
	return nil
}

func nativePodUIDPreconditions(pod *corev1.Pod) *metav1.Preconditions {
	if pod.UID == "" {
		return nil
	}
	uid := pod.UID
	return &metav1.Preconditions{UID: &uid}
}
