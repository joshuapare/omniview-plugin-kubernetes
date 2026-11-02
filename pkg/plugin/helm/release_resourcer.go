package helm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"go.uber.org/zap"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/release"
)

// ReleaseResourcer supplies native release reads, actions, and editor schemas.
type ReleaseResourcer struct {
	log *zap.SugaredLogger
}

// NewReleaseResourcer creates a new ReleaseResourcer.
func NewReleaseResourcer(logger *zap.SugaredLogger) *ReleaseResourcer {
	return &ReleaseResourcer{
		log: logger.Named("HelmReleaseResourcer"),
	}
}

func (r *ReleaseResourcer) getConfig(
	ctx context.Context,
	client *clients.ClientSet,
	namespace string,
) (*action.Configuration, error) {
	session, _ := resource.SessionFromContext(ctx)
	conn := session.Connection
	if conn == nil || client == nil || client.RESTConfig == nil {
		return nil, fmt.Errorf("no connection in context")
	}

	return newActionConfig(ctx, client.RESTConfig, client.HTTPClient, namespace)
}

// releaseToMap converts a Helm release to a map for the SDK.
func releaseToMap(rel *release.Release) map[string]interface{} {
	data, err := json.Marshal(rel)
	if err != nil {
		return map[string]interface{}{"name": rel.Name, "namespace": rel.Namespace}
	}
	var result map[string]interface{}
	if err := decodeNativeJSON(data, &result); err != nil {
		return map[string]interface{}{"name": rel.Name, "namespace": rel.Namespace}
	}
	result = normalizeJSONNumbers(result).(map[string]interface{})
	result["version"] = int64(rel.Version)
	if len(rel.Config) > 0 {
		result["config"] = rel.Config
	}
	return result
}

// ================================= ACTIONS ================================= //

