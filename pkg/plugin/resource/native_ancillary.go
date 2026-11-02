package resource

import (
	"context"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
)

func (p *kubernetesProvider) ScopeValues(ctx context.Context, route resourcev2.AccessRoute, dimension string) (values []string, err error) {
	if dimension != "namespace" {
		return nil, resourcev2.NewError("UNSUPPORTED", "Kubernetes does not declare this scope dimension")
	}
	err = p.WithClient(ctx, route, func(ctx context.Context, client *clients.ClientSet) error {
		values, err = p.connections.GetNamespaces(ctx, client)
		return err
	})
	return values, err
}

func (p *kubernetesProvider) WatchConnections(ctx context.Context, stream chan<- []types.Connection) error {
	updates, err := p.connections.WatchConnections(ctx)
	if err != nil {
		return err
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case connections, ok := <-updates:
			if !ok {
				return ctx.Err()
			}
			if err := p.ApplyConnections(ctx, connections); err != nil {
				return err
			}
			current, err := p.ListConnections(ctx)
			if err != nil {
				return err
			}
			select {
			case stream <- current:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
}

func (p *kubernetesProvider) GetActions(ctx context.Context, route resourcev2.AccessRoute, token string) (actions []resourcev2.ActionDescriptor, err error) {
	err = p.WithClient(ctx, route, func(ctx context.Context, client *clients.ClientSet) error {
		snapshot, snapshotErr := p.snapshot(route)
		if snapshotErr != nil {
			return snapshotErr
		}
		found := false
		for _, descriptor := range snapshot.catalog.Types {
			if descriptor.Type == token {
				found = true
				break
			}
		}
		if !found {
			return resourcev2.NewError("NOT_FOUND", "Resource type is not present in this connection catalog")
		}
		if token == editorQueryType {
			actions = editorQueryRegistration().Actions
			return nil
		}
		if binding, ok := snapshot.bindings[token]; ok {
			actions = binding.Actions
			return nil
		}
		for _, descriptor := range p.helmTypes {
			if descriptor.Type == token {
				actions, err = p.helmAncillary.GetActions(ctx, client, token)
				return err
			}
		}
		return resourcev2.NewError("UNSUPPORTED", "Resource type does not provide actions")
	})
	return actions, err
}

func (p *kubernetesProvider) StreamAction(ctx context.Context, request resourcev2.ActionRequest, stream chan<- resourcev2.ActionEvent) error {
	if _, err := resourcev2.AdmitStreamingAction(ctx, p, request); err != nil {
		return err
	}
	helper, ok := p.helpers[request.Reference.Address.Type].(nativeStreamingActionHelper)
	if !ok {
		return resourcev2.NewError("UNSUPPORTED", "Resource type does not provide streaming actions")
	}
	snapshot, err := p.snapshot(request.Route)
	if err != nil {
		return err
	}
	binding, ok := snapshot.bindings[request.Reference.Address.Type]
	if !ok {
		return resourcev2.NewError("NOT_FOUND", "Resource type is not present in this connection catalog")
	}
	return p.WithClient(ctx, request.Route, func(ctx context.Context, client *clients.ClientSet) error {
		if _, err := NativeGet(ctx, client.DynamicClient, binding.GVR, binding.API.Namespaced, resourcev2.GetRequest{Route: request.Route, Reference: request.Reference, Representation: binding.Descriptor.DefaultRepresentation}, binding.Descriptor.Representations[0]); err != nil {
			return err
		}
		return helper.StreamAction(ctx, client, request, stream)
	})
}

type nativeStreamingActionHelper interface {
	StreamAction(context.Context, *clients.ClientSet, resourcev2.ActionRequest, chan<- resourcev2.ActionEvent) error
}

func (p *kubernetesProvider) Features(ctx context.Context) (resourcev2.FeatureSet, error) {
	features, err := p.Controller.Features(ctx)
	if err != nil {
		return resourcev2.FeatureSet{}, err
	}
	for _, feature := range []resourcev2.Feature{
		resourcev2.FeatureConnectionBrowser,
		resourcev2.FeatureScopeValues,
		resourcev2.FeaturePresentation,
		resourcev2.FeatureEditorSchemas,
		resourcev2.FeatureSchemaDocuments,
		resourcev2.FeatureRelationships,
		resourcev2.FeatureHealth,
		resourcev2.FeatureActionCatalog,
		resourcev2.FeatureStreamingActions,
	} {
		if !features.Has(feature) {
			features.Traits = append(features.Traits, feature)
		}
	}
	return features, resourcev2.ValidateFeatures(features)
}
