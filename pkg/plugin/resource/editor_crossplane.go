package resource

import (
 "context"
 "encoding/json"
 "reflect"
 "sort"

 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 authorizationv1 "k8s.io/api/authorization/v1"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
 "k8s.io/apimachinery/pkg/runtime/schema"
 "k8s.io/apimachinery/pkg/types"
)

const crossplaneActivationProtocol="kubernetes.crossplane-revision-activation.v1"

type activationIdentity struct {
 Resource string `json:"resource"`
 Name string `json:"name"`
 UID string `json:"uid"`
 ResourceVersion string `json:"resourceVersion"`
}
type activationOwner struct {
 activationIdentity
 Group string `json:"group"`
 Version string `json:"version"`
 ActivationPolicy string `json:"activationPolicy"`
}
type activationChange struct {
 activationIdentity
 From string `json:"from"`
 To string `json:"to"`
}
type activationPlan struct {
 Owner activationOwner `json:"owner"`
 Target activationIdentity `json:"target"`
 Changes []activationChange `json:"changes"`
 Atomic bool `json:"atomic"`
}
type activationConfirmation struct {
 Name string `json:"name"`
 UID string `json:"uid"`
 ResourceVersion string `json:"resourceVersion"`
}
type activationInput struct {
 Phase string `json:"phase"`
 Plan activationPlan `json:"plan"`
 Confirmed []activationConfirmation `json:"confirmed"`
}

func crossplaneOwnerKind(resource string)(kind,plural string){
 switch resource {
 case "providerrevisions":return "Provider","providers"
 case "configurationrevisions":return "Configuration","configurations"
 case "functionrevisions":return "Function","functions"
 default:return "",""
 }
}
func activationObjectIdentity(resource string,object *unstructured.Unstructured)activationIdentity{
 return activationIdentity{Resource:resource,Name:object.GetName(),UID:string(object.GetUID()),ResourceVersion:object.GetResourceVersion()}
}
func activationController(object *unstructured.Unstructured,kind string)(metav1.OwnerReference,error){
 var owner *metav1.OwnerReference
 for _,reference:=range object.GetOwnerReferences(){
  if reference.Controller==nil || !*reference.Controller {continue}
  if owner!=nil {return metav1.OwnerReference{},resourcev2.NewError("INVALID_REQUEST","Revision has ambiguous controller ownership")}
  copy:=reference;owner=&copy
 }
 if owner==nil || owner.Kind!=kind || owner.Name=="" || owner.UID=="" {return metav1.OwnerReference{},resourcev2.NewError("INVALID_REQUEST","Revision requires a verified package controller owner")}
 gv,err:=schema.ParseGroupVersion(owner.APIVersion)
 if err!=nil || gv.Group!="pkg.crossplane.io" || gv.Version!="v1" && (kind!="Function" || gv.Version!="v1beta1") {return metav1.OwnerReference{},resourcev2.NewError("UNSUPPORTED","Package owner API version is unsupported")}
 return *owner,nil
}
func revisionHasOwner(object *unstructured.Unstructured,owner metav1.OwnerReference)bool{
 candidate,err:=activationController(object,owner.Kind)
 if err!=nil {return false}
 candidateGV,_:=schema.ParseGroupVersion(candidate.APIVersion)
 ownerGV,_:=schema.ParseGroupVersion(owner.APIVersion)
 if candidate.UID==owner.UID && candidate.Name==owner.Name && candidate.Kind==owner.Kind && candidateGV.Group==ownerGV.Group {return true}
 return false
}
func activationState(object *unstructured.Unstructured)string{state,_,_:=unstructured.NestedString(object.Object,"spec","desiredState");return state}

