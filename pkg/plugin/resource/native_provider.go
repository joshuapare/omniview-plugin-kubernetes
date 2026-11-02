package resource

import (
	"context"
	"sync"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/helm"
	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	"github.com/omniview/kubernetes/pkg/plugin/resource/resourcers"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
	"go.uber.org/zap"
)

const nativeRepresentationVersion = "kubernetes.object.v1"

type nativeCatalogSnapshot struct {
	catalog           resourcev2.Catalog
	bindings          map[string]nativeType
	registrations     map[string]resourcev2.Registration[clients.ClientSet]
	documents         map[resourcev2.SchemaDocumentReference]resourcev2.SchemaDocument
	identityHint      *resourcev2.NativeAuthorityHint
	schemaLease       *nativeSchemaLease
	discoveryRevision string
	nextRefresh       time.Time
	refreshError      error
}

type nativeCatalogLoad struct {
	cancel context.CancelFunc
}

type kubernetesProvider struct {
	*resourcev2.Controller[clients.ClientSet]
	connections      *kubeConnectionProvider
	mu               sync.RWMutex
	catalogs         map[string]*nativeCatalogSnapshot
	catalogLoads     map[string]*nativeCatalogLoad
	catalogRefreshes map[string]*nativeCatalogRefresh
	schemaBudget     nativeSchemaBudget
	helpers          map[string]any
	relationships    map[string][]resourcev2.RelationshipDescriptor
	helmTypes        []resourcev2.ResourceType
	helmDefinitions  map[string]resourcev2.ResourceDefinition
	helmAncillary    *helm.HelmAncillary
	logger           *zap.SugaredLogger
}

func newKubernetesProvider(logger *zap.SugaredLogger, retireMetrics func(string)) (*kubernetesProvider, error) {
	if retireMetrics == nil {
		return nil, resourcev2.NewError("INVALID_REQUEST", "Native metric connection retirement is required")
	}
	relationships := resourcers.RelationshipTable()
	provider := &kubernetesProvider{
		connections:     &kubeConnectionProvider{logger: logger},
		catalogs:        make(map[string]*nativeCatalogSnapshot),
		helpers:         nativeSpecializedHelpers(logger, relationships),
		relationships:   relationships,
		helmTypes:       helm.HelmResourceTypes(),
		helmDefinitions: helm.HelmResourceDefinitions(),
		helmAncillary:   helm.NewHelmAncillary(logger),
		logger:          logger,
	}
	controller, err := resourcev2.NewController(resourcev2.Config[clients.ClientSet]{
		DynamicUpdates:      true,
		Catalog:             provider.catalog,
		Registrations:       append(provider.helmAncillary.Registrations(), auditRegistration()),
		ResolveRegistration: provider.registration,
		ErrorClassifier:     &kubeErrorClassifier{},
		ConnectionMetadata:  connectionMetadata,
		Lifecycle: &resourcev2.Lifecycle[clients.ClientSet]{
			LoadConnections: provider.connections.LoadConnections,
			CreateClient: func(ctx context.Context, _ types.Connection) (*clients.ClientSet, error) {
				return provider.connections.CreateClient(ctx)
			},
			DestroyClient:   provider.connections.DestroyClient,
			CheckConnection: provider.checkConnection,
			OnStart:         provider.startNativeConnection,
			OnStop: func(_ context.Context, connection types.Connection, _ *clients.ClientSet) error {
				provider.retireNativeCatalog(connection.ID)
				retireMetrics(connection.ID)
				return nil
			},
		},
	})
	if err != nil {
		return nil, err
	}
	provider.Controller = controller
	return provider, nil
}

func nativeSpecializedHelpers(logger *zap.SugaredLogger, relationships map[string][]resourcev2.RelationshipDescriptor) map[string]any {
	opts := func(token string) []resourcers.Option {
		return []resourcers.Option{resourcers.WithRelationships(relationships[token])}
	}
	return map[string]any{
		"k8s:/nodes":                                 resourcers.NewNodeResourcer(logger, opts("k8s:/nodes")...),
		"k8s:/pods":                                  resourcers.NewPodResourcer(logger, opts("k8s:/pods")...),
		"k8s:apps/deployments":                       resourcers.NewDeploymentResourcer(logger, opts("k8s:apps/deployments")...),
		"k8s:apps/daemonsets":                        resourcers.NewDaemonSetResourcer(logger, opts("k8s:apps/daemonsets")...),
		"k8s:apps/statefulsets":                      resourcers.NewStatefulSetResourcer(logger, opts("k8s:apps/statefulsets")...),
		"k8s:autoscaling/horizontalpodautoscalers":   resourcers.NewHPAResourcer(logger, opts("k8s:autoscaling/horizontalpodautoscalers")...),
		"k8s:batch/cronjobs":                         resourcers.NewCronJobResourcer(logger, opts("k8s:batch/cronjobs")...),
		"k8s:rbac.authorization.k8s.io/rolebindings": resourcers.NewRoleBindingResourcer(logger, opts("k8s:rbac.authorization.k8s.io/rolebindings")...),
	}
}

