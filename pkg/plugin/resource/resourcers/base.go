package resourcers

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"go.uber.org/zap"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/tools/cache"
)

// MetaAccessor describes native metadata used by specialized Kubernetes helpers.
type MetaAccessor interface {
	GetName() string
	GetNamespace() string
	GetLabels() map[string]string
}

// KubernetesResourcerBase holds optional native update and relationship behavior.
// Finite operations belong to the provider's shared native dispatch.
type KubernetesResourcerBase[T MetaAccessor] struct {
	sync.RWMutex
	log           *zap.SugaredLogger
	resourceType  schema.GroupVersionResource
	syncPolicy    resource.SyncPolicy
	relationships []resource.RelationshipDescriptor
}
type Option func(*baseOptions)
type baseOptions struct {
	syncPolicy    resource.SyncPolicy
	relationships []resource.RelationshipDescriptor
}

func WithSyncPolicy(p resource.SyncPolicy) Option { return func(o *baseOptions) { o.syncPolicy = p } }
func WithRelationships(r []resource.RelationshipDescriptor) Option {
	return func(o *baseOptions) { o.relationships = r }
}
func NewKubernetesResourcerBase[T MetaAccessor](logger *zap.SugaredLogger, nativeType schema.GroupVersionResource, opts ...Option) *KubernetesResourcerBase[T] {
	o := baseOptions{syncPolicy: resource.SyncOnConnect}
	for _, apply := range opts {
		apply(&o)
	}
	return &KubernetesResourcerBase[T]{log: logger.With("service", nativeType.Resource+"Service"), resourceType: nativeType, syncPolicy: o.syncPolicy, relationships: o.relationships}
}
func (s *KubernetesResourcerBase[T]) GroupVersionResource() schema.GroupVersionResource {
	return s.resourceType
}
func (s *KubernetesResourcerBase[T]) SyncPolicy() resource.SyncPolicy { return s.syncPolicy }
func (s *KubernetesResourcerBase[T]) DeclareRelationships() []resource.RelationshipDescriptor {
	return s.relationships
}

// nativeRequestNamespace accepts only the exact native namespace dimension.
// An empty scope denotes a cluster-scoped object; an explicit namespace is nonempty.
func nativeRequestNamespace(scope []resource.ScopeEntry) (string, error) {
	if len(scope) == 0 {
		return "", nil
	}
	if len(scope) != 1 || scope[0].Dimension != "namespace" || scope[0].Value == "" {
		return "", resource.NewError("INVALID_REQUEST", "Kubernetes scope must contain only one nonempty namespace dimension")
	}
	return scope[0].Value, nil
}

func extractMetadata(u *unstructured.Unstructured) resource.ResourceMetadata {
	m := resource.ResourceMetadata{Labels: u.GetLabels()}
	if t := u.GetCreationTimestamp(); !t.IsZero() {
		m.CreatedAt = &t.Time
	}
	return m
}

type watchErrorClassification struct {
	isForbidden        bool
	isNotFound         bool
	isMethodNotAllowed bool
	code               string
	message            string
}

func watchErrorCode(err error) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return "TIMEOUT"
	}
	var classified *resource.ResourceOperationError
	if errors.As(err, &classified) && classified != nil && resource.IsErrorCode(classified.Code) {
		return classified.Code
	}
	return "PROVIDER_ERROR"
}

func classifyWatchError(err error) watchErrorClassification {
	var status *k8serrors.StatusError
	if errors.As(err, &status) {
		switch status.ErrStatus.Code {
		case 403:
			return watchErrorClassification{isForbidden: true, code: "FORBIDDEN", message: "Access denied: " + status.ErrStatus.Message}
		case 401:
			return watchErrorClassification{isForbidden: true, code: "UNAUTHORIZED", message: "Authentication failed: " + status.ErrStatus.Message}
		case 404:
			return watchErrorClassification{isNotFound: true, code: "NOT_FOUND", message: "Resource type not found: " + status.ErrStatus.Message}
		case 405:
			return watchErrorClassification{isMethodNotAllowed: true, code: "UNSUPPORTED", message: "Resource does not support this method: " + status.ErrStatus.Message}
		}
	}
	return watchErrorClassification{code: watchErrorCode(err), message: err.Error()}
}

func watchStateEvent(target resource.ReadTarget, state resource.WatchState, count int, failure error) resource.WatchStateEvent {
	observed := resource.Count{Kind: "unknown"}
	if state == resource.WatchStateSynced {
		value := strconv.Itoa(count)
		observed = resource.Count{Kind: "estimate", Value: &value}
	}
	event := resource.WatchStateEvent{Route: target.Route, Type: target.Type, State: state, Count: observed, Guarantee: resource.BestEffortGuarantee}
	if failure != nil {
		classified := classifyWatchError(failure)
		event.Message = classified.message
		event.Error = &resource.ResourceOperationError{Code: classified.code, Message: classified.message}
	}
	return event
}

