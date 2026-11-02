package resource

import (
 "context"
 "testing"
 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
 "k8s.io/apimachinery/pkg/runtime"
 dynamicfake "k8s.io/client-go/dynamic/fake"
)

func TestEditorCertificateRenewPreservesOtherStatusConditions(t *testing.T){
 binding:=editorTestBinding("cert-manager.io","v1","certificates","Certificate",true)
 object:=&unstructured.Unstructured{Object:map[string]any{"apiVersion":"cert-manager.io/v1","kind":"Certificate","metadata":map[string]any{"name":"tls","namespace":"team","resourceVersion":"7","generation":int64(3)},"status":map[string]any{"conditions":[]any{map[string]any{"type":"Ready","status":"True","reason":"Ready"}},"revision":int64(2)}}}
 dynamic:=dynamicfake.NewSimpleDynamicClient(runtime.NewScheme(),object)
 request:=resourcev2.ActionRequest{Reference:resourcev2.ResourceReference{Address:resourcev2.ResourceAddress{ID:"tls"}},Input:editorTestValue(t,map[string]any{"operation":"renew","resourceVersion":"7"})}
 _,err:=editorCertManager(context.Background(),&clients.ClientSet{DynamicClient:dynamic},binding,request,"team")
 if err!=nil{t.Fatal(err)}
 result,err:=dynamic.Resource(binding.GVR).Namespace("team").Get(context.Background(),"tls",metav1.GetOptions{})
 if err!=nil{t.Fatal(err)}
 conditions,_,_:=unstructured.NestedSlice(result.Object,"status","conditions")
 revision,_,_:=unstructured.NestedInt64(result.Object,"status","revision")
 if len(conditions)!=2 || conditions[0].(map[string]any)["type"]!="Ready" || conditions[1].(map[string]any)["reason"]!="ManuallyTriggered" || revision!=2 {t.Fatal("renewal erased existing status or did not trigger issuance")}
 for _,action:=range dynamic.Actions(){if action.GetVerb()=="update" && action.GetSubresource()!="status"{t.Fatal("renewal bypassed status subresource")}}
}
