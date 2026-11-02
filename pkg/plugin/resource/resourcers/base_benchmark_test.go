package resourcers

import (
	"context"
	"encoding/json"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/cache"

	resource "github.com/omniviewdev/plugin-sdk/pkg/resource/v2"
)

// representativePodJSON models a running Deployment pod, including the managedFields
// returned by Kubernetes. Keep this payload shared between callback and List benchmarks.
const representativePodJSON = `{
  "apiVersion": "v1",
  "kind": "Pod",
  "metadata": {
    "name": "web-7c8b6c9d5f-00000",
    "namespace": "production",
    "uid": "86c3ac40-2f5c-4cc1-8b6c-000000000000",
    "resourceVersion": "10000",
    "creationTimestamp": "2026-10-01T12:00:00Z",
    "labels": {
      "app.kubernetes.io/name": "web",
      "app.kubernetes.io/instance": "production",
      "app.kubernetes.io/component": "frontend",
      "app.kubernetes.io/managed-by": "Helm",
      "pod-template-hash": "7c8b6c9d5f"
    },
    "annotations": {
      "checksum/config": "f20cbb678e8ad1f9a45d65317b60794a5da5d148c3b872a3f603d9acb76f29b3",
      "prometheus.io/scrape": "true",
      "prometheus.io/port": "8080",
      "kubectl.kubernetes.io/restartedAt": "2026-10-01T12:00:00Z"
    },
    "ownerReferences": [{
      "apiVersion": "apps/v1", "kind": "ReplicaSet", "name": "web-7c8b6c9d5f",
      "uid": "75243ca2-aa97-42b5-849a-a358b9929783", "controller": true, "blockOwnerDeletion": true
    }],
    "managedFields": [{
      "manager": "kube-controller-manager", "operation": "Update", "apiVersion": "v1",
      "time": "2026-10-01T12:00:00Z", "fieldsType": "FieldsV1",
      "fieldsV1": {
        "f:metadata": {
          "f:annotations": {".": {}, "f:checksum/config": {}, "f:prometheus.io/scrape": {}, "f:prometheus.io/port": {}, "f:kubectl.kubernetes.io/restartedAt": {}},
          "f:labels": {".": {}, "f:app.kubernetes.io/name": {}, "f:app.kubernetes.io/instance": {}, "f:app.kubernetes.io/component": {}, "f:app.kubernetes.io/managed-by": {}, "f:pod-template-hash": {}},
          "f:ownerReferences": {".": {}, "k:{\"uid\":\"75243ca2-aa97-42b5-849a-a358b9929783\"}": {}}
        },
        "f:spec": {
          "f:containers": {
            "k:{\"name\":\"web\"}": {
              ".": {}, "f:name": {}, "f:image": {}, "f:imagePullPolicy": {},
              "f:ports": {".": {}, "k:{\"containerPort\":8080,\"protocol\":\"TCP\"}": {".": {}, "f:containerPort": {}, "f:name": {}, "f:protocol": {}}},
              "f:env": {".": {}, "k:{\"name\":\"APP_ENV\"}": {".": {}, "f:name": {}, "f:value": {}}, "k:{\"name\":\"CONFIG_PATH\"}": {".": {}, "f:name": {}, "f:value": {}}},
              "f:resources": {".": {}, "f:limits": {".": {}, "f:cpu": {}, "f:memory": {}}, "f:requests": {".": {}, "f:cpu": {}, "f:memory": {}}},
              "f:readinessProbe": {".": {}, "f:httpGet": {".": {}, "f:path": {}, "f:port": {}, "f:scheme": {}}, "f:initialDelaySeconds": {}, "f:periodSeconds": {}},
              "f:volumeMounts": {".": {}, "k:{\"mountPath\":\"/etc/web\"}": {".": {}, "f:mountPath": {}, "f:name": {}, "f:readOnly": {}}}
            }
          },
          "f:dnsPolicy": {}, "f:restartPolicy": {}, "f:schedulerName": {}, "f:serviceAccountName": {},
          "f:terminationGracePeriodSeconds": {}, "f:volumes": {".": {}, "k:{\"name\":\"config\"}": {".": {}, "f:name": {}, "f:configMap": {".": {}, "f:name": {}}}}
        }
      }
    }, {
      "manager": "kubelet", "operation": "Update", "apiVersion": "v1", "subresource": "status",
      "time": "2026-10-01T12:00:12Z", "fieldsType": "FieldsV1",
      "fieldsV1": {"f:status": {
        "f:conditions": {"k:{\"type\":\"Initialized\"}": {".": {}, "f:lastTransitionTime": {}, "f:status": {}, "f:type": {}}, "k:{\"type\":\"Ready\"}": {".": {}, "f:lastTransitionTime": {}, "f:status": {}, "f:type": {}}, "k:{\"type\":\"ContainersReady\"}": {".": {}, "f:lastTransitionTime": {}, "f:status": {}, "f:type": {}}},
        "f:containerStatuses": {}, "f:hostIP": {}, "f:phase": {}, "f:podIP": {}, "f:podIPs": {".": {}, "k:{\"ip\":\"10.244.2.17\"}": {".": {}, "f:ip": {}}}, "f:startTime": {}
      }}
    }]
  },
  "spec": {
    "nodeName": "worker-02",
    "serviceAccountName": "web",
    "restartPolicy": "Always",
    "dnsPolicy": "ClusterFirst",
    "schedulerName": "default-scheduler",
    "terminationGracePeriodSeconds": 30,
    "securityContext": {"runAsNonRoot": true, "runAsUser": 1000, "fsGroup": 1000},
    "containers": [{
      "name": "web", "image": "registry.example.com/web:2026.10.1", "imagePullPolicy": "IfNotPresent",
      "ports": [{"name": "http", "containerPort": 8080, "protocol": "TCP"}],
      "env": [{"name": "APP_ENV", "value": "production"}, {"name": "CONFIG_PATH", "value": "/etc/web/config.yaml"}],
      "resources": {"requests": {"cpu": "100m", "memory": "128Mi"}, "limits": {"cpu": "500m", "memory": "512Mi"}},
      "readinessProbe": {"httpGet": {"path": "/ready", "port": "http", "scheme": "HTTP"}, "initialDelaySeconds": 5, "periodSeconds": 10},
      "volumeMounts": [{"name": "config", "mountPath": "/etc/web", "readOnly": true}]
    }],
    "volumes": [{"name": "config", "configMap": {"name": "web-config"}}],
    "tolerations": [{"key": "node.kubernetes.io/not-ready", "operator": "Exists", "effect": "NoExecute", "tolerationSeconds": 300}]
  },
  "status": {
    "phase": "Running", "hostIP": "192.168.1.12", "podIP": "10.244.2.17", "podIPs": [{"ip": "10.244.2.17"}],
    "startTime": "2026-10-01T12:00:01Z",
    "conditions": [
      {"type": "Initialized", "status": "True", "lastTransitionTime": "2026-10-01T12:00:01Z"},
      {"type": "Ready", "status": "True", "lastTransitionTime": "2026-10-01T12:00:12Z"},
      {"type": "ContainersReady", "status": "True", "lastTransitionTime": "2026-10-01T12:00:12Z"},
      {"type": "PodScheduled", "status": "True", "lastTransitionTime": "2026-10-01T12:00:01Z"}
    ],
    "containerStatuses": [{
      "name": "web", "ready": true, "restartCount": 0, "started": true,
      "image": "registry.example.com/web:2026.10.1",
      "imageID": "registry.example.com/web@sha256:5484c30da375b576128f9937e3caa9d977b857b93c19623dce79e73042cbe701",
      "containerID": "containerd://492d2264a908164daa266a8be2abca5482d83008ea909e393e08eac56f087345",
      "state": {"running": {"startedAt": "2026-10-01T12:00:10Z"}}
    }]
  }
}`

