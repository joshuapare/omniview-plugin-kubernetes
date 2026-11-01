package resource

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"maps"
	"sort"
	"strings"

	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

const (
	nativeReadMaxPageSize            = resourcev2.MaxPageRecords
	nativeReadMaxCursorBytes         = 64 * 1024
	nativeLabelSelectorLanguage      = "kubernetes-label-selector.v1"
	nativeModelRepresentationVersion = "kubernetes.model.v1"
)

// NativeGet reads directly from the API server. The caller resolves the opaque
// resource type to a discovered GVR and supplies its catalog representation.
func NativeGet(ctx context.Context, client dynamic.Interface, gvr schema.GroupVersionResource, namespaced bool, request resourcev2.GetRequest, representation resourcev2.Representation) (resourcev2.Record, error) {
	if err := ctx.Err(); err != nil {
		return resourcev2.Record{}, err
	}
	if request.Representation != representation.ID {
		return resourcev2.Record{}, resourcev2.NewError("INVALID_REQUEST", "The requested representation does not match the discovered resource representation")
	}
	namespace, err := nativeIdentityNamespace(request.Reference.Address.Scope, namespaced)
	if err != nil {
		return resourcev2.Record{}, err
	}
	if request.Reference.Address.ID == "" {
		return resourcev2.Record{}, resourcev2.NewError("INVALID_REQUEST", "A Kubernetes resource name is required")
	}
	if request.Reference.Incarnation != nil && *request.Reference.Incarnation == "" {
		return resourcev2.Record{}, resourcev2.NewError("INVALID_REQUEST", "An incarnation must be absent or nonempty")
	}
	object, err := nativeResourceClient(client, gvr, namespaced, namespace).Get(ctx, request.Reference.Address.ID, metav1.GetOptions{})
	if err != nil {
		return resourcev2.Record{}, err
	}
	if err := ctx.Err(); err != nil {
		return resourcev2.Record{}, err
	}
	if object.GetName() != request.Reference.Address.ID {
		return resourcev2.Record{}, resourcev2.NewError("INVALID_REQUEST", "The API server returned a different resource name")
	}
	if request.Reference.Incarnation != nil && *request.Reference.Incarnation != string(object.GetUID()) {
		return resourcev2.Record{}, resourcev2.NewError("RESET_REQUIRED", "The Kubernetes resource incarnation has changed")
	}
	record, err := nativeRecord(object, request.Reference.Address, namespaced, namespace, representation)
	if err != nil {
		return resourcev2.Record{}, err
	}
	if err := resourcev2.ValidateRecord(record); err != nil {
		return resourcev2.Record{}, err
	}
	if err := ctx.Err(); err != nil {
		return resourcev2.Record{}, err
	}
	return record, nil
}

// NativeEnumerate performs at most one bounded API List per call. Its private
// cursor resumes source acquisition only; it is never a host query cursor.
// Separate namespace lists do not establish a shared point-in-time snapshot.
func NativeEnumerate(ctx context.Context, client dynamic.Interface, gvr schema.GroupVersionResource, namespaced bool, request resourcev2.EnumerateRequest, representation resourcev2.Representation) (resourcev2.SourcePage, error) {
	return nativeEnumerate(ctx, client, gvr, namespaced, request, representation, "")
}

// NativeQuery executes Kubernetes label selection without adding a second query
// engine. Selection remains inside the admitted namespace and representation.
func NativeQuery(ctx context.Context, client dynamic.Interface, gvr schema.GroupVersionResource, namespaced bool, request resourcev2.NativeQueryRequest, representation resourcev2.Representation) (resourcev2.SourcePage, error) {
	if request.Language != nativeLabelSelectorLanguage {
		return resourcev2.SourcePage{}, resourcev2.NewError("UNSUPPORTED", "The native query language is not supported")
	}
	if request.Query.Kind != "map" || len(request.Query.Map) != 1 {
		return resourcev2.SourcePage{}, resourcev2.NewError("INVALID_REQUEST", "A Kubernetes label query requires only labelSelector")
	}
	value, ok := request.Query.Map["labelSelector"]
	if !ok || value.Kind != "string" {
		return resourcev2.SourcePage{}, resourcev2.NewError("INVALID_REQUEST", "Kubernetes labelSelector must be a string")
	}
	selector, err := labels.Parse(value.String)
	if err != nil {
		return resourcev2.SourcePage{}, resourcev2.NewError("INVALID_REQUEST", "Kubernetes labelSelector is invalid")
	}
	return nativeEnumerate(ctx, client, gvr, namespaced, resourcev2.EnumerateRequest{
		Target: request.Target, PageSize: request.PageSize, Cursor: request.Cursor,
	}, representation, selector.String())
}

