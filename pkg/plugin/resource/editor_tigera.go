package resource

import (
 "context"
 "regexp"
 "strings"

 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 appsv1 "k8s.io/api/apps/v1"
 apierrors "k8s.io/apimachinery/pkg/api/errors"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
 "k8s.io/apimachinery/pkg/runtime/schema"
)

const tigeraEvidenceProtocol="kubernetes.tigera-evidence.v1"
var observedImageVersion=regexp.MustCompile(`^v?[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$`)

func evidenceFailure(err error) map[string]any {
 status:="unavailable"
 switch resourcev2.ErrorCode(editorSafeError(err)) {
 case "FORBIDDEN","UNAUTHORIZED":status="denied"
 case "NOT_FOUND":status="absent"
 }
 return map[string]any{"status":status}
}

// A tag is observed configuration, not a signed or registry-verified identity.
func tigeraDeploymentEvidence(object *appsv1.Deployment)map[string]any{
 images:=[]any{}
 for _,container:=range object.Spec.Template.Spec.Containers {
  if container.Name!="tigera-operator" {continue}
  image:=map[string]any{"name":container.Name,"image":container.Image}
  withoutDigest:=strings.SplitN(container.Image,"@",2)[0]
  if colon:=strings.LastIndex(withoutDigest,":");colon>strings.LastIndex(withoutDigest,"/") {
   tag:=withoutDigest[colon+1:]
   if observedImageVersion.MatchString(tag){image["observedVersion"]=tag}
  }
  images=append(images,image)
 }
 return map[string]any{"name":object.Name,"namespace":object.Namespace,"uid":string(object.UID),"resourceVersion":object.ResourceVersion,"generation":object.Generation,"observedGeneration":object.Status.ObservedGeneration,"availableReplicas":int64(object.Status.AvailableReplicas),"images":images,"versionEvidence":"image-tag-only"}
}

func tigeraControllerEvidence(ctx context.Context,client *clients.ClientSet)map[string]any{
 if client==nil || client.KubeClient==nil {return map[string]any{"status":"unavailable"}}
 // The pinned upstream manifest uses this exact namespace/name. Fall back to a
 // bounded label-qualified inventory only when the standard deployment is absent.
 object,err:=client.KubeClient.AppsV1().Deployments("tigera-operator").Get(ctx,"tigera-operator",metav1.GetOptions{})
 if err==nil {
  status:="ready"
  if object.Name!="tigera-operator" || object.Namespace!="tigera-operator" || object.UID=="" || object.ResourceVersion=="" || object.DeletionTimestamp!=nil {status="unknown"}
  return map[string]any{"status":status,"deployments":[]any{tigeraDeploymentEvidence(object)}}
 }
 if !apierrors.IsNotFound(err) {return evidenceFailure(err)}
 list,err:=client.KubeClient.AppsV1().Deployments("").List(ctx,metav1.ListOptions{LabelSelector:"k8s-app=tigera-operator",Limit:32})
 if err!=nil {return evidenceFailure(err)}
 if list.Continue!="" {return map[string]any{"status":"unavailable"}}
 deployments:=[]any{}
 for index:=range list.Items {
  object:=&list.Items[index]
  if object.Name=="" || object.Namespace=="" || object.UID=="" || object.ResourceVersion=="" || object.Labels["k8s-app"]!="tigera-operator" || object.DeletionTimestamp!=nil {return map[string]any{"status":"unknown"}}
  deployments=append(deployments,tigeraDeploymentEvidence(object))
 }
 if len(deployments)==0 {return map[string]any{"status":"absent","deployments":deployments}}
 status:="ready"
 if len(deployments)>1 {status="unknown"}
 return map[string]any{"status":status,"deployments":deployments}
}

func safeTigeraConditions(object *unstructured.Unstructured)[]any{
 result:=[]any{}
 conditions,found,err:=unstructured.NestedSlice(object.Object,"status","conditions")
 if err!=nil || !found {return result}
 // Conditions contain bounded structured status only; messages may echo private inputs.
 for index,raw:=range conditions {
  if index>=64 {break}
  condition,ok:=raw.(map[string]any);if !ok {continue}
  output:=map[string]any{}
  for _,key:=range []string{"type","status","reason"} {if value,ok:=condition[key].(string);ok && len(value)<=256 {output[key]=value}}
  if len(output)>0 {result=append(result,output)}
 }
 return result
}
func tigeraObjectEvidence(ctx context.Context,client *clients.ClientSet,plural string)map[string]any{
 if client==nil || client.DynamicClient==nil {return map[string]any{"status":"unavailable"}}
 object,err:=client.DynamicClient.Resource(schema.GroupVersionResource{Group:"operator.tigera.io",Version:"v1",Resource:plural}).Get(ctx,"default",metav1.GetOptions{})
 if err!=nil{return evidenceFailure(err)}
 if object.GetName()!="default" || object.GetNamespace()!="" || object.GetUID()=="" || object.GetResourceVersion()=="" {return map[string]any{"status":"unknown"}}
 expectedKind:=""
 switch plural {case "installations":expectedKind="Installation";case "apiservers":expectedKind="APIServer";case "goldmanes":expectedKind="Goldmane"}
 if expectedKind=="" || object.GetAPIVersion()!="operator.tigera.io/v1" || object.GetKind()!=expectedKind {return map[string]any{"status":"unknown"}}
 spec:=map[string]any{}
 if plural=="installations" {
  for _,key:=range []string{"variant","registry","imagePath","imagePrefix","kubernetesProvider"} {if value,found,_:=unstructured.NestedString(object.Object,"spec",key);found && len(value)<=2048 {spec[key]=value}}
 }
 observed:=map[string]any{"conditions":safeTigeraConditions(object)}
 for _,key:=range []string{"variant","calicoVersion","state"} {if value,found,_:=unstructured.NestedString(object.Object,"status",key);found && len(value)<=256 {observed[key]=value}}
 if value,found,_:=unstructured.NestedInt64(object.Object,"status","observedGeneration");found {observed["observedGeneration"]=value}
 if object.GetDeletionTimestamp()!=nil {observed["deleting"]=true}
 return map[string]any{"status":"ready","name":object.GetName(),"uid":string(object.GetUID()),"resourceVersion":object.GetResourceVersion(),"generation":object.GetGeneration(),"spec":spec,"observed":observed}
}

// Fixed reads only. No arbitrary object URL, secret, pod environment, certificate,
// Installation computed body, or image pull credential enters the public result.
func editorTigeraEvidence(ctx context.Context,client *clients.ClientSet)(resourcev2.Value,error){
 if err:=ctx.Err();err!=nil{return resourcev2.Value{},err}
 controller:=tigeraControllerEvidence(ctx,client)
 installation:=tigeraObjectEvidence(ctx,client,"installations")
 apiServer:=tigeraObjectEvidence(ctx,client,"apiservers")
 goldmane:=tigeraObjectEvidence(ctx,client,"goldmanes")
 if err:=ctx.Err();err!=nil{return resourcev2.Value{},err}
 return resourcev2.ValueFromNative(map[string]any{"controller":controller,"installation":installation,"apiServer":apiServer,"goldmane":goldmane})
}
