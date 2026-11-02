package helm

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"go.uber.org/zap"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/repo"
)

// ChartResourcer reads chart metadata independently of mutation support.
// It reads chart metadata from Helm's local repo index cache files.
type ChartResourcer struct {
	log *zap.SugaredLogger
}

// NewChartResourcer creates a new ChartResourcer.
func NewChartResourcer(logger *zap.SugaredLogger) *ChartResourcer {
	return &ChartResourcer{
		log: logger.Named("HelmChartResourcer"),
	}
}

// loadAllIndexes loads all repo index files from the Helm cache directory.
func loadAllIndexes() (map[string]*repo.IndexFile, error) {
	f, err := loadRepoFile()
	if err != nil {
		return nil, err
	}

	settings := cli.New()
	cachePath := settings.RepositoryCache

	var totalBytes int64
	for _, entry := range f.Repositories {
		info, err := os.Stat(filepath.Join(cachePath, entry.Name+"-index.yaml"))
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if info.Size() > (16<<20)-totalBytes {
			return nil, fmt.Errorf("Helm cached indexes exceed 16 MiB")
		}
		totalBytes += info.Size()
	}
	indexes := make(map[string]*repo.IndexFile, len(f.Repositories))
	for _, entry := range f.Repositories {
		indexPath := filepath.Join(cachePath, entry.Name+"-index.yaml")
		if _, statErr := os.Stat(indexPath); os.IsNotExist(statErr) {
			continue
		}
		idx, loadErr := loadIndex(entry.Name)
		if loadErr != nil {
			return nil, loadErr
		}
		indexes[entry.Name] = idx
	}

	return indexes, nil
}

// chartVersionToMap converts a ChartVersion into a flat map suitable for the SDK.
// Values remain native until the canonical SDK codec preserves their scalar intent.
func chartVersionToMap(repoName string, cv *repo.ChartVersion) map[string]interface{} {
	m := map[string]interface{}{
		"id":          repoName + "/" + cv.Name,
		"name":        cv.Name,
		"description": cv.Description,
		"version":     cv.Version,
		"appVersion":  cv.AppVersion,
		"repository":  repoName,
		"deprecated":  cv.Deprecated,
		"type":        cv.Type,
	}

	if cv.Icon != "" {
		m["icon"] = cv.Icon
	}
	if cv.Home != "" {
		m["home"] = cv.Home
	}
	if len(cv.Keywords) > 0 {
		keywords := make([]interface{}, len(cv.Keywords))
		for i, kw := range cv.Keywords {
			keywords[i] = kw
		}
		m["keywords"] = keywords
	}
	if cv.KubeVersion != "" {
		m["kubeVersion"] = cv.KubeVersion
	}
	if len(cv.Maintainers) > 0 {
		maintainers := make([]interface{}, 0, len(cv.Maintainers))
		for _, maint := range cv.Maintainers {
			entry := map[string]interface{}{"name": maint.Name}
			if maint.Email != "" {
				entry["email"] = maint.Email
			}
			if maint.URL != "" {
				entry["url"] = maint.URL
			}
			maintainers = append(maintainers, entry)
		}
		m["maintainers"] = maintainers
	}

	return m
}

// ChartResourcerWithActions combines ChartResourcer with action support.
type ChartResourcerWithActions struct {
	ChartResourcer
}

// NewChartResourcerWithActions creates a new ChartResourcerWithActions.
func NewChartResourcerWithActions(logger *zap.SugaredLogger) *ChartResourcerWithActions {
	return &ChartResourcerWithActions{
		ChartResourcer: *NewChartResourcer(logger),
	}
}

func (r *ChartResourcerWithActions) GetActions(
	_ context.Context,
	_ *clients.ClientSet,
) ([]resource.ActionDescriptor, error) {
	versionParams := &resource.Schema{
		Properties: map[string]resource.SchemaProperty{
			"version": {Type: resource.SchemaString, Description: "Chart version (defaults to latest)"},
		},
	}

	return []resource.ActionDescriptor{
		{
			ID:           "get-values",
			Label:        "Get Default Values",
			Description:  "Get the default values.yaml for this chart",
			Icon:         "LuFileText",
			Scope:        resource.ActionScopeInstance,
			ParamsSchema: versionParams,
		},
		{
			ID:           "get-readme",
			Label:        "Get README",
			Description:  "Get the README for this chart",
			Icon:         "LuBookOpen",
			Scope:        resource.ActionScopeInstance,
			ParamsSchema: versionParams,
		},
		{
			ID:          "get-versions",
			Label:       "Get All Versions",
			Description: "Get all available versions of this chart",
			Icon:        "LuList",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:           "get-chart-detail",
			Label:        "Get Chart Detail",
			Description:  "Get values, readme, versions, and dependencies for a chart in one call",
			Icon:         "LuInfo",
			Scope:        resource.ActionScopeInstance,
			ParamsSchema: versionParams,
		},
	}, nil
}

func (r *ChartResourcerWithActions) Action(
	_ context.Context,
	_ *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	parts := strings.SplitN(input.Reference.Address.ID, "/", 2)
	if len(parts) != 2 {
		return resource.Value{}, fmt.Errorf("chart ID must be in the form repo/chart, got %q", input.Reference.Address.ID)
	}
	repoName, chartName := parts[0], parts[1]

	switch input.Action {
	case "get-values":
		return r.executeGetValues(repoName, chartName, input)
	case "get-readme":
		return r.executeGetReadme(repoName, chartName, input)
	case "get-versions":
		return r.executeGetVersions(repoName, chartName)
	case "get-chart-detail":
		return r.executeGetChartDetail(repoName, chartName, input)
	default:
		return resource.Value{}, fmt.Errorf("unknown action: %s", input.Action)
	}
}