func watchRecord(target resource.ReadTarget, representation resource.Representation, u *unstructured.Unstructured) (resource.Record, error) {
	body, err := resource.ValueFromNative(u.Object)
	if err != nil {
		return resource.Record{}, err
	}
	address := resource.ResourceAddress{Provider: target.Provider, Authority: target.Authority, Type: target.Type, ID: u.GetName(), Scope: []resource.ScopeEntry{}}
	if namespace := u.GetNamespace(); namespace != "" {
		address.Scope = []resource.ScopeEntry{{Dimension: "namespace", Value: namespace}}
	}
	ref := resource.ResourceReference{Address: address}
	if uid := string(u.GetUID()); uid != "" {
		ref.Incarnation = &uid
	}
	record := resource.Record{Reference: ref, Body: body, Representation: representation, Coverage: resource.Coverage{Kind: "complete", Paths: []string{}}}
	if revision := u.GetResourceVersion(); revision != "" {
		record.SourceRevision = &revision
	}
	if err := resource.ValidateRecord(record); err != nil {
		return resource.Record{}, err
	}
	return record, nil
}

// makeEventHandler forwards advisory informer events. It does not claim replay,
// gap detection, or an atomic finite snapshot/update boundary.
func makeEventHandler(ctx context.Context, target resource.ReadTarget, representation resource.Representation, sink resource.WatchEventSink) cache.ResourceEventHandlerFuncs {
	emit := func(obj interface{}, kind string) {
		if ctx.Err() != nil {
			return
		}
		u, ok := obj.(*unstructured.Unstructured)
		if !ok || u == nil {
			tombstone, found := obj.(cache.DeletedFinalStateUnknown)
			if !found {
				return
			}
			u, ok = tombstone.Obj.(*unstructured.Unstructured)
			if !ok || u == nil {
				return
			}
		}
		record, err := watchRecord(target, representation, u)
		if err != nil {
			sink.OnStateChange(resource.WatchStateEvent{Route: target.Route, Type: target.Type, State: resource.WatchStateError, Count: resource.Count{Kind: "unknown"}, Error: &resource.ResourceOperationError{Code: watchErrorCode(err), Message: "native update cannot be represented"}, Guarantee: resource.BestEffortGuarantee})
			return
		}
		switch kind {
		case "add":
			sink.OnAdd(resource.WatchAddPayload{Route: target.Route, Record: record, Metadata: extractMetadata(u), Guarantee: resource.BestEffortGuarantee})
		case "update":
			sink.OnUpdate(resource.WatchUpdatePayload{Route: target.Route, Record: record, Metadata: extractMetadata(u), Guarantee: resource.BestEffortGuarantee})
		case "delete":
			sink.OnDelete(resource.WatchDeletePayload{Route: target.Route, Reference: record.Reference, LastKnown: &record, Guarantee: resource.BestEffortGuarantee})
		}
	}
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) { emit(obj, "add") },
		UpdateFunc: func(oldObj, newObj interface{}) {
			u, ok := newObj.(*unstructured.Unstructured)
			if !ok || u == nil {
				return
			}
			// Informer resyncs can replay the same version without changing the object.
			// Keep empty versions and replacement objects: neither proves a no-op.
			if old, ok := oldObj.(*unstructured.Unstructured); ok && old != nil {
				if version := u.GetResourceVersion(); version != "" &&
					version == old.GetResourceVersion() &&
					u.GetUID() == old.GetUID() &&
					u.GetName() == old.GetName() &&
					u.GetNamespace() == old.GetNamespace() &&
					u.GetAPIVersion() == old.GetAPIVersion() &&
					u.GetKind() == old.GetKind() {
					return
				}
			}
			emit(u, "update")
		},
		DeleteFunc: func(obj interface{}) { emit(obj, "delete") },
	}
}

func watchNamespaces(scope resource.QueryScope) ([]string, error) {
	if len(scope) == 0 {
		return nil, nil
	}
	if len(scope) != 1 || scope[0].Dimension != "namespace" {
		return nil, resource.NewError("INVALID_REQUEST", "unsupported Kubernetes watch scope")
	}
	constraint := scope[0]
	switch constraint.Match {
	case resource.ScopeAny:
		if constraint.Values != nil {
			return nil, resource.NewError("INVALID_REQUEST", "any namespace scope must not contain values")
		}
		return nil, nil
	case resource.ScopeOneOf:
		if constraint.Values == nil || len(*constraint.Values) == 0 {
			return nil, resource.NewError("INVALID_REQUEST", "namespace scope requires values")
		}
		seen := make(map[string]struct{}, len(*constraint.Values))
		for _, namespace := range *constraint.Values {
			if namespace == "" {
				return nil, resource.NewError("INVALID_REQUEST", "namespace must not be empty")
			}
			if _, exists := seen[namespace]; exists {
				return nil, resource.NewError("INVALID_REQUEST", "namespace scope contains duplicates")
			}
			seen[namespace] = struct{}{}
		}
		return *constraint.Values, nil
	default:
		return nil, resource.NewError("INVALID_REQUEST", "unsupported Kubernetes scope match")
	}
}

