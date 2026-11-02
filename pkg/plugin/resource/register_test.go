package resource

import (
	"context"
	"github.com/omniview/kubernetes/pkg/plugin/resource/clients"
	resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"strings"
	"testing"
)

func TestNativeRegistrationUsesCatalogBindingAndIndependentOperations(t *testing.T) {
	backend := boundaryClient(boundaryObject("native-name", "selected"))
	controller, _ := boundaryProvider(t, backend)
	catalog, err := controller.Catalog(context.Background(), resourcev2.CatalogRequest{Route: boundaryGet().Route})
	require.NoError(t, err)
	require.Len(t, catalog.Types, 1)
	descriptor := catalog.Types[0]
	require.Equal(t, "k8s:/pods", descriptor.Type)
	require.Equal(t, boundaryRepresentation().ID, descriptor.DefaultRepresentation)
	require.Equal(t, []resourcev2.Dimension{{Name: "namespace"}}, descriptor.IdentityDimensions)
	require.Equal(t, []resourcev2.Representation{boundaryRepresentation()}, descriptor.Representations)
	ctx := resourcev2.WithCatalogRevisionForRoute(context.Background(), "kubernetes", boundaryGet().Route, catalog.Revision)
	for _, old := range []string{"core::v1::Pod", "core/pods", "pods"} {
		request := boundaryGet()
		request.Reference.Address.Type = old
		_, err := controller.Get(ctx, request)
		require.Equal(t, "UNSUPPORTED", resourcev2.ErrorCode(err), old)
	}
}

func TestNativeRegistrationRetainsCreateOnlyAndSnapshotOnlyTypes(t *testing.T) {
	for _, verbs := range [][]string{{"create"}, {"get"}, {"list"}, {"watch"}, {"list", "watch"}, {"update"}, {"delete"}, {}} {
		t.Run(strings.Join(verbs, "-"), func(t *testing.T) {
			representation := boundaryRepresentation()
			p := &kubernetesProvider{logger: zap.NewNop().Sugar(), catalogs: map[string]*nativeCatalogSnapshot{"cluster": {bindings: map[string]nativeType{"k8s:/pods": {GVR: boundaryGVR, API: metav1.APIResource{Name: "pods", Kind: "Pod", Namespaced: true, Verbs: verbs}, Descriptor: resourcev2.ResourceType{Type: "k8s:/pods", Representations: []resourcev2.Representation{representation}}}}}}}
			snapshot := p.catalogs["cluster"]
			snapshot.registrations = map[string]resourcev2.Registration[clients.ClientSet]{"k8s:/pods": p.nativeRegistration(boundaryGet().Route, snapshot.bindings["k8s:/pods"])}
			registration, err := p.registration(context.Background(), boundaryGet().Route, "k8s:/pods")
			require.NoError(t, err)
			require.Equal(t, verbSliceContains(verbs, "get"), registration.Get != nil)
			require.Equal(t, verbSliceContains(verbs, "list"), registration.Enumerate != nil)
			require.Equal(t, verbSliceContains(verbs, "create") || verbSliceContains(verbs, "update") || verbSliceContains(verbs, "delete"), registration.Mutate != nil)
			require.Equal(t, verbSliceContains(verbs, "list") && verbSliceContains(verbs, "watch"), registration.Source != nil)
		})
	}
}
