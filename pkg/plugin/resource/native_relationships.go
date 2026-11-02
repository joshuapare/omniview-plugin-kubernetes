package resource

import (
	"context"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	"github.com/omniview/kubernetes/pkg/plugin/resource/resourcers"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
)

func (p *kubernetesProvider) GetRelationships(ctx context.Context, route resourcev2.AccessRoute, token string) (relationships []resourcev2.RelationshipDescriptor, err error) {
	err = p.WithClient(ctx, route, func(_ context.Context, _ *clients.ClientSet) error {
		snapshot, err := p.snapshot(route)
		if err != nil {
			return err
		}
		exists := false
		for _, descriptor := range snapshot.catalog.Types {
			if descriptor.Type == token {
				exists = true
				break
			}
		}
		if !exists {
			return resourcev2.NewError("NOT_FOUND", "Resource type is not present in this connection catalog")
		}
		if helper, ok := p.helpers[token].(nativeRelationshipDeclarer); ok {
			relationships = helper.DeclareRelationships()
		} else {
			relationships = p.relationships[token]
		}
		if relationships == nil {
			relationships = []resourcev2.RelationshipDescriptor{}
		}
		return nil
	})
	return relationships, err
}

func (p *kubernetesProvider) ResolveRelationships(ctx context.Context, request resourcev2.RelationshipResolutionRequest) (relationships []resourcev2.ResolvedRelationship, err error) {
	if err := resourcev2.ValidateRelationshipResolutionRequest(request); err != nil {
		return nil, err
	}
	if _, err := p.Get(ctx, request.Source); err != nil {
		return nil, err
	}
	helper, ok := p.helpers[request.Source.Reference.Address.Type].(nativeRelationshipResolver)
	if !ok {
		return nil, resourcev2.NewError("UNSUPPORTED", "Resource type does not resolve native relationships")
	}
	err = p.WithClient(ctx, request.Source.Route, func(ctx context.Context, client *clients.ClientSet) error {
		relationships, err = helper.ResolveRelationships(ctx, client, request)
		if err != nil {
			return err
		}
		return resourcev2.ValidateRelationshipResolutionResult(request, relationships)
	})
	return relationships, err
}

func (p *kubernetesProvider) GetHealth(ctx context.Context, request resourcev2.GetRequest, body resourcev2.Value) (health *resourcev2.ResourceHealth, err error) {
	if _, err := p.Get(ctx, request); err != nil {
		return nil, err
	}
	helper, ok := p.helpers[request.Reference.Address.Type].(nativeHealthAssessor)
	if !ok {
		return nil, resourcev2.NewError("UNSUPPORTED", "Resource type does not assess native health")
	}
	err = p.WithClient(ctx, request.Route, func(ctx context.Context, client *clients.ClientSet) error {
		health, err = helper.AssessHealth(ctx, client, request, body)
		return err
	})
	return health, err
}

func (p *kubernetesProvider) GetResourceEvents(ctx context.Context, request resourcev2.GetRequest, limit uint32) (events []resourcev2.ResourceEvent, err error) {
	if _, err := p.Get(ctx, request); err != nil {
		return nil, err
	}
	if helper, ok := p.helpers[request.Reference.Address.Type].(nativeEventRetriever); ok {
		err = p.WithClient(ctx, request.Route, func(ctx context.Context, client *clients.ClientSet) error {
			events, err = helper.GetEvents(ctx, client, request, limit)
			return err
		})
		return events, err
	}
	snapshot, err := p.snapshot(request.Route)
	if err != nil {
		return nil, err
	}
	kind, err := snapshot.nativeEventKind(request.Reference.Address.Type)
	if err != nil {
		return nil, err
	}
	err = p.WithClient(ctx, request.Route, func(ctx context.Context, client *clients.ClientSet) error {
		events, err = resourcers.NativeKindEvents(ctx, client, request, kind, limit)
		return err
	})
	return events, err
}

// nativeEventKind returns the Kubernetes kind whose core events describe the
// token. Catalog types without a native binding (Helm, audit) are UNSUPPORTED.
func (s *nativeCatalogSnapshot) nativeEventKind(token string) (string, error) {
	if binding, ok := s.bindings[token]; ok {
		if binding.API.Kind == "" {
			return "", resourcev2.NewError("UNSUPPORTED", "Resource type does not retrieve native events")
		}
		return binding.API.Kind, nil
	}
	for _, descriptor := range s.catalog.Types {
		if descriptor.Type == token {
			return "", resourcev2.NewError("UNSUPPORTED", "Resource type does not retrieve native events")
		}
	}
	return "", resourcev2.NewError("NOT_FOUND", "Resource type is not present in this connection catalog")
}

type nativeRelationshipDeclarer interface {
	DeclareRelationships() []resourcev2.RelationshipDescriptor
}
type nativeRelationshipResolver interface {
	ResolveRelationships(context.Context, *clients.ClientSet, resourcev2.RelationshipResolutionRequest) ([]resourcev2.ResolvedRelationship, error)
}
type nativeHealthAssessor interface {
	AssessHealth(context.Context, *clients.ClientSet, resourcev2.GetRequest, resourcev2.Value) (*resourcev2.ResourceHealth, error)
}
type nativeEventRetriever interface {
	GetEvents(context.Context, *clients.ClientSet, resourcev2.GetRequest, uint32) ([]resourcev2.ResourceEvent, error)
}
