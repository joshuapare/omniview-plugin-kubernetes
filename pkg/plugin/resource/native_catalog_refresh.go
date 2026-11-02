package resource

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
)

const nativeCatalogRefreshInterval = 30 * time.Second

type nativeCatalogRefresh struct {
	done chan struct{}
	err  error
}

// Catalog acquisition is demand-driven, not a CRD watcher. Each active cluster
// can perform one discovery acquisition per interval. Concurrent callers share
// that acquisition; failures remain errors until the next permitted attempt.
func (p *kubernetesProvider) refreshNativeCatalog(ctx context.Context, connectionID string, client *clients.ClientSet) error {
	p.mu.Lock()
	previous := p.catalogs[connectionID]
	if previous == nil {
		p.mu.Unlock()
		return resourcev2.NewError("UNAVAILABLE", "Connection catalog is not available")
	}
	if refresh := p.catalogRefreshes[connectionID]; refresh != nil {
		p.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-refresh.done:
			return refresh.err
		}
	}
	if time.Now().Before(previous.nextRefresh) {
		err := previous.refreshError
		p.mu.Unlock()
		return err
	}
	refresh := &nativeCatalogRefresh{done: make(chan struct{})}
	if p.catalogRefreshes == nil {
		p.catalogRefreshes = make(map[string]*nativeCatalogRefresh)
	}
	p.catalogRefreshes[connectionID] = refresh
	p.mu.Unlock()

	var snapshot *nativeCatalogSnapshot
	var changed bool
	timeout, err := resourcev2.ConnectionAcquisitionTimeout(ctx)
	if err == nil {
		acquisition, cancel := context.WithTimeout(ctx, timeout)
		snapshot, changed, err = p.acquireNativeCatalog(acquisition, connectionID, client, previous)
		cancel()
	}
	p.mu.Lock()
	if p.catalogs[connectionID] != previous || ctx.Err() != nil {
		if err == nil {
			err = resourcev2.NewError("RESET_REQUIRED", "Native connection catalog acquisition was retired")
		}
	} else {
		if err == nil && changed {
			p.catalogs[connectionID] = snapshot
		}
		current := p.catalogs[connectionID]
		current.nextRefresh = time.Now().Add(nativeCatalogRefreshInterval)
		current.refreshError = err
	}
	if p.catalogRefreshes[connectionID] == refresh {
		delete(p.catalogRefreshes, connectionID)
	}
	refresh.err = err
	close(refresh.done)
	p.mu.Unlock()
	if changed {
		if err != nil {
			snapshot.schemaLease.Release()
		} else {
			previous.schemaLease.Release()
		}
	}
	return err
}

func (p *kubernetesProvider) acquireNativeCatalog(ctx context.Context, connectionID string, client *clients.ClientSet, previous *nativeCatalogSnapshot) (*nativeCatalogSnapshot, bool, error) {
	bindings, coverage, err := discoverNativeTypes(ctx, client.DiscoveryClient)
	if err != nil {
		return nil, false, err
	}
	identity, err := nativeClusterIdentity(ctx, client.KubeClient)
	if err != nil {
		return nil, false, err
	}
	var hint *resourcev2.NativeAuthorityHint
	if identity != nil {
		hint = &resourcev2.NativeAuthorityHint{Scheme: "kubernetes.namespace-uid.v1", ID: *identity, Continuity: resourcev2.ContinuityConnectionLocal}
	}
	if previous != nil && previous.identityHint != nil && (hint == nil || hint.ID != previous.identityHint.ID) {
		return nil, false, resourcev2.NewError("RESET_REQUIRED", "Native Kubernetes backing identity changed; reconnect before acquiring resources")
	}
	watchScope, err := p.connections.ResolveScope(ctx, client)
	if err != nil {
		return nil, false, err
	}
	encoded, err := json.Marshal(struct {
		Bindings   map[string]nativeType
		Coverage   resourcev2.Coverage
		Identity   *resourcev2.NativeAuthorityHint
		WatchScope resourcev2.QueryScope
	}{bindings, coverage, hint, watchScope})
	if err != nil {
		return nil, false, err
	}
	digest := sha256.Sum256(encoded)
	revision := hex.EncodeToString(digest[:])
	schemas, failures, lease := fetchNativeSchemas(ctx, client.DiscoveryClient.RESTClient(), nativeSchemaBindings(bindings), &p.schemaBudget)
	if err := ctx.Err(); err != nil {
		lease.Release()
		return nil, false, err
	}
	snapshot, err := p.assembleNativeCatalog(ctx, connectionID, client, bindings, coverage, schemas, failures, hint, watchScope)
	if err != nil {
		lease.Release()
		return nil, false, err
	}
	if previous != nil && previous.discoveryRevision == revision && previous.catalog.Revision == snapshot.catalog.Revision {
		lease.Release()
		return previous, false, nil
	}
	snapshot.schemaLease = lease
	snapshot.discoveryRevision = revision
	return snapshot, true, nil
}