func (p *kubernetesProvider) startNativeConnection(ctx context.Context, connection types.Connection, client *clients.ClientSet) error {
	ctx, cancel := context.WithTimeout(ctx, nativeCatalogAcquisitionTimeout)
	load := &nativeCatalogLoad{cancel: cancel}
	p.mu.Lock()
	if p.catalogLoads == nil {
		p.catalogLoads = make(map[string]*nativeCatalogLoad)
	}
	previousLoad, previousSnapshot := p.catalogLoads[connection.ID], p.catalogs[connection.ID]
	p.catalogLoads[connection.ID] = load
	delete(p.catalogs, connection.ID)
	p.mu.Unlock()
	if previousLoad != nil {
		previousLoad.cancel()
	}
	if previousSnapshot != nil {
		previousSnapshot.schemaLease.Release()
	}
	defer func() {
		cancel()
		p.mu.Lock()
		if p.catalogLoads[connection.ID] == load {
			delete(p.catalogLoads, connection.ID)
		}
		p.mu.Unlock()
	}()
	snapshot, _, err := p.acquireNativeCatalog(ctx, connection.ID, client, nil)
	if err != nil {
		return err
	}
	p.mu.Lock()
	if p.catalogLoads[connection.ID] != load || ctx.Err() != nil {
		p.mu.Unlock()
		snapshot.schemaLease.Release()
		return resourcev2.NewError("RESET_REQUIRED", "Native connection catalog acquisition was retired")
	}
	snapshot.nextRefresh = time.Now().Add(nativeCatalogRefreshInterval)
	p.catalogs[connection.ID] = snapshot
	p.mu.Unlock()
	return nil
}

func (p *kubernetesProvider) retireNativeCatalog(connectionID string) {
	p.mu.Lock()
	load, snapshot := p.catalogLoads[connectionID], p.catalogs[connectionID]
	delete(p.catalogLoads, connectionID)
	delete(p.catalogs, connectionID)
	p.mu.Unlock()
	if load != nil {
		load.cancel()
	}
	if snapshot != nil {
		snapshot.schemaLease.Release()
	}
}

func nativeTypeScope(binding nativeType) resourcev2.QueryScope {
	if binding.API.Namespaced {
		return resourcev2.QueryScope{{Dimension: "namespace", Match: resourcev2.ScopeAny}}
	}
	return resourcev2.QueryScope{}
}

func (p *kubernetesProvider) snapshot(route resourcev2.AccessRoute) (*nativeCatalogSnapshot, error) {
	if route.Connection == "" {
		return nil, resourcev2.NewError("INVALID_REQUEST", "An explicit connection is required")
	}
	p.mu.RLock()
	snapshot := p.catalogs[route.Connection]
	p.mu.RUnlock()
	if snapshot == nil {
		return nil, resourcev2.NewError("UNAVAILABLE", "Connection catalog is not available")
	}
	return snapshot, nil
}

func (p *kubernetesProvider) catalog(ctx context.Context, request resourcev2.CatalogRequest) (catalog resourcev2.Catalog, err error) {
	err = p.WithClient(ctx, request.Route, func(ctx context.Context, client *clients.ClientSet) error {
		if client != nil && client.DiscoveryClient != nil {
			if err := p.refreshNativeCatalog(ctx, request.Route.Connection, client); err != nil {
				return err
			}
		}
		snapshot, err := p.snapshot(request.Route)
		if err != nil {
			return err
		}
		catalog = snapshot.catalog
		return nil
	})
	return catalog, err
}

func (p *kubernetesProvider) registration(_ context.Context, route resourcev2.AccessRoute, token string) (resourcev2.Registration[clients.ClientSet], error) {
	registration := resourcev2.Registration[clients.ClientSet]{Type: token, Connection: route.Connection}
	// Static Helm registrations use their own native operations.
	for _, descriptor := range p.helmTypes {
		if descriptor.Type == token {
			return registration, nil
		}
	}
	if token == auditType {
		return registration, nil
	}
	snapshot, err := p.snapshot(route)
	if err != nil {
		return registration, err
	}
	registration, ok := snapshot.registrations[token]
	if !ok {
		return registration, resourcev2.NewError("NOT_FOUND", "Resource type is not present in this connection catalog")
	}
	return registration, nil
}

