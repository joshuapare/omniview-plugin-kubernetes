package resource

import (
 "context"
 "errors"
 "encoding/json"
 "strings"
 "testing"
 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 appsv1 "k8s.io/api/apps/v1"
 corev1 "k8s.io/api/core/v1"
 apierrors "k8s.io/apimachinery/pkg/api/errors"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
 "k8s.io/apimachinery/pkg/runtime"
 "k8s.io/apimachinery/pkg/runtime/schema"
 dynamicfake "k8s.io/client-go/dynamic/fake"
 kubefake "k8s.io/client-go/kubernetes/fake"
 clienttesting "k8s.io/client-go/testing"
)

func TestTigeraEvidenceReportsObservedCohortWithoutCredentialBodies(t *testing.T){
 deployment:=&appsv1.Deployment{ObjectMeta:metav1.ObjectMeta{Name:"tigera-operator",Namespace:"tigera-operator",UID:"controller-uid",ResourceVersion:"7",Generation:2},Spec:appsv1.DeploymentSpec{Template:corev1.PodTemplateSpec{Spec:corev1.PodSpec{Containers:[]corev1.Container{{Name:"tigera-operator",Image:"quay.io/tigera/operator:v1.38.0",Env:[]corev1.EnvVar{{Name:"PRIVATE",Value:"must-not-leak"}}}}}}},Status:appsv1.DeploymentStatus{ObservedGeneration:2,AvailableReplicas:1}}
 installation:=&unstructured.Unstructured{Object:map[string]any{"apiVersion":"operator.tigera.io/v1","kind":"Installation","metadata":map[string]any{"name":"default","uid":"installation-uid","resourceVersion":"4","generation":int64(3)},"spec":map[string]any{"variant":"Calico","proxy":map[string]any{"httpProxy":"must-not-leak"}},"status":map[string]any{"variant":"Calico","calicoVersion":"v3.30.0","computed":map[string]any{"private":"must-not-leak"},"conditions":[]any{map[string]any{"type":"Ready","status":"True","reason":"Ready","message":"must-not-leak"}}}}}
 client:=&clients.ClientSet{KubeClient:kubefake.NewSimpleClientset(deployment),DynamicClient:dynamicfake.NewSimpleDynamicClient(runtime.NewScheme(),installation)}
 result,err:=editorTigeraEvidence(context.Background(),client)
 if err!=nil{t.Fatal(err)}
 controller:=result.Map["controller"]
 if controller.Map["status"].String!="ready" || controller.Map["deployments"].List[0].Map["images"].List[0].Map["observedVersion"].String!="v1.38.0" {t.Fatal("actual image tag not observed")}
 if result.Map["installation"].Map["observed"].Map["calicoVersion"].String!="v3.30.0" {t.Fatal("actual installed Calico version missing")}
 if _,exists:=result.Map["installation"].Map["observed"].Map["observedGeneration"];exists {t.Fatal("invented Installation generation freshness")}
 if result.Map["apiServer"].Map["status"].String!="absent" || result.Map["goldmane"].Map["status"].String!="absent" {t.Fatal("missing prerequisites not distinguished")}
 data,_:=json.Marshal(result)
 if strings.Contains(string(data),"must-not-leak") {t.Fatal("credential echoed")}
 native,_:=resourcev2.NativeFromValue(result)
 encoded,_:=activationResultValue(native)
 if _,exists:=encoded.Map["installation"].Map["spec"].Map["proxy"];exists {t.Fatal("unapproved spec exposed")}
 if _,exists:=encoded.Map["installation"].Map["observed"].Map["conditions"].List[0].Map["message"];exists {t.Fatal("raw diagnostic exposed")}
}

func TestTigeraEvidencePreservesDeniedInsteadOfAbsent(t *testing.T){
 kube:=kubefake.NewSimpleClientset()
 kube.PrependReactor("get","deployments",func(clienttesting.Action)(bool,runtime.Object,error){return true,nil,apierrors.NewForbidden(schema.GroupResource{Group:"apps",Resource:"deployments"},"tigera-operator",errors.New("private diagnostic"))})
 evidence:=tigeraControllerEvidence(context.Background(),&clients.ClientSet{KubeClient:kube})
 if evidence["status"]!="denied" {t.Fatal("denied controller lookup became absent")}
 for _,action:=range kube.Actions(){if action.GetVerb()=="list"{t.Fatal("denied lookup broadened cluster access")}}
}

func TestTigeraDigestOnlyImageDoesNotInventVersion(t *testing.T){
 deployment:=&appsv1.Deployment{Spec:appsv1.DeploymentSpec{Template:corev1.PodTemplateSpec{Spec:corev1.PodSpec{Containers:[]corev1.Container{{Name:"tigera-operator",Image:"quay.io/tigera/operator@sha256:abcdef"}}}}}}
 evidence:=tigeraDeploymentEvidence(deployment)
 image:=evidence["images"].([]any)[0].(map[string]any)
 if _,exists:=image["observedVersion"];exists {t.Fatal("digest was treated as supported version")}
 if evidence["versionEvidence"]!="image-tag-only" {t.Fatal("tag evidence claimed signed proof")}
}