func newRepresentativeBenchmarkPod(b *testing.B, index int) *unstructured.Unstructured {
	b.Helper()
	pod := &unstructured.Unstructured{}
	if err := json.Unmarshal([]byte(representativePodJSON), pod); err != nil {
		b.Fatal(err)
	}
	pod.SetName(fmt.Sprintf("web-7c8b6c9d5f-%05d", index))
	pod.SetUID(types.UID(fmt.Sprintf("86c3ac40-2f5c-4cc1-8b6c-%012d", index)))
	return pod
}

func BenchmarkMakeEventHandler_Update300Pods(b *testing.B) {
	for _, mode := range []string{"Changed", "UnchangedReplay", "EmptyVersion"} {
		b.Run(mode, func(b *testing.B) {
			const count = 300
			oldPods := make([]*unstructured.Unstructured, count)
			newPods := make([]*unstructured.Unstructured, count)
			for i := range oldPods {
				oldPods[i] = newRepresentativeBenchmarkPod(b, i)
				newPods[i] = oldPods[i].DeepCopy()
				switch mode {
				case "Changed":
					newPods[i].SetResourceVersion("10001")
					if err := unstructured.SetNestedField(newPods[i].Object, "192.168.1.13", "status", "hostIP"); err != nil {
						b.Fatal(err)
					}
				case "EmptyVersion":
					oldPods[i].SetResourceVersion("")
					newPods[i].SetResourceVersion("")
				}
			}
			events := make(chan sourceEvent, count)
			var overflow atomic.Bool
			handler := makeSourceHandler(context.Background(), events, &overflow)
			delivered := 0
			b.ReportAllocs()
			b.ResetTimer()
			for range b.N {
				for i := range oldPods {
					handler.UpdateFunc(oldPods[i], newPods[i])
				}
				delivered += len(events)
				for len(events) != 0 {
					<-events
				}
			}
			b.StopTimer()
			want := b.N * count
			if mode == "UnchangedReplay" {
				want = 0
			}
			if delivered != want {
				b.Fatalf("delivered %d updates, want %d", delivered, want)
			}
			b.ReportMetric(count, "pods/op")
			b.ReportMetric(float64(delivered)/float64(b.N), "events/op")
		})
	}
}