func (r *ReleaseResourcer) GetActions(
	_ context.Context,
	_ *clients.ClientSet,
) ([]resource.ActionDescriptor, error) {
	chartVersionParams := &resource.Schema{
		Properties: map[string]resource.SchemaProperty{
			"chart":        {Type: resource.SchemaString, Description: "Chart reference (e.g. repo/chart)"},
			"values":       {Type: resource.SchemaObject, Description: "Override values"},
			"version":      {Type: resource.SchemaString, Description: "Chart version constraint"},
			"reuse_values": {Type: resource.SchemaBoolean, Description: "Reuse existing values from the release"},
		},
		Required: []string{"chart"},
	}

	installParams := &resource.Schema{
		Properties: map[string]resource.SchemaProperty{
			"name":    {Type: resource.SchemaString, Description: "New release name"},
			"chart":   {Type: resource.SchemaString, Description: "Chart reference (e.g. repo/chart)"},
			"values":  {Type: resource.SchemaObject, Description: "Override values"},
			"version": {Type: resource.SchemaString, Description: "Chart version constraint"},
		},
		Required: []string{"name", "chart"},
	}

	dryRunInstallParams := &resource.Schema{
		Properties: map[string]resource.SchemaProperty{
			"name":    {Type: resource.SchemaString, Description: "New release name"},
			"chart":   {Type: resource.SchemaString, Description: "Chart reference (e.g. repo/chart)"},
			"values":  {Type: resource.SchemaObject, Description: "Override values"},
			"version": {Type: resource.SchemaString, Description: "Chart version constraint"},
		},
		Required: []string{"name", "chart"},
	}

	return []resource.ActionDescriptor{
		{
			ID:           "upgrade",
			Label:        "Upgrade Release",
			Description:  "Upgrade an installed release with new chart or values",
			Icon:         "LuArrowUpCircle",
			Scope:        resource.ActionScopeInstance,
			Dangerous:    true,
			ParamsSchema: chartVersionParams,
		},
		{
			ID:          "rollback",
			Label:       "Rollback Release",
			Description: "Rollback a release to a previous revision",
			Icon:        "LuUndo2",
			Scope:       resource.ActionScopeInstance,
			Dangerous:   true,
			ParamsSchema: &resource.Schema{
				Properties: map[string]resource.SchemaProperty{
					"revision": {Type: resource.SchemaInteger, Minimum: resource.PtrFloat64(0), Description: "Revision number to rollback to (0 = previous)"},
				},
			},
		},
		{
			ID:          "get-values",
			Label:       "Get Values",
			Description: "Get the computed values for a release",
			Icon:        "LuFileText",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{
				Properties: map[string]resource.SchemaProperty{
					"all": {Type: resource.SchemaBoolean, Description: "Return all computed values (including defaults)"},
				},
			},
		},
		{
			ID:          "get-manifest",
			Label:       "Get Manifest",
			Description: "Get the rendered manifest for a release",
			Icon:        "LuFileCode",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{
				Properties: map[string]resource.SchemaProperty{
					"revision": {Type: resource.SchemaInteger, Minimum: resource.PtrFloat64(1), Description: "Specific revision to get manifest for"},
				},
			},
		},
		{
			ID:          "get-notes",
			Label:       "Get Notes",
			Description: "Get the release notes",
			Icon:        "LuStickyNote",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:          "get-hooks",
			Label:       "Get Hooks",
			Description: "Get the release hooks",
			Icon:        "LuAnchor",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:          "get-history",
			Label:       "Get History",
			Description: "Get the revision history for a release",
			Icon:        "LuHistory",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{
				Properties: map[string]resource.SchemaProperty{
					"max": {Type: resource.SchemaInteger, Minimum: resource.PtrFloat64(1), Maximum: resource.PtrFloat64(256), Description: "Maximum number of revisions to return (default 256)"},
				},
			},
		},
		{
			ID:           "install",
			Label:        "Install Chart",
			Description:  "Install a chart as a new release",
			Icon:         "LuDownload",
			Scope:        resource.ActionScopeType,
			ParamsSchema: installParams,
		},
		{
			ID:           "dry-run-install",
			Label:        "Dry Run Install",
			Description:  "Preview what an install would render without applying",
			Icon:         "LuEye",
			Scope:        resource.ActionScopeType,
			ParamsSchema: dryRunInstallParams,
		},
		{
			ID:           "dry-run-upgrade",
			Label:        "Dry Run Upgrade",
			Description:  "Preview what an upgrade would render without applying",
			Icon:         "LuEye",
			Scope:        resource.ActionScopeInstance,
			ParamsSchema: chartVersionParams,
		},
		{
			ID:          "diff-revisions",
			Label:       "Diff Revisions",
			Description: "Compare manifests between two revisions",
			Icon:        "LuGitCompare",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{
				Properties: map[string]resource.SchemaProperty{
					"revision1": {Type: resource.SchemaInteger, Minimum: resource.PtrFloat64(1), Description: "First revision to compare"},
					"revision2": {Type: resource.SchemaInteger, Minimum: resource.PtrFloat64(1), Description: "Second revision to compare"},
				},
				Required: []string{"revision1", "revision2"},
			},
		},
		{
			ID:          "test",
			Label:       "Test Release",
			Description: "Run test hooks for a release",
			Icon:        "LuFlaskConical",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
	}, nil
}

func (r *ReleaseResourcer) Action(
	ctx context.Context,
	client *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	namespace, err := actionNamespace(input)
	if err != nil {
		return resource.Value{}, err
	}
	cfg, err := r.getConfig(ctx, client, namespace)
	if err != nil {
		return resource.Value{}, err
	}

	switch input.Action {
	case "upgrade":
		return r.executeUpgrade(cfg, input)
	case "rollback":
		return r.executeRollback(cfg, input)
	case "get-values":
		return r.executeGetValues(cfg, input)
	case "get-manifest":
		return r.executeGetManifest(cfg, input)
	case "get-notes":
		return r.executeGetNotes(cfg, input)
	case "get-hooks":
		return r.executeGetHooks(cfg, input)
	case "get-history":
		return r.executeGetHistory(cfg, input)
	case "install":
		return r.executeInstall(cfg, input)
	case "dry-run-install":
		return r.executeDryRunInstall(cfg, input)
	case "dry-run-upgrade":
		return r.executeDryRunUpgrade(cfg, input)
	case "diff-revisions":
		return r.executeDiffRevisions(cfg, input)
	case "test":
		return r.executeTest(cfg, input)
	default:
		return resource.Value{}, fmt.Errorf("unknown action: %s", input.Action)
	}
}

// ================================= SCHEMA ================================= //

// GetEditorSchemas extracts values.schema.json from installed Helm chart releases.
// Schema discovery is finite and fails rather than returning silently truncated schemas.
func (r *ReleaseResourcer) GetEditorSchemas(
	ctx context.Context,
	client *clients.ClientSet,
) ([]resource.EditorSchema, error) {
	metadata, err := releaseMetadata(ctx, client, "", 256, nil)
	if err != nil {
		return nil, err
	}
	if metadata.Continue != "" {
		return nil, resource.NewError("RESOURCE_LIMIT", "Helm schema discovery exceeds 256 storage entries")
	}

	session, _ := resource.SessionFromContext(ctx)
	conn := session.Connection
	connID := ""
	if conn != nil {
		connID = conn.ID
	}

	var schemas []resource.EditorSchema
	totalBytes := 0
	for _, item := range metadata.Items {
		version, err := latestReleaseVersion(ctx, client, item.Namespace, item.Labels["name"])
		if err != nil {
			return nil, err
		}
		if fmt.Sprint(version) != item.Labels["version"] {
			continue
		}
		cfg, err := r.getConfig(ctx, client, item.Namespace)
		if err != nil {
			return nil, err
		}
		get := action.NewGet(cfg)
		get.Version = version
		rel, err := get.Run(item.Labels["name"])
		if err != nil {
			return nil, err
		}
		if rel.Chart == nil || rel.Chart.Metadata == nil {
			continue
		}
		if len(rel.Chart.Schema) == 0 {
			continue
		}
		schema, size, err := helmEditorSchema(
			rel.Chart.Schema,
			fmt.Sprintf("helm://%s/%s/%s/values-schema", connID, rel.Chart.Metadata.Name, rel.Chart.Metadata.Version),
			fmt.Sprintf("**/helm:releases/%s.yaml", rel.Name),
		)
		if err != nil {
			return nil, err
		}
		if size > resource.MaxDocumentBytes-totalBytes {
			return nil, resource.NewError("RESOURCE_LIMIT", "Helm editor schemas exceed presentation budget")
		}
		totalBytes += size
		schemas = append(schemas, schema)
	}

	return schemas, nil
}

// ================================= ACTION IMPLEMENTATIONS ================================= //

func (r *ReleaseResourcer) executeUpgrade(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	chartRef, _ := params["chart"].(string)
	values, _ := params["values"].(map[string]interface{})
	reuseValues, _ := params["reuse_values"].(bool)

	if chartRef == "" {
		return resource.Value{}, fmt.Errorf("chart reference is required for upgrade")
	}

	settings := cli.New()
	settings.SetNamespace(namespaceOf(input.Reference))

	version, _ := params["version"].(string)
	chartPath, err := (&action.ChartPathOptions{Version: version}).LocateChart(chartRef, settings)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to locate chart %s: %w", chartRef, err)
	}

	chart, err := loader.Load(chartPath)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to load chart %s: %w", chartPath, err)
	}

	upgrade := action.NewUpgrade(cfg)
	upgrade.Namespace = namespaceOf(input.Reference)
	upgrade.ReuseValues = reuseValues

	rel, err := upgrade.Run(input.Reference.Address.ID, chart, values)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to upgrade release: %w", err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data":    releaseToMap(rel),
		"message": fmt.Sprintf("Release %s upgraded to revision %d", rel.Name, rel.Version),
	})
}

