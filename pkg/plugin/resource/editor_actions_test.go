package resource

import (
 "context"
 "encoding/json"
 "net/http"
 "net/http/httptest"
 "strings"
 "sync"
 "testing"

 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 authenticationv1 "k8s.io/api/authentication/v1"
 certificatesv1 "k8s.io/api/certificates/v1"
 corev1 "k8s.io/api/core/v1"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
 "k8s.io/apimachinery/pkg/runtime"
 "k8s.io/apimachinery/pkg/runtime/schema"
 "k8s.io/apimachinery/pkg/types"
 dynamicfake "k8s.io/client-go/dynamic/fake"
 kubeclient "k8s.io/client-go/kubernetes"
 "k8s.io/client-go/kubernetes/fake"
 "k8s.io/client-go/rest"
 clienttesting "k8s.io/client-go/testing"
)

func editorTestBinding(group,version,plural,kind string,namespaced bool) nativeType {
 return nativeType{GVR:schema.GroupVersionResource{Group:group,Version:version,Resource:plural},API:metav1.APIResource{Name:plural,Kind:kind,Namespaced:namespaced,Verbs:metav1.Verbs{"create","list","get","update"}},Descriptor:resourcev2.ResourceType{Type:"k8s:"+group+"/"+plural},Subresources:map[string]metav1.APIResource{"approval":{Verbs:metav1.Verbs{"update"}}}}
}
func editorTestValue(t *testing.T,input any)resourcev2.Value{t.Helper();value,err:=resourcev2.ValueFromNative(input);if err!=nil{t.Fatal(err)};return value}

func TestEditorNamelessTokenReviewReturnsStatusWithoutBearer(t *testing.T){
 client:=fake.NewSimpleClientset()
 client.PrependReactor("create","tokenreviews",func(action clienttesting.Action)(bool,runtime.Object,error){
  review:=action.(clienttesting.CreateAction).GetObject().(*authenticationv1.TokenReview)
  if review.Name!="" || review.Spec.Token!="private-bearer" {t.Fatal("request lost nameless review or token")}
  review.Status.Authenticated=true
  return true,review,nil
 })
 binding:=editorTestBinding("authentication.k8s.io","v1","tokenreviews","TokenReview",false)
 result,err:=editorAction(context.Background(),&clients.ClientSet{KubeClient:client},binding,resourcev2.ActionRequest{TypeTarget:&resourcev2.TypeActionTarget{},Action:editorReview,Input:editorTestValue(t,map[string]any{"apiVersion":"authentication.k8s.io/v1","kind":"TokenReview","spec":map[string]any{"token":"private-bearer"}})})
 if err!=nil{t.Fatal(err)}
 if _,exists:=result.Map["spec"];exists{t.Fatal("review echoed sensitive input")}
 if !result.Map["status"].Map["authenticated"].Bool{t.Fatal("real review status missing")}
}

func TestEditorCSRApprovalPreservesExistingConditions(t *testing.T){
 current:=&certificatesv1.CertificateSigningRequest{ObjectMeta:metav1.ObjectMeta{Name:"csr",ResourceVersion:"7"},Status:certificatesv1.CertificateSigningRequestStatus{Conditions:[]certificatesv1.CertificateSigningRequestCondition{{Type:"AdapterObserved",Status:"True"}}}}
 client:=fake.NewSimpleClientset(current)
 binding:=editorTestBinding("certificates.k8s.io","v1","certificatesigningrequests","CertificateSigningRequest",false)
 _,err:=editorAction(context.Background(),&clients.ClientSet{KubeClient:client},binding,resourcev2.ActionRequest{Reference:resourcev2.ResourceReference{Address:resourcev2.ResourceAddress{ID:"csr"}},Action:"kubernetes.csr-approval.v1",Input:editorTestValue(t,map[string]any{"metadata":map[string]any{"name":"csr","resourceVersion":"7"},"status":map[string]any{"conditions":[]any{map[string]any{"type":"Approved","status":"True"}}}})})
 if err!=nil{t.Fatal(err)}
 found:=false
 for _,action:=range client.Actions(){if update,ok:=action.(clienttesting.UpdateAction);ok {found=true;if update.GetSubresource()!="approval"{t.Fatal("approval bypassed subresource")};body:=update.GetObject().(*certificatesv1.CertificateSigningRequest);if len(body.Status.Conditions)!=2 || body.Status.Conditions[0].Type!="AdapterObserved"{t.Fatal("approval erased existing condition")}}}
 if !found{t.Fatal("approval never reached Kubernetes")}
}