// Watch leases native sources for this consumer's lifetime. The caller supplies
// the host-issued target and the actual catalog representation, never an inferred identity.
func (s *KubernetesResourcerBase[T]) Watch(ctx context.Context, client *clients.ClientSet, target resource.ReadTarget, representation resource.Representation, sink resource.WatchEventSink) error {
	if client == nil || client.DynamicClient == nil || sink == nil {
		return fmt.Errorf("client and watch sink are required")
	}
	lifetime := client.InformerShutdown()
	ctx, stopWatch := context.WithCancel(ctx)
	defer stopWatch()
	go func() {
		select {
		case <-ctx.Done():
		case <-lifetime:
			stopWatch()
		}
	}()
	namespaces, err := watchNamespaces(target.Scope)
	if err != nil {
		return err
	}
	emitState := func(state resource.WatchState, count int, failure error) {
		sink.OnStateChange(watchStateEvent(target, state, count, failure))
	}
	probe := func(namespace string) error {
		native := client.DynamicClient.Resource(s.resourceType)
		if namespace != "" {
			_, err := native.Namespace(namespace).List(ctx, metav1.ListOptions{Limit: 1})
			return err
		}
		_, err := native.List(ctx, metav1.ListOptions{Limit: 1})
		return err
	}
	probeNamespace := ""
	if len(namespaces) != 0 {
		probeNamespace = namespaces[0]
	}
	if err := probe(probeNamespace); err != nil {
		classified := classifyWatchError(err)
		if classified.isNotFound || classified.isMethodNotAllowed || (classified.isForbidden && len(namespaces) == 0) {
			state := resource.WatchStateSkipped
			if classified.isForbidden {
				state = resource.WatchStateForbidden
			}
			emitState(state, 0, err)
			<-ctx.Done()
			return nil
		}
	}
	type activeInformer struct {
		namespace string
		lease     *clients.InformerLease
	}
	active := make([]activeInformer, 0, len(namespaces)+1)
	handler := makeEventHandler(ctx, target, representation, sink)
	// Cleanup covers cancellation, failed sync, and partial setup alike.
	defer func() {
		for _, item := range active {
			if err := item.lease.Close(); err != nil {
				s.log.Warnw("failed to retire watch source", "error", err)
			}
		}
	}()
	add := func(namespace string) error {
		lease, err := client.AcquireInformer(ctx, namespace, s.resourceType, handler)
		if err != nil {
			return err
		}
		active = append(active, activeInformer{namespace: namespace, lease: lease})
		return nil
	}
	if len(namespaces) == 0 {
		if err := add(""); err != nil {
			return fmt.Errorf("failed to add event handler: %w", err)
		}
	} else {
		for _, namespace := range namespaces {
			if err := add(namespace); err != nil {
				s.log.Warnw("failed to add namespace handler", "namespace", namespace, "error", err)
			}
		}
	}
	if len(active) == 0 {
		emitState(resource.WatchStateForbidden, 0, fmt.Errorf("no accessible namespaces"))
		<-ctx.Done()
		return nil
	}
	emitState(resource.WatchStateSyncing, 0, nil)
	syncCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	synced := 0
	count := 0
	var lastErr error
	transientFailure := false
	for index := range active {
		item := &active[index]
		if !cache.WaitForCacheSync(syncCtx.Done(), item.lease.HasSynced) {
			if ctx.Err() != nil {
				return nil
			}
			lastErr = probe(item.namespace)
			if lastErr == nil {
				lastErr = fmt.Errorf("cache sync timed out: %w", context.DeadlineExceeded)
			}
			classified := classifyWatchError(lastErr)
			if len(namespaces) == 0 {
				state := resource.WatchStateError
				if classified.isForbidden {
					state = resource.WatchStateForbidden
				} else if classified.isNotFound || classified.isMethodNotAllowed {
					state = resource.WatchStateSkipped
				}
				emitState(state, 0, lastErr)
				if state != resource.WatchStateError {
					<-ctx.Done()
					return nil
				}
				return lastErr
			}
			if err := item.lease.Close(); err != nil {
				s.log.Warnw("failed to retire unsynced watch source", "error", err)
			}
			if !classified.isForbidden && !classified.isNotFound && !classified.isMethodNotAllowed {
				transientFailure = true
			}
			continue
		}
		synced++
		items := item.lease.Informer.GetStore().List()
		count += len(items)
		for _, object := range items {
			handler.OnAdd(object, true)
		}
	}
	if synced == 0 {
		state := resource.WatchStateForbidden
		if transientFailure {
			state = resource.WatchStateError
		}
		emitState(state, 0, lastErr)
		if transientFailure {
			return lastErr
		}
		<-ctx.Done()
		return nil
	}
	emitState(resource.WatchStateSynced, count, nil)
	<-ctx.Done()
	return nil
}
