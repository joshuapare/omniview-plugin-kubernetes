package resourcers

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
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
	relationships []resource.RelationshipDescriptor
}
type Option func(*baseOptions)
type baseOptions struct {
	relationships []resource.RelationshipDescriptor
}

func WithRelationships(r []resource.RelationshipDescriptor) Option {
	return func(o *baseOptions) { o.relationships = r }
}
func NewKubernetesResourcerBase[T MetaAccessor](logger *zap.SugaredLogger, nativeType schema.GroupVersionResource, opts ...Option) *KubernetesResourcerBase[T] {
	o := baseOptions{}
	for _, apply := range opts {
		apply(&o)
	}
	return &KubernetesResourcerBase[T]{log: logger.With("service", nativeType.Resource+"Service"), resourceType: nativeType, relationships: o.relationships}
}
func (s *KubernetesResourcerBase[T]) GroupVersionResource() schema.GroupVersionResource {
	return s.resourceType
}
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

func classifyWatchError(err error) watchErrorClassification {
	var status *k8serrors.StatusError
	if errors.As(err, &status) {
		switch status.ErrStatus.Code {
		case 403:
			return watchErrorClassification{isForbidden: true, code: "FORBIDDEN", message: "Access denied"}
		case 401:
			return watchErrorClassification{isForbidden: true, code: "UNAUTHORIZED", message: "Authentication failed"}
		case 404:
			return watchErrorClassification{isNotFound: true, code: "NOT_FOUND", message: "Resource type not found"}
		case 405:
			return watchErrorClassification{isMethodNotAllowed: true, code: "UNSUPPORTED", message: "Resource does not support this method"}
		}
	}
	return watchErrorClassification{code: "UNKNOWN", message: err.Error()}
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

const sourceQueueCapacity = 4096

type sourceEvent struct {
	kind   string
	object *unstructured.Unstructured
}

func makeSourceHandler(ctx context.Context, events chan<- sourceEvent, overflow *atomic.Bool) cache.ResourceEventHandlerFuncs {
	enqueue := func(obj interface{}, kind string) {
		if ctx.Err() != nil || overflow.Load() {
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
		select {
		case events <- sourceEvent{kind: kind, object: u}:
		default:
			overflow.Store(true)
		}
	}
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) { enqueue(obj, "add") },
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
			enqueue(u, "update")
		},
		DeleteFunc: func(obj interface{}) { enqueue(obj, "delete") },
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

// Source leases informer handlers for one source session.
func (s *KubernetesResourcerBase[T]) Source(ctx context.Context, client *clients.ClientSet, request resource.SourceRequest, emit resource.SourceEmitter) error {
	if client == nil || client.DynamicClient == nil || emit == nil {
		return fmt.Errorf("client and source emitter are required")
	}
	lifetime := client.InformerShutdown()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		select {
		case <-ctx.Done():
		case <-lifetime:
			cancel()
		}
	}()
	namespaces, err := watchNamespaces(request.Target.Scope)
	if err != nil {
		return err
	}
	if len(namespaces) == 0 {
		namespaces = []string{""}
	}
	events := make(chan sourceEvent, sourceQueueCapacity)
	var overflow atomic.Bool
	handler := makeSourceHandler(ctx, events, &overflow)
	leases := make([]*clients.InformerLease, 0, len(namespaces))
	defer func() {
		for _, lease := range leases {
			if err := lease.Close(); err != nil {
				s.log.Warnw("failed to retire watch source", "error", err)
			}
		}
	}()
	for _, namespace := range namespaces {
		native := client.DynamicClient.Resource(s.resourceType)
		if namespace == "" {
			_, err = native.List(ctx, metav1.ListOptions{Limit: 1})
		} else {
			_, err = native.Namespace(namespace).List(ctx, metav1.ListOptions{Limit: 1})
		}
		if err != nil {
			classified := classifyWatchError(err)
			if classified.isForbidden || classified.isNotFound || classified.isMethodNotAllowed {
				return resource.NewError(classified.code, classified.message)
			}
			return err
		}
		lease, err := client.AcquireInformer(ctx, namespace, s.resourceType, handler)
		if err != nil {
			return err
		}
		leases = append(leases, lease)
	}
	syncCtx, stopSync := context.WithTimeout(ctx, 30*time.Second)
	defer stopSync()
	for _, lease := range leases {
		if !cache.WaitForCacheSync(syncCtx.Done(), lease.HasSynced) {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return resource.NewError("UNAVAILABLE", "informer cache sync timed out")
		}
	}
	reset := func() error {
		return emit.Reset(ctx, resource.SourceResetOverflow, "informer event queue exceeded 4096 items")
	}
	if overflow.Load() {
		return reset()
	}
	staging := make(map[string]*unstructured.Unstructured)
	for n := len(events); n > 0; n-- {
		event := <-events
		key := event.object.GetNamespace() + "/" + event.object.GetName()
		if event.kind == "delete" {
			delete(staging, key)
		} else {
			staging[key] = event.object
		}
	}
	observation := func(u *unstructured.Unstructured) (resource.SourceObservation, error) {
		record, err := watchRecord(request.Target, request.Representation, u)
		if err != nil {
			return resource.SourceObservation{}, err
		}
		result := resource.SourceObservation{Record: record}
		metadata := extractMetadata(u)
		if len(metadata.Labels) != 0 || metadata.CreatedAt != nil {
			result.Metadata = &metadata
		}
		return result, nil
	}
	batch := make([]resource.SourceObservation, 0, resource.MaxSourceBatchItems)
	for _, u := range staging {
		item, err := observation(u)
		if err != nil {
			return err
		}
		batch = append(batch, item)
		if len(batch) == resource.MaxSourceBatchItems {
			if overflow.Load() {
				return reset()
			}
			if err := emit.Snapshot(ctx, batch); err != nil {
				return err
			}
			batch = make([]resource.SourceObservation, 0, resource.MaxSourceBatchItems)
		}
	}
	if overflow.Load() {
		return reset()
	}
	if len(batch) != 0 {
		if err := emit.Snapshot(ctx, batch); err != nil {
			return err
		}
	}
	if overflow.Load() {
		return reset()
	}
	coverage := resource.SourceCoverage{
		Enumeration: resource.EnumerationExhausted,
		Consistency: resource.ConsistencyBestEffort,
		Limitations: []string{"informer cache readiness is not a point-in-time snapshot", "startup events are reconciled by key, not by native revision handoff"},
	}
	if err := emit.EndSnapshot(ctx, coverage, resource.ContinuityBestEffort); err != nil {
		return err
	}
	for {
		if overflow.Load() {
			return reset()
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case first := <-events:
			changes := make([]resource.SourceChange, 0, request.Limits.MaxBatchItems)
			event := first
			for {
				item, err := observation(event.object)
				if err != nil {
					return err
				}
				if event.kind == "delete" {
					changes = append(changes, resource.SourceChange{Kind: resource.SourceChangeRemove, Reference: &item.Record.Reference, SourceRevision: item.Record.SourceRevision})
				} else {
					changes = append(changes, resource.SourceChange{Kind: resource.SourceChangeUpsert, Observation: &item})
				}
				if len(changes) >= int(request.Limits.MaxBatchItems) || len(events) == 0 {
					break
				}
				event = <-events
			}
			if overflow.Load() {
				return reset()
			}
			if err := emit.Changes(ctx, changes, nil); err != nil {
				return err
			}
		}
	}
}
