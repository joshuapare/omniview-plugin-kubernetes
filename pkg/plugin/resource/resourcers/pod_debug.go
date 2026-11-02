package resourcers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"path"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/validation"
)

// debugRequest deliberately excludes arbitrary container and security fields.
type debugRequest struct {
	PodUID               string            `json:"podUID"`
	Name                 string            `json:"name"`
	Target               string            `json:"targetContainerName"`
	Image                string            `json:"image"`
	Command              []string          `json:"command"`
	Profile              string            `json:"profile"`
	ElevatedAcknowledged bool              `json:"elevatedAcknowledged"`
	ImagePullPolicy      corev1.PullPolicy `json:"imagePullPolicy"`
	Env                  map[string]string `json:"env"`
	VolumeMounts         []debugMount      `json:"volumeMounts"`
}

type debugMount struct {
	Name      string `json:"name"`
	MountPath string `json:"mountPath"`
	ReadOnly  bool   `json:"readOnly"`
}

func (p *PodResourcer) GetActions(context.Context, *clients.ClientSet) ([]resource.ActionDescriptor, error) {
	return []resource.ActionDescriptor{{
		ID: "debug-create", Label: "Debug", Description: "Add a targeted ephemeral inspection container",
		Icon: "LuBug", Scope: resource.ActionScopeInstance, Dangerous: true,
		ParamsSchema: &resource.Schema{
			Properties: map[string]resource.SchemaProperty{
				"podUID":               {Type: resource.SchemaString},
				"name":                 {Type: resource.SchemaString},
				"targetContainerName":  {Type: resource.SchemaString},
				"image":                {Type: resource.SchemaString},
				"command":              {Type: resource.SchemaArray},
				"profile":              {Type: resource.SchemaString, Enum: []string{"restricted", "netadmin", "sysadmin"}},
				"elevatedAcknowledged": {Type: resource.SchemaBoolean},
				"imagePullPolicy":      {Type: resource.SchemaString, Enum: []string{"IfNotPresent", "Always"}},
				"env":                  {Type: resource.SchemaObject},
				"volumeMounts":         {Type: resource.SchemaArray},
			},
			Required: []string{"podUID", "name", "targetContainerName", "image"},
		},
	}, podExecActionDescriptor()}, nil
}

func (p *PodResourcer) StreamAction(context.Context, *clients.ClientSet, resource.ActionRequest, chan<- resource.ActionEvent) error {
	return &resource.ResourceOperationError{Code: "UNSUPPORTED", Title: "Unsupported operation", Message: "Debug creation is not a streaming action."}
}

func (p *PodResourcer) ExecuteAction(ctx context.Context, client *clients.ClientSet, input resource.ActionRequest) (resource.Value, error) {
	if err := resource.ValidateActionRequest(input); err != nil {
		return resource.Value{}, err
	}
	switch input.Action {
	case "exec":
		return p.executeExec(ctx, client, input)
	case "debug-create":
	default:
		return resource.Value{}, resource.NewError("UNSUPPORTED", "Unknown Pod action")
	}
	if input.TypeTarget != nil || input.Reference.Address.Provider != "kubernetes" || input.Reference.Address.Type != "k8s:/pods" {
		return resource.Value{}, resource.NewError("INVALID_REQUEST", "Debug creation requires an exact native Pod reference")
	}
	namespace, err := nativeRequestNamespace(input.Reference.Address.Scope)
	if err != nil || namespace == "" {
		return resource.Value{}, invalidDebugRequest(fmt.Errorf("Pod name and namespace are required"))
	}
	if client == nil || client.KubeClient == nil {
		return resource.Value{}, resource.NewError("UNAVAILABLE", "Kubernetes client is required")
	}
	params, err := nativeActionParams(input.Input)
	if err != nil {
		return resource.Value{}, invalidDebugRequest(err)
	}
	request, entry, err := decodeDebugRequest(params)
	if err != nil {
		return resource.Value{}, invalidDebugRequest(err)
	}
	if input.Reference.Incarnation != nil && *input.Reference.Incarnation != request.PodUID {
		return resource.Value{}, invalidDebugRequest(fmt.Errorf("Pod UID does not match the reference"))
	}
	pods := client.KubeClient.CoreV1().Pods(namespace)
	for range 5 {
		pod, err := pods.Get(ctx, input.Reference.Address.ID, metav1.GetOptions{})
		if err != nil {
			return resource.Value{}, err
		}
		if string(pod.UID) != request.PodUID {
			return resource.Value{}, invalidDebugRequest(fmt.Errorf("Pod UID changed"))
		}
		for _, existing := range pod.Spec.EphemeralContainers {
			if existing.Name != entry.Name {
				continue
			}
			if !sameDebugEntry(existing, entry) {
				return resource.Value{}, invalidDebugRequest(fmt.Errorf("debug container name %q already exists with different configuration", entry.Name))
			}
			return debugActionResult(pod, entry.Name, false)
		}
		if err := validateDebugPod(pod, request); err != nil {
			return resource.Value{}, invalidDebugRequest(err)
		}
		updated := pod.DeepCopy()
		updated.Spec.EphemeralContainers = append(updated.Spec.EphemeralContainers, entry)
		accepted, err := pods.UpdateEphemeralContainers(ctx, input.Reference.Address.ID, updated, metav1.UpdateOptions{})
		if err == nil {
			return debugActionResult(accepted, entry.Name, true)
		}
		if apierrors.IsConflict(err) {
			continue
		}
		// Authoritative client errors cannot conceal an accepted mutation. A server
		// timeout (including HTTP 408) can, so it must reconcile like a network error.
		if status, ok := err.(apierrors.APIStatus); ok {
			code := status.Status().Code
			if code >= 400 && code < 500 && code != 408 {
				return resource.Value{}, err
			}
		}
		reconcileCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		observed, getErr := pods.Get(reconcileCtx, input.Reference.Address.ID, metav1.GetOptions{})
		cancel()
		if getErr == nil && string(observed.UID) == request.PodUID {
			for _, existing := range observed.Spec.EphemeralContainers {
				if existing.Name == entry.Name && sameDebugEntry(existing, entry) {
					return debugActionResult(observed, entry.Name, true)
				}
			}
		}
		return resource.Value{}, &resource.ResourceOperationError{Code: "PROVIDER_ERROR", Title: "Debug creation outcome unknown", Message: "The debug container request may have succeeded. Inspect the reserved container before retrying.", Err: err}
	}
	return resource.Value{}, &resource.ResourceOperationError{Code: "CONFLICT", Title: "Debug creation conflicted", Message: "Debug creation conflicted repeatedly; no new name was submitted."}
}

