package resource

import (
 "context"
 "encoding/json"
 "errors"
 "strings"

 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 authenticationv1 "k8s.io/api/authentication/v1"
 certificatesv1 "k8s.io/api/certificates/v1"
 policyv1 "k8s.io/api/policy/v1"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
 apierrors "k8s.io/apimachinery/pkg/api/errors"
 kubejson "k8s.io/apimachinery/pkg/util/json"
)

const editorReview = "kubernetes.review.v1"

func editorActionDescriptors(binding nativeType) []resourcev2.ActionDescriptor {
 result := []resourcev2.ActionDescriptor{}
 if verbSliceContains(binding.API.Verbs,"list") {result=append(result,resourcev2.ActionDescriptor{ID:"kubernetes.references.v1", Label:"Reference lookup", Scope:resourcev2.ActionScopeType})}
 token := binding.Descriptor.Type
 add := func(id, label string, scope resourcev2.ActionScope) { result = append(result, resourcev2.ActionDescriptor{ID:id,Label:label,Scope:scope}) }
 switch token {
 case "k8s:authentication.k8s.io/tokenreviews", "k8s:authentication.k8s.io/selfsubjectreviews", "k8s:authorization.k8s.io/subjectaccessreviews", "k8s:authorization.k8s.io/selfsubjectaccessreviews", "k8s:authorization.k8s.io/localsubjectaccessreviews", "k8s:authorization.k8s.io/selfsubjectrulesreviews":
  if binding.GVR.Version=="v1" && verbSliceContains(binding.API.Verbs,"create") {add(editorReview,"Execute review",resourcev2.ActionScopeType)}
 case "k8s:/serviceaccounts":
  if verbSliceContains(binding.Subresources["token"].Verbs,"create") {add("kubernetes.service-account-token.v1","Request token",resourcev2.ActionScopeInstance)}
 case "k8s:certificates.k8s.io/certificatesigningrequests":
  if verbSliceContains(binding.Subresources["approval"].Verbs,"update") {add("kubernetes.csr-approval.v1","Update approval",resourcev2.ActionScopeInstance)}
 case "k8s:/pods":
  if verbSliceContains(binding.Subresources["eviction"].Verbs,"create") {add("kubernetes.pod-eviction.v1","Evict pod",resourcev2.ActionScopeInstance)}
 case "k8s:cert-manager.io/certificates", "k8s:cert-manager.io/certificaterequests":
  if verbSliceContains(binding.Subresources["status"].Verbs,"update") {add("kubernetes.cert-manager.v1","cert-manager workflow",resourcev2.ActionScopeInstance)}
 case "k8s:pkg.crossplane.io/providerrevisions", "k8s:pkg.crossplane.io/configurationrevisions", "k8s:pkg.crossplane.io/functionrevisions":
  if verbSliceContains(binding.API.Verbs,"get") && verbSliceContains(binding.API.Verbs,"list") && verbSliceContains(binding.API.Verbs,"patch") {add(crossplaneActivationProtocol,"Review revision activation",resourcev2.ActionScopeInstance)}
 }
 if binding.GVR.Group == "metrics.k8s.io" || binding.GVR.Group == "custom.metrics.k8s.io" || binding.GVR.Group == "external.metrics.k8s.io" { add("kubernetes.metrics.v1","Query metrics",resourcev2.ActionScopeType) }
 if verbSliceContains(binding.Subresources["scale"].Verbs,"get") { add("kubernetes.scale.v1","Read or update scale",resourcev2.ActionScopeInstance) }
 return result
}

// Never return API diagnostic bodies: review and token input may contain credentials.
func editorSafeError(err error) error {
 if err == nil { return nil }
 var safe *resourcev2.ResourceOperationError
 if errors.As(err,&safe) { return safe }
 if errors.Is(err,context.Canceled) {return context.Canceled}
 if errors.Is(err,context.DeadlineExceeded) {return context.DeadlineExceeded}
 code := "UNAVAILABLE"
 if apierrors.IsForbidden(err) || apierrors.IsUnauthorized(err) { code = "FORBIDDEN" }
 if apierrors.IsNotFound(err) { code = "NOT_FOUND" }
 if apierrors.IsConflict(err) { code = "CONFLICT" }
 if apierrors.IsInvalid(err) || apierrors.IsBadRequest(err) { code = "INVALID_REQUEST" }
 return resourcev2.NewError(code,"Kubernetes rejected or could not complete this operation")
}