func (r *ChartResourcerWithActions) executeGetValues(repoName, chartName string, input resource.ActionRequest) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	chartRef := repoName + "/" + chartName

	settings := cli.New()
	version, _ := params["version"].(string)

	chartPathOpts := &action.ChartPathOptions{Version: version}
	chartPath, err := chartPathOpts.LocateChart(chartRef, settings)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to locate chart %s: %w", chartRef, err)
	}

	ch, err := loader.Load(chartPath)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to load chart %s: %w", chartPath, err)
	}

	values := ""
	for _, f := range ch.Raw {
		if f.Name == "values.yaml" {
			values = string(f.Data)
			break
		}
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"values": values,
		},
	})
}

func (r *ChartResourcerWithActions) executeGetReadme(repoName, chartName string, input resource.ActionRequest) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	chartRef := repoName + "/" + chartName

	settings := cli.New()
	version, _ := params["version"].(string)

	chartPathOpts := &action.ChartPathOptions{Version: version}
	chartPath, err := chartPathOpts.LocateChart(chartRef, settings)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to locate chart %s: %w", chartRef, err)
	}

	ch, err := loader.Load(chartPath)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to load chart %s: %w", chartPath, err)
	}

	readme := ""
	for _, f := range ch.Files {
		if strings.EqualFold(f.Name, "readme.md") || strings.EqualFold(f.Name, "readme.txt") || strings.EqualFold(f.Name, "readme") {
			readme = string(f.Data)
			break
		}
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"readme": readme,
		},
	})
}

func (r *ChartResourcerWithActions) executeGetVersions(repoName, chartName string) (resource.Value, error) {
	indexes, err := loadAllIndexes()
	if err != nil {
		return resource.Value{}, err
	}

	idx, ok := indexes[repoName]
	if !ok {
		return resource.Value{}, fmt.Errorf("repository %s not found in local cache", repoName)
	}

	versions, found := idx.Entries[chartName]
	if !found {
		return resource.Value{}, fmt.Errorf("chart %s not found in repository %s", chartName, repoName)
	}

	if len(versions) > 256 {
		return resource.Value{}, fmt.Errorf("chart versions exceed finite action limit of 256")
	}
	allVersions := make([]interface{}, 0, len(versions))
	for _, v := range versions {
		entry := map[string]interface{}{
			"version":    v.Version,
			"appVersion": v.AppVersion,
			"created":    v.Created.Format(time.RFC3339),
			"deprecated": v.Deprecated,
		}
		if v.Description != "" {
			entry["description"] = v.Description
		}
		if v.KubeVersion != "" {
			entry["kubeVersion"] = v.KubeVersion
		}
		if v.Digest != "" {
			entry["digest"] = v.Digest
		}
		if v.Home != "" {
			entry["home"] = v.Home
		}
		if v.Icon != "" {
			entry["icon"] = v.Icon
		}
		if v.Type != "" {
			entry["type"] = v.Type
		}
		allVersions = append(allVersions, entry)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"versions": allVersions,
			"total":    len(allVersions),
		},
	})
}

func (r *ChartResourcerWithActions) executeGetChartDetail(repoName, chartName string, input resource.ActionRequest) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	chartRef := repoName + "/" + chartName

	settings := cli.New()
	version, _ := params["version"].(string)

	// Load the chart archive to get values and readme.
	chartPathOpts := &action.ChartPathOptions{Version: version}
	chartPath, err := chartPathOpts.LocateChart(chartRef, settings)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to locate chart %s: %w", chartRef, err)
	}

	ch, err := loader.Load(chartPath)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to load chart %s: %w", chartPath, err)
	}

	// Extract values.yaml
	values := ""
	for _, f := range ch.Raw {
		if f.Name == "values.yaml" {
			values = string(f.Data)
			break
		}
	}

	// Extract README
	readme := ""
	for _, f := range ch.Files {
		if strings.EqualFold(f.Name, "readme.md") || strings.EqualFold(f.Name, "readme.txt") || strings.EqualFold(f.Name, "readme") {
			readme = string(f.Data)
			break
		}
	}

	// Extract dependencies
	var deps []interface{}
	if ch.Metadata != nil && len(ch.Metadata.Dependencies) > 0 {
		if len(ch.Metadata.Dependencies) > 256 {
			return resource.Value{}, fmt.Errorf("chart dependencies exceed finite action limit of 256")
		}
		deps = make([]interface{}, 0, len(ch.Metadata.Dependencies))
		for _, d := range ch.Metadata.Dependencies {
			entry := map[string]interface{}{
				"name":       d.Name,
				"repository": d.Repository,
			}
			if d.Version != "" {
				entry["version"] = d.Version
			}
			if d.Condition != "" {
				entry["condition"] = d.Condition
			}
			deps = append(deps, entry)
		}
	}

	// Get all versions from the index
	versionsResult, err := r.executeGetVersions(repoName, chartName)
	if err != nil {
		return resource.Value{}, err
	}

	versionData, err := nativeObject(versionsResult.Map["data"])
	if err != nil {
		return resource.Value{}, err
	}
	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"values":       values,
			"readme":       readme,
			"versions":     versionData["versions"],
			"total":        versionData["total"],
			"dependencies": deps,
		},
	})
}
