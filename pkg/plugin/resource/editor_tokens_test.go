package resource

import (
 "context"
 "encoding/base64"
 "encoding/json"
 "strings"
 "testing"

 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 authenticationv1 "k8s.io/api/authentication/v1"
 corev1 "k8s.io/api/core/v1"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/runtime"
 "k8s.io/apimachinery/pkg/runtime/schema"
 "k8s.io/apimachinery/pkg/types"
 "k8s.io/client-go/kubernetes/fake"
 clienttesting "k8s.io/client-go/testing"
)

// Isolated trusted-response fixture, intentionally not a signed credential.
func returnedTokenFixture(name,namespace,uid string)string{
 claims,_:=json.Marshal(map[string]any{"sub":"system:serviceaccount:"+namespace+":"+name,"kubernetes.io":map[string]any{"namespace":namespace,"serviceaccount":map[string]any{"name":name,"uid":uid}}})
 return base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"fixture-only"}`))+"."+base64.RawURLEncoding.EncodeToString(claims)+".fixture-signature"
}

func TestEditorGateDisabledTokenForReplacementAccountIsDiscarded(t *testing.T){
 client:=fake.NewSimpleClientset(&corev1.ServiceAccount{ObjectMeta:metav1.ObjectMeta{Name:"builder",Namespace:"team",UID:"account-a"}})
 creates,minted:=0,0
 returnedToken:=returnedTokenFixture("builder","team","account-b")
 client.PrependReactor("create","serviceaccounts",func(action clienttesting.Action)(bool,runtime.Object,error){
  if action.GetSubresource()!="token" {return false,nil,nil}
  creates++
  body:=action.(clienttesting.CreateAction).GetObject().(*authenticationv1.TokenRequest)
  if body.UID!="account-a" {t.Error("token request did not preserve observed UID")}
  replacement:=&corev1.ServiceAccount{ObjectMeta:metav1.ObjectMeta{Name:"builder",Namespace:"team",UID:"account-b"}}
  if err:=client.Tracker().Update(schema.GroupVersionResource{Version:"v1",Resource:"serviceaccounts"},replacement,"team");err!=nil{return true,nil,err}
  // Gate-disabled TokenREST preserves requested metadata.uid A but builds
  // standard token claims from the actual replacement service account B.
  response:=body.DeepCopy()
  response.Status.Token=returnedToken
  minted++
  return true,response,nil
 })
 binding,request:=editorTokenRequestFixture(t)
 result,err:=editorAction(context.Background(),&clients.ClientSet{KubeClient:client},binding,request)
 if resourcev2.ErrorCode(err)!="CONFLICT" || result.Kind!="" || creates!=1 || minted!=1 {t.Fatal("replacement credential was delivered or request retried")}
 if strings.Contains(err.Error(),returnedToken) || strings.Contains(err.Error(),"account-b") {t.Fatal("token or private claim leaked in error")}
}

func TestEditorReturnsOnlyTokenMatchingObservedAccount(t *testing.T){
 client:=fake.NewSimpleClientset(&corev1.ServiceAccount{ObjectMeta:metav1.ObjectMeta{Name:"builder",Namespace:"team",UID:"account-a"}})
 client.PrependReactor("create","serviceaccounts",func(action clienttesting.Action)(bool,runtime.Object,error){
  if action.GetSubresource()!="token" {return false,nil,nil}
  body:=action.(clienttesting.CreateAction).GetObject().(*authenticationv1.TokenRequest)
  response:=body.DeepCopy()
  response.Status.Token=returnedTokenFixture("builder","team","account-a")
  return true,response,nil
 })
 binding,request:=editorTokenRequestFixture(t)
 result,err:=editorAction(context.Background(),&clients.ClientSet{KubeClient:client},binding,request)
 if err!=nil || result.Map["status"].Map["token"].String=="" {t.Fatal("matching trusted-response credential rejected")}
}

func TestReturnedTokenRequiresStandardIdentityClaimsWithoutAuthenticationClaim(t *testing.T){
 for _,test:=range []struct{token,code string}{
  {returnedTokenFixture("builder","team","account-a"),""},
  {returnedTokenFixture("other","team","account-a"),"CONFLICT"},
  {returnedTokenFixture("builder","other","account-a"),"CONFLICT"},
  {returnedTokenFixture("builder","team","account-b"),"CONFLICT"},
  {"opaque-server-value","UNAVAILABLE"},
  {"header.invalid-base64!.signature","UNAVAILABLE"},
  {"header."+base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"system:serviceaccount:team:builder"}`))+".signature","UNAVAILABLE"},
 } {
  response:=&authenticationv1.TokenRequest{ObjectMeta:metav1.ObjectMeta{Name:"builder",Namespace:"team",UID:types.UID("account-a")},Status:authenticationv1.TokenRequestStatus{Token:test.token}}
  err:=validateReturnedServiceAccountToken(response,"builder","team","account-a")
  if resourcev2.ErrorCode(err)!=test.code {t.Fatal("incorrect trusted-response token binding decision")}
  if err!=nil && strings.Contains(err.Error(),test.token) {t.Fatal("credential echoed by validator")}
 }
}
