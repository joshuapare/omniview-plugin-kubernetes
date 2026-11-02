package resource

import (
	"context"
	"github.com/omniview/kubernetes/pkg/plugin/helm"
	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	"github.com/omniview/kubernetes/pkg/plugin/resource/resourcers"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"sort"
)

func (p *kubernetesProvider) GetSchemaDocument(ctx context.Context, route resourcev2.AccessRoute, reference resourcev2.SchemaDocumentReference) (document resourcev2.SchemaDocument, err error) {
	err = p.WithClient(ctx, route, func(_ context.Context, _ *clients.ClientSet) error {
		snapshot, err := p.snapshot(route)
		if err != nil {
			return err
		}
		var ok bool
		document, ok = snapshot.documents[reference]
		if !ok {
			return resourcev2.NewError("RESET_REQUIRED", "Schema document revision is not available in this connection catalog")
		}
		return nil
	})
	return document, err
}

func (p *kubernetesProvider) GetEditorSchemas(ctx context.Context, route resourcev2.AccessRoute) (schemas []resourcev2.EditorSchema, err error) {
	err = p.WithClient(ctx, route, func(ctx context.Context, client *clients.ClientSet) error {
		schemas, err = p.helmAncillary.GetEditorSchemas(ctx, client)
		if err == nil {
			return nil
		}
		if canceled := ctx.Err(); canceled != nil {
			return canceled
		}
		// Native Kubernetes errors lose their code across the SDK boundary;
		// classify them into public-safe resource errors.
		if classified := classifyResourceError(err); classified != nil {
			return classified
		}
		return err
	})
	return schemas, err
}

func (p *kubernetesProvider) GetResourceDefinition(ctx context.Context, route resourcev2.AccessRoute, token string) (definition resourcev2.ResourceDefinition, err error) {
	err = p.WithClient(ctx, route, func(_ context.Context, _ *clients.ClientSet) error {
		snapshot, err := p.snapshot(route)
		if err != nil {
			return err
		}
		if helmDefinition, ok := p.helmDefinitions[token]; ok {
			definition = helmDefinition
			return nil
		}
		if token == auditType {
			definition = resourcers.DefaultResourceDef
			return nil
		}
		if _, ok := snapshot.bindings[token]; !ok {
			return resourcev2.NewError("NOT_FOUND", "Resource type is not present in this connection catalog")
		}
		definition, _ = resourcers.ResourceDefs[token]
		if len(definition.ColumnDefs) == 0 {
			definition = resourcers.DefaultResourceDef
		}
		return nil
	})
	return definition, err
}

func nativeGroupDisplayID(group string) string {
	switch group {
	case "":
		return "core"
	case "apps", "batch", "policy":
		return group
	case "admissionregistration.k8s.io":
		return "admissionregistration"
	case "apiextensions.k8s.io":
		return "apiextensions"
	case "apiregistration.k8s.io":
		return "apiregistration"
	case "autoscaling":
		return "autoscaling"
	case "authentication.k8s.io":
		return "authentication"
	case "authorization.k8s.io":
		return "authorization"
	case "certificates.k8s.io":
		return "certificates"
	case "coordination.k8s.io":
		return "coordination"
	case "discovery.k8s.io":
		return "discovery"
	case "events.k8s.io":
		return "events"
	case "flowcontrol.apiserver.k8s.io":
		return "flowcontrol"
	case "internal.apiserver.k8s.io":
		return "apiserverinternal"
	case "metrics.k8s.io":
		return "metrics"
	case "networking.k8s.io":
		return "networking"
	case "node.k8s.io":
		return "node"
	case "rbac.authorization.k8s.io":
		return "rbac"
	case "resource.k8s.io":
		return "resource"
	case "scheduling.k8s.io":
		return "scheduling"
	case "storage.k8s.io":
		return "storage"
	default:
		return ""
	}
}

func (p *kubernetesProvider) GetResourceGroups(ctx context.Context, route resourcev2.AccessRoute) (groups []resourcev2.ResourceGroup, err error) {
	err = p.WithClient(ctx, route, func(_ context.Context, _ *clients.ClientSet) error {
		snapshot, err := p.snapshot(route)
		if err != nil {
			return err
		}
		presentations := make(map[string]resourcev2.ResourceGroup, len(ResourceGroups))
		for _, group := range ResourceGroups {
			presentations[group.ID] = group
		}
		byID := make(map[string]resourcev2.ResourceGroup)
		for token, binding := range snapshot.bindings {
			id := "k8s:" + binding.GVR.Group
			group, exists := byID[id]
			if !exists {
				group = presentations[nativeGroupDisplayID(binding.GVR.Group)]
				group.ID = id
				if group.Name == "" {
					group.Name = binding.GVR.Group
				}
				group.Resources = []string{}
			}
			group.Resources = append(group.Resources, token)
			byID[id] = group
		}
		helmGroup := helm.HelmResourceGroup()
		helmGroup.ID = "helm:"
		byID[helmGroup.ID] = helmGroup
		byID["audit:"] = resourcev2.ResourceGroup{ID: "audit:", Name: "Audits", Resources: []string{auditType}}
		for _, group := range byID {
			if len(group.Resources) != 0 {
				sort.Strings(group.Resources)
				groups = append(groups, group)
			}
		}
		sort.Slice(groups, func(i, j int) bool { return groups[i].ID < groups[j].ID })
		return nil
	})
	return groups, err
}
