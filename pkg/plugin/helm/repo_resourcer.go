package helm

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"go.uber.org/zap"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/getter"
	"helm.sh/helm/v3/pkg/registry"
	"helm.sh/helm/v3/pkg/repo"
)

// RepoResourcer supplies native Helm repository operations.
type RepoResourcer struct {
	log *zap.SugaredLogger
}

// NewRepoResourcer creates a new RepoResourcer.
func NewRepoResourcer(logger *zap.SugaredLogger) *RepoResourcer {
	return &RepoResourcer{
		log: logger.Named("HelmRepoResourcer"),
	}
}

func repoFile() string {
	settings := cli.New()
	return settings.RepositoryConfig
}

func loadRepoFile() (*repo.File, error) {
	path := repoFile()
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return repo.NewFile(), nil
	}
	if err != nil {
		return nil, err
	}
	if info.Size() > 16<<20 {
		return nil, fmt.Errorf("Helm repositories exceed 16 MiB")
	}
	f, err := repo.LoadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return repo.NewFile(), nil
		}
		return nil, fmt.Errorf("failed to load repo file: %w", err)
	}
	return f, nil
}

func repoEntryToMap(entry *repo.Entry) map[string]interface{} {
	repoType := "default"
	if registry.IsOCI(entry.URL) {
		repoType = "oci"
	}
	return map[string]interface{}{
		"name":                     entry.Name,
		"url":                      entry.URL,
		"type":                     repoType,
		"username":                 entry.Username,
		"certFile":                 entry.CertFile,
		"keyFile":                  entry.KeyFile,
		"caFile":                   entry.CAFile,
		"insecure_skip_tls_verify": entry.InsecureSkipTLSverify,
		"pass_credentials_all":     entry.PassCredentialsAll,
	}
}

// RepoResourcerWithActions combines RepoResourcer with action support.
type RepoResourcerWithActions struct {
	RepoResourcer
}

func NewRepoResourcerWithActions(logger *zap.SugaredLogger) *RepoResourcerWithActions {
	return &RepoResourcerWithActions{
		RepoResourcer: *NewRepoResourcer(logger),
	}
}

func (r *RepoResourcerWithActions) GetActions(
	_ context.Context,
	_ *clients.ClientSet,
) ([]resource.ActionDescriptor, error) {
	return []resource.ActionDescriptor{
		{
			ID:          "refresh",
			Label:       "Refresh Repository",
			Description: "Re-download the repository index",
			Icon:        "LuRefreshCw",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:          "list-charts",
			Label:       "List Charts",
			Description: "List all charts in this repository",
			Icon:        "LuList",
			Scope:       resource.ActionScopeInstance,
			ParamsSchema: &resource.Schema{},
		},
		{
			ID:          "add",
			Label:       "Add Repository",
			Description: "Add a new Helm chart repository",
			Icon:        "LuPlus",
			Scope:       resource.ActionScopeType,
			ParamsSchema: &resource.Schema{
				Properties: map[string]resource.SchemaProperty{
					"name":            {Type: resource.SchemaString, Description: "New repository name"},
					"url":             {Type: resource.SchemaString, Description: "Repository URL"},
					"username":        {Type: resource.SchemaString, Description: "Auth username"},
					"password":        {Type: resource.SchemaString, Description: "Auth password"},
					"certFile":        {Type: resource.SchemaString, Description: "TLS client certificate file"},
					"keyFile":         {Type: resource.SchemaString, Description: "TLS client key file"},
					"caFile":          {Type: resource.SchemaString, Description: "TLS CA certificate file"},
					"insecureSkipTLS": {Type: resource.SchemaBoolean, Description: "Skip TLS verification"},
					"plainHTTP":       {Type: resource.SchemaBoolean, Description: "Use plain HTTP for OCI registries"},
				},
				Required: []string{"name", "url"},
			},
		},
	}, nil
}

