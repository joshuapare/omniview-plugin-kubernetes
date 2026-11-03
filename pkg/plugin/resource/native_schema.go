package resource

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"

	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/rest"
)

// nativeSchemaDocument keeps the adapter-corrected OpenAPI document and its native root.
// It does not normalize dialects, rewrite references, or claim validation.
// All types from one group/version share the same bounded document bytes.
type nativeSchemaDocument struct {
	Document json.RawMessage
	Root     string
	Revision string
}

const maxNativeSchemaBytes = 16 << 20
const maxNativeRetainedSchemaBytes = 32 << 20

// nativeSchemaBudget bounds retained document bytes across every connection on
// one provider. Its staging gate admits one acquisition, with at most four
// documents being fetched, buffered, or decoded, rather than the previous one.
// Each schema read retains its 16 MiB cap. The resource response transport can
// also buffer up to its separate 32 MiB wire cap and copy those bytes, so this
// document count does not imply a whole-stack memory cap.
// The zero value uses the production retained limit.
type nativeSchemaBudget struct {
	// Accounting never holds mu during network reads or decoding.
	mu        sync.Mutex
	staging   chan struct{}
	limit     int
	used      int
	documents map[string]*nativeRetainedSchema
}

type nativeRetainedSchema struct {
	data       json.RawMessage
	references int
}

// nativeSchemaLease belongs to one catalog snapshot. Release it on failed
// publication, replacement, or connection teardown, after dropping its cache.
type nativeSchemaLease struct {
	budget    *nativeSchemaBudget
	documents map[string]struct{}
}

func (l *nativeSchemaLease) Release() {
	if l == nil {
		return
	}
	l.budget.mu.Lock()
	defer l.budget.mu.Unlock()
	for revision := range l.documents {
		document := l.budget.documents[revision]
		document.references--
		if document.references == 0 {
			l.budget.used -= len(document.data)
			delete(l.budget.documents, revision)
		}
	}
	l.documents = nil
}

// Identical schema content can be held by old and replacement snapshots without
// double-charging the provider budget. Staging remains separately bounded.
func (b *nativeSchemaBudget) retain(data json.RawMessage, revision string, lease *nativeSchemaLease) (json.RawMessage, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	document := b.documents[revision]
	if document == nil {
		limit := b.limit
		if limit == 0 {
			limit = maxNativeRetainedSchemaBytes
		}
		if len(data) > limit-b.used {
			return nil, fmt.Errorf("native OpenAPI retained schema budget exhausted (%d bytes)", limit)
		}
		if cap(data) != len(data) {
			exact := make([]byte, len(data))
			copy(exact, data)
			data = exact
		}
		document = &nativeRetainedSchema{data: data}
		if b.documents == nil {
			b.documents = make(map[string]*nativeRetainedSchema)
		}
		b.documents[revision] = document
		b.used += len(data)
	}
	if lease.documents == nil {
		lease.documents = make(map[string]struct{})
	}
	if _, held := lease.documents[revision]; !held {
		lease.documents[revision] = struct{}{}
		document.references++
	}
	return document.data, nil
}

// Preferred-version schema keys retain the established token lookup. Other
// served endpoints get distinct keys while retaining the same logical type.
func nativeSchemaKey(token string, preferred, served schema.GroupVersionResource) string {
	if preferred == served {
		return token
	}
	return token + "@" + served.GroupVersion().String()
}

func nativeSchemaBindings(bindings map[string]nativeType) map[string]nativeType {
	result := make(map[string]nativeType)
	for token, binding := range bindings {
		for _, served := range nativeServedVersions(binding) {
			result[nativeSchemaKey(token, binding.GVR, served.GVR)] = nativeType{GVR: served.GVR, API: served.API}
		}
	}
	return result
}