func TestEditorSecretReferenceNegotiationNeverFallsBack(t *testing.T){
 calls:=0
 server:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){calls++;if !strings.Contains(r.Header.Get("Accept"),"as=Table") || strings.Contains(r.Header.Get("Accept"),",application/json"){t.Error("unsafe Secret negotiation")};w.Header().Set("Content-Type","application/json");_,_=w.Write([]byte(`{"apiVersion":"v1","kind":"SecretList","items":[{"metadata":{"name":"credential"},"data":{"token":"private"}}]}`))}))
 defer server.Close()
 binding:=editorTestBinding("","v1","secrets","Secret",true)
 _,err:=editorReferences(context.Background(),&clients.ClientSet{RESTConfig:&rest.Config{Host:server.URL},HTTPClient:server.Client()},binding,"ns",editorTestValue(t,map[string]any{"projection":"secretType"}))
 if err==nil || calls!=1 {t.Fatal("Secret lookup accepted full object or retried unsafely")}
}

func TestEditorCancelledReferenceDoesNotCallServer(t *testing.T){
 calls:=0
 server:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){calls++}))
 defer server.Close()
 ctx,cancel:=context.WithCancel(context.Background());cancel()
 _,err:=editorReferences(ctx,&clients.ClientSet{RESTConfig:&rest.Config{Host:server.URL},HTTPClient:server.Client()},editorTestBinding("","v1","secrets","Secret",true),"ns",editorTestValue(t,map[string]any{}))
 if err==nil || calls!=0{t.Fatal("cancelled lookup reached network")}
}

func TestEditorMetadataReferenceReturnsRealEmptyAndDeniedSeparately(t *testing.T){
 denied:=false
 server:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  if r.Header.Get("Accept")!="application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1" {t.Error("metadata negotiation missing")}
  if denied {w.WriteHeader(http.StatusForbidden);return}
  w.Header().Set("Content-Type","application/json")
  _,_=w.Write([]byte(`{"apiVersion":"meta.k8s.io/v1","kind":"PartialObjectMetadataList","items":[]}`))
 }))
 defer server.Close()
 client:=&clients.ClientSet{RESTConfig:&rest.Config{Host:server.URL},HTTPClient:server.Client()}
 binding:=editorTestBinding("","v1","secrets","Secret",true)
 result,err:=editorReferences(context.Background(),client,binding,"team",editorTestValue(t,map[string]any{}))
 if err!=nil || len(result.Map["items"].List)!=0 {t.Fatal("empty list not returned honestly")}
 denied=true
 _,err=editorReferences(context.Background(),client,binding,"team",editorTestValue(t,map[string]any{}))
 if resourcev2.ErrorCode(err)!="FORBIDDEN" {t.Fatal("denial turned into empty list")}
}