func nativeEnumerate(ctx context.Context, client dynamic.Interface, gvr schema.GroupVersionResource, namespaced bool, request resourcev2.EnumerateRequest, representation resourcev2.Representation, selector string) (resourcev2.SourcePage, error) {
	if err := ctx.Err(); err != nil {
		return resourcev2.SourcePage{}, err
	}
	if request.Target.Representation != representation.ID {
		return resourcev2.SourcePage{}, resourcev2.NewError("INVALID_REQUEST", "The requested representation does not match the discovered resource representation")
	}
	if request.PageSize == 0 || request.PageSize > nativeReadMaxPageSize {
		return resourcev2.SourcePage{}, resourcev2.NewError("INVALID_REQUEST", "The native source page size must be between 1 and 256")
	}
	namespaces, err := nativeQueryNamespaces(request.Target.Scope, namespaced)
	if err != nil {
		return resourcev2.SourcePage{}, err
	}
	binding, err := nativeCursorBinding(request, gvr, namespaced, namespaces, selector)
	if err != nil {
		return resourcev2.SourcePage{}, err
	}
	cursor, err := decodeNativeCursor(request.Cursor, binding, len(namespaces))
	if err != nil {
		return resourcev2.SourcePage{}, err
	}
	page := resourcev2.SourcePage{
		Records:     []resourcev2.Record{},
		Count:       resourcev2.Count{Kind: "unknown"},
		Coverage:    nativeRepresentationCoverage(representation),
		Consistency: "bestEffort",
	}
	if len(namespaces) == 0 {
		return page, nil
	}
	namespace := namespaces[cursor.Namespace]
	list, err := nativeResourceClient(client, gvr, namespaced, namespace).List(ctx, metav1.ListOptions{
		Limit:         int64(request.PageSize),
		Continue:      cursor.Continue,
		LabelSelector: selector,
	})
	if err != nil {
		return resourcev2.SourcePage{}, err
	}
	if err := ctx.Err(); err != nil {
		return resourcev2.SourcePage{}, err
	}
	if len(list.Items) > int(request.PageSize) {
		return resourcev2.SourcePage{}, resourcev2.NewError("RESOURCE_LIMIT", "The API server exceeded the requested native source page size")
	}
	address := resourcev2.ResourceAddress{
		Provider:  request.Target.Provider,
		Authority: request.Target.Authority,
		Type:      request.Target.Type,
	}
	page.Records = make([]resourcev2.Record, 0, len(list.Items))
	bodyBytes := 0
	for index := range list.Items {
		if err := ctx.Err(); err != nil {
			return resourcev2.SourcePage{}, err
		}
		record, err := nativeRecord(&list.Items[index], address, namespaced, namespace, representation)
		if err != nil {
			return resourcev2.SourcePage{}, err
		}
		size, err := resourcev2.ValueWireSize(record.Body)
		if err != nil {
			return resourcev2.SourcePage{}, err
		}
		if size > resourcev2.MaxPageBodyBytes-bodyBytes {
			return resourcev2.SourcePage{}, resourcev2.NewError("RESOURCE_LIMIT", "The native source page exceeded the resource wire body budget")
		}
		bodyBytes += size
		page.Records = append(page.Records, record)
	}
	if len(namespaces) == 1 {
		page.SourceRevision = nativeOptionalToken(list.GetResourceVersion())
	}
	continuation := list.GetContinue()
	if continuation != "" {
		if continuation == cursor.Continue {
			return resourcev2.SourcePage{}, resourcev2.NewError("RESET_REQUIRED", "The API server did not advance the native source continuation")
		}
		cursor.Continue = continuation
	} else {
		cursor.Namespace++
		cursor.Continue = ""
	}
	if cursor.Namespace < len(namespaces) {
		token, err := encodeNativeCursor(cursor)
		if err != nil {
			return resourcev2.SourcePage{}, err
		}
		page.NextCursor = &token
	}
	if err := resourcev2.ValidateSourcePage(page); err != nil {
		return resourcev2.SourcePage{}, err
	}
	if err := ctx.Err(); err != nil {
		return resourcev2.SourcePage{}, err
	}
	return page, nil
}