func fetchNativeSchemas(ctx context.Context, client rest.Interface, bindings map[string]nativeType, budget *nativeSchemaBudget) (map[string]nativeSchemaDocument, map[string]error, *nativeSchemaLease) {
	budget.mu.Lock()
	if budget.staging == nil {
		budget.staging = make(chan struct{}, 1)
	}
	staging := budget.staging
	budget.mu.Unlock()
	lease := &nativeSchemaLease{budget: budget}
	select {
	case staging <- struct{}{}:
		defer func() { <-staging }()
	case <-ctx.Done():
		failures := make(map[string]error, len(bindings))
		for token := range bindings {
			failures[token] = ctx.Err()
		}
		return map[string]nativeSchemaDocument{}, failures, lease
	}
	byGroup := make(map[schema.GroupVersion][]string)
	for token, binding := range bindings {
		gv := binding.GVR.GroupVersion()
		byGroup[gv] = append(byGroup[gv], token)
	}
	result := make(map[string]nativeSchemaDocument, len(bindings))
	failures := make(map[string]error)
	groups := make([]schema.GroupVersion, 0, len(byGroup))
	for gv := range byGroup {
		groups = append(groups, gv)
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].String() < groups[j].String() })
	type fetchedSchema struct {
		data []byte
		err  error
	}
	workerCount := min(nativeCatalogRequestConcurrency, len(groups))
	jobs := make(chan int, workerCount)
	prefetched := make([]chan fetchedSchema, workerCount)
	var workers sync.WaitGroup
	for i := range prefetched {
		prefetched[i] = make(chan fetchedSchema, 1)
	}
	for range workerCount {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for index := range jobs {
				if ctx.Err() != nil {
					return
				}
				gv := groups[index]
				path := "/openapi/v3/apis/" + gv.Group + "/" + gv.Version
				if gv.Group == "" {
					path = "/openapi/v3/api/" + gv.Version
				}
				data, err := readNativeSchema(ctx, client, path)
				// Each slot receives only one job until its prior document has
				// been decoded. A canceled consumer can leave one result per
				// slot without blocking workers or retaining further documents.
				prefetched[index%workerCount] <- fetchedSchema{data: data, err: err}
			}
		}()
	}
	defer func() {
		close(jobs)
		workers.Wait()
	}()
	for index := range workerCount {
		jobs <- index
	}
	for index, gv := range groups {
		tokens := byGroup[gv]
		if err := ctx.Err(); err != nil {
			for _, token := range tokens {
				failures[token] = err
			}
			continue
		}
		// Refill only after the previous iteration finishes decoding and
		// retaining its document. The rolling window includes that document,
		// not just network requests, and retention stays in sorted GV order.
		if next := index + workerCount - 1; index > 0 && next < len(groups) {
			jobs <- next
		}
		var fetched fetchedSchema
		select {
		case fetched = <-prefetched[index%workerCount]:
		case <-ctx.Done():
			fetched.err = ctx.Err()
		}
		data, err := fetched.data, fetched.err
		if err != nil {
			for _, token := range tokens {
				failures[token] = err
			}
			continue
		}
		if err := resourcev2.ValidateJSON(data); err != nil {
			for _, token := range tokens {
				failures[token] = err
			}
			continue
		}
		var document struct {
			Components struct {
				Schemas map[string]json.RawMessage `json:"schemas"`
			} `json:"components"`
		}
		if err := json.Unmarshal(data, &document); err != nil {
			for _, token := range tokens {
				failures[token] = fmt.Errorf("invalid native OpenAPI document: %w", err)
			}
			continue
		}
		data, err = correctNativeTimeSchemas(data)
		if err != nil {
			for _, token := range tokens {
				failures[token] = err
			}
			continue
		}
		digest := sha256.Sum256(data)
		revision := hex.EncodeToString(digest[:])
		roots := make(map[schema.GroupVersionKind]string)
		ambiguous := make(map[schema.GroupVersionKind]bool)
		for name, body := range document.Components.Schemas {
			var descriptor struct {
				Kinds []struct {
					Group   string `json:"group"`
					Version string `json:"version"`
					Kind    string `json:"kind"`
				} `json:"x-kubernetes-group-version-kind"`
			}
			if err := json.Unmarshal(body, &descriptor); err != nil {
				continue
			}
			root := "#/components/schemas/" + escapeJSONPointer(name)
			for _, kind := range descriptor.Kinds {
				key := schema.GroupVersionKind{Group: kind.Group, Version: kind.Version, Kind: kind.Kind}
				if prior, exists := roots[key]; exists && prior != root {
					ambiguous[key] = true
				}
				roots[key] = root
			}
		}
		retained := false
		for _, token := range tokens {
			binding := bindings[token]
			key := gv.WithKind(binding.API.Kind)
			if ambiguous[key] {
				failures[token] = fmt.Errorf("ambiguous native OpenAPI root for %q", token)
				continue
			}
			root := roots[key]
			if root == "" {
				failures[token] = fmt.Errorf("native OpenAPI root unavailable for %q", token)
				continue
			}
			if !retained {
				data, err = budget.retain(data, revision, lease)
				if err != nil {
					for _, token := range tokens {
						failures[token] = err
					}
					break
				}
				retained = true
			}
			result[token] = nativeSchemaDocument{Document: data, Root: root, Revision: revision}
		}
	}
	return result, failures, lease
}