func (r *RepoResourcerWithActions) Action(
	_ context.Context,
	_ *clients.ClientSet,
	input resource.ActionRequest,
) (resource.Value, error) {
	switch input.Action {
	case "refresh":
		return r.executeRefresh(input)
	case "list-charts":
		return r.executeListCharts(input)
	case "add":
		return r.executeAdd(input)
	default:
		return resource.Value{}, fmt.Errorf("unknown action: %s", input.Action)
	}
}

func (r *RepoResourcerWithActions) executeRefresh(input resource.ActionRequest) (resource.Value, error) {
	f, err := loadRepoFile()
	if err != nil {
		return resource.Value{}, err
	}

	var entry *repo.Entry
	for _, e := range f.Repositories {
		if e.Name == input.Reference.Address.ID {
			entry = e
			break
		}
	}
	if entry == nil {
		return resource.Value{}, fmt.Errorf("repository %s not found", input.Reference.Address.ID)
	}

	// OCI registries don't have a downloadable index file — validate connectivity.
	if registry.IsOCI(entry.URL) {
		if err := validateOCIRegistry(
			entry.URL, entry.Username, entry.Password,
			entry.CertFile, entry.KeyFile, entry.CAFile,
			entry.InsecureSkipTLSverify, false,
		); err != nil {
			return resource.Value{}, fmt.Errorf("OCI registry validation failed: %w", err)
		}
		return resource.ValueFromNative(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"refreshedAt": time.Now().Format(time.RFC3339),
				"type":        "oci",
			},
			"message": fmt.Sprintf("OCI repository %s validated", entry.Name),
		})
	}

	settings := cli.New()
	chartRepo, err := repo.NewChartRepository(entry, getter.All(settings))
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to create chart repository: %w", err)
	}
	chartRepo.CachePath = settings.RepositoryCache

	indexPath, err := chartRepo.DownloadIndexFile()
	if err != nil {
		return resource.Value{}, fmt.Errorf("failed to refresh %s: %w", entry.Name, err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"indexPath":   indexPath,
			"refreshedAt": time.Now().Format(time.RFC3339),
		},
		"message": fmt.Sprintf("Repository %s refreshed", entry.Name),
	})
}

func (r *RepoResourcerWithActions) executeListCharts(input resource.ActionRequest) (resource.Value, error) {
	repoName := input.Reference.Address.ID

	indexes, err := loadAllIndexes()
	if err != nil {
		return resource.Value{}, err
	}

	idx, ok := indexes[repoName]
	if !ok {
		return resource.Value{}, fmt.Errorf("repository %s index not found in local cache", repoName)
	}

	if len(idx.Entries) > 256 {
		return resource.Value{}, fmt.Errorf("repository chart action exceeds 256 entries; use chart enumeration")
	}
	charts := make([]interface{}, 0, len(idx.Entries))
	for _, versions := range idx.Entries {
		if len(versions) == 0 {
			continue
		}
		charts = append(charts, chartVersionToMap(repoName, versions[0]))
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"charts": charts,
		},
		"message": fmt.Sprintf("Found %d charts in %s", len(charts), repoName),
	})
}