func BenchmarkBase_ListRepresentativePods(b *testing.B) {
	for _, count := range []int{300, 3000} {
		for _, synced := range []bool{true, false} {
			path := "UnsyncedClient"
			if synced {
				path = "SyncedCache"
			}
			b.Run(fmt.Sprintf("%s/Pods%d", path, count), func(b *testing.B) {
				objects := make([]runtime.Object, count)
				for i := range objects {
					objects[i] = newRepresentativeBenchmarkPod(b, i)
				}
				ctx, cancel := context.WithCancel(context.Background())
				cs := newFakeClientSet(defaultGVRListKinds(), objects...)
				b.Cleanup(func() {
					cancel()
					cs.ShutdownInformers()
				})
				list := func() ([]resource.Record, error) {
					native, err := cs.DynamicClient.Resource(testGVR).List(ctx, metav1.ListOptions{})
					if err != nil {
						return nil, err
					}
					records := make([]resource.Record, 0, len(native.Items))
					for i := range native.Items {
						record, err := watchRecord(testWatchTarget(), testWatchRepresentation(), &native.Items[i])
						if err != nil {
							return nil, err
						}
						records = append(records, record)
					}
					return records, nil
				}
				if synced {
					lease, err := cs.AcquireInformer(ctx, "", testGVR, cache.ResourceEventHandlerFuncs{})
					if err != nil {
						b.Fatal(err)
					}
					b.Cleanup(func() {
						if err := lease.Close(); err != nil {
							b.Error(err)
						}
					})
					syncCtx, syncCancel := context.WithTimeout(ctx, 10*time.Second)
					ok := cache.WaitForCacheSync(syncCtx.Done(), lease.HasSynced)
					syncCancel()
					if !ok {
						b.Fatal("pod informer did not sync")
					}
					list = func() ([]resource.Record, error) {
						native := lease.Informer.GetStore().List()
						records := make([]resource.Record, 0, len(native))
						for _, obj := range native {
							record, err := watchRecord(testWatchTarget(), testWatchRepresentation(), obj.(*unstructured.Unstructured))
							if err != nil {
								return nil, err
							}
							records = append(records, record)
						}
						return records, nil
					}
				}
				result, err := list()
				if err != nil {
					b.Fatal(err)
				}
				if len(result) != count {
					b.Fatalf("listed %d pods, want %d", len(result), count)
				}
				b.ReportAllocs()
				b.ResetTimer()
				for range b.N {
					result, err = list()
					if err != nil {
						b.Fatal(err)
					}
				}
				b.StopTimer()
				if len(result) != count {
					b.Fatalf("listed %d pods, want %d", len(result), count)
				}
				b.ReportMetric(float64(count), "pods/op")
			})
		}
	}
}