func (p *kubernetesProvider) nativeRegistration(route resourcev2.AccessRoute, binding nativeType) resourcev2.Registration[clients.ClientSet] {
	token := binding.Descriptor.Type
	registration := resourcev2.Registration[clients.ClientSet]{Type: token, Connection: route.Connection, Actions: binding.Actions}
	representation := binding.Descriptor.Representations[0]
	if verbSliceContains(binding.API.Verbs, "get") {
		registration.Get = func(ctx context.Context, client *clients.ClientSet, request resourcev2.GetRequest) (resourcev2.Record, error) {
			served, representation, err := nativeRepresentation(binding, request.Representation, "get")
			if err != nil {
				return resourcev2.Record{}, err
			}
			return NativeGet(ctx, client.DynamicClient, served.GVR, served.API.Namespaced, request, representation)
		}
	}
	if verbSliceContains(binding.API.Verbs, "list") {
		registration.Enumerate = func(ctx context.Context, client *clients.ClientSet, request resourcev2.EnumerateRequest) (resourcev2.SourcePage, error) {
			served, representation, err := nativeRepresentation(binding, request.Target.Representation, "list")
			if err != nil {
				return resourcev2.SourcePage{}, err
			}
			return NativeEnumerate(ctx, client.DynamicClient, served.GVR, served.API.Namespaced, request, representation)
		}
		registration.NativeQuery = func(ctx context.Context, client *clients.ClientSet, request resourcev2.NativeQueryRequest) (resourcev2.SourcePage, error) {
			served, representation, err := nativeRepresentation(binding, request.Target.Representation, "list")
			if err != nil {
				return resourcev2.SourcePage{}, err
			}
			return NativeQuery(ctx, client.DynamicClient, served.GVR, served.API.Namespaced, request, representation)
		}
	}
	if verbSliceContains(binding.API.Verbs, "create") || verbSliceContains(binding.API.Verbs, "update") || verbSliceContains(binding.API.Verbs, "delete") {
		registration.Mutate = func(ctx context.Context, client *clients.ClientSet, request resourcev2.MutationRequest) (resourcev2.Record, error) {
			return NativeMutate(ctx, client.DynamicClient, binding.GVR, binding.API.Namespaced, binding.API.Verbs, request, representation)
		}
	}
	if helper, ok := p.helpers[token].(nativeActionHelper); ok {
		registration.Action = func(ctx context.Context, client *clients.ClientSet, request resourcev2.ActionRequest) (resourcev2.Value, error) {
			return helper.ExecuteAction(ctx, client, request)
		}
	}
	if verbSliceContains(binding.API.Verbs, "list") && verbSliceContains(binding.API.Verbs, "watch") {
		watcher := resourcers.NewKubernetesResourcerBase[resourcers.MetaAccessor](p.logger, binding.GVR)
		registration.Watch = watcher.Watch
		registration.SyncPolicy = resourcev2.SyncOnConnect
		if token == "k8s:/events" || token == "k8s:events.k8s.io/events" {
			registration.SyncPolicy = resourcev2.SyncOnFirstQuery
		}
	}
	return registration
}

func nativeRepresentation(binding nativeType, id, verb string) (nativeServedType, resourcev2.Representation, error) {
	for _, representation := range binding.Descriptor.Representations {
		if representation.ID != id {
			continue
		}
		for _, served := range nativeServedVersions(binding) {
			gv := served.GVR.GroupVersion().String()
			if len(binding.Served) == 0 || id == nativeRepresentationVersion+"/"+gv || id == nativeModelRepresentationVersion+"/"+gv {
				if !verbSliceContains(served.API.Verbs, verb) {
					return nativeServedType{}, resourcev2.Representation{}, resourcev2.NewError("UNSUPPORTED", "The served Kubernetes API version does not support this operation")
				}
				return served, representation, nil
			}
		}
	}
	return nativeServedType{}, resourcev2.Representation{}, resourcev2.NewError("INVALID_REQUEST", "The requested Kubernetes representation is not declared")
}

func (p *kubernetesProvider) checkConnection(ctx context.Context, connection types.Connection, client *clients.ClientSet) (types.ConnectionStatus, error) {
	status, err := p.connections.CheckConnection(ctx, &connection, client)
	if err != nil || status.Status != types.ConnectionStatusConnected {
		return status, err
	}
	identity, err := nativeClusterIdentity(ctx, client.KubeClient)
	if err != nil {
		return status, err
	}
	snapshot, err := p.snapshot(resourcev2.AccessRoute{Connection: connection.ID})
	if err != nil {
		return status, err
	}
	if hint := snapshot.identityHint; hint != nil && (identity == nil || hint.ID != *identity) {
		return status, resourcev2.NewError("RESET_REQUIRED", "Native Kubernetes backing identity changed; reconnect before acquiring resources")
	}
	return status, nil
}

type nativeActionHelper interface {
	GetActions(context.Context, *clients.ClientSet) ([]resourcev2.ActionDescriptor, error)
	ExecuteAction(context.Context, *clients.ClientSet, resourcev2.ActionRequest) (resourcev2.Value, error)
}
