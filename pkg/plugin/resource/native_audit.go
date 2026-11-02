package resource

import (
	"context"

	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	"github.com/omniview/kubernetes/pkg/plugin/resource/resourcers/extras/benchmark"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
)

const auditType = "audit:polaris"

func auditResourceType() resourcev2.ResourceType {
	return resourcev2.ResourceType{
		Type: auditType, DisplayName: "ClusterBenchmark",
		IdentityDimensions: []resourcev2.Dimension{}, QueryDimensions: []resourcev2.Dimension{},
		DefaultRepresentation: "kubernetes.polaris-audit.v1",
		Representations:       []resourcev2.Representation{{ID: "kubernetes.polaris-audit.v1", Revision: "kubernetes.polaris-audit.v1", Schema: resourcev2.SchemaBinding{State: "absent"}}},
		Capabilities:          []resourcev2.Capability{{Operation: resourcev2.OperationEnumerate, Scope: resourcev2.QueryScope{}}},
	}
}

func auditRegistration() resourcev2.Registration[clients.ClientSet] {
	auditor := &benchmark.ClusterBenchmarker{}
	descriptor := auditResourceType()
	return resourcev2.Registration[clients.ClientSet]{
		Type: auditType,
		Enumerate: func(ctx context.Context, client *clients.ClientSet, request resourcev2.EnumerateRequest) (resourcev2.SourcePage, error) {
			if request.Cursor != nil {
				return resourcev2.SourcePage{}, resourcev2.NewError("CONTINUATION_EXPIRED", "A cluster audit has no continuation")
			}
			if request.PageSize == 0 {
				return resourcev2.SourcePage{}, resourcev2.NewError("INVALID_REQUEST", "Audit page size must be positive")
			}
			body, err := auditor.Audit(ctx, client)
			if err != nil {
				return resourcev2.SourcePage{}, err
			}
			if err := ctx.Err(); err != nil {
				return resourcev2.SourcePage{}, err
			}
			total := "1"
			page := resourcev2.SourcePage{
				Records: []resourcev2.Record{{
					Reference: resourcev2.ResourceReference{Address: resourcev2.ResourceAddress{Provider: request.Target.Provider, Authority: request.Target.Authority, Type: auditType, Scope: []resourcev2.ScopeEntry{}, ID: "cluster"}},
					Body:      body, Representation: descriptor.Representations[0], Coverage: nativeCompleteCoverage(),
				}},
				Count: resourcev2.Count{Kind: "exact", Value: &total}, Coverage: nativeCompleteCoverage(), Consistency: resourcev2.ConsistencyBestEffort,
			}
			return page, resourcev2.ValidateSourcePage(page)
		},
	}
}
