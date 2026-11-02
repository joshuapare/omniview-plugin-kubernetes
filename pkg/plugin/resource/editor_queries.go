package resource

import (
 "context"
 "encoding/json"
 "net/url"
 "strings"

 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

const editorQueryType="kubernetes:editor-queries"
func editorQueryResourceType() resourcev2.ResourceType {
 return resourcev2.ResourceType{Type:editorQueryType,DisplayName:"Kubernetes API queries",IdentityDimensions:[]resourcev2.Dimension{},QueryDimensions:[]resourcev2.Dimension{},DefaultRepresentation:"kubernetes.editor-query.v1",Representations:[]resourcev2.Representation{{ID:"kubernetes.editor-query.v1",Revision:"kubernetes.editor-query.v1",Schema:resourcev2.SchemaBinding{State:"absent"}}},Capabilities:[]resourcev2.Capability{{Operation:resourcev2.OperationAction,Scope:resourcev2.QueryScope{}}}}
}
func editorQueryRegistration() resourcev2.Registration[clients.ClientSet] {
 return resourcev2.Registration[clients.ClientSet]{Type:editorQueryType,Actions:[]resourcev2.ActionDescriptor{{ID:tigeraEvidenceProtocol,Label:"Read Tigera operator evidence",Scope:resourcev2.ActionScopeType},{ID:"kubernetes.server-info.v1",Label:"Read server version",Scope:resourcev2.ActionScopeType},{ID:"kubernetes.discovery.v1",Label:"Discover APIs",Scope:resourcev2.ActionScopeType},{ID:"kubernetes.metrics.v1",Label:"Query adapter metrics",Scope:resourcev2.ActionScopeType}},Action:editorQueryAction}
}
func editorQueryAction(ctx context.Context,client *clients.ClientSet,request resourcev2.ActionRequest)(resourcev2.Value,error){
 if client==nil {return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Kubernetes client is unavailable")}
 if request.Action==tigeraEvidenceProtocol {return editorTigeraEvidence(ctx,client)}
 if request.Action=="kubernetes.server-info.v1" {
  data,err:=editorReadJSON(ctx,client,"/version","application/json","")
  if err!=nil{return resourcev2.Value{},editorSafeError(err)}
  var info struct {Major string `json:"major"`; Minor string `json:"minor"`; GitVersion string `json:"gitVersion"`}
  if json.Unmarshal(data,&info)!=nil || info.Major=="" || info.Minor=="" || info.GitVersion=="" {return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Invalid Kubernetes version response")}
  return resourcev2.ValueFromNative(map[string]any{"major":info.Major,"minor":info.Minor,"gitVersion":info.GitVersion})
 }
 get:=func(key string)string{value:=request.Input.Map[key];if value.Kind=="string"{return value.String};return ""}
 version:=get("version")
 var data []byte
 var err error
 if request.Action=="kubernetes.discovery.v1" {
  endpoint:=get("endpoint")
  if (endpoint!="/api" && endpoint!="/apis") || (version!="v2" && version!="v2beta1") {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Invalid discovery query")}
  data,err=editorReadJSON(ctx,client,endpoint,"application/json;g=apidiscovery.k8s.io;v="+version+";as=APIGroupDiscoveryList","")
 } else if request.Action=="kubernetes.metrics.v1" {
  group:=get("group")
  if group!="custom.metrics.k8s.io" && group!="external.metrics.k8s.io" && group!="metrics.k8s.io" {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Invalid metrics API group")}
  if version!="v1beta1" && version!="v1beta2" {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Invalid metrics API version")}
  discoveryData,discoveryErr:=editorReadJSON(ctx,client,"/apis/"+group+"/"+version,"application/json","")
  if discoveryErr!=nil{return resourcev2.Value{},editorSafeError(discoveryErr)}
  var discovery metav1.APIResourceList
  if json.Unmarshal(discoveryData,&discovery)!=nil || discovery.GroupVersion!=group+"/"+version {return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Invalid metrics discovery response")}
  if get("operation")=="discover" {data=discoveryData} else if get("operation")=="query" {
   resource,metric,name,namespace:=get("resource"),get("metric"),get("name"),get("namespace")
   segment:=func(s string)bool{return s!="" && s!="." && s!=".." && !strings.ContainsAny(s,"/%?#\\")}
   if !segment(resource) || namespace!="" && !segment(namespace) {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Invalid metrics target")}
   path:="/apis/"+group+"/"+version
   found:=false
   for _,api:=range discovery.APIResources {
    expected:=resource
    if group=="custom.metrics.k8s.io" {expected+="/"+metric}
    if api.Name==expected && verbSliceContains(api.Verbs,"get") || group!="custom.metrics.k8s.io" && api.Name==expected && verbSliceContains(api.Verbs,"list") {found=true;if api.Namespaced && namespace=="" {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Metrics query requires a namespace")}}
   }
   if !found {return resourcev2.Value{},resourcev2.NewError("NOT_FOUND","Metric is not advertised by this API version")}
   // Segments were validated above. URL.Path performs the only escaping;
   // pre-escaping here would turn the custom-metric wildcard into literal %2A.
   if namespace!="" {path+="/namespaces/"+namespace}
   path+="/"+resource
   if group=="custom.metrics.k8s.io" {
    if !segment(metric) || name!="*" && !segment(name) {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Invalid custom metric query")}
    path+="/"+name
    if resource=="namespaces" {path+="/metrics"}
    path+="/"+metric
   }
   query:=url.Values{}
   if selector:=get("labelSelector");selector!="" {query.Set("labelSelector",selector)}
   if selector:=get("metricLabelSelector");selector!="" {query.Set("metricLabelSelector",selector)}
   data,err=editorReadJSON(ctx,client,path,"application/json",query.Encode())
 } else {return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Choose metrics discover or query operation")}
 } else {return resourcev2.Value{},resourcev2.NewError("UNSUPPORTED","Unsupported query protocol")}
 if err!=nil{return resourcev2.Value{},editorSafeError(err)}
 object:=&unstructured.Unstructured{}
 if err=object.UnmarshalJSON(data);err!=nil{return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Invalid Kubernetes query response")}
 if request.Action=="kubernetes.discovery.v1" && object.GetKind()!="APIGroupDiscoveryList" {return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Aggregated discovery negotiation unavailable")}
 return resourcev2.ValueFromNative(object.Object)
}
