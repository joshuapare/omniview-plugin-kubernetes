package resource

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/kubernetes"
)

// nativeType is an adapter-owned dispatch binding. The public type token is
// looked up verbatim; callers never parse it to reconstruct a Kubernetes GVR.
type nativeType struct {
	GVR          schema.GroupVersionResource
	API          metav1.APIResource
	Descriptor   resourcev2.ResourceType
	Served       map[string]nativeServedType
	Actions      []resourcev2.ActionDescriptor
	Subresources map[string]metav1.APIResource
}

type nativeServedType struct {
	GVR schema.GroupVersionResource
	API metav1.APIResource
}

// discoverNativeTypes retains snapshot-only and create-only APIs. Discovery
// verbs describe native operations, not an authorization grant for a principal.
func discoverNativeTypes(ctx context.Context, client discovery.DiscoveryInterface) (map[string]nativeType, resourcev2.Coverage, error) {
	if err := ctx.Err(); err != nil {
		return nil, resourcev2.Coverage{}, err
	}
	groups, lists, discoveryErr := discoverNativeResources(ctx, client)
	if err := ctx.Err(); err != nil {
		return nil, resourcev2.Coverage{}, err
	}
	coverage := resourcev2.Coverage{Kind: "complete", Paths: []string{}}
	if discoveryErr != nil {
		var failed *discovery.ErrGroupDiscoveryFailed
		if errors.As(discoveryErr, &failed) {
			for _, cause := range failed.Groups {
				if k8serrors.IsForbidden(cause) || k8serrors.IsUnauthorized(cause) {
					return nil, resourcev2.Coverage{}, cause
				}
			}
		}
		if k8serrors.IsForbidden(discoveryErr) || k8serrors.IsUnauthorized(discoveryErr) {
			return nil, resourcev2.Coverage{}, discoveryErr
		}
		if len(lists) == 0 {
			return nil, resourcev2.Coverage{}, discoveryErr
		}
		coverage.Kind = "partial"
		coverage.Reason = "Some Kubernetes API groups could not be discovered"
	}

	preferred := map[string]string{"": "v1"}
	for _, group := range groups {
		if group != nil && group.PreferredVersion.Version != "" {
			preferred[group.Name] = group.PreferredVersion.Version
		}
	}
	result := make(map[string]nativeType)
	for _, list := range lists {
		if list == nil {
			continue
		}
		gv, err := schema.ParseGroupVersion(list.GroupVersion)
		if err != nil {
			return nil, resourcev2.Coverage{}, fmt.Errorf("invalid discovered Kubernetes group/version: %w", err)
		}
		for _, api := range list.APIResources {
			if err := ctx.Err(); err != nil {
				return nil, resourcev2.Coverage{}, err
			}
			// Logs, exec and other subresources keep their own native services.
			if strings.Contains(api.Name, "/") {
				continue
			}
			if api.Name == "" || api.Kind == "" {
				return nil, resourcev2.Coverage{}, fmt.Errorf("discovery returned an unnamed Kubernetes resource")
			}
			gvr := gv.WithResource(api.Name)
			token := "k8s:" + gv.Group + "/" + api.Name
			served := map[string]nativeServedType{gv.String(): {GVR: gvr, API: api}}
			if prior, exists := result[token]; exists {
				if _, duplicate := prior.Served[gv.String()]; duplicate {
					return nil, resourcev2.Coverage{}, fmt.Errorf("duplicate discovered Kubernetes resource %q", token)
				}
				if prior.API.Namespaced != api.Namespaced {
					return nil, resourcev2.Coverage{}, fmt.Errorf("inconsistent native identity dimensions for %q", token)
				}
				served = prior.Served
				served[gv.String()] = nativeServedType{GVR: gvr, API: api}
				// Native preferred served version selects representation, not
				// logical identity. Partial discovery falls back deterministically
				// without claiming the chosen version is newer.
				if prior.GVR.Version == preferred[gv.Group] || (gv.Version != preferred[gv.Group] && prior.GVR.Version < gv.Version) {
					prior.Served = served
					result[token] = prior
					continue
				}
			}
			dimensions := []resourcev2.Dimension{}
			scope := resourcev2.QueryScope{}
			if api.Namespaced {
				dimensions = append(dimensions, resourcev2.Dimension{Name: "namespace", AllowEmpty: false})
				scope = append(scope, resourcev2.ScopeConstraint{Dimension: "namespace", Match: resourcev2.ScopeAny})
			}
			capabilities := []resourcev2.Capability{}
			if verbSliceContains(api.Verbs, "get") {
				capabilities = append(capabilities, resourcev2.Capability{Operation: resourcev2.OperationGet, Scope: scope})
			}
			if verbSliceContains(api.Verbs, "list") {
				capabilities = append(capabilities, resourcev2.Capability{Operation: resourcev2.OperationEnumerate, Scope: scope})
				capabilities = append(capabilities, resourcev2.Capability{Operation: resourcev2.OperationNativeQuery, Scope: scope})
			}
			for _, mutation := range []struct {
				verb      string
				operation resourcev2.Operation
			}{{"create", resourcev2.OperationCreate}, {"update", resourcev2.OperationMutationUpdate}, {"delete", resourcev2.OperationDelete}} {
				if verbSliceContains(api.Verbs, mutation.verb) {
					capabilities = append(capabilities, resourcev2.Capability{Operation: mutation.operation, Scope: scope})
				}
			}
			result[token] = nativeType{
				GVR:    gvr,
				API:    api,
				Served: served,
				Descriptor: resourcev2.ResourceType{
					Type:               token,
					DisplayName:        api.Kind,
					IdentityDimensions: dimensions,
					QueryDimensions:    dimensions,
					Representations:    []resourcev2.Representation{},
					Capabilities:       capabilities,
				},
			}
			if verbSliceContains(api.Verbs, "list") {
				binding := result[token]
				binding.Descriptor.NativeQueries = []resourcev2.NativeQueryDescriptor{{
					Language:    nativeLabelSelectorLanguage,
					Description: "Select resources using native Kubernetes label selectors within the admitted scope; returns one bounded source page",
					InputSchema: resourcev2.Schema{
						Properties: map[string]resourcev2.SchemaProperty{"labelSelector": {
							Type: resourcev2.SchemaString, Description: "Kubernetes label selector; an empty string selects all labels within the admitted scope",
						}},
						Required: []string{"labelSelector"},
					},
				}}
				result[token] = binding
			}
		}
	}
	for token, binding := range result {
		binding.Subresources = make(map[string]metav1.APIResource)
		for _, list := range lists {
			if list == nil || list.GroupVersion != binding.GVR.GroupVersion().String() {
				continue
			}
			for _, api := range list.APIResources {
				if strings.HasPrefix(api.Name, binding.GVR.Resource+"/") {
					binding.Subresources[strings.TrimPrefix(api.Name, binding.GVR.Resource+"/")] = api
				}
			}
		}
		result[token] = binding
	}
	return result, coverage, nil
}

func sortedNativeTypes(bindings map[string]nativeType) []resourcev2.ResourceType {
	tokens := make([]string, 0, len(bindings))
	for token := range bindings {
		tokens = append(tokens, token)
	}
	sort.Strings(tokens)
	types := make([]resourcev2.ResourceType, 0, len(tokens))
	for _, token := range tokens {
		types = append(types, bindings[token].Descriptor)
	}
	return types
}

// nativeClusterIdentity supplies a backing-identity hint, not a host authority.
// A route without permission to observe the native UID remains unknown.
func nativeClusterIdentity(ctx context.Context, client kubernetes.Interface) (*string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	namespace, err := client.CoreV1().Namespaces().Get(ctx, "kube-system", metav1.GetOptions{})
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err != nil || namespace.UID == "" {
		return nil, nil
	}
	identity := string(namespace.UID)
	return &identity, nil
}

func verbSliceContains(verbs []string, target string) bool {
	for _, verb := range verbs {
		if verb == target {
			return true
		}
	}
	return false
}
