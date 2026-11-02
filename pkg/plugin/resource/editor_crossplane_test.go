package resource

import (
 "context"
 "errors"
 "testing"
 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 authorizationv1 "k8s.io/api/authorization/v1"
 apierrors "k8s.io/apimachinery/pkg/api/errors"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
 "k8s.io/apimachinery/pkg/runtime"
 "k8s.io/apimachinery/pkg/runtime/schema"
 dynamicfake "k8s.io/client-go/dynamic/fake"
 kubefake "k8s.io/client-go/kubernetes/fake"
 clienttesting "k8s.io/client-go/testing"
)

func activationFixture(t *testing.T,allowed bool)(*clients.ClientSet,nativeType,resourcev2.ActionRequest){
 t.Helper()
 binding:=editorTestBinding("pkg.crossplane.io","v1","providerrevisions","ProviderRevision",false)
 controller:=true
 owner:=&unstructured.Unstructured{Object:map[string]any{"apiVersion":"pkg.crossplane.io/v1","kind":"Provider","metadata":map[string]any{"name":"provider","uid":"owner-uid","resourceVersion":"owner-1"},"spec":map[string]any{"revisionActivationPolicy":"Manual"}}}
 revision:=func(name,uid,state string)*unstructured.Unstructured{
  object:=&unstructured.Unstructured{Object:map[string]any{"apiVersion":"pkg.crossplane.io/v1","kind":"ProviderRevision","metadata":map[string]any{"name":name,"uid":uid,"resourceVersion":"1"},"spec":map[string]any{"desiredState":state,"package":"private-registry/credential-sensitive-package"}}}
  object.SetOwnerReferences([]metav1.OwnerReference{{APIVersion:"pkg.crossplane.io/v1",Kind:"Provider",Name:"provider",UID:"owner-uid",Controller:&controller}})
  return object
 }
 dynamic:=dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),map[schema.GroupVersionResource]string{binding.GVR:"ProviderRevisionList"},owner,revision("next","next-uid","Inactive"),revision("previous","previous-uid","Active"))
 kube:=kubefake.NewSimpleClientset()
 kube.PrependReactor("create","selfsubjectaccessreviews",func(clienttesting.Action)(bool,runtime.Object,error){return true,&authorizationv1.SelfSubjectAccessReview{Status:authorizationv1.SubjectAccessReviewStatus{Allowed:allowed}},nil})
 request:=resourcev2.ActionRequest{Reference:resourcev2.ResourceReference{Address:resourcev2.ResourceAddress{ID:"next"}},Action:crossplaneActivationProtocol,Input:editorTestValue(t,map[string]any{"phase":"preview"})}
 return &clients.ClientSet{DynamicClient:dynamic,KubeClient:kube},binding,request
}
func executeActivationInput(t *testing.T,plan activationPlan)resourcev2.Value{
 t.Helper();confirmed:=[]activationConfirmation{}
 for _,change:=range plan.Changes{confirmed=append(confirmed,activationConfirmation{Name:change.Name,UID:change.UID,ResourceVersion:change.ResourceVersion})}
 value,err:=activationResultValue(activationInput{Phase:"execute",Plan:plan,Confirmed:confirmed});if err!=nil{t.Fatal(err)};return value
}

func TestCrossplaneActivationReviewsEveryChangeAndTransitionsSiblingFirst(t *testing.T){
 client,binding,request:=activationFixture(t,true)
 plan,err:=previewCrossplaneActivation(context.Background(),client,binding,request)
 if err!=nil{t.Fatal(err)}
 if len(plan.Changes)!=2 || plan.Changes[0].Name!="previous" || plan.Changes[0].To!="Inactive" || plan.Changes[1].Name!="next" || plan.Atomic {t.Fatal("activation plan omitted competing revision or claims atomicity")}
 request.Input=executeActivationInput(t,plan)
 result,err:=editorCrossplaneActivation(context.Background(),client,binding,request)
 if err!=nil{t.Fatal(err)}
 if result.Map["status"].String!="completed" || len(result.Map["applied"].List)!=2 || len(result.Map["pending"].List)!=0 {t.Fatal("activation transition incomplete")}
 for name,want:=range map[string]string{"next":"Active","previous":"Inactive"}{object,getErr:=client.DynamicClient.Resource(binding.GVR).Get(context.Background(),name,metav1.GetOptions{});if getErr!=nil || activationState(object)!=want{t.Fatal("wrong revision state")}}
}