func (r *ReleaseResourcer) executeRollback(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	revisionF, _ := params["revision"].(int64)
	revision := int(revisionF)

	rollback := action.NewRollback(cfg)
	rollback.Version = revision

	if err := rollback.Run(input.Reference.Address.ID); err != nil {
		return resource.Value{}, fmt.Errorf("failed to rollback release: %w", err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Release %s rolled back to revision %d", input.Reference.Address.ID, revision),
	})
}

func (r *ReleaseResourcer) executeGetValues(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	getValues := action.NewGetValues(cfg)
	allValues, _ := params["all"].(bool)
	getValues.AllValues = allValues

	values, err := getValues.Run(input.Reference.Address.ID)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get values: %w", err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"values": values,
		},
	})
}

func (r *ReleaseResourcer) executeGetManifest(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	get := action.NewGet(cfg)

	// Support fetching a specific revision's manifest.
	if revF, ok := params["revision"].(int64); ok && revF > 0 {
		get.Version = int(revF)
	}

	rel, err := get.Run(input.Reference.Address.ID)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get release: %w", err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"manifest": rel.Manifest,
		},
	})
}

func (r *ReleaseResourcer) executeGetNotes(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	get := action.NewGet(cfg)
	rel, err := get.Run(input.Reference.Address.ID)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get release: %w", err)
	}

	notes := ""
	if rel.Info != nil {
		notes = rel.Info.Notes
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"notes": notes,
		},
	})
}

