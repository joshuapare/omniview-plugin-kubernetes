package helm

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"strconv"
	"strings"
)

// normalizeJSONNumbers preserves integer tokens while adapting Helm's JSON metadata.
// Release Config bypasses this conversion and retains its original native scalar types.
func normalizeJSONNumbers(value any) any {
	switch v := value.(type) {
	case json.Number:
		if n, err := v.Int64(); err == nil {
			return n
		}
		if n, err := v.Float64(); err == nil {
			return n
		}
		return v
	case map[string]interface{}:
		for key, item := range v {
			v[key] = normalizeJSONNumbers(item)
		}
	case []interface{}:
		for i, item := range v {
			v[i] = normalizeJSONNumbers(item)
		}
	}
	return value
}

func validateActionInput(request resource.ActionRequest) error {
	if err := resource.ValidateValue(request.Input); err != nil {
		return err
	}
	if request.Input.Kind != "map" && request.Input.Kind != "null" {
		return fmt.Errorf("Helm action input must be an object or null")
	}
	for _, key := range []string{"revision", "revision1", "revision2", "max"} {
		value, exists := request.Input.Map[key]
		if !exists {
			continue
		}
		if value.Kind != "int64" {
			return fmt.Errorf("%s must retain signed integer intent", key)
		}
		number, err := strconv.ParseInt(value.Int, 10, 32)
		if err != nil || number < 0 {
			return fmt.Errorf("%s is outside Helm integer range", key)
		}
		if key == "max" && (number < 1 || number > 256) {
			return fmt.Errorf("history max must be between 1 and 256")
		}
	}
	return nil
}

// helmEditorSchema preserves the raw native schema as an auxiliary editor
// schema keyed by release. The host normalizes it and decides dialect support.
func helmEditorSchema(document []byte, key string) (resource.EditorSchema, int, error) {
	if err := resource.ValidateJSON(document); err != nil {
		return resource.EditorSchema{}, 0, err
	}
	dialect := resource.DialectJSONSchemaDraft07
	trimmed := bytes.TrimSpace(document)
	if len(trimmed) > 0 && trimmed[0] == '{' {
		var declaration struct {
			Dialect string `json:"$schema"`
		}
		if err := json.Unmarshal(document, &declaration); err != nil {
			return resource.EditorSchema{}, 0, resource.NewError("INVALID_REQUEST", "invalid Helm schema declaration")
		}
		if declaration.Dialect != "" {
			dialect = helmSchemaDialect(declaration.Dialect)
		}
	} else if !bytes.Equal(trimmed, []byte("true")) && !bytes.Equal(trimmed, []byte("false")) {
		return resource.EditorSchema{}, 0, resource.NewError("INVALID_REQUEST", "Helm schema must be an object or boolean")
	}
	digest := sha256.Sum256(document)
	revision := hex.EncodeToString(digest[:])
	schema := resource.EditorSchema{
		Type: ReleaseType, Key: key, Language: "yaml",
		Binding: resource.SchemaBinding{
			State: "available", Revision: &revision, Dialect: dialect, Root: "",
			Document: document,
		},
	}
	// Bound retained raw documents plus worst-case escaped metadata before the
	// caller appends another schema. The fixed allowance covers field syntax.
	metadataBytes := 1024 + 6*(len(schema.Type)+len(key)+len(schema.Language)+len(dialect)+len(revision))
	if metadataBytes > resource.MaxDocumentBytes || len(document) > resource.MaxDocumentBytes-metadataBytes {
		return resource.EditorSchema{}, 0, resource.NewError("RESOURCE_LIMIT", "Helm editor schema exceeds presentation budget")
	}
	return schema, metadataBytes + len(document), nil
}

// helmSchemaDialect maps a chart's $schema to the SDK dialect constant when it
// names draft-07 or 2020-12, ignoring the http/https scheme and an empty
// trailing fragment. Any other declaration is reported verbatim.
func helmSchemaDialect(declared string) string {
	canonical := strings.TrimSuffix(declared, "#")
	if rest, ok := strings.CutPrefix(canonical, "https://"); ok {
		canonical = rest
	} else if rest, ok := strings.CutPrefix(canonical, "http://"); ok {
		canonical = rest
	} else {
		return declared
	}
	switch canonical {
	case "json-schema.org/draft-07/schema":
		return resource.DialectJSONSchemaDraft07
	case "json-schema.org/draft/2020-12/schema":
		return resource.DialectJSONSchema202012
	}
	return declared
}
