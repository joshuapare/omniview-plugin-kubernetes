package resource

import (
 "context"
 "encoding/json"
 "io"
 "net/http"
 "net/url"
 "strings"

 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
 "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
 "k8s.io/client-go/rest"
)

// Negotiation deliberately has no application/json fallback for Secrets.
func editorReferences(ctx context.Context, client *clients.ClientSet, binding nativeType, namespace string, input resourcev2.Value) (resourcev2.Value,error) {
 projection:="metadata"
 if value,ok:=input.Map["projection"];ok { if value.Kind!="string" { return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Invalid reference projection") }; projection=value.String }
 allowed:=projection=="metadata" || projection=="secretType" && binding.GVR.Resource=="secrets" && binding.GVR.Group=="" || projection=="servicePorts" && binding.GVR.Resource=="services" && binding.GVR.Group=="" || projection=="storageClass" && binding.GVR.Resource=="storageclasses" && binding.GVR.Group=="storage.k8s.io" || projection=="ingressClass" && binding.GVR.Resource=="ingressclasses" && binding.GVR.Group=="networking.k8s.io"
 if !allowed { return resourcev2.Value{},resourcev2.NewError("INVALID_REQUEST","Unsupported reference projection") }
 if !verbSliceContains(binding.API.Verbs,"list") { return resourcev2.Value{},resourcev2.NewError("UNSUPPORTED","Reference API cannot list") }
 accept:="application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1"
 if projection=="secretType" { accept="application/json;as=Table;g=meta.k8s.io;v=v1" }
 if projection!="metadata" && projection!="secretType" { accept="application/json" }
 path:="/api/"+url.PathEscape(binding.GVR.Version)
 if binding.GVR.Group!="" { path="/apis/"+url.PathEscape(binding.GVR.Group)+"/"+url.PathEscape(binding.GVR.Version) }
 if namespace!="" { path+="/namespaces/"+url.PathEscape(namespace) }
 path+="/"+url.PathEscape(binding.GVR.Resource)
 data,err:=editorReadJSON(ctx,client,path,accept,"limit=500&includeObject=Metadata")
 if err!=nil { return resourcev2.Value{},err }
 items:=[]any{}
 if projection=="secretType" {
  var table metav1.Table
  if err=json.Unmarshal(data,&table);err!=nil { return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Invalid reference Table response") }
  if table.Kind!="Table" { return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Secret Table negotiation unavailable") }
  typeColumn:=-1
  if table.Continue!="" {return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Reference list exceeds lookup limit; narrow namespace")}
  for i,column:=range table.ColumnDefinitions { if strings.EqualFold(column.Name,"Type") { typeColumn=i } }
  if typeColumn<0 { return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Secret type column unavailable") }
  for _,row:=range table.Rows {
   metadata:=&metav1.PartialObjectMetadata{}
   if err=json.Unmarshal(row.Object.Raw,metadata);err!=nil || metadata.Name=="" { return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Secret metadata unavailable") }
   item:=editorReferenceMetadata(metadata)
   if typeColumn<len(row.Cells) { if kind,ok:=row.Cells[typeColumn].(string);ok { item["secretType"]=kind } }
   items=append(items,item)
  }
 } else {
  list:=&unstructured.UnstructuredList{}
  if err=list.UnmarshalJSON(data);err!=nil { return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Invalid reference list response") }
  if list.GetContinue()!="" {return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Reference list exceeds lookup limit; narrow namespace")}
  if projection=="metadata" && list.GetKind()!="PartialObjectMetadataList" { return resourcev2.Value{},resourcev2.NewError("UNAVAILABLE","Metadata negotiation unavailable") }
  for _,object:=range list.Items {
   item:=editorReferenceMetadata(&object)
   switch projection {
   case "servicePorts":
    ports,_,_:=unstructured.NestedSlice(object.Object,"spec","ports"); item["servicePorts"]=ports
    selector,found,selectorErr:=unstructured.NestedStringMap(object.Object,"spec","selector")
    item["serviceSelector"]="unknown"
    if selectorErr==nil { if !found || len(selector)==0 {item["serviceSelector"]="none"} else {item["serviceSelector"]="present"} }
   case "storageClass":
    provisioner,_,_:=unstructured.NestedString(object.Object,"provisioner")
    projection:=map[string]any{"provisioner":provisioner}
    if mode,found,_:=unstructured.NestedString(object.Object,"volumeBindingMode");found {projection["volumeBindingMode"]=mode}
    if expansion,found,_:=unstructured.NestedBool(object.Object,"allowVolumeExpansion");found {projection["allowVolumeExpansion"]=expansion}
    item["storageClass"]=projection
   case "ingressClass":
    controller,_,_:=unstructured.NestedString(object.Object,"spec","controller")
    item["ingressClass"]=map[string]any{"controller":controller,"isDefault":object.GetAnnotations()["ingressclass.kubernetes.io/is-default-class"]=="true"}
   }
   items=append(items,item)
  }
 }
 return resourcev2.ValueFromNative(map[string]any{"items":items})
}

func editorReferenceMetadata(object metav1.Object) map[string]any {
 return map[string]any{"name":object.GetName(),"namespace":object.GetNamespace(),"uid":string(object.GetUID()),"resourceVersion":object.GetResourceVersion()}
}

func editorReadJSON(ctx context.Context, client *clients.ClientSet, path,accept,query string) ([]byte,error) {
 if client==nil || client.RESTConfig==nil { return nil,resourcev2.NewError("UNAVAILABLE","Kubernetes HTTP transport unavailable") }
 base,err:=url.Parse(client.RESTConfig.Host)
 if err!=nil { return nil,resourcev2.NewError("UNAVAILABLE","Kubernetes HTTP transport unavailable") }
 base.Path=strings.TrimRight(base.Path,"/")+path
 base.RawQuery=query
 request,err:=http.NewRequestWithContext(ctx,http.MethodGet,base.String(),nil)
 if err!=nil { return nil,err }
 request.Header.Set("Accept",accept)
 httpClient:=client.HTTPClient
 if httpClient==nil { httpClient,err=rest.HTTPClientFor(client.RESTConfig);if err!=nil{return nil,err} }
 response,err:=httpClient.Do(request)
 if err!=nil { return nil,editorSafeError(err) }
 defer response.Body.Close()
 if response.StatusCode<200 || response.StatusCode>=300 {
  code:="UNAVAILABLE"
  if response.StatusCode==401 || response.StatusCode==403 {code="FORBIDDEN"}
  if response.StatusCode==404 {code="NOT_FOUND"}
  return nil,resourcev2.NewError(code,"Kubernetes lookup unavailable or denied")
 }
 const maxBytes=4<<20
 data,err:=io.ReadAll(io.LimitReader(response.Body,maxBytes+1))
 if err!=nil {return nil,err}
 if len(data)>maxBytes { return nil,resourcev2.NewError("UNAVAILABLE","Kubernetes lookup exceeded response limit") }
 return data,nil
}