func TestEditorActionsReportOnlyMissingRequiredClients(t *testing.T){
 reviewBinding:=editorTestBinding("authentication.k8s.io","v1","tokenreviews","TokenReview",false)
 reviewRequest:=resourcev2.ActionRequest{TypeTarget:&resourcev2.TypeActionTarget{},Action:editorReview,Input:editorTestValue(t,map[string]any{"apiVersion":"authentication.k8s.io/v1","kind":"TokenReview","spec":map[string]any{"token":"private-bearer"}})}
 for _,client:=range []*clients.ClientSet{nil,{}} {
  _,err:=editorAction(context.Background(),client,reviewBinding,reviewRequest)
  if resourcev2.ErrorCode(err)!="UNAVAILABLE" {t.Fatal("missing typed client did not return safe unavailability")}
 }
 scaleBinding:=editorTestBinding("apps","v1","deployments","Deployment",true)
 scaleBinding.Subresources["scale"]=metav1.APIResource{Verbs:metav1.Verbs{"get"}}
 _,err:=editorAction(context.Background(),&clients.ClientSet{KubeClient:fake.NewSimpleClientset()},scaleBinding,resourcev2.ActionRequest{Reference:resourcev2.ResourceReference{Address:resourcev2.ResourceAddress{ID:"deployment",Scope:[]resourcev2.ScopeEntry{{Dimension:"namespace",Value:"team"}}}},Action:"kubernetes.scale.v1",Input:editorTestValue(t,map[string]any{})})
 if resourcev2.ErrorCode(err)!="UNAVAILABLE" {t.Fatal("missing dynamic client did not return safe unavailability")}
}

func editorTokenRequestFixture(t *testing.T)(nativeType,resourcev2.ActionRequest){
 t.Helper()
 binding:=editorTestBinding("","v1","serviceaccounts","ServiceAccount",true)
 binding.Subresources["token"]=metav1.APIResource{Verbs:metav1.Verbs{"create"}}
 uid:="account-a"
 request:=resourcev2.ActionRequest{Reference:resourcev2.ResourceReference{Address:resourcev2.ResourceAddress{ID:"builder",Scope:[]resourcev2.ScopeEntry{{Dimension:"namespace",Value:"team"}}},Incarnation:&uid},Action:"kubernetes.service-account-token.v1",Input:editorTestValue(t,map[string]any{"apiVersion":"authentication.k8s.io/v1","kind":"TokenRequest","spec":map[string]any{"audiences":[]any{"api"}}})}
 return binding,request
}

func TestEditorTokenRequestBindsUIDAcrossAccountReplacement(t *testing.T){
 // Emulate the v1.35 TokenREST UID check with its default-on validation gate:
 // account A is replaced by B after GET but before token creation.
 liveUID:=types.UID("account-a")
 var mu sync.Mutex
 gets,creates,minted:=0,0,0
 server:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  mu.Lock()
  defer mu.Unlock()
  w.Header().Set("Content-Type","application/json")
  switch {
  case r.Method==http.MethodGet && r.URL.Path=="/api/v1/namespaces/team/serviceaccounts/builder":
   gets++
   _=json.NewEncoder(w).Encode(&corev1.ServiceAccount{TypeMeta:metav1.TypeMeta{APIVersion:"v1",Kind:"ServiceAccount"},ObjectMeta:metav1.ObjectMeta{Name:"builder",Namespace:"team",UID:liveUID,ResourceVersion:"1"}})
   liveUID="account-b"
  case r.Method==http.MethodPost && r.URL.Path=="/api/v1/namespaces/team/serviceaccounts/builder/token":
   creates++
   var body authenticationv1.TokenRequest
   if json.NewDecoder(r.Body).Decode(&body)!=nil {t.Error("invalid typed token request");w.WriteHeader(400);return}
   if body.UID!="account-a" || body.Name!="builder" || body.Namespace!="team" {t.Error("token request lost observed service-account identity")}
   if body.UID!=liveUID {
    w.WriteHeader(http.StatusConflict)
    _=json.NewEncoder(w).Encode(&metav1.Status{TypeMeta:metav1.TypeMeta{APIVersion:"v1",Kind:"Status"},Status:metav1.StatusFailure,Reason:metav1.StatusReasonConflict,Code:409,Message:"service account UID differs"})
    return
   }
   minted++
   _=json.NewEncoder(w).Encode(&authenticationv1.TokenRequest{})
  default:t.Error("unexpected token request route");w.WriteHeader(404)
  }
 }))
 defer server.Close()
 // This isolated HTTP fixture speaks JSON; production clients may negotiate
 // Kubernetes protobuf. Keep the fixture encoding explicit, not production-only.
 client,err:=kubeclient.NewForConfig(&rest.Config{Host:server.URL,ContentConfig:rest.ContentConfig{ContentType:"application/json",AcceptContentTypes:"application/json"}})
 if err!=nil {t.Fatal(err)}
 binding,request:=editorTokenRequestFixture(t)
 _,err=editorAction(context.Background(),&clients.ClientSet{KubeClient:client},binding,request)
 mu.Lock()
 defer mu.Unlock()
 if resourcev2.ErrorCode(err)!="CONFLICT" || gets!=1 || creates!=1 || minted!=0 {t.Fatal("account replacement minted a token, retried, or lost conflict")}
}