// correctNativeTimeSchemas changes only the two Kubernetes time components.
// The input remains untouched, and unchanged documents retain their exact bytes.
func correctNativeTimeSchemas(data []byte) ([]byte, error) {
	type replacement struct {
		start, end int
		body       []byte
	}
	var replacements []replacement
	// The document was validated before this scan. Locate values without
	// decoding or copying unrelated, potentially large, document sections.
	skipSpace := func(i int) int {
		for i < len(data) && (data[i] == ' ' || data[i] == '\n' || data[i] == '\r' || data[i] == '\t') {
			i++
		}
		return i
	}
	skipString := func(i int) int {
		i++
		for i < len(data) {
			if data[i] == '\\' {
				i += 2
			} else if data[i] == '"' {
				return i + 1
			} else {
				i++
			}
		}
		return i
	}
	skipValue := func(i int) int {
		depth := 0
		for i < len(data) {
			switch data[i] {
			case '"':
				i = skipString(i)
				continue
			case '{', '[':
				depth++
			case '}', ']':
				if depth == 0 {
					return i
				}
				depth--
				if depth == 0 {
					return i + 1
				}
			case ',', ' ', '\n', '\r', '\t':
				if depth == 0 {
					return i
				}
			}
			i++
		}
		return i
	}
	var walk func(int, int) error
	walk = func(start, level int) error {
		if start >= len(data) || data[start] != '{' {
			return fmt.Errorf("native OpenAPI time component location is invalid")
		}
		i := skipSpace(start + 1)
		for data[i] != '}' {
			end := skipString(i)
			var name string
			_ = json.Unmarshal(data[i:end], &name) // Already validated.
			i = skipSpace(end)
			i = skipSpace(i + 1) // Colon.
			end = skipValue(i)
			if (level == 0 && name == "components") || (level == 1 && name == "schemas") {
				if err := walk(i, level+1); err != nil {
					return err
				}
			} else if level == 2 && (name == "io.k8s.apimachinery.pkg.apis.meta.v1.Time" || name == "io.k8s.apimachinery.pkg.apis.meta.v1.MicroTime") {
				var fields map[string]json.RawMessage
				if err := json.Unmarshal(data[i:end], &fields); err != nil || fields == nil {
					return fmt.Errorf("invalid native OpenAPI component %q: expected object", name)
				}
				if !bytes.Equal(bytes.TrimSpace(fields["nullable"]), []byte("true")) {
					fields["nullable"] = json.RawMessage("true")
					corrected, err := json.Marshal(fields)
					if err != nil {
						return fmt.Errorf("invalid native OpenAPI component %q: %w", name, err)
					}
					replacements = append(replacements, replacement{start: i, end: end, body: corrected})
				}
			}
			i = skipSpace(end)
			if data[i] == ',' {
				i = skipSpace(i + 1)
			}
		}
		return nil
	}
	if err := walk(skipSpace(0), 0); err != nil {
		return nil, err
	}
	if len(replacements) == 0 {
		return data, nil
	}
	size := len(data)
	for _, r := range replacements {
		size += len(r.body) - (r.end - r.start)
	}
	if size > maxNativeSchemaBytes {
		return nil, fmt.Errorf("native OpenAPI document exceeds %d bytes", maxNativeSchemaBytes)
	}
	result := make([]byte, 0, size)
	last := 0
	for _, r := range replacements {
		result = append(result, data[last:r.start]...)
		result = append(result, r.body...)
		last = r.end
	}
	result = append(result, data[last:]...)
	return result, nil
}

func readNativeSchema(ctx context.Context, client rest.Interface, path string) ([]byte, error) {
	stream, err := client.Get().AbsPath(path).Stream(ctx)
	if err != nil {
		return nil, err
	}
	defer stream.Close()
	limit := maxNativeSchemaBytes
	data, err := io.ReadAll(io.LimitReader(stream, int64(limit)+1))
	if err != nil {
		return nil, err
	}
	if len(data) > limit {
		return nil, fmt.Errorf("native OpenAPI document exceeds %d bytes", maxNativeSchemaBytes)
	}
	return data, ctx.Err()
}

func escapeJSONPointer(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}
