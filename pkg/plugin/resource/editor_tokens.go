package resource

import (
 "encoding/base64"
 "encoding/json"
 "strings"

 resourcev2 "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
 authenticationv1 "k8s.io/api/authentication/v1"
 "k8s.io/apimachinery/pkg/types"
)

// The response came from the authenticated Kubernetes API. This is a private
// consistency check of standard service-account claims, NOT JWT signature
// verification or an independent authentication/provenance assertion.
// Never retain or include the token, decoded payload, or parser diagnostics in errors.
func validateReturnedServiceAccountToken(response *authenticationv1.TokenRequest,name,namespace string,uid types.UID)error{
 unavailable:=func()error{return resourcev2.NewError("UNAVAILABLE","Kubernetes token response could not prove the requested service-account binding")}
 conflict:=func()error{return resourcev2.NewError("CONFLICT","Service-account token identity changed; returned credential discarded")}
 if response==nil || response.Status.Token=="" || len(response.Status.Token)>128<<10 {return unavailable()}
 if response.Name!=name || response.Namespace!=namespace || response.UID!=uid {return conflict()}
 header,rest,ok:=strings.Cut(response.Status.Token,".")
 if !ok || header=="" {return unavailable()}
 payload,signature,ok:=strings.Cut(rest,".")
 if !ok || payload=="" || signature=="" || strings.Contains(signature,".") {return unavailable()}
 decoded,err:=base64.RawURLEncoding.DecodeString(payload)
 if err!=nil {return unavailable()}
 var claims struct {
  Subject string `json:"sub"`
  Kubernetes struct {
   Namespace string `json:"namespace"`
   ServiceAccount struct {
    Name string `json:"name"`
    UID string `json:"uid"`
   } `json:"serviceaccount"`
  } `json:"kubernetes.io"`
 }
 if json.Unmarshal(decoded,&claims)!=nil {return unavailable()}
 if claims.Subject=="" || claims.Kubernetes.Namespace=="" || claims.Kubernetes.ServiceAccount.Name=="" || claims.Kubernetes.ServiceAccount.UID=="" {return unavailable()}
 if claims.Subject!="system:serviceaccount:"+namespace+":"+name || claims.Kubernetes.Namespace!=namespace || claims.Kubernetes.ServiceAccount.Name!=name || claims.Kubernetes.ServiceAccount.UID!=string(uid) {return conflict()}
 return nil
}
