package resource

import (
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/omniviewdev/plugin-sdk/pkg/types"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// The plugin serves the OpenAPI document and root rather than a traversal API.
// Resolve its local JSON pointers here to check what consumers can traverse.
func podSchemaResolve(t *testing.T, document map[string]any, node map[string]any) map[string]any {
	t.Helper()
	seen := map[string]bool{}
	for {
		ref, ok := node["$ref"].(string)
		if !ok {
			if allOf, exists := node["allOf"]; exists {
				parts, ok := allOf.([]any)
				require.True(t, ok)
				require.Len(t, parts, 1, "fixture traversal expects a single allOf reference")
				node, ok = parts[0].(map[string]any)
				require.True(t, ok)
				continue
			}
			return node
		}
		require.True(t, strings.HasPrefix(ref, "#/"), "non-local ref %q", ref)
		require.False(t, seen[ref], "cyclic ref %q", ref)
		seen[ref] = true
		var value any = document
		for _, part := range strings.Split(strings.TrimPrefix(ref, "#/"), "/") {
			part = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
			object, ok := value.(map[string]any)
			require.True(t, ok, "invalid ref %q", ref)
			value, ok = object[part]
			require.True(t, ok, "missing ref %q", ref)
		}
		node, ok = value.(map[string]any)
		require.True(t, ok, "ref %q is not an object", ref)
	}
}

func podSchemaObject(t *testing.T, node map[string]any, key string) map[string]any {
	t.Helper()
	value, ok := node[key].(map[string]any)
	require.True(t, ok, "%q must be an object", key)
	return value
}

func TestNativePodSchemaTraversalFromClusterOpenAPI(t *testing.T) {
	// Full document recorded from a v1.37.2 cluster at /openapi/v3/api/v1.
	file, err := os.Open("testdata/openapi-v3-api-v1.json.gz")
	require.NoError(t, err)
	defer file.Close()
	reader, err := gzip.NewReader(file)
	require.NoError(t, err)
	defer reader.Close()
	fixture, err := io.ReadAll(reader)
	require.NoError(t, err)

	f, client := newRefreshHTTPFixture(t)
	f.mu.Lock()
	f.documents["/openapi/v3/api/v1"] = string(fixture)
	f.mu.Unlock()
	p := refreshTestProvider()
	ctx, connection := refreshTestContext("pod-schema-cluster")
	require.NoError(t, p.startNativeConnection(ctx, connection, client))
	t.Cleanup(func() { p.retireNativeCatalog(connection.ID) })

	controller, err := resourcev2.NewController(resourcev2.Config[clients.ClientSet]{Catalog: p.catalog, Lifecycle: &resourcev2.Lifecycle[clients.ClientSet]{
		LoadConnections: func(context.Context) ([]types.Connection, error) { return []types.Connection{connection}, nil },
		CreateClient:    func(context.Context, types.Connection) (*clients.ClientSet, error) { return client, nil },
		DestroyClient:   (&kubeConnectionProvider{logger: zap.NewNop().Sugar()}).DestroyClient,
	}})
	require.NoError(t, err)
	p.Controller = controller
	t.Cleanup(func() { require.NoError(t, controller.Close()) })
	_, err = controller.LoadConnections(context.Background())
	require.NoError(t, err)
	_, err = controller.StartConnection(context.Background(), connection.ID)
	require.NoError(t, err)
	route := resourcev2.AccessRoute{Connection: connection.ID}

	descriptor := p.catalogs[connection.ID].bindings["k8s:/pods"].Descriptor
	var binding resourcev2.SchemaBinding
	for _, representation := range descriptor.Representations {
		if representation.ID == descriptor.DefaultRepresentation {
			binding = representation.Schema
		}
	}
	require.Equal(t, "available", binding.State)
	require.NotNil(t, binding.Revision)
	require.NotNil(t, binding.DocumentRef)
	require.Equal(t, *binding.Revision, binding.DocumentRef.Revision)
	served, err := p.GetSchemaDocument(ctx, route, *binding.DocumentRef)
	require.NoError(t, err)
	digest := sha256.Sum256(served.Document)
	require.Equal(t, hex.EncodeToString(digest[:]), *binding.Revision)
	require.Equal(t, hex.EncodeToString(digest[:]), served.Reference.Revision)
	var source map[string]any
	require.NoError(t, json.Unmarshal(fixture, &source))
	sourceSchemas := podSchemaObject(t, podSchemaObject(t, source, "components"), "schemas")
	for _, name := range []string{"io.k8s.apimachinery.pkg.apis.meta.v1.Time", "io.k8s.apimachinery.pkg.apis.meta.v1.MicroTime"} {
		component := podSchemaObject(t, sourceSchemas, name)
		require.NotEqual(t, true, component["nullable"])
		component["nullable"] = true
	}
	var actual map[string]any
	require.NoError(t, json.Unmarshal(served.Document, &actual))
	require.Equal(t, source, actual, "served schema must differ only in time nullability")
	var document map[string]any
	require.NoError(t, json.Unmarshal(served.Document, &document))
	root := podSchemaResolve(t, document, map[string]any{"$ref": binding.Root})
	properties := podSchemaObject(t, root, "properties")
	spec := podSchemaResolve(t, document, podSchemaObject(t, properties, "spec"))
	require.Equal(t, "object", spec["type"])
	require.NotEmpty(t, podSchemaObject(t, spec, "properties"))
	containers := podSchemaObject(t, podSchemaObject(t, spec, "properties"), "containers")
	require.Equal(t, "array", containers["type"])
	items := podSchemaObject(t, containers, "items")
	require.Contains(t, items["$ref"], ".Container")
	container := podSchemaResolve(t, document, items)
	fields := podSchemaObject(t, container, "properties")
	require.Equal(t, "string", podSchemaObject(t, fields, "name")["type"])
	require.Equal(t, "array", podSchemaObject(t, fields, "ports")["type"])
	resources := podSchemaObject(t, fields, "resources")
	parts, ok := resources["allOf"].([]any)
	require.True(t, ok)
	require.Len(t, parts, 1)
	resourceRef, ok := parts[0].(map[string]any)
	require.True(t, ok)
	require.Contains(t, resourceRef["$ref"], ".ResourceRequirements")
	require.NotEmpty(t, podSchemaObject(t, podSchemaResolve(t, document, resources), "properties"))
	metadata := podSchemaResolve(t, document, podSchemaObject(t, properties, "metadata"))
	labels := podSchemaObject(t, podSchemaObject(t, metadata, "properties"), "labels")
	require.Equal(t, "object", labels["type"])
	require.Equal(t, "string", podSchemaObject(t, labels, "additionalProperties")["type"])
	require.NotContains(t, labels, "properties")
}