func TestCrossplaneActivationRejectsOwnerPolicyRaceBeforeAnyPatch(t *testing.T){
 client,binding,request:=activationFixture(t,true)
 plan,err:=previewCrossplaneActivation(context.Background(),client,binding,request);if err!=nil{t.Fatal(err)}
 owners:=client.DynamicClient.Resource(binding.GVR.GroupVersion().WithResource("providers"))
 owner,err:=owners.Get(context.Background(),"provider",metav1.GetOptions{});if err!=nil{t.Fatal(err)}
 owner.SetResourceVersion("owner-2");_ = unstructured.SetNestedField(owner.Object,"Automatic","spec","revisionActivationPolicy")
 if _,err=owners.Update(context.Background(),owner,metav1.UpdateOptions{});err!=nil{t.Fatal(err)}
 request.Input=executeActivationInput(t,plan)
 _,err=editorCrossplaneActivation(context.Background(),client,binding,request)
 if err==nil{t.Fatal("activation ignored owner policy race")}
 for _,action:=range client.DynamicClient.(*dynamicfake.FakeDynamicClient).Actions(){if action.GetVerb()=="patch"{t.Fatal("stale plan wrote revision")}}
}

func TestCrossplaneActivationDeniedPreviewNeverMutates(t *testing.T){
 client,binding,request:=activationFixture(t,false)
 _,err:=editorCrossplaneActivation(context.Background(),client,binding,request)
 if resourcev2.ErrorCode(err)!="FORBIDDEN"{t.Fatal("denied patch permission ignored")}
 for _,action:=range client.DynamicClient.(*dynamicfake.FakeDynamicClient).Actions(){if action.GetVerb()=="patch"{t.Fatal("denied preview mutated revision")}}
}

func TestCrossplaneActivationReportsPartialFailureWithoutSuccessOrDiagnostics(t *testing.T){
 client,binding,request:=activationFixture(t,true)
 plan,err:=previewCrossplaneActivation(context.Background(),client,binding,request);if err!=nil{t.Fatal(err)}
 client.DynamicClient.(*dynamicfake.FakeDynamicClient).PrependReactor("patch","providerrevisions",func(action clienttesting.Action)(bool,runtime.Object,error){if action.(clienttesting.PatchAction).GetName()=="next"{return true,nil,apierrors.NewForbidden(binding.GVR.GroupResource(),"next",errors.New("private diagnostic"))};return false,nil,nil})
 request.Input=executeActivationInput(t,plan)
 result,err:=editorCrossplaneActivation(context.Background(),client,binding,request)
 if err!=nil{t.Fatal(err)}
 if result.Map["status"].String!="partial" || len(result.Map["applied"].List)!=1 || len(result.Map["pending"].List)!=1 || result.Map["failure"].Map["status"].String!="FORBIDDEN" {t.Fatal("partial activation was misrepresented")}
}

func TestCrossplaneActivationRequiresEveryUIDRevisionConfirmation(t *testing.T){
 client,binding,request:=activationFixture(t,true)
 plan,err:=previewCrossplaneActivation(context.Background(),client,binding,request);if err!=nil{t.Fatal(err)}
 request.Input=executeActivationInput(t,plan)
 confirmations:=request.Input.Map["confirmed"]
 confirmations.List=confirmations.List[:1]
 request.Input.Map["confirmed"]=confirmations
 _,err=editorCrossplaneActivation(context.Background(),client,binding,request)
 if err==nil{t.Fatal("activation accepted partial confirmation")}
 for _,action:=range client.DynamicClient.(*dynamicfake.FakeDynamicClient).Actions(){if action.GetVerb()=="patch"{t.Fatal("unconfirmed plan mutated revision")}}
}