func nativeResourceClient(client dynamic.Interface, gvr schema.GroupVersionResource, namespaced bool, namespace string) dynamic.ResourceInterface {
	resource := client.Resource(gvr)
	if namespaced {
		return resource.Namespace(namespace)
	}
	return resource
}

func nativeIdentityNamespace(scope []resourcev2.ScopeEntry, namespaced bool) (string, error) {
	if !namespaced {
		if len(scope) != 0 {
			return "", resourcev2.NewError("INVALID_REQUEST", "Cluster-scoped Kubernetes identity must not have scope dimensions")
		}
		return "", nil
	}
	if len(scope) != 1 || scope[0].Dimension != "namespace" || scope[0].Value == "" {
		return "", resourcev2.NewError("INVALID_REQUEST", "Namespaced Kubernetes identity requires exactly one nonempty namespace dimension")
	}
	return scope[0].Value, nil
}

func nativeQueryNamespaces(scope resourcev2.QueryScope, namespaced bool) ([]string, error) {
	if !namespaced {
		if len(scope) != 0 {
			return nil, resourcev2.NewError("INVALID_REQUEST", "Cluster-scoped Kubernetes queries must not have scope dimensions")
		}
		return []string{""}, nil
	}
	if len(scope) == 0 {
		return []string{metav1.NamespaceAll}, nil
	}
	if len(scope) != 1 || scope[0].Dimension != "namespace" {
		return nil, resourcev2.NewError("INVALID_REQUEST", "Namespaced Kubernetes queries require exactly one namespace constraint")
	}
	constraint := scope[0]
	switch constraint.Match {
	case resourcev2.ScopeAny:
		if constraint.Values != nil {
			return nil, resourcev2.NewError("INVALID_REQUEST", "An any namespace constraint must not contain values")
		}
		return []string{metav1.NamespaceAll}, nil
	case resourcev2.ScopeOneOf:
		if constraint.Values == nil {
			return nil, resourcev2.NewError("INVALID_REQUEST", "A oneOf namespace constraint requires a values array")
		}
		namespaces := append([]string{}, (*constraint.Values)...)
		for _, namespace := range namespaces {
			if namespace == "" {
				return nil, resourcev2.NewError("INVALID_REQUEST", "A selected Kubernetes namespace must be nonempty")
			}
		}
		sort.Strings(namespaces)
		unique := namespaces[:0]
		for _, namespace := range namespaces {
			if len(unique) == 0 || unique[len(unique)-1] != namespace {
				unique = append(unique, namespace)
			}
		}
		return unique, nil
	default:
		return nil, resourcev2.NewError("INVALID_REQUEST", "The namespace constraint must use any or oneOf")
	}
}