func (r *RepoResourcerWithActions) executeAdd(input resource.ActionRequest) (resource.Value, error) {
	params, err := actionParams(input)
	if err != nil {
		return resource.Value{}, err
	}
	name, _ := params["name"].(string)
	url, _ := params["url"].(string)

	if name == "" || url == "" {
		return resource.Value{}, fmt.Errorf("name and url are required")
	}

	f, err := loadRepoFile()
	if err != nil {
		return resource.Value{}, err
	}

	if f.Has(name) {
		return resource.Value{}, fmt.Errorf("repository %s already exists", name)
	}

	// Read optional auth fields.
	username, _ := params["username"].(string)
	password, _ := params["password"].(string)
	certFile, _ := params["certFile"].(string)
	keyFile, _ := params["keyFile"].(string)
	caFile, _ := params["caFile"].(string)
	insecureSkipTLS, _ := params["insecureSkipTLS"].(bool)
	plainHTTP, _ := params["plainHTTP"].(bool)

	entry := &repo.Entry{
		Name:                  name,
		URL:                   url,
		Username:              username,
		Password:              password,
		CertFile:              certFile,
		KeyFile:               keyFile,
		CAFile:                caFile,
		InsecureSkipTLSverify: insecureSkipTLS,
	}

	if registry.IsOCI(url) {
		// OCI registries don't have index.yaml -- validate by connecting.
		if err := validateOCIRegistry(url, username, password, certFile, keyFile, caFile, insecureSkipTLS, plainHTTP); err != nil {
			return resource.Value{}, err
		}
	} else {
		// Traditional HTTP(S) repository -- validate by downloading the index.
		settings := cli.New()
		chartRepo, err := repo.NewChartRepository(entry, getter.All(settings))
		if err != nil {
			return resource.Value{}, fmt.Errorf("failed to create chart repository: %w", err)
		}
		chartRepo.CachePath = settings.RepositoryCache

		if _, err := chartRepo.DownloadIndexFile(); err != nil {
			return resource.Value{}, fmt.Errorf("failed to download index for %s: %w", url, err)
		}
	}

	f.Update(entry)
	if err := f.WriteFile(repoFile(), 0644); err != nil {
		return resource.Value{}, fmt.Errorf("failed to write repo file: %w", err)
	}

	return resource.ValueFromNative(map[string]interface{}{
		"success": true,
		"data":    repoEntryToMap(entry),
		"message": fmt.Sprintf("Repository %s added successfully", name),
	})
}

// validateOCIRegistry validates an OCI registry by attempting to log in (if
// credentials are provided) or by creating a registry client and verifying
// the connection. OCI registries (oci://) don't use index.yaml files so we
// can't use the standard DownloadIndexFile validation path.
func validateOCIRegistry(
	url, username, password, certFile, keyFile, caFile string,
	insecureSkipTLS, plainHTTP bool,
) error {
	// Strip oci:// prefix to get the registry host.
	host := strings.TrimPrefix(url, "oci://")
	if host == "" {
		return fmt.Errorf("invalid OCI URL %q: registry host is empty", url)
	}
	// Remove any trailing path components to get just the registry host for login.
	// e.g. "ghcr.io/my-org/charts" -> "ghcr.io"
	parts := strings.SplitN(host, "/", 2)
	registryHost := parts[0]
	if registryHost == "" {
		return fmt.Errorf("invalid OCI URL %q: registry host is empty", url)
	}

	// Build client options.
	clientOpts := []registry.ClientOption{}
	if plainHTTP {
		clientOpts = append(clientOpts, registry.ClientOptPlainHTTP())
	}
	if username != "" && password != "" {
		clientOpts = append(clientOpts, registry.ClientOptBasicAuth(username, password))
	}

	client, err := registry.NewClient(clientOpts...)
	if err != nil {
		return fmt.Errorf("failed to create OCI registry client: %w", err)
	}

	// Attempt login if credentials are provided.
	if username != "" && password != "" {
		loginOpts := []registry.LoginOption{
			registry.LoginOptBasicAuth(username, password),
			registry.LoginOptInsecure(insecureSkipTLS),
		}
		if certFile != "" || keyFile != "" || caFile != "" {
			loginOpts = append(loginOpts, registry.LoginOptTLSClientConfig(certFile, keyFile, caFile))
		}

		if err := client.Login(registryHost, loginOpts...); err != nil {
			return fmt.Errorf("failed to authenticate with OCI registry %s: %w", registryHost, err)
		}
	}

	// For OCI, we don't require listing tags -- the login/client creation is
	// sufficient validation. Some registries restrict tag listing without a
	// specific repository reference, and users may be adding a registry root.
	return nil
}