func TestEditorTokenRequestRejectsConflictingBodyUIDBeforeCreate(t *testing.T){
 client:=fake.NewSimpleClientset(&corev1.ServiceAccount{ObjectMeta:metav1.ObjectMeta{Name:"builder",Namespace:"team",UID:"account-a"}})
 binding,request:=editorTokenRequestFixture(t)
 request.Input.Map["metadata"]=editorTestValue(t,map[string]any{"uid":"account-b"})
 _,err:=editorAction(context.Background(),&clients.ClientSet{KubeClient:client},binding,request)
 if resourcev2.ErrorCode(err)!="INVALID_REQUEST" {t.Fatal("conflicting token body UID accepted")}
 for _,action:=range client.Actions(){if action.GetVerb()=="create"{t.Fatal("conflicting body UID reached token endpoint")}}
}

func TestEditorScaleReadAcceptsTypelessDTOUsingOnlyDynamicClient(t *testing.T){
 dynamic:=dynamicfake.NewSimpleDynamicClient(runtime.NewScheme())
 reads:=0
 dynamic.PrependReactor("get","deployments",func(action clienttesting.Action)(bool,runtime.Object,error){
  if action.GetSubresource()!="scale" {t.Error("scale read targeted parent instead of scale subresource");return false,nil,nil}
  reads++
  return true,&unstructured.Unstructured{Object:map[string]any{"apiVersion":"autoscaling/v1","kind":"Scale","metadata":map[string]any{"name":"deployment","namespace":"team","resourceVersion":"1"},"spec":map[string]any{"replicas":int64(3)}}},nil
 })
 binding:=editorTestBinding("apps","v1","deployments","Deployment",true)
 binding.Subresources["scale"]=metav1.APIResource{Verbs:metav1.Verbs{"get"}}
 request:=resourcev2.ActionRequest{Reference:resourcev2.ResourceReference{Address:resourcev2.ResourceAddress{ID:"deployment",Scope:[]resourcev2.ScopeEntry{{Dimension:"namespace",Value:"team"}}}},Action:"kubernetes.scale.v1",Input:editorTestValue(t,map[string]any{})}
 result,err:=editorAction(context.Background(),&clients.ClientSet{DynamicClient:dynamic},binding,request)
 if err!=nil || reads!=1 || result.Map["spec"].Map["replicas"].Int!="3" {t.Fatal("typeless scale read DTO was rejected or misrouted")}
}

func TestEditorActionDTORejectsNonObjectWithoutAPICall(t *testing.T){
 client:=fake.NewSimpleClientset()
 binding:=editorTestBinding("authentication.k8s.io","v1","tokenreviews","TokenReview",false)
 _,err:=editorAction(context.Background(),&clients.ClientSet{KubeClient:client},binding,resourcev2.ActionRequest{TypeTarget:&resourcev2.TypeActionTarget{},Action:editorReview,Input:editorTestValue(t,[]any{})})
 if resourcev2.ErrorCode(err)!="INVALID_REQUEST" || len(client.Actions())!=0 {t.Fatal("non-object request reached Kubernetes")}
}
