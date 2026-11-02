package resource

import (
 "context"
 "net/http"
 "net/http/httptest"
 "testing"
 "github.com/omniview/kubernetes/pkg/plugin/resource/clients"
 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 "k8s.io/client-go/rest"
)

func TestEditorCustomMetricUsesDiscoveredSubresourceAndExactInteger(t *testing.T){
 queries:=0
 server:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  w.Header().Set("Content-Type","application/json")
  switch r.URL.Path {
  case "/apis/custom.metrics.k8s.io/v1beta2":
   _,_=w.Write([]byte(`{"apiVersion":"v1","kind":"APIResourceList","groupVersion":"custom.metrics.k8s.io/v1beta2","resources":[{"name":"pods/requests","namespaced":true,"kind":"MetricValueList","verbs":["get"]}]}`))
  case "/apis/custom.metrics.k8s.io/v1beta2/namespaces/team/pods/*/requests":
   queries++
   if r.URL.Query().Get("metricLabelSelector")!="method=GET" || r.URL.Query().Get("labelSelector")!="app=api" {t.Error("selector lost")}
   _,_=w.Write([]byte(`{"apiVersion":"custom.metrics.k8s.io/v1beta2","kind":"MetricValueList","items":[{"windowSeconds":9007199254740993,"value":"1"}]}`))
  default:t.Errorf("unexpected path %s",r.URL.Path);w.WriteHeader(404)
  }
 }))
 defer server.Close()
 result,err:=editorQueryAction(context.Background(),&clients.ClientSet{RESTConfig:&rest.Config{Host:server.URL},HTTPClient:server.Client()},resourcev2.ActionRequest{Action:"kubernetes.metrics.v1",Input:editorTestValue(t,map[string]any{"group":"custom.metrics.k8s.io","version":"v1beta2","operation":"query","resource":"pods","metric":"requests","name":"*","namespace":"team","labelSelector":"app=api","metricLabelSelector":"method=GET"})})
 if err!=nil{t.Fatal(err)}
 if queries!=1 || result.Map["items"].List[0].Map["windowSeconds"].Int!="9007199254740993"{t.Fatal("metric query failed or rounded integer")}
}

func TestEditorDiscoveryRejectsArbitraryEndpointWithoutNetwork(t *testing.T){
 _,err:=editorQueryAction(context.Background(),&clients.ClientSet{},resourcev2.ActionRequest{Action:"kubernetes.discovery.v1",Input:editorTestValue(t,map[string]any{"endpoint":"/api/v1/secrets","version":"v2"})})
 if err==nil{t.Fatal("arbitrary discovery endpoint accepted")}
}

func TestEditorServerVersionUsesOnlyFixedAuthenticatedEndpoint(t *testing.T){
 server:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  if r.URL.Path!="/version" || r.URL.RawQuery!="" {t.Error("version query changed endpoint")}
  w.Header().Set("Content-Type","application/json")
  _,_=w.Write([]byte(`{"major":"1","minor":"35+","gitVersion":"v1.35.0-vendor"}`))
 }))
 defer server.Close()
 result,err:=editorQueryAction(context.Background(),&clients.ClientSet{RESTConfig:&rest.Config{Host:server.URL},HTTPClient:server.Client()},resourcev2.ActionRequest{Action:"kubernetes.server-info.v1",Input:editorTestValue(t,map[string]any{})})
 if err!=nil || result.Map["minor"].String!="35+" || result.Map["gitVersion"].String!="v1.35.0-vendor" {t.Fatal("server version was guessed or lost")}
}