func (r *ReleaseResourcer) executeGetHooks(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	get := action.NewGet(cfg)
	rel, err := get.Run(input.Reference.Address.ID)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get release: %w", err)
	}

	hooks := make([]interface{}, 0, len(rel.Hooks))
	for _, hook := range rel.Hooks {
		h := map[string]interface{}{
			"name":   hook.Name,
			"kind":   hook.Kind,
			"path":   hook.Path,
			"weight": hook.Weight,
		}
		events := make([]interface{}, 0, len(hook.Events))
		for _, e := range hook.Events {
			events = append(events, string(e))
		}
		h["events"] = events
		hooks = append(hooks, h)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"hooks": hooks,
		},
	})
}

func (r *ReleaseResourcer) executeGetHistory(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	history := action.NewHistory(cfg)
	history.Max = 256
	maxF, ok := params["max"].(int64)
	if ok && maxF > 0 {
		history.Max = int(maxF)
	}

	releases, err := history.Run(input.Reference.Address.ID)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get history: %w", err)
	}

	revisions := make([]interface{}, 0, len(releases))
	for _, rel := range releases {
		revisions = append(revisions, releaseToMap(rel))
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"revisions": revisions,
		},
	})
}

func (r *ReleaseResourcer) executeInstall(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	chartRef, _ := params["chart"].(string)
	releaseName, _ := params["name"].(string)
	namespace, err := actionNamespace(input)
	if err != nil {
		return resource.Value{}, err
	}
	values, _ := params["values"].(map[string]interface{})
	version, _ := params["version"].(string)

	if chartRef == "" {
		return resource.Value{}, fmt.Errorf("chart reference is required")
	}
	if releaseName == "" {
		return resource.Value{}, fmt.Errorf("release name is required")
	}

	settings := cli.New()
	if namespace != "" {
		settings.SetNamespace(namespace)
	}

	chartPathOpts := &action.ChartPathOptions{Version: version}
	chartPath, err := chartPathOpts.LocateChart(chartRef, settings)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to locate chart %s: %w", chartRef, err)
	}

	chart, err := loader.Load(chartPath)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to load chart %s: %w", chartPath, err)
	}

	install := action.NewInstall(cfg)
	install.ReleaseName = releaseName
	install.Namespace = namespace
	install.CreateNamespace = true
	if version != "" {
		install.Version = version
	}

	rel, err := install.Run(chart, values)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to install release: %w", err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data":    releaseToMap(rel),
		"message": fmt.Sprintf("Release %s installed in namespace %s", rel.Name, rel.Namespace),
	})
}