// The plan is reconstructed from live objects, never from a package-name label.
// Crossplane v2.0.0 b639502e2f93680ff83417a0f517ec459ce079cc defines
// Manual package activation and revision spec.desiredState Active/Inactive.
func previewCrossplaneActivation(ctx context.Context,client *clients.ClientSet,binding nativeType,request resourcev2.ActionRequest)(activationPlan,error){
 plan:=activationPlan{Changes:[]activationChange{}}
 if client==nil || client.DynamicClient==nil || client.KubeClient==nil {return plan,resourcev2.NewError("UNAVAILABLE","Kubernetes revision and authorization clients are unavailable")}
 kind,plural:=crossplaneOwnerKind(binding.GVR.Resource)
 if binding.GVR.Group!="pkg.crossplane.io" || kind=="" || binding.API.Namespaced || binding.GVR.Version!="v1" && (kind!="Function" || binding.GVR.Version!="v1beta1") {return plan,resourcev2.NewError("UNSUPPORTED","Unsupported package revision target")}
 revisions:=client.DynamicClient.Resource(binding.GVR)
 target,err:=revisions.Get(ctx,request.Reference.Address.ID,metav1.GetOptions{})
 if err!=nil{return plan,err}
 if request.Reference.Incarnation!=nil && string(target.GetUID())!=*request.Reference.Incarnation {return plan,resourcev2.NewError("CONFLICT","Revision incarnation changed")}
 if target.GetUID()=="" || target.GetResourceVersion()=="" || target.GetDeletionTimestamp()!=nil {return plan,resourcev2.NewError("CONFLICT","Revision identity unavailable or deleting")}
 if activationState(target)!="Inactive" {return plan,resourcev2.NewError("CONFLICT","Only an inactive revision can be activated")}
 ownerRef,err:=activationController(target,kind)
 if err!=nil{return plan,err}
 gv,_:=schema.ParseGroupVersion(ownerRef.APIVersion)
 owner,err:=client.DynamicClient.Resource(gv.WithResource(plural)).Get(ctx,ownerRef.Name,metav1.GetOptions{})
 if err!=nil{return plan,err}
 policy,_,_:=unstructured.NestedString(owner.Object,"spec","revisionActivationPolicy")
 if owner.GetUID()!=ownerRef.UID || owner.GetResourceVersion()=="" || owner.GetDeletionTimestamp()!=nil {return plan,resourcev2.NewError("CONFLICT","Package owner changed or is deleting")}
 if policy!="Manual" {return plan,resourcev2.NewError("INVALID_REQUEST","Package activation policy must be Manual")}
 siblings,err:=revisions.List(ctx,metav1.ListOptions{Limit:1000})
 if err!=nil{return plan,err}
 if siblings.GetContinue()!="" {return plan,resourcev2.NewError("UNAVAILABLE","Revision inventory exceeds activation review limit")}
 plan.Owner=activationOwner{activationIdentity:activationObjectIdentity(plural,owner),Group:gv.Group,Version:gv.Version,ActivationPolicy:policy}
 plan.Target=activationObjectIdentity(binding.GVR.Resource,target)
 for _,sibling:=range siblings.Items {
  if sibling.GetName()==target.GetName(){if sibling.GetUID()!=target.GetUID() || sibling.GetResourceVersion()!=target.GetResourceVersion(){return plan,resourcev2.NewError("CONFLICT","Revision changed during review")};continue}
  if !revisionHasOwner(&sibling,ownerRef) || activationState(&sibling)!="Active" {continue}
  if sibling.GetUID()=="" || sibling.GetResourceVersion()=="" || sibling.GetDeletionTimestamp()!=nil {return plan,resourcev2.NewError("CONFLICT","Active sibling identity unavailable or deleting")}
  plan.Changes=append(plan.Changes,activationChange{activationIdentity:activationObjectIdentity(binding.GVR.Resource,&sibling),From:"Active",To:"Inactive"})
 }
 sort.Slice(plan.Changes,func(i,j int)bool{return plan.Changes[i].Name<plan.Changes[j].Name})
 plan.Changes=append(plan.Changes,activationChange{activationIdentity:plan.Target,From:"Inactive",To:"Active"})
 for _,change:=range plan.Changes {
  review,reviewErr:=client.KubeClient.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx,&authorizationv1.SelfSubjectAccessReview{Spec:authorizationv1.SelfSubjectAccessReviewSpec{ResourceAttributes:&authorizationv1.ResourceAttributes{Group:binding.GVR.Group,Version:binding.GVR.Version,Resource:binding.GVR.Resource,Name:change.Name,Verb:"patch"}}},metav1.CreateOptions{})
  if reviewErr!=nil{return plan,reviewErr}
  if !review.Status.Allowed || review.Status.Denied {return plan,resourcev2.NewError("FORBIDDEN","Revision activation requires patch permission for every reviewed revision")}
 }
 return plan,nil
}

func activationResultValue(value any)(resourcev2.Value,error){
 data,err:=json.Marshal(value);if err!=nil{return resourcev2.Value{},err}
 var result map[string]any
 if err=json.Unmarshal(data,&result);err!=nil{return resourcev2.Value{},err}
 return resourcev2.ValueFromNative(result)
}

