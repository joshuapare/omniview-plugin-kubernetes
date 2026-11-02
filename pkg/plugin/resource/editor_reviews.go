package resource

import (
 "context"
 "encoding/json"
 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 authenticationv1 "k8s.io/api/authentication/v1"
 authorizationv1 "k8s.io/api/authorization/v1"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func editorCreateReview(ctx context.Context,client *clients.ClientSet,kind,namespace string,data []byte)(any,error){
 switch kind {
 case "TokenReview":
  var body authenticationv1.TokenReview
  if err:=json.Unmarshal(data,&body);err!=nil{return nil,err}
  return client.KubeClient.AuthenticationV1().TokenReviews().Create(ctx,&body,metav1.CreateOptions{})
 case "SelfSubjectReview":
  var body authenticationv1.SelfSubjectReview
  if err:=json.Unmarshal(data,&body);err!=nil{return nil,err}
  return client.KubeClient.AuthenticationV1().SelfSubjectReviews().Create(ctx,&body,metav1.CreateOptions{})
 case "SubjectAccessReview":
  var body authorizationv1.SubjectAccessReview
  if err:=json.Unmarshal(data,&body);err!=nil{return nil,err}
  return client.KubeClient.AuthorizationV1().SubjectAccessReviews().Create(ctx,&body,metav1.CreateOptions{})
 case "SelfSubjectAccessReview":
  var body authorizationv1.SelfSubjectAccessReview
  if err:=json.Unmarshal(data,&body);err!=nil{return nil,err}
  return client.KubeClient.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx,&body,metav1.CreateOptions{})
 case "LocalSubjectAccessReview":
  var body authorizationv1.LocalSubjectAccessReview
  if err:=json.Unmarshal(data,&body);err!=nil{return nil,err}
  body.Namespace=namespace
  return client.KubeClient.AuthorizationV1().LocalSubjectAccessReviews(namespace).Create(ctx,&body,metav1.CreateOptions{})
 case "SelfSubjectRulesReview":
  var body authorizationv1.SelfSubjectRulesReview
  if err:=json.Unmarshal(data,&body);err!=nil{return nil,err}
  return client.KubeClient.AuthorizationV1().SelfSubjectRulesReviews().Create(ctx,&body,metav1.CreateOptions{})
 default:return nil,resourcev2.NewError("UNSUPPORTED","Unsupported review kind")
 }
}
