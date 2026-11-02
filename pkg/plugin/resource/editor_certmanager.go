package resource

import (
 "context"
 "time"
 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 authorizationv1 "k8s.io/api/authorization/v1"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func editorCertManager(ctx context.Context,client *clients.ClientSet,binding nativeType,request resourcev2.ActionRequest,namespace string)(resourcev2.Value,error){
 if client==nil || client.DynamicClient==nil {return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Kubernetes dynamic client is unavailable")}
 input:=request.Input.Map
 operation,revision:=input["operation"].String,input["resourceVersion"].String
 if revision=="" || request.Reference.Address.ID=="" {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Workflow requires exact object and observed resourceVersion")}
 resource:=nativeResourceClient(client.DynamicClient,binding.GVR,true,namespace)
 current,err:=resource.Get(ctx,request.Reference.Address.ID,metav1.GetOptions{})
 if err!=nil{return resourcev2.Value{},err}
 if current.GetResourceVersion()!=revision || request.Reference.Incarnation!=nil && string(current.GetUID())!=*request.Reference.Incarnation{return resourcev2.Value{},resourcev2.NewError("CONFLICT","cert-manager object changed")}
 conditionType,reason,message:="","",""
 switch {
 case operation=="renew" && binding.GVR.Resource=="certificates":
  conditionType,reason,message="Issuing","ManuallyTriggered","Certificate re-issuance manually triggered"
 case (operation=="approve" || operation=="deny") && binding.GVR.Resource=="certificaterequests":
  if client.KubeClient==nil {return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Kubernetes authorization client is unavailable")}
  issuer,_,_:=unstructured.NestedString(current.Object,"spec","issuerRef","name")
  kind,_,_:=unstructured.NestedString(current.Object,"spec","issuerRef","kind")
  group,_,_:=unstructured.NestedString(current.Object,"spec","issuerRef","group")
  if group!="" && group!="cert-manager.io" {return resourcev2.Value{},resourcev2.NewError("UNSUPPORTED","External issuer approval is not supported")}
  signer:="issuers.cert-manager.io/"+namespace+"."+issuer
  if kind=="ClusterIssuer" {signer="clusterissuers.cert-manager.io/"+issuer} else if kind!="" && kind!="Issuer" {return resourcev2.Value{},resourcev2.NewError("UNSUPPORTED","Issuer kind is unsupported")}
  if issuer=="" {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Issuer identity missing")}
  review,reviewErr:=client.KubeClient.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx,&authorizationv1.SelfSubjectAccessReview{Spec:authorizationv1.SelfSubjectAccessReviewSpec{ResourceAttributes:&authorizationv1.ResourceAttributes{Group:"cert-manager.io",Resource:"signers",Name:signer,Verb:"approve"}}},metav1.CreateOptions{})
  if reviewErr!=nil{return resourcev2.Value{},reviewErr}
  if !review.Status.Allowed || review.Status.Denied {return resourcev2.Value{},resourcev2.NewError("FORBIDDEN","Signer approval is not permitted")}
  conditionType,reason,message="Approved","OmniviewApproval","Certificate request approved"
  if operation=="deny" {conditionType,reason,message="Denied","OmniviewDenial","Certificate request denied"}
 default:return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Workflow does not match cert-manager target")
 }
 conditions,_,err:=unstructured.NestedSlice(current.Object,"status","conditions")
 if err!=nil{return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Invalid cert-manager conditions")}
 kept:=make([]any,0,len(conditions)+1)
 for _,raw:=range conditions {
  condition,ok:=raw.(map[string]any)
  if !ok{return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Invalid cert-manager condition")}
  if binding.GVR.Resource=="certificaterequests" && (condition["type"]=="Approved" || condition["type"]=="Denied") {return resourcev2.Value{},resourcev2.NewError("CONFLICT","Certificate request already decided")}
  if condition["type"]!=conditionType {kept=append(kept,condition)} else if condition["status"]=="True" {return resourcev2.Value{},resourcev2.NewError("CONFLICT","Workflow is already active")}
 }
 kept=append(kept,map[string]any{"type":conditionType,"status":"True","reason":reason,"message":message,"lastTransitionTime":time.Now().UTC().Format(time.RFC3339),"observedGeneration":current.GetGeneration()})
 if err=unstructured.SetNestedSlice(current.Object,kept,"status","conditions");err!=nil{return resourcev2.Value{},err}
 _,err=resource.UpdateStatus(ctx,current,metav1.UpdateOptions{})
 if err!=nil{return resourcev2.Value{},err}
 return resourcev2.ValueFromNative(map[string]any{"accepted":true,"operation":operation})
}