// Check owner policy and the complete competing-active set before every write.
// This cannot create a Kubernetes multi-object transaction; races remain possible.
func checkActivationBoundary(ctx context.Context,client *clients.ClientSet,binding nativeType,plan activationPlan,expected map[string]activationChange)error{
 owner,err:=client.DynamicClient.Resource(schema.GroupVersionResource{Group:plan.Owner.Group,Version:plan.Owner.Version,Resource:plan.Owner.Resource}).Get(ctx,plan.Owner.Name,metav1.GetOptions{})
 if err!=nil{return err}
 policy,_,_:=unstructured.NestedString(owner.Object,"spec","revisionActivationPolicy")
 if string(owner.GetUID())!=plan.Owner.UID || owner.GetResourceVersion()!=plan.Owner.ResourceVersion || owner.GetDeletionTimestamp()!=nil || policy!="Manual" {return resourcev2.NewError("CONFLICT","Package owner or activation policy changed")}
 list,err:=client.DynamicClient.Resource(binding.GVR).List(ctx,metav1.ListOptions{Limit:1000})
 if err!=nil{return err}
 if list.GetContinue()!="" {return resourcev2.NewError("UNAVAILABLE","Revision inventory exceeds activation review limit")}
 found:=map[string]bool{}
 for _,object:=range list.Items {
  if expectation,ok:=expected[object.GetName()];ok {
   if string(object.GetUID())!=expectation.UID || object.GetResourceVersion()!=expectation.ResourceVersion || activationState(&object)!=expectation.From || object.GetDeletionTimestamp()!=nil {return resourcev2.NewError("CONFLICT","Reviewed revision changed")}
   ownerKind,_:=crossplaneOwnerKind(binding.GVR.Resource)
   ownerRef,ownerErr:=activationController(&object,ownerKind)
   if ownerErr!=nil || string(ownerRef.UID)!=plan.Owner.UID || ownerRef.Name!=plan.Owner.Name {return resourcev2.NewError("CONFLICT","Reviewed revision owner changed")}
   found[object.GetName()]=true
  } else if activationState(&object)=="Active" {
   for _,reference:=range object.GetOwnerReferences(){if reference.Controller!=nil && *reference.Controller && string(reference.UID)==plan.Owner.UID {return resourcev2.NewError("CONFLICT","An unreviewed revision became active")}}
  }
 }
 if len(found)!=len(expected){return resourcev2.NewError("CONFLICT","A reviewed revision disappeared")}
 return nil
}

func editorCrossplaneActivation(ctx context.Context,client *clients.ClientSet,binding nativeType,request resourcev2.ActionRequest)(resourcev2.Value,error){
 native,err:=resourcev2.NativeFromValue(request.Input);if err!=nil{return resourcev2.Value{},err}
 bytes,err:=json.Marshal(native);if err!=nil{return resourcev2.Value{},err}
 var input activationInput
 if json.Unmarshal(bytes,&input)!=nil {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Invalid activation request")}
 if input.Phase!="preview" && input.Phase!="execute" {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Choose activation preview or execute")}
 plan,err:=previewCrossplaneActivation(ctx,client,binding,request)
 if err!=nil{return resourcev2.Value{},err}
 if input.Phase=="preview" {return activationResultValue(plan)}
 if !reflect.DeepEqual(input.Plan,plan) || len(input.Confirmed)!=len(plan.Changes) {return resourcev2.Value{},resourcev2.NewError("CONFLICT","Activation plan changed; review every affected revision again")}
 confirmations:=map[string]activationConfirmation{}
 for _,confirmation:=range input.Confirmed {if _,exists:=confirmations[confirmation.Name];exists{return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Duplicate revision confirmation")};confirmations[confirmation.Name]=confirmation}
 expected:=map[string]activationChange{}
 for _,change:=range plan.Changes {
  if confirmations[change.Name]!=(activationConfirmation{Name:change.Name,UID:change.UID,ResourceVersion:change.ResourceVersion}) {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Every revision requires explicit identity and revision confirmation")}
  expected[change.Name]=change
 }
 applied:=[]activationChange{}
 result:=func(cause error,uncertain *activationChange)(resourcev2.Value,error){
  pending:=append([]activationChange{},plan.Changes[len(applied):]...)
  status:="completed"
  output:=map[string]any{"status":status,"atomic":false,"applied":applied,"pending":pending}
  if cause!=nil {
   status="failed";if len(applied)>0 {status="partial"};output["status"]=status
   safe:=editorSafeError(cause)
   output["failure"]=map[string]any{"status":resourcev2.ErrorCode(safe),"message":"Activation stopped; refresh all reviewed revisions before retrying"}
   if uncertain!=nil {output["uncertain"]=*uncertain}
  }
  return activationResultValue(output)
 }
 for _,change:=range plan.Changes {
  if err=checkActivationBoundary(ctx,client,binding,plan,expected);err!=nil{return result(err,nil)}
  patch,_:=json.Marshal([]map[string]any{{"op":"test","path":"/metadata/uid","value":change.UID},{"op":"test","path":"/metadata/resourceVersion","value":change.ResourceVersion},{"op":"test","path":"/spec/desiredState","value":change.From},{"op":"replace","path":"/spec/desiredState","value":change.To}})
  object,patchErr:=client.DynamicClient.Resource(binding.GVR).Patch(ctx,change.Name,types.JSONPatchType,patch,metav1.PatchOptions{})
  if patchErr!=nil {
   switch resourcev2.ErrorCode(editorSafeError(patchErr)) {
   case "FORBIDDEN","NOT_FOUND","CONFLICT","INVALID_REQUEST":return result(patchErr,nil)
   default:return result(patchErr,&change)
   }
  }
  applied=append(applied,change)
  observation:=change;observation.From=change.To;observation.ResourceVersion=object.GetResourceVersion();expected[change.Name]=observation
 }
 if err=checkActivationBoundary(ctx,client,binding,plan,expected);err!=nil{return result(err,nil)}
 return result(nil,nil)
}