func invalidDebugRequest(err error) *resource.ResourceOperationError {
	return &resource.ResourceOperationError{Code: "INVALID_REQUEST", Title: "Cannot start debug container", Message: "The Pod debug request is invalid or no longer matches the Pod", Err: err}
}

func debugActionResult(pod *corev1.Pod, name string, created bool) (resource.Value, error) {
	data, err := runtime.DefaultUnstructuredConverter.ToUnstructured(pod)
	if err != nil {
		return resource.Value{}, &resource.ResourceOperationError{Code: "PROVIDER_ERROR", Title: "Debug result unavailable", Message: "The debug request may have succeeded, but its Pod result could not be encoded. Inspect the reserved container before retrying.", Err: err}
	}
	return resource.ValueFromNative(map[string]any{"success": true, "data": map[string]any{"pod": data, "podUID": string(pod.UID), "containerName": name, "created": created}})
}

func decodeDebugRequest(params map[string]interface{}) (debugRequest, corev1.EphemeralContainer, error) {
	var r debugRequest
	var entry corev1.EphemeralContainer
	encoded, err := json.Marshal(params)
	if err != nil {
		return r, entry, err
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&r); err != nil {
		return r, entry, fmt.Errorf("invalid debug parameters: %w", err)
	}
	var values interface{}
	if err := json.Unmarshal(encoded, &values); err != nil {
		return r, entry, err
	}
	if hasDebugNull(values) {
		return r, entry, fmt.Errorf("debug parameters cannot contain null values")
	}
	if r.PodUID == "" || r.Target == "" {
		return r, entry, fmt.Errorf("podUID and targetContainerName are required")
	}
	if len(validation.IsDNS1123Label(r.Name)) != 0 {
		return r, entry, fmt.Errorf("name must be a valid DNS label")
	}
	if strings.TrimSpace(r.Image) == "" || strings.ContainsAny(r.Image, " \t\r\n\x00") {
		return r, entry, fmt.Errorf("image must be a nonblank image reference")
	}
	if _, exists := params["command"]; !exists {
		r.Command = []string{"sh"}
	}
	if len(r.Command) == 0 || strings.TrimSpace(r.Command[0]) == "" {
		return r, entry, fmt.Errorf("command must contain an executable")
	}
	for _, arg := range r.Command {
		if strings.ContainsRune(arg, 0) {
			return r, entry, fmt.Errorf("command contains NUL")
		}
	}
	if r.Profile == "" {
		r.Profile = "restricted"
	}
	if r.Profile != "restricted" && r.Profile != "netadmin" && r.Profile != "sysadmin" {
		return r, entry, fmt.Errorf("unsupported debug profile %q", r.Profile)
	}
	if r.Profile != "restricted" && !r.ElevatedAcknowledged {
		return r, entry, fmt.Errorf("elevated profile requires explicit acknowledgment")
	}
	if r.ImagePullPolicy == "" {
		r.ImagePullPolicy = corev1.PullIfNotPresent
	}
	if r.ImagePullPolicy != corev1.PullIfNotPresent && r.ImagePullPolicy != corev1.PullAlways {
		return r, entry, fmt.Errorf("unsupported imagePullPolicy")
	}
	uid, nonRoot, no := int64(1000), true, false
	sc := &corev1.SecurityContext{RunAsUser: &uid, RunAsNonRoot: &nonRoot, AllowPrivilegeEscalation: &no, Capabilities: &corev1.Capabilities{Drop: []corev1.Capability{"ALL"}}, SeccompProfile: &corev1.SeccompProfile{Type: corev1.SeccompProfileTypeRuntimeDefault}}
	if r.Profile == "netadmin" {
		sc.Capabilities.Add = []corev1.Capability{"NET_ADMIN", "NET_RAW"}
	}
	if r.Profile == "sysadmin" {
		yes := true
		sc = &corev1.SecurityContext{Privileged: &yes}
	}
	entry = corev1.EphemeralContainer{EphemeralContainerCommon: corev1.EphemeralContainerCommon{Name: r.Name, Image: r.Image, Command: r.Command, ImagePullPolicy: r.ImagePullPolicy, Stdin: true, TTY: true, SecurityContext: sc}, TargetContainerName: r.Target}
	keys := make([]string, 0, len(r.Env))
	for name, value := range r.Env {
		if len(validation.IsEnvVarName(name)) != 0 || strings.ContainsRune(value, 0) {
			return r, entry, fmt.Errorf("invalid environment variable %q", name)
		}
		keys = append(keys, name)
	}
	sort.Strings(keys)
	for _, name := range keys {
		entry.Env = append(entry.Env, corev1.EnvVar{Name: name, Value: r.Env[name]})
	}
	paths := make(map[string]bool, len(r.VolumeMounts))
	for _, mount := range r.VolumeMounts {
		if !mount.ReadOnly || mount.Name == "" || !path.IsAbs(mount.MountPath) || path.Clean(mount.MountPath) != mount.MountPath || strings.ContainsRune(mount.MountPath, 0) || paths[mount.MountPath] {
			return r, entry, fmt.Errorf("mounts must have unique absolute paths and be explicitly read-only")
		}
		paths[mount.MountPath] = true
		entry.VolumeMounts = append(entry.VolumeMounts, corev1.VolumeMount{Name: mount.Name, MountPath: mount.MountPath, ReadOnly: true})
	}
	return r, entry, nil
}

