package resource

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sync"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/rest"
)

const (
	nativeCatalogRequestConcurrency = 4
	maxNativeDiscoveryVersions      = 256
	maxNativeDiscoveryBytes         = 16 << 20
	maxNativeDiscoveryDocumentBytes = 4 << 20
)

// Native discovery uses the existing client's transport with the acquisition
// context. client-go's ServerGroupsAndResources has no context parameter.
func discoverNativeResources(ctx context.Context, client discovery.DiscoveryInterface) ([]*metav1.APIGroup, []*metav1.APIResourceList, error) {
	restClient := client.RESTClient()
	if _, native := client.(*discovery.DiscoveryClient); !native || restClient == nil {
		// Injected discovery implementations supply their own response.
		return client.ServerGroupsAndResources()
	}
	budget := &nativeDiscoveryBudget{remaining: maxNativeDiscoveryBytes + 1}
	budget.changed = sync.NewCond(&budget.mu)
	stop := context.AfterFunc(ctx, func() {
		budget.mu.Lock()
		budget.changed.Broadcast()
		budget.mu.Unlock()
	})
	defer stop()
	var core metav1.APIVersions
	if err := readNativeDiscovery(ctx, restClient, "/api", &core, budget); err != nil {
		return nil, nil, err
	}
	var advertised metav1.APIGroupList
	if err := readNativeDiscovery(ctx, restClient, "/apis", &advertised, budget); err != nil {
		return nil, nil, err
	}
	groups := make([]*metav1.APIGroup, 0, len(advertised.Groups))
	versions := make([]schema.GroupVersion, 0, len(core.Versions))
	for _, version := range core.Versions {
		versions = append(versions, schema.GroupVersion{Version: version})
	}
	for index := range advertised.Groups {
		group := &advertised.Groups[index]
		groups = append(groups, group)
		for _, version := range group.Versions {
			gv, err := schema.ParseGroupVersion(version.GroupVersion)
			if err != nil || gv.Group != group.Name || gv.Version != version.Version {
				return nil, nil, fmt.Errorf("invalid Kubernetes discovery group version")
			}
			versions = append(versions, gv)
		}
	}
	if len(versions) > maxNativeDiscoveryVersions {
		return nil, nil, fmt.Errorf("Kubernetes discovery exceeds the served-version budget")
	}
	seen := make(map[schema.GroupVersion]bool, len(versions))
	for _, gv := range versions {
		if seen[gv] || gv.Version == "" {
			return nil, nil, fmt.Errorf("invalid or duplicate Kubernetes discovery group version")
		}
		seen[gv] = true
	}
	type result struct {
		list metav1.APIResourceList
		err  error
	}
	results := make([]result, len(versions))
	workCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	var workers sync.WaitGroup
	var nextMu sync.Mutex
	next := 0
	for range min(nativeCatalogRequestConcurrency, len(versions)) {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for {
				nextMu.Lock()
				if next == len(versions) || workCtx.Err() != nil {
					nextMu.Unlock()
					return
				}
				index := next
				next++
				nextMu.Unlock()
				gv := versions[index]
				path := "/apis/" + gv.String()
				if gv.Group == "" {
					path = "/api/" + gv.Version
				}
				entry := &results[index]
				entry.err = readNativeDiscovery(workCtx, restClient, path, &entry.list, budget)
				if entry.err == nil && entry.list.GroupVersion != gv.String() {
					entry.err = fmt.Errorf("Kubernetes discovery returned a different group version")
					cancel()
				}
			}
		}()
	}
	workers.Wait()
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	// A mismatched response is a hard failure, not partial discovery.
	if workCtx.Err() != nil {
		return nil, nil, fmt.Errorf("Kubernetes discovery returned a different group version")
	}
	lists := make([]*metav1.APIResourceList, 0, len(versions))
	failed := make(map[schema.GroupVersion]error)
	for index, gv := range versions {
		entry := &results[index]
		if entry.err != nil {
			failed[gv] = entry.err
		} else {
			lists = append(lists, &entry.list)
		}
	}
	if len(failed) != 0 {
		return groups, lists, &discovery.ErrGroupDiscoveryFailed{Groups: failed}
	}
	return groups, lists, nil
}

// The budget reserves bytes before each read, then refunds unused allowance.
// Waiting readers share refunds without holding the lock across network I/O.
// This bounds discovery reads; the existing transport can buffer separately.
type nativeDiscoveryBudget struct {
	mu        sync.Mutex
	remaining int
	inFlight  int
	changed   *sync.Cond
}

type nativeDiscoveryReader struct {
	ctx    context.Context
	stream io.Reader
	budget *nativeDiscoveryBudget
}

func (r nativeDiscoveryReader) Read(p []byte) (int, error) {
	b := r.budget
	b.mu.Lock()
	for b.remaining == 0 && b.inFlight != 0 {
		if err := r.ctx.Err(); err != nil {
			b.mu.Unlock()
			return 0, err
		}
		b.changed.Wait()
	}
	if b.remaining == 0 {
		b.mu.Unlock()
		return 0, fmt.Errorf("Kubernetes discovery exceeds the byte budget")
	}
	limit := min(len(p), b.remaining, 32<<10)
	b.remaining -= limit
	b.inFlight++
	b.mu.Unlock()
	n, err := r.stream.Read(p[:limit])
	b.mu.Lock()
	b.remaining += limit - n
	b.inFlight--
	exceeded := b.remaining == 0 && b.inFlight == 0
	b.changed.Broadcast()
	b.mu.Unlock()
	if exceeded {
		return n, fmt.Errorf("Kubernetes discovery exceeds the byte budget")
	}
	return n, err
}

func readNativeDiscovery(ctx context.Context, client rest.Interface, path string, into any, budget *nativeDiscoveryBudget) error {
	budget.mu.Lock()
	exhausted := budget.remaining == 0 && budget.inFlight == 0
	budget.mu.Unlock()
	if exhausted {
		return fmt.Errorf("Kubernetes discovery exceeds the byte budget")
	}
	stream, err := client.Get().AbsPath(path).Stream(ctx)
	if err != nil {
		return err
	}
	defer stream.Close()
	reader := nativeDiscoveryReader{ctx: ctx, stream: stream, budget: budget}
	data, err := io.ReadAll(io.LimitReader(reader, maxNativeDiscoveryDocumentBytes+1))
	if err != nil {
		return err
	}
	if len(data) > maxNativeDiscoveryDocumentBytes {
		return fmt.Errorf("Kubernetes discovery exceeds the byte budget")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return json.Unmarshal(data, into)
}