func nativeRecord(object *unstructured.Unstructured, address resourcev2.ResourceAddress, namespaced bool, namespace string, representation resourcev2.Representation) (resourcev2.Record, error) {
	if object.GetName() == "" {
		return resourcev2.Record{}, resourcev2.NewError("INVALID_REQUEST", "The API server returned a resource without metadata.name")
	}
	actualNamespace := object.GetNamespace()
	if (!namespaced && actualNamespace != "") || (namespaced && (actualNamespace == "" || (namespace != metav1.NamespaceAll && namespace != actualNamespace))) {
		return resourcev2.Record{}, resourcev2.NewError("INVALID_REQUEST", "The API server returned a resource outside the requested namespace scope")
	}
	address.ID = object.GetName()
	address.Scope = []resourcev2.ScopeEntry{}
	if namespaced {
		address.Scope = []resourcev2.ScopeEntry{{Dimension: "namespace", Value: actualNamespace}}
	}
	// Copy only the two maps changed by projection, never the resource body.
	bodyObject := object.Object
	if strings.HasPrefix(representation.ID, nativeModelRepresentationVersion+"/") {
		if metadata, ok := bodyObject["metadata"].(map[string]any); ok {
			if _, present := metadata["managedFields"]; present {
				bodyObject = maps.Clone(bodyObject)
				projectedMetadata := maps.Clone(metadata)
				delete(projectedMetadata, "managedFields")
				bodyObject["metadata"] = projectedMetadata
			}
		}
	}
	body, err := resourcev2.ValueFromNative(bodyObject)
	if err != nil {
		return resourcev2.Record{}, err
	}
	return resourcev2.Record{
		Reference:      resourcev2.ResourceReference{Address: address, Incarnation: nativeOptionalToken(string(object.GetUID()))},
		Body:           body,
		Representation: representation,
		Coverage:       nativeRepresentationCoverage(representation),
		SourceRevision: nativeOptionalToken(object.GetResourceVersion()),
	}, nil
}

func nativeRepresentationCoverage(representation resourcev2.Representation) resourcev2.Coverage {
	if strings.HasPrefix(representation.ID, nativeModelRepresentationVersion+"/") {
		return resourcev2.Coverage{Kind: "partial", Paths: []string{"/metadata/managedFields"}, Reason: "Kubernetes model projection omits metadata.managedFields"}
	}
	return nativeCompleteCoverage()
}

func nativeCompleteCoverage() resourcev2.Coverage {
	return resourcev2.Coverage{Kind: "complete", Paths: []string{}}
}

func nativeOptionalToken(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

type nativeReadCursor struct {
	Version   int    `json:"version"`
	Binding   string `json:"binding"`
	Namespace int    `json:"namespace"`
	Continue  string `json:"continue"`
}

func nativeCursorBinding(request resourcev2.EnumerateRequest, gvr schema.GroupVersionResource, namespaced bool, namespaces []string, selector string) (string, error) {
	// Normalize only the adapter's namespace selection. Type and ID are opaque;
	// the caller's discovered GVR, not a parsed type, determines the API endpoint.
	target := request.Target
	if namespaced && len(target.Scope) != 0 && target.Scope[0].Match == resourcev2.ScopeOneOf {
		target.Scope = resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeOneOf, Values: &namespaces}}
	}
	encoded, err := json.Marshal(struct {
		Target     resourcev2.ReadTarget       `json:"target"`
		GVR        schema.GroupVersionResource `json:"gvr"`
		Namespaced bool                        `json:"namespaced"`
		PageSize   uint32                      `json:"pageSize"`
		Selector   string                      `json:"labelSelector"`
	}{target, gvr, namespaced, request.PageSize, selector})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

func decodeNativeCursor(token *string, binding string, namespaceCount int) (nativeReadCursor, error) {
	if token == nil {
		return nativeReadCursor{Version: 1, Binding: binding}, nil
	}
	if len(*token) == 0 || len(*token) > nativeReadMaxCursorBytes {
		return nativeReadCursor{}, resourcev2.NewError("INVALID_REQUEST", "The native source cursor has an invalid length")
	}
	var cursor nativeReadCursor
	encoded, err := base64.RawURLEncoding.DecodeString(*token)
	if err != nil || json.Unmarshal(encoded, &cursor) != nil || cursor.Version != 1 || cursor.Binding != binding || cursor.Namespace < 0 || cursor.Namespace >= namespaceCount {
		return nativeReadCursor{}, resourcev2.NewError("INVALID_REQUEST", "The native source cursor does not match the requested source")
	}
	return cursor, nil
}

func encodeNativeCursor(cursor nativeReadCursor) (string, error) {
	encoded, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(encoded)
	if len(token) > nativeReadMaxCursorBytes {
		return "", resourcev2.NewError("RESOURCE_LIMIT", "The native source cursor exceeded the adapter limit")
	}
	return token, nil
}