func validateDebugPod(pod *corev1.Pod, r debugRequest) error {
	if string(pod.UID) != r.PodUID {
		return fmt.Errorf("Pod UID changed")
	}
	if pod.DeletionTimestamp != nil || pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
		return fmt.Errorf("Pod is deleting or terminal")
	}
	if _, mirror := pod.Annotations["kubernetes.io/config.mirror"]; mirror {
		return fmt.Errorf("static mirror Pods cannot be debugged")
	}
	if source := pod.Annotations["kubernetes.io/config.source"]; source != "" && source != "api" {
		return fmt.Errorf("static Pods cannot be debugged")
	}
	target := false
	for _, c := range pod.Spec.Containers {
		if c.Name == r.Name {
			return fmt.Errorf("name collides with application container")
		}
		if c.Name == r.Target {
			target = true
		}
	}
	for _, c := range pod.Spec.InitContainers {
		if c.Name == r.Name {
			return fmt.Errorf("name collides with init container")
		}
	}
	running := false
	for _, status := range pod.Status.ContainerStatuses {
		if status.Name == r.Target && status.State.Running != nil {
			running = true
		}
	}
	if !target || !running {
		return fmt.Errorf("target %q is not a running regular container", r.Target)
	}
	for _, mount := range r.VolumeMounts {
		found := false
		for _, volume := range pod.Spec.Volumes {
			if volume.Name == mount.Name {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("volume %q does not exist", mount.Name)
		}
	}
	return nil
}

func sameDebugEntry(a, b corev1.EphemeralContainer) bool {
	// Kubernetes defaults these fields on persisted entries. Normalize only
	// documented API defaults, never discard user-supplied configuration.
	if a.TerminationMessagePath == "/dev/termination-log" {
		a.TerminationMessagePath = ""
	}
	if a.TerminationMessagePolicy == corev1.TerminationMessageReadFile {
		a.TerminationMessagePolicy = ""
	}
	return reflect.DeepEqual(a, b)
}

func hasDebugNull(value interface{}) bool {
	switch v := value.(type) {
	case nil:
		return true
	case map[string]interface{}:
		for _, child := range v {
			if hasDebugNull(child) {
				return true
			}
		}
	case []interface{}:
		for _, child := range v {
			if hasDebugNull(child) {
				return true
			}
		}
	}
	return false
}
