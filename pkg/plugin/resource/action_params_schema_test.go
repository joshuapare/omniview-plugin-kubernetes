package resource

import (
	"context"
	"testing"

	"github.com/omniview/kubernetes/pkg/plugin/helm"
	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

// TestUnaryActionsDeclareParamsSchema keeps every unary action schema-typed so
// generated MCP tools advertise an explicit (possibly empty) params object.
func TestUnaryActionsDeclareParamsSchema(t *testing.T) {
	logger := zap.NewNop().Sugar()
	helpers := map[string]any{
		helm.ReleaseType: helm.NewReleaseResourcer(logger),
		"helm:repos":     helm.NewRepoResourcerWithActions(logger),
		"helm:charts":    helm.NewChartResourcerWithActions(logger),
	}
	for token, helper := range nativeSpecializedHelpers(logger, nil) {
		helpers[token] = helper
	}
	checked := 0
	for token, helper := range helpers {
		actions, ok := helper.(interface {
			GetActions(context.Context, *clients.ClientSet) ([]resourcev2.ActionDescriptor, error)
		})
		if !ok {
			continue
		}
		descriptors, err := actions.GetActions(context.Background(), nil)
		require.NoError(t, err, token)
		for _, descriptor := range descriptors {
			if descriptor.Streaming {
				continue
			}
			checked++
			require.NotNilf(t, descriptor.ParamsSchema, "%s action %q has no ParamsSchema", token, descriptor.ID)
		}
	}
	require.NotZero(t, checked)
}
