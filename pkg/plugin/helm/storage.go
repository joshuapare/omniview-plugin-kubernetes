package helm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"helm.sh/helm/v3/pkg/action"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func supportsBoundedReleaseEnumeration() bool {
	switch os.Getenv("HELM_DRIVER") {
	case "", "secret", "secrets", "configmap", "configmaps":
		return true
	default:
		return false
	}
}

// releaseMetadata uses Kubernetes native continuation without loading release payloads.
func releaseMetadata(ctx context.Context, c *clients.ClientSet, namespace string, size int, cursor *string) (metav1.PartialObjectMetadataList, error) {
	return namedReleaseMetadata(ctx, c, namespace, size, cursor, "")
}

func namedReleaseMetadata(ctx context.Context, c *clients.ClientSet, namespace string, size int, cursor *string, name string) (metav1.PartialObjectMetadataList, error) {
	var page metav1.PartialObjectMetadataList
	storage := os.Getenv("HELM_DRIVER")
	if !supportsBoundedReleaseEnumeration() {
		return page, resource.NewError("UNSUPPORTED", "bounded release enumeration is unavailable for this Helm storage driver")
	}
	if c == nil || c.RESTConfig == nil || c.HTTPClient == nil || c.HTTPClient.Transport == nil {
		return page, resource.NewError("UNAVAILABLE", "Helm metadata requires the existing auth-aware bounded Kubernetes HTTP client")
	}
	if storage == "configmap" || storage == "configmaps" {
		storage = "configmaps"
	} else {
		storage = "secrets"
	}
	u, err := url.Parse(c.RESTConfig.Host)
	if err != nil {
		return page, err
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1"
	if namespace != "" {
		u.Path += "/namespaces/" + url.PathEscape(namespace)
	}
	u.Path += "/" + storage
	q := u.Query()
	selector := "owner=helm"
	if name != "" {
		selector += ",name=" + name
	}
	q.Set("labelSelector", selector)
	q.Set("limit", strconv.Itoa(size))
	if cursor != nil {
		q.Set("continue", *cursor)
	}
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return page, err
	}
	req.Header.Set("Accept", "application/json;as=PartialObjectMetadataList;g=meta.k8s.io;v=v1")
	response, err := c.HTTPClient.Do(req)
	if err != nil {
		return page, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return page, apierrors.NewGenericServerResponse(response.StatusCode, http.MethodGet, schema.GroupResource{Resource: storage}, "", "Helm storage metadata request failed", 0, false)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (32<<20)+1))
	if err != nil {
		return page, err
	}
	if len(data) > 32<<20 {
		return page, fmt.Errorf("Helm storage metadata exceeds 32 MiB")
	}
	if err = resource.ValidateJSON(data); err != nil {
		return page, err
	}
	if err = json.Unmarshal(data, &page); err != nil {
		return page, err
	}
	if len(page.Items) > size {
		return page, fmt.Errorf("Helm storage ignored page limit")
	}
	return page, nil
}

func (h *HelmAncillary) enumerateReleases(ctx context.Context, c *clients.ClientSet, r resource.EnumerateRequest) (resource.SourcePage, error) {
	scope, err := queryScope(r.Target)
	if err != nil {
		return resource.SourcePage{}, err
	}
	size := int(r.PageSize)
	if size == 0 {
		size = 256
	}
	if size > 256 {
		return resource.SourcePage{}, fmt.Errorf("page size exceeds 256")
	}
	metadata, err := releaseMetadata(ctx, c, scope[0].Value, size, r.Cursor)
	if err != nil {
		return resource.SourcePage{}, err
	}
	page := resource.SourcePage{Records: make([]resource.Record, 0, len(metadata.Items)), Count: resource.Count{Kind: "unknown"}, Coverage: resource.Coverage{Kind: "complete"}, Consistency: resource.ConsistencyBestEffort}
	if metadata.Continue != "" {
		page.NextCursor = &metadata.Continue
	}
	budget := 0
	for _, item := range metadata.Items {
		name := item.Labels["name"]
		if name == "" {
			return resource.SourcePage{}, fmt.Errorf("Helm storage entry lacks release name")
		}
		namespace := item.Namespace
		if namespace == "" {
			return resource.SourcePage{}, fmt.Errorf("Helm storage entry lacks namespace")
		}
		cfg, err := h.release.getConfig(ctx, c, namespace)
		if err != nil {
			return resource.SourcePage{}, err
		}
		version, err := latestReleaseVersion(ctx, c, namespace, name)
		if err != nil {
			return resource.SourcePage{}, err
		}
		get := action.NewGet(cfg)
		get.Version = version
		rel, err := get.Run(name)
		if err != nil {
			return resource.SourcePage{}, err
		}
		if strconv.Itoa(rel.Version) != item.Labels["version"] {
			continue
		}
		identityScope := []resource.ScopeEntry{{Dimension: "namespace", Value: namespace}}
		record, err := helmRecord(targetReference(r.Target, name, identityScope), releaseToMap(rel))
		if err != nil {
			return resource.SourcePage{}, err
		}
		size, err := resource.RecordWireSize(record)
		if err != nil {
			return resource.SourcePage{}, err
		}
		if size > (32<<20)-budget {
			return resource.SourcePage{}, fmt.Errorf("Helm source page exceeds 32 MiB")
		}
		budget += size
		page.Records = append(page.Records, record)
	}
	return page, nil
}

// latestReleaseVersion scans native metadata pages, never a materialized history.
func latestReleaseVersion(ctx context.Context, c *clients.ClientSet, namespace, name string) (int, error) {
	var cursor *string
	latest := 0
	for {
		page, err := namedReleaseMetadata(ctx, c, namespace, 256, cursor, name)
		if err != nil {
			return 0, err
		}
		for _, entry := range page.Items {
			version, err := strconv.Atoi(entry.Labels["version"])
			if err != nil || version < 1 {
				return 0, fmt.Errorf("invalid native Helm revision")
			}
			if version > latest {
				latest = version
			}
		}
		if page.Continue == "" {
			break
		}
		cursor = &page.Continue
	}
	if latest == 0 {
		return 0, fmt.Errorf("Helm release not found")
	}
	return latest, nil
}
