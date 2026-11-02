/** Synthetic, credential-free fixtures. Never imported by provider registration. */
export const coreFixtures = [
  {
    "kind": "Namespace",
    "resource": "namespaces",
    "scope": "Cluster",
    "component": "NamespaceForm.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"Namespace\",\n  \"metadata\": {\n    \"name\": \"fixture-namespace\",\n    \"labels\": {\n      \"pod-security.kubernetes.io/enforce\": \"restricted\",\n      \"pod-security.kubernetes.io/enforce-version\": \"v1.35\",\n      \"environment\": \"verification\"\n    }\n  }\n}",
    "paths": [
      "metadata.labels.pod-security.kubernetes.io/{enforce,warn,audit}",
      "metadata.labels.pod-security.kubernetes.io/{enforce,warn,audit}-version",
      "metadata.labels.environment"
    ]
  },
  {
    "kind": "ServiceAccount",
    "resource": "serviceaccounts",
    "scope": "Namespaced",
    "component": "ServiceAccountForm.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"ServiceAccount\",\n  \"metadata\": {\n    \"name\": \"fixture-serviceaccount\",\n    \"namespace\": \"fixture\"\n  },\n  \"automountServiceAccountToken\": false,\n  \"imagePullSecrets\": [\n    {\n      \"name\": \"fixture-pull-reference\"\n    }\n  ]\n}",
    "paths": [
      "automountServiceAccountToken",
      "imagePullSecrets[*].name"
    ]
  },
  {
    "kind": "ResourceQuota",
    "resource": "resourcequotas",
    "scope": "Namespaced",
    "component": "ResourceQuotaForm.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"ResourceQuota\",\n  \"metadata\": {\n    \"name\": \"fixture-resourcequota\",\n    \"namespace\": \"fixture\"\n  },\n  \"spec\": {\n    \"hard\": {\n      \"requests.cpu\": \"2\",\n      \"requests.memory\": \"4Gi\",\n      \"pods\": \"10\"\n    },\n    \"scopes\": [\n      \"NotBestEffort\"\n    ],\n    \"scopeSelector\": {\n      \"matchExpressions\": [\n        {\n          \"scopeName\": \"PriorityClass\",\n          \"operator\": \"In\",\n          \"values\": [\n            \"batch\"\n          ]\n        }\n      ]\n    }\n  }\n}",
    "paths": [
      "spec.hard[resource]",
      "spec.scopes[*]",
      "spec.scopeSelector.matchExpressions[*].{scopeName,operator,values[*]}"
    ]
  },
  {
    "kind": "LimitRange",
    "resource": "limitranges",
    "scope": "Namespaced",
    "component": "LimitRangeForm.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"LimitRange\",\n  \"metadata\": {\n    \"name\": \"fixture-limitrange\",\n    \"namespace\": \"fixture\"\n  },\n  \"spec\": {\n    \"limits\": [\n      {\n        \"type\": \"Container\",\n        \"min\": {\n          \"memory\": \"64Mi\"\n        },\n        \"max\": {\n          \"memory\": \"2Gi\"\n        },\n        \"default\": {\n          \"memory\": \"256Mi\"\n        },\n        \"defaultRequest\": {\n          \"memory\": \"128Mi\"\n        },\n        \"maxLimitRequestRatio\": {\n          \"cpu\": \"4\"\n        }\n      }\n    ]\n  }\n}",
    "paths": [
      "spec.limits[*].type",
      "spec.limits[*].{min,max,default,defaultRequest,maxLimitRequestRatio}[resource]"
    ]
  },
  {
    "kind": "PodTemplate",
    "resource": "podtemplates",
    "scope": "Namespaced",
    "component": "WorkloadFields.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"PodTemplate\",\n  \"metadata\": {\n    \"name\": \"fixture-podtemplate\",\n    \"namespace\": \"fixture\"\n  },\n  \"template\": {\n    \"metadata\": {\n      \"labels\": {\n        \"app\": \"fixture-app\"\n      }\n    },\n    \"spec\": {\n      \"serviceAccountName\": \"fixture-account\",\n      \"containers\": [\n        {\n          \"name\": \"app\",\n          \"image\": \"example.invalid/app:v1\",\n          \"resources\": {\n            \"requests\": {\n              \"cpu\": \"100m\",\n              \"memory\": \"128Mi\"\n            }\n          }\n        }\n      ]\n    }\n  }\n}",
    "paths": [
      "template.metadata.labels[key]",
      "template.spec.containers[*].{name,image,imagePullPolicy}",
      "template.spec.containers[*].resources.{requests,limits}.{cpu,memory,ephemeral-storage}",
      "template.spec.{serviceAccountName,nodeSelector[key],automountServiceAccountToken}"
    ]
  },
  {
    "kind": "PersistentVolume",
    "resource": "persistentvolumes",
    "scope": "Cluster",
    "component": "PersistentVolumeForm.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"PersistentVolume\",\n  \"metadata\": {\n    \"name\": \"fixture-persistentvolume\"\n  },\n  \"spec\": {\n    \"capacity\": {\n      \"storage\": \"10Gi\"\n    },\n    \"accessModes\": [\n      \"ReadWriteMany\"\n    ],\n    \"volumeMode\": \"Filesystem\",\n    \"storageClassName\": \"\",\n    \"nfs\": {\n      \"server\": \"storage.example.invalid\",\n      \"path\": \"/export\",\n      \"readOnly\": false\n    },\n    \"persistentVolumeReclaimPolicy\": \"Retain\",\n    \"mountOptions\": [\n      \"hard\"\n    ]\n  }\n}",
    "paths": [
      "spec.capacity.storage",
      "spec.accessModes[*]",
      "spec.volumeMode",
      "spec.storageClassName",
      "spec.nfs.{server,path,readOnly}",
      "spec.persistentVolumeReclaimPolicy",
      "spec.mountOptions[*]"
    ]
  },
  {
    "kind": "ReplicationController",
    "resource": "replicationcontrollers",
    "scope": "Namespaced",
    "component": "WorkloadFields.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"ReplicationController\",\n  \"metadata\": {\n    \"name\": \"fixture-replicationcontroller\",\n    \"namespace\": \"fixture\"\n  },\n  \"spec\": {\n    \"replicas\": 1,\n    \"selector\": {\n      \"app\": \"fixture-app\"\n    },\n    \"template\": {\n      \"metadata\": {\n        \"labels\": {\n          \"app\": \"fixture-app\"\n        }\n      },\n      \"spec\": {\n        \"containers\": [\n          {\n            \"name\": \"app\",\n            \"image\": \"example.invalid/app:v1\"\n          }\n        ]\n      }\n    }\n  }\n}",
    "paths": [
      "spec.replicas",
      "spec.selector[key]",
      "spec.template.metadata.labels[key]",
      "spec.template.spec.containers[*].{name,image,imagePullPolicy}",
      "spec.template.spec.containers[*].resources.{requests,limits}.{cpu,memory,ephemeral-storage}",
      "spec.template.spec.{serviceAccountName,nodeSelector[key],automountServiceAccountToken}"
    ]
  },
  {
    "kind": "Endpoints",
    "resource": "endpoints",
    "scope": "Namespaced",
    "component": "EndpointsForm.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"Endpoints\",\n  \"metadata\": {\n    \"name\": \"fixture-service\",\n    \"namespace\": \"fixture\"\n  },\n  \"subsets\": [\n    {\n      \"addresses\": [\n        {\n          \"ip\": \"10.0.0.8\"\n        }\n      ],\n      \"notReadyAddresses\": [\n        {\n          \"ip\": \"10.0.0.9\"\n        }\n      ],\n      \"ports\": [\n        {\n          \"name\": \"http\",\n          \"port\": 8080,\n          \"protocol\": \"TCP\"\n        }\n      ]\n    }\n  ]\n}",
    "paths": [
      "subsets[*].{addresses,notReadyAddresses}[*].{ip,hostname,nodeName}",
      "subsets[*].ports[*].{name,port,protocol}"
    ]
  },
  {
    "kind": "Node",
    "resource": "nodes",
    "scope": "Cluster",
    "component": "InspectionForms.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"Node\",\n  \"metadata\": {\n    \"name\": \"fixture-node\"\n  },\n  \"spec\": {\n    \"unschedulable\": false,\n    \"taints\": [\n      {\n        \"key\": \"dedicated\",\n        \"value\": \"batch\",\n        \"effect\": \"NoSchedule\"\n      }\n    ],\n    \"podCIDR\": \"10.244.0.0/24\"\n  },\n  \"status\": {\n    \"conditions\": [\n      {\n        \"type\": \"Ready\",\n        \"status\": \"True\",\n        \"reason\": \"KubeletReady\",\n        \"lastTransitionTime\": \"2026-01-01T00:00:00Z\"\n      }\n    ],\n    \"nodeInfo\": {\n      \"kubeletVersion\": \"v1.35.0\",\n      \"containerRuntimeVersion\": \"containerd://2.0\",\n      \"operatingSystem\": \"linux\",\n      \"architecture\": \"arm64\"\n    }\n  }\n}",
    "paths": [
      "spec.{unschedulable,podCIDR,providerID}",
      "spec.taints[*].{key,value,effect,timeAdded}",
      "status.conditions[*].{type,status,reason,lastTransitionTime}",
      "status.nodeInfo.{kubeletVersion,containerRuntimeVersion,operatingSystem,architecture}"
    ]
  },
  {
    "kind": "Event",
    "resource": "events",
    "scope": "Namespaced",
    "component": "InspectionForms.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"Event\",\n  \"metadata\": {\n    \"name\": \"fixture-event\",\n    \"namespace\": \"fixture\"\n  },\n  \"reason\": \"Scheduled\",\n  \"type\": \"Normal\",\n  \"involvedObject\": {\n    \"apiVersion\": \"v1\",\n    \"kind\": \"Pod\",\n    \"name\": \"fixture-app\",\n    \"namespace\": \"fixture\",\n    \"uid\": \"fixture-uid\"\n  },\n  \"message\": \"Fixture event detail intentionally withheld\",\n  \"count\": 1,\n  \"reportingComponent\": \"default-scheduler\",\n  \"firstTimestamp\": \"2026-01-01T00:00:00Z\",\n  \"lastTimestamp\": \"2026-01-01T00:00:00Z\"\n}",
    "paths": [
      "reason",
      "type",
      "involvedObject.{apiVersion,kind,namespace,name,uid,fieldPath}",
      "count",
      "reportingComponent",
      "reportingInstance",
      "firstTimestamp",
      "lastTimestamp",
      "eventTime",
      "message (masked, never rendered)"
    ]
  },
  {
    "kind": "ComponentStatus",
    "resource": "componentstatuses",
    "scope": "Cluster",
    "component": "InspectionForms.tsx",
    "source": "{\n  \"apiVersion\": \"v1\",\n  \"kind\": \"ComponentStatus\",\n  \"metadata\": {\n    \"name\": \"fixture-componentstatus\"\n  },\n  \"conditions\": [\n    {\n      \"type\": \"Healthy\",\n      \"status\": \"Unknown\"\n    }\n  ]\n}",
    "paths": [
      "kind (exact provider target)",
      "conditions[*].{type,status}",
      "conditions[*].{message,error} (masked, never rendered)"
    ]
  }
] as const;
