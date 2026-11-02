/** Lightweight admission catalog; detailed observed schemas stay in the lazy inspector chunk. */
export const backingCatalog = [
  {
    "kind": "BGPConfiguration",
    "resource": "bgpconfigurations",
    "scope": "Cluster",
    "sensitiveFields": [
      "nodeMeshPassword"
    ]
  },
  {
    "kind": "BGPFilter",
    "resource": "bgpfilters",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "BGPPeer",
    "resource": "bgppeers",
    "scope": "Cluster",
    "sensitiveFields": [
      "password"
    ]
  },
  {
    "kind": "BlockAffinity",
    "resource": "blockaffinities",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "CalicoNodeStatus",
    "resource": "caliconodestatuses",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "ClusterInformation",
    "resource": "clusterinformations",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "FelixConfiguration",
    "resource": "felixconfigurations",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "GlobalNetworkPolicy",
    "resource": "globalnetworkpolicies",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "GlobalNetworkSet",
    "resource": "globalnetworksets",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "HostEndpoint",
    "resource": "hostendpoints",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "IPAMBlock",
    "resource": "ipamblocks",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "IPAMConfig",
    "resource": "ipamconfigs",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "IPAMHandle",
    "resource": "ipamhandles",
    "scope": "Cluster",
    "sensitiveFields": [
      "handleID"
    ]
  },
  {
    "kind": "IPPool",
    "resource": "ippools",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "IPReservation",
    "resource": "ipreservations",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "KubeControllersConfiguration",
    "resource": "kubecontrollersconfigurations",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "NetworkPolicy",
    "resource": "networkpolicies",
    "scope": "Namespaced",
    "sensitiveFields": []
  },
  {
    "kind": "NetworkSet",
    "resource": "networksets",
    "scope": "Namespaced",
    "sensitiveFields": []
  },
  {
    "kind": "StagedGlobalNetworkPolicy",
    "resource": "stagedglobalnetworkpolicies",
    "scope": "Cluster",
    "sensitiveFields": []
  },
  {
    "kind": "StagedKubernetesNetworkPolicy",
    "resource": "stagedkubernetesnetworkpolicies",
    "scope": "Namespaced",
    "sensitiveFields": []
  },
  {
    "kind": "StagedNetworkPolicy",
    "resource": "stagednetworkpolicies",
    "scope": "Namespaced",
    "sensitiveFields": []
  },
  {
    "kind": "Tier",
    "resource": "tiers",
    "scope": "Cluster",
    "sensitiveFields": []
  }
] as const;
