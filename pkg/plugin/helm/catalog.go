package helm

import (
	"context"
	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
)

func HelmResourceGroup() resource.ResourceGroup {
	return resource.ResourceGroup{ID: "helm", Name: "Helm", Icon: "SiHelm", Resources: []string{ReleaseType, RepositoryType, ChartType}}
}
func helmRepresentationDescriptor() resource.Representation {
	return resource.Representation{ID: helmRepresentation, Revision: "1", Schema: resource.SchemaBinding{State: "absent"}}
}
func HelmResourceTypes() []resource.ResourceType {
	out := make([]resource.ResourceType, 0, 3)
	boundedReleases := supportsBoundedReleaseEnumeration()
	for _, token := range []string{ReleaseType, RepositoryType, ChartType} {
		dimensions := []resource.Dimension{{Name: "domain"}}
		if token == ReleaseType {
			dimensions = []resource.Dimension{{Name: "namespace"}}
		}
		queryDimensions := dimensions
		if token == ChartType {
			queryDimensions = []resource.Dimension{{Name: "domain"}, {Name: "repository"}}
		}
		scope := make(resource.QueryScope, 0, len(queryDimensions))
		for _, dimension := range queryDimensions {
			scope = append(scope, resource.ScopeConstraint{Dimension: dimension.Name, Match: resource.ScopeAny})
		}
		capabilities := []resource.Capability{{Operation: resource.OperationGet, Scope: scope}, {Operation: resource.OperationAction, Scope: scope}}
		if token != ReleaseType || boundedReleases {
			capabilities = append(capabilities, resource.Capability{Operation: resource.OperationEnumerate, Scope: scope})
		}
		if token != ChartType {
			capabilities = append(capabilities, resource.Capability{Operation: resource.OperationCreate, Scope: scope}, resource.Capability{Operation: resource.OperationDelete, Scope: scope})
		}
		out = append(out, resource.ResourceType{
			Type:                  token,
			DisplayName:           map[string]string{ReleaseType: "Release", RepositoryType: "Repository", ChartType: "Chart"}[token],
			IdentityDimensions:    dimensions,
			QueryDimensions:       queryDimensions,
			Representations:       []resource.Representation{helmRepresentationDescriptor()},
			DefaultRepresentation: helmRepresentation,
			Capabilities:          capabilities,
		})
	}
	return out
}

func (h *HelmAncillary) GetEditorSchemas(ctx context.Context, c *clients.ClientSet) ([]resource.EditorSchema, error) {
	return h.release.GetEditorSchemas(ctx, c)
}

func HelmResourceDefinitions() map[string]resource.ResourceDefinition {
	return map[string]resource.ResourceDefinition{
		ReleaseType: {
			ColumnDefs: []resource.ColumnDefinition{
				{
					ID:        "name",
					Header:    "Name",
					Accessors: "name",
				},
				{
					ID:        "namespace",
					Header:    "Namespace",
					Accessors: "namespace",
				},
				{
					ID:        "chart",
					Header:    "Chart",
					Accessors: "chart.metadata.name",
				},
				{
					ID:        "app_version",
					Header:    "App Version",
					Accessors: "chart.metadata.appVersion",
				},
				{
					ID:        "revision",
					Header:    "Revision",
					Accessors: "version",
				},
				{
					ID:        "status",
					Header:    "Status",
					Accessors: "info.status",
					ColorMap: map[string]string{
						"deployed":         "success",
						"failed":           "danger",
						"pending-install":  "warning",
						"pending-upgrade":  "warning",
						"pending-rollback": "warning",
						"superseded":       "neutral",
						"uninstalling":     "warning",
						"uninstalled":      "neutral",
					},
				},
				{
					ID:        "updated",
					Header:    "Updated",
					Accessors: "info.last_deployed",
					Formatter: "AGE",
				},
			},
		},
		RepositoryType: {
			ColumnDefs: []resource.ColumnDefinition{
				{
					ID:        "name",
					Header:    "Name",
					Accessors: "name",
				},
				{
					ID:        "url",
					Header:    "URL",
					Accessors: "url",
				},
			},
		},
		ChartType: {
			ColumnDefs: []resource.ColumnDefinition{
				{
					ID:        "name",
					Header:    "Name",
					Accessors: "name",
				},
				{
					ID:        "description",
					Header:    "Description",
					Accessors: "description",
				},
				{
					ID:        "version",
					Header:    "Version",
					Accessors: "version",
				},
				{
					ID:        "appVersion",
					Header:    "App Version",
					Accessors: "appVersion",
				},
				{
					ID:        "repository",
					Header:    "Repository",
					Accessors: "repository",
				},
			},
		},
	}
}