func (r *ReleaseResourcer) executeDryRunInstall(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	chartRef, _ := params["chart"].(string)
	releaseName, _ := params["name"].(string)
	namespace, err := actionNamespace(input)
	if err != nil {
		return resource.Value{}, err
	}
	values, _ := params["values"].(map[string]interface{})
	version, _ := params["version"].(string)

	if chartRef == "" {
		return resource.Value{}, fmt.Errorf("chart reference is required")
	}
	if releaseName == "" {
		return resource.Value{}, fmt.Errorf("release name is required")
	}

	settings := cli.New()
	if namespace != "" {
		settings.SetNamespace(namespace)
	}

	chartPathOpts := &action.ChartPathOptions{Version: version}
	chartPath, err := chartPathOpts.LocateChart(chartRef, settings)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to locate chart %s: %w", chartRef, err)
	}

	chart, err := loader.Load(chartPath)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to load chart %s: %w", chartPath, err)
	}

	install := action.NewInstall(cfg)
	install.ReleaseName = releaseName
	install.Namespace = namespace
	install.DryRun = true
	install.ClientOnly = true
	if version != "" {
		install.Version = version
	}

	rel, err := install.Run(chart, values)
	if err != nil {
		return resource.Value{}, fmt.Errorf("dry-run install failed: %w", err)
	}

	notes := ""
	if rel != nil && rel.Info != nil {
		notes = rel.Info.Notes
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"manifest": rel.Manifest,
			"notes":    notes,
		},
		"message": "Dry-run install completed",
	})
}

func (r *ReleaseResourcer) executeDryRunUpgrade(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	chartRef, _ := params["chart"].(string)
	values, _ := params["values"].(map[string]interface{})
	reuseValues, _ := params["reuse_values"].(bool)
	version, _ := params["version"].(string)

	if chartRef == "" {
		return resource.Value{}, fmt.Errorf("chart reference is required for upgrade")
	}

	settings := cli.New()
	settings.SetNamespace(namespaceOf(input.Reference))

	chartPathOpts := &action.ChartPathOptions{Version: version}
	chartPath, err := chartPathOpts.LocateChart(chartRef, settings)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to locate chart %s: %w", chartRef, err)
	}

	chart, err := loader.Load(chartPath)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to load chart %s: %w", chartPath, err)
	}

	upgrade := action.NewUpgrade(cfg)
	upgrade.Namespace = namespaceOf(input.Reference)
	upgrade.DryRun = true
	upgrade.ReuseValues = reuseValues

	rel, err := upgrade.Run(input.Reference.Address.ID, chart, values)
	if err != nil {
		return resource.Value{}, fmt.Errorf("dry-run upgrade failed: %w", err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"manifest": rel.Manifest,
		},
		"message": "Dry-run upgrade completed",
	})
}

func (r *ReleaseResourcer) executeDiffRevisions(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	rev1F, _ := params["revision1"].(int64)
	rev2F, _ := params["revision2"].(int64)
	rev1 := int(rev1F)
	rev2 := int(rev2F)

	get1 := action.NewGet(cfg)
	get1.Version = rev1
	rel1, err := get1.Run(input.Reference.Address.ID)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get revision %d: %w", rev1, err)
	}

	get2 := action.NewGet(cfg)
	get2.Version = rev2
	rel2, err := get2.Run(input.Reference.Address.ID)
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to get revision %d: %w", rev2, err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"revision1": map[string]interface{}{
				"revision": rev1,
				"manifest": rel1.Manifest,
			},
			"revision2": map[string]interface{}{
				"revision": rev2,
				"manifest": rel2.Manifest,
			},
		},
	})
}

func (r *ReleaseResourcer) executeTest(
	cfg *action.Configuration,
	input resource.ActionRequest,
) (resource.Value, error) {
	test := action.NewReleaseTesting(cfg)

	rel, err := test.Run(input.Reference.Address.ID)
	if err != nil {
		return resource.Value{}, fmt.Errorf("release test failed: %w", err)
	}

	hooks := make([]interface{}, 0)
	for _, hook := range rel.Hooks {
		events := make([]interface{}, 0, len(hook.Events))
		for _, e := range hook.Events {
			events = append(events, string(e))
		}
		hooks = append(hooks, map[string]interface{}{
			"name":   hook.Name,
			"kind":   hook.Kind,
			"events": events,
			"lastRun": map[string]interface{}{
				"started_at":   hook.LastRun.StartedAt.Time,
				"completed_at": hook.LastRun.CompletedAt.Time,
				"phase":        string(hook.LastRun.Phase),
			},
		})
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"hooks": hooks,
		},
		"message": fmt.Sprintf("Release %s tests completed", input.Reference.Address.ID),
	})
}

func decodeNativeJSON(data []byte, out any) error {
	d := json.NewDecoder(bytes.NewReader(data))
	d.UseNumber()
	return d.Decode(out)
}
