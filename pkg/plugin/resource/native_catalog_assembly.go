package resource

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"sort"
)

// assembleNativeCatalog builds an unpublished snapshot. The startup caller owns
// acquisition cancellation, schema leases, retirement fencing, and publication.
func (p *kubernetesProvider) assembleNativeCatalog(ctx context.Context, connectionID string, client *clients.ClientSet, bindings map[string]nativeType, coverage resourcev2.Coverage, schemas map[string]nativeSchemaDocument, failures map[string]error, identityHint *resourcev2.NativeAuthorityHint, watchScope resourcev2.QueryScope) (*nativeCatalogSnapshot, error) {
	registrations := make(map[string]resourcev2.Registration[clients.ClientSet], len(bindings))
	documents := make(map[resourcev2.SchemaDocumentReference]resourcev2.SchemaDocument)
	for token, binding := range bindings {
		versions := nativeServedVersions(binding)
		binding.Descriptor.Representations = make([]resourcev2.Representation, 0, 2*len(versions))
		for _, served := range versions {
			gv := served.GVR.GroupVersion().String()
			representation := resourcev2.Representation{
				ID:       nativeRepresentationVersion + "/" + gv,
				Revision: nativeRepresentationVersion + "/" + gv,
				Schema:   resourcev2.SchemaBinding{State: "unavailable"},
			}
			key := nativeSchemaKey(token, binding.GVR, served.GVR)
			if document, ok := schemas[key]; ok {
				ref := resourcev2.SchemaDocumentReference{ID: "kubernetes.openapi.v3/" + gv, Revision: document.Revision}
				revision := document.Revision
				representation.Schema = resourcev2.SchemaBinding{
					State: "available", Revision: &revision, Dialect: resourcev2.DialectOpenAPI30, Root: document.Root,
					DocumentRef: &ref,
				}
				documents[ref] = resourcev2.SchemaDocument{Reference: ref, Dialect: resourcev2.DialectOpenAPI30, Document: document.Document}
			} else if failures[key] != nil {
				p.logger.Debugw("native schema unavailable", "type", token, "apiVersion", gv)
			}
			model := representation
			model.ID = nativeModelRepresentationVersion + "/" + gv
			model.Revision = nativeModelRepresentationVersion + "/" + gv
			binding.Descriptor.Representations = append(binding.Descriptor.Representations, representation, model)
		}
		if actions, ok := p.helpers[token].(nativeActionHelper); ok {
			descriptors, err := actions.GetActions(ctx, client)
			if err != nil {
				return nil, err
			}
			binding.Actions = descriptors
		}
		binding.Actions = append(binding.Actions, editorActionDescriptors(binding)...)
		if len(binding.Actions) != 0 {
			binding.Descriptor.Capabilities = append(binding.Descriptor.Capabilities, resourcev2.Capability{Operation: resourcev2.OperationAction, Scope: nativeTypeScope(binding)})
		}
		binding.Descriptor.DefaultRepresentation = nativeRepresentationVersion + "/" + binding.GVR.GroupVersion().String()
		binding.Descriptor.ModelRepresentation = nativeModelRepresentationVersion + "/" + binding.GVR.GroupVersion().String()
		binding.Descriptor.NativeAuthorityHint = identityHint
		if verbSliceContains(binding.API.Verbs, "list") && verbSliceContains(binding.API.Verbs, "watch") {
			scope := nativeTypeScope(binding)
			if binding.API.Namespaced {
				scope = watchScope
			}
			binding.Descriptor.Capabilities = append(binding.Descriptor.Capabilities, resourcev2.Capability{Operation: resourcev2.OperationSourceUpdates, Scope: scope, Guarantee: resourcev2.ContinuityBestEffort})
			binding.Descriptor.AcquireOnConnect = token != "k8s:/events" && token != "k8s:events.k8s.io/events"
		}
		if binding.API.Namespaced {
			for index := range binding.Descriptor.Capabilities {
				binding.Descriptor.Capabilities[index].Scope = watchScope
			}
		}
		bindings[token] = binding
		registrations[token] = p.nativeRegistration(resourcev2.AccessRoute{Connection: connectionID}, binding)
	}
	catalog := resourcev2.Catalog{Provider: "kubernetes", Types: sortedNativeTypes(bindings), Coverage: coverage}
	catalog.Types = append(catalog.Types, p.helmTypes...)
	catalog.Types = append(catalog.Types, auditResourceType())
	catalog.Types = append(catalog.Types, editorQueryResourceType())
	for index := range catalog.Types {
		if catalog.Types[index].Type == "helm:releases" {
			catalog.Types[index].NativeAuthorityHint = identityHint
		}
	}
	encoded, err := json.Marshal(struct {
		Provider string                    `json:"provider"`
		Types    []resourcev2.ResourceType `json:"types"`
		Coverage resourcev2.Coverage       `json:"coverage"`
	}{catalog.Provider, catalog.Types, catalog.Coverage})
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(encoded)
	catalog.Revision = hex.EncodeToString(digest[:])
	if err := resourcev2.ValidateCatalog(catalog); err != nil {
		return nil, err
	}
	return &nativeCatalogSnapshot{catalog: catalog, bindings: bindings, registrations: registrations, documents: documents, identityHint: identityHint}, nil
}

// Keep the preferred raw representation first for existing UI/watch consumers.
func nativeServedVersions(binding nativeType) []nativeServedType {
	if len(binding.Served) == 0 {
		return []nativeServedType{{GVR: binding.GVR, API: binding.API}}
	}
	versions := make([]string, 0, len(binding.Served))
	for version := range binding.Served {
		versions = append(versions, version)
	}
	sort.Strings(versions)
	result := make([]nativeServedType, 0, len(versions))
	result = append(result, binding.Served[binding.GVR.GroupVersion().String()])
	for _, version := range versions {
		if version != binding.GVR.GroupVersion().String() {
			result = append(result, binding.Served[version])
		}
	}
	return result
}
