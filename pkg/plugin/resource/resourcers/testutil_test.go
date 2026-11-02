package resourcers

import (
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"testing"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	fakedynamic "k8s.io/client-go/dynamic/fake"
)

// testGVR is a standard GVR used across tests (core/v1/pods).
var testGVR = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}

// newTestPod creates an unstructured Pod object for testing.
func newTestPod(name, namespace string) *unstructured.Unstructured {
	pod := &unstructured.Unstructured{}
	pod.SetGroupVersionKind(schema.GroupVersionKind{Group: "", Version: "v1", Kind: "Pod"})
	pod.SetName(name)
	pod.SetNamespace(namespace)
	return pod
}

// newTestPodWithLabels creates an unstructured Pod object with labels for testing.
func newTestPodWithLabels(name, namespace string, labels map[string]string) *unstructured.Unstructured {
	pod := newTestPod(name, namespace)
	pod.SetLabels(labels)
	return pod
}

// newFakeClientSet builds a ClientSet for direct native resource operations.
func newFakeClientSet(gvrToListKind map[schema.GroupVersionResource]string, objects ...runtime.Object) *clients.ClientSet {
	scheme := runtime.NewScheme()
	dynamicClient := fakedynamic.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind, objects...)

	return &clients.ClientSet{
		DynamicClient: dynamicClient,
	}
}

// defaultGVRListKinds returns the GVR-to-ListKind mapping for the standard test GVR (pods).
func defaultGVRListKinds() map[schema.GroupVersionResource]string {
	return map[schema.GroupVersionResource]string{
		testGVR: "PodList",
	}
}

func mustTestValue(t testing.TB, data []byte) resource.Value {
	t.Helper()
	value, err := resource.JSONToValue(data)
	if err != nil {
		t.Fatalf("invalid native test body: %v", err)
	}
	return value
}

func testWatchTarget() resource.ReadTarget {
	return resource.ReadTarget{Route: resource.AccessRoute{Connection: "test-route"}, Provider: "kubernetes", Authority: "host-issued-test-authority", Type: "opaque-pod-type", Representation: "native", Scope: resource.QueryScope{}}
}

func testWatchRepresentation() resource.Representation {
	return resource.Representation{ID: "native", Revision: "test-schema-revision", Schema: resource.SchemaBinding{State: "absent"}}
}

func relationshipRequest(source resource.GetRequest, targetTypes ...string) resource.RelationshipResolutionRequest {
	request := resource.RelationshipResolutionRequest{Source: source, Targets: []resource.ReadTarget{}}
	for _, targetType := range targetTypes {
		scope := resource.QueryScope{{Dimension: "namespace", Match: resource.ScopeAny}}
		switch targetType {
		case "k8s:/nodes", "k8s:/namespaces", "k8s:/persistentvolumes", "k8s:rbac.authorization.k8s.io/clusterroles", "k8s:rbac.authorization.k8s.io/clusterrolebindings":
			scope = resource.QueryScope{}
		}
		request.Targets = append(request.Targets, resource.ReadTarget{
			Route: source.Route, Provider: source.Reference.Address.Provider,
			Authority: "fixture-host-target-authority:" + targetType,
			Type:      targetType, Scope: scope, Representation: "native",
		})
	}
	return request
}