func editorAction(ctx context.Context, client *clients.ClientSet, binding nativeType, request resourcev2.ActionRequest) (result resourcev2.Value, err error) {
 defer func(){ err = editorSafeError(err) }()
 if err = ctx.Err(); err != nil { return }
 declared := false
 for _, descriptor := range editorActionDescriptors(binding) { if descriptor.ID == request.Action { declared = true } }
 if !declared { return result, resourcev2.NewError("UNSUPPORTED","Unsupported editor protocol") }
 if client==nil {return result,resourcev2.NewError("UNAVAILABLE","Kubernetes client is unavailable")}
 switch request.Action {
 case editorReview,"kubernetes.service-account-token.v1","kubernetes.csr-approval.v1","kubernetes.pod-eviction.v1":
  if client.KubeClient==nil {return result,resourcev2.NewError("UNAVAILABLE","Kubernetes typed client is unavailable")}
 case "kubernetes.scale.v1","kubernetes.metrics.v1","kubernetes.cert-manager.v1",crossplaneActivationProtocol:
  if client.DynamicClient==nil {return result,resourcev2.NewError("UNAVAILABLE","Kubernetes dynamic client is unavailable")}
 }
 if request.Action==crossplaneActivationProtocol && client.KubeClient==nil {return result,resourcev2.NewError("UNAVAILABLE","Kubernetes authorization client is unavailable")}
 namespace := ""
 if request.TypeTarget != nil {
  namespaces, scopeErr := nativeQueryNamespaces(request.TypeTarget.Scope,binding.API.Namespaced)
  if scopeErr != nil { return result,scopeErr }
  if len(namespaces)!=1 { return result,resourcev2.NewError("INVALID_REQUEST","Select exactly one namespace") }
  namespace=namespaces[0]
 } else {
  namespace,err=nativeIdentityNamespace(request.Reference.Address.Scope,binding.API.Namespaced)
  if err!=nil { return }
 }
 if request.TypeTarget!=nil && request.Action!=editorReview && request.Action!="kubernetes.references.v1" && request.Action!="kubernetes.metrics.v1" { return result,resourcev2.NewError("INVALID_REQUEST","Action requires an exact object target") }
 if request.TypeTarget!=nil && binding.API.Namespaced && namespace=="" && request.Action==editorReview { return result,resourcev2.NewError("INVALID_REQUEST","Namespaced reviews require a namespace") }
 if request.Action == "kubernetes.references.v1" { return editorReferences(ctx,client,binding,namespace,request.Input) }
 if request.Action == "kubernetes.cert-manager.v1" {return editorCertManager(ctx,client,binding,request,namespace)}
 if request.Action == crossplaneActivationProtocol {return editorCrossplaneActivation(ctx,client,binding,request)}
 native,err := resourcev2.NativeFromValue(request.Input)
 if err!=nil { return result,err }
 native,err=nativeMutationJSON(native)
 if err!=nil {return result,err}
 objectMap,ok:=native.(map[string]any)
 if !ok {return result,resourcev2.NewError("INVALID_REQUEST","Expected a Kubernetes request object")}
 data,err := json.Marshal(native)
 if err!=nil { return result,err }
 // Action DTOs (approval, scale-read, metric query) need not carry TypeMeta.
 // Only explicit review requests require kind/apiVersion below.
 object := &unstructured.Unstructured{Object:objectMap}
 name:=request.Reference.Address.ID
 if object.GetNamespace()!="" && object.GetNamespace()!=namespace { return result,resourcev2.NewError("INVALID_REQUEST","Request namespace differs from target") }
 object.SetNamespace(namespace)
 var output any
 switch request.Action {
 case editorReview:
  if !verbSliceContains(binding.API.Verbs,"create") || object.GetKind()!=binding.API.Kind || object.GetAPIVersion()!=binding.GVR.GroupVersion().String() { return result,resourcev2.NewError("INVALID_REQUEST","Review must match discovered target") }
  if object.GetName()!="" { return result,resourcev2.NewError("INVALID_REQUEST","Reviews do not have object names") }
  if binding.GVR.Version!="v1" {return result,resourcev2.NewError("UNSUPPORTED","Review client requires discovered v1 API")}
  output,err=editorCreateReview(ctx,client,binding.API.Kind,namespace,data)
 case "kubernetes.service-account-token.v1":
  var body authenticationv1.TokenRequest
  if err=json.Unmarshal(data,&body);err!=nil { return result,err }
  if body.Name!="" && body.Name!=name {return result,resourcev2.NewError("INVALID_REQUEST","Token request name differs from target")}
  current,getErr:=client.KubeClient.CoreV1().ServiceAccounts(namespace).Get(ctx,name,metav1.GetOptions{})
  if getErr!=nil {return result,getErr}
  if request.Reference.Incarnation!=nil && string(current.UID)!=*request.Reference.Incarnation {return result,resourcev2.NewError("CONFLICT","Service account changed")}
  if current.UID=="" {return result,resourcev2.NewError("UNAVAILABLE","Service account identity is unavailable")}
  if body.UID!="" && body.UID!=current.UID {return result,resourcev2.NewError("INVALID_REQUEST","Token request UID differs from target")}
  // v1.35 TokenREST compares metadata.uid before minting. Its
  // TokenRequestServiceAccountUIDValidation gate is default-on since v1.34.
  // Never retry without this identity binding when the account is replaced.
  body.UID=current.UID
  body.Name=name
  body.Namespace=namespace
  response,tokenErr:=client.KubeClient.CoreV1().ServiceAccounts(namespace).CreateToken(ctx,name,&body,metav1.CreateOptions{})
  if tokenErr!=nil {return result,tokenErr}
  if bindingErr:=validateReturnedServiceAccountToken(response,name,namespace,current.UID);bindingErr!=nil {
   if response!=nil {response.Status.Token=""}
   return result,bindingErr
  }
  output=response
 case "kubernetes.csr-approval.v1":
  var body certificatesv1.CertificateSigningRequest
  if err=json.Unmarshal(data,&body);err!=nil { return result,err }
  if body.Name!=name || body.ResourceVersion=="" { return result,resourcev2.NewError("INVALID_REQUEST","Approval requires exact name and observed resourceVersion") }
  current,getErr:=client.KubeClient.CertificatesV1().CertificateSigningRequests().Get(ctx,name,metav1.GetOptions{})
  if getErr!=nil { return result,getErr }
  if current.ResourceVersion!=body.ResourceVersion || (request.Reference.Incarnation!=nil && string(current.UID)!=*request.Reference.Incarnation) { return result,resourcev2.NewError("CONFLICT","Certificate request changed") }
  if len(body.Status.Conditions)!=1 {return result,resourcev2.NewError("INVALID_REQUEST","Choose one approval or denial condition")}
  condition:=body.Status.Conditions[0]
  if (condition.Type!=certificatesv1.CertificateApproved && condition.Type!=certificatesv1.CertificateDenied) || condition.Status!="True" {return result,resourcev2.NewError("INVALID_REQUEST","Invalid approval condition")}
  for _,existing:=range current.Status.Conditions {if existing.Type==certificatesv1.CertificateApproved || existing.Type==certificatesv1.CertificateDenied || existing.Type==certificatesv1.CertificateFailed {return result,resourcev2.NewError("CONFLICT","Certificate request already decided")}}
  if len(current.Status.Certificate)!=0 {return result,resourcev2.NewError("CONFLICT","Certificate request already issued")}
  current.Status.Conditions=append(current.Status.Conditions,condition)
  output,err=client.KubeClient.CertificatesV1().CertificateSigningRequests().UpdateApproval(ctx,name,current,metav1.UpdateOptions{})
 case "kubernetes.pod-eviction.v1":
  var body policyv1.Eviction
  if err=json.Unmarshal(data,&body);err!=nil { return result,err }
  if body.Name!=name { return result,resourcev2.NewError("INVALID_REQUEST","Eviction name differs from target") }
  pod,getErr:=client.KubeClient.CoreV1().Pods(namespace).Get(ctx,name,metav1.GetOptions{})
  if getErr!=nil { return result,getErr }
  if request.Reference.Incarnation!=nil && string(pod.UID)!=*request.Reference.Incarnation { return result,resourcev2.NewError("CONFLICT","Pod changed") }
  body.Namespace=namespace
  if body.DeleteOptions==nil { body.DeleteOptions=&metav1.DeleteOptions{} }
  body.DeleteOptions.Preconditions=&metav1.Preconditions{UID:&pod.UID,ResourceVersion:&pod.ResourceVersion}
  err=client.KubeClient.PolicyV1().Evictions(namespace).Evict(ctx,&body)
  output=map[string]any{"accepted":err==nil}
 case "kubernetes.scale.v1":
  // The API server, not a guessed workload plural, decides whether scale exists.
  resource:=nativeResourceClient(client.DynamicClient,binding.GVR,binding.API.Namespaced,namespace)
  if request.TypeTarget!=nil { return result,resourcev2.NewError("INVALID_REQUEST","Scale requires an object target") }
  if request.Reference.Incarnation!=nil {
   parent,getErr:=resource.Get(ctx,name,metav1.GetOptions{})
   if getErr!=nil {return result,getErr}
   if string(parent.GetUID())!=*request.Reference.Incarnation {return result,resourcev2.NewError("CONFLICT","Scale target changed")}
  }
  if object.GetName()=="" { output,err=resource.Get(ctx,name,metav1.GetOptions{},"scale") } else {
   if !verbSliceContains(binding.Subresources["scale"].Verbs,"update") {return result,resourcev2.NewError("UNSUPPORTED","Scale API does not support updates")}
   if object.GetName()!=name || object.GetKind()!="Scale" || object.GetResourceVersion()=="" { return result,resourcev2.NewError("INVALID_REQUEST","Scale update requires exact name and observed resourceVersion") }
   output,err=resource.Update(ctx,object,metav1.UpdateOptions{},"scale")
  }
 case "kubernetes.metrics.v1":
  if !strings.HasSuffix(binding.GVR.Group,"metrics.k8s.io") { return result,resourcev2.NewError("INVALID_REQUEST","Not a metrics API") }
  resource:=nativeResourceClient(client.DynamicClient,binding.GVR,binding.API.Namespaced,namespace)
  selector,_,_:=unstructured.NestedString(object.Object,"selector")
  output,err=resource.List(ctx,metav1.ListOptions{LabelSelector:selector,Limit:500})
 default: return result,resourcev2.NewError("UNSUPPORTED","Unsupported editor protocol")
 }
 if err!=nil { return result,err }
 bytes,err:=json.Marshal(output)
 if err!=nil { return result,err }
 // Kubernetes JSON decoder preserves int64, unlike encoding/json's any decoder.
 var decodedMap map[string]any
 if err=kubejson.Unmarshal(bytes,&decodedMap);err!=nil || decodedMap==nil { return result,resourcev2.NewError("UNAVAILABLE","Invalid Kubernetes action response") }
 decoded:=&unstructured.Unstructured{Object:decodedMap}
 if request.Action==editorReview {
  // Return review status only; never echo the bearer token or identity spec.
  status,_,_:=unstructured.NestedMap(decoded.Object,"status")
  decoded.Object=map[string]any{"apiVersion":decoded.GetAPIVersion(),"kind":decoded.GetKind(),"status":status}
 }
 return resourcev2.ValueFromNative(decoded.Object)
}
