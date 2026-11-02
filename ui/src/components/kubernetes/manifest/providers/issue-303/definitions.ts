export interface Field { path:string; label:string; type:string }
export interface Definition { kind:string; resource:string; scope:'Namespaced'|'Cluster'; title:string; fields:Field[]; schema:string[]; source:string }
export const definitions: readonly Definition[] = [
  {
    "kind": "NetworkPolicy",
    "resource": "networkpolicies",
    "scope": "Namespaced",
    "title": "Targets & rules",
    "fields": [
      {
        "path": "selector",
        "label": "Endpoint selector",
        "type": "selector"
      },
      {
        "path": "tier",
        "label": "Tier",
        "type": "ref:default,security"
      },
      {
        "path": "order",
        "label": "Order",
        "type": "number"
      },
      {
        "path": "types",
        "label": "Directions",
        "type": "list"
      },
      {
        "path": "ingress",
        "label": "Ingress rules",
        "type": "rules"
      },
      {
        "path": "egress",
        "label": "Egress rules",
        "type": "rules"
      }
    ],
    "schema": [
      "spec.tier",
      "spec.order",
      "spec.ingress",
      "spec.egress",
      "spec.selector",
      "spec.types",
      "spec.serviceAccountSelector",
      "spec.performanceHints"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/networkpolicy.go"
  },
  {
    "kind": "GlobalNetworkPolicy",
    "resource": "globalnetworkpolicies",
    "scope": "Cluster",
    "title": "Global traffic",
    "fields": [
      {
        "path": "selector",
        "label": "Endpoint selector",
        "type": "selector"
      },
      {
        "path": "namespaceSelector",
        "label": "Namespace selector",
        "type": "selector"
      },
      {
        "path": "tier",
        "label": "Tier",
        "type": "ref:default,security"
      },
      {
        "path": "order",
        "label": "Order",
        "type": "number"
      },
      {
        "path": "ingress",
        "label": "Ingress rules",
        "type": "rules"
      },
      {
        "path": "egress",
        "label": "Egress rules",
        "type": "rules"
      },
      {
        "path": "preDNAT",
        "label": "Pre-DNAT",
        "type": "bool"
      },
      {
        "path": "applyOnForward",
        "label": "Forward traffic",
        "type": "bool"
      },
      {
        "path": "doNotTrack",
        "label": "Untracked traffic",
        "type": "bool"
      }
    ],
    "schema": [
      "spec.tier",
      "spec.order",
      "spec.ingress",
      "spec.egress",
      "spec.selector",
      "spec.types",
      "spec.doNotTrack",
      "spec.preDNAT",
      "spec.applyOnForward",
      "spec.serviceAccountSelector",
      "spec.namespaceSelector",
      "spec.performanceHints"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/globalnetworkpolicy.go"
  },
  {
    "kind": "NetworkSet",
    "resource": "networksets",
    "scope": "Namespaced",
    "title": "Address membership",
    "fields": [
      {
        "path": "nets",
        "label": "Networks",
        "type": "list"
      }
    ],
    "schema": [
      "spec.nets"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/networkset.go"
  },
  {
    "kind": "GlobalNetworkSet",
    "resource": "globalnetworksets",
    "scope": "Cluster",
    "title": "Global address membership",
    "fields": [
      {
        "path": "nets",
        "label": "Networks",
        "type": "list"
      }
    ],
    "schema": [
      "spec.nets"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/globalnetworkset.go"
  },
  {
    "kind": "HostEndpoint",
    "resource": "hostendpoints",
    "scope": "Cluster",
    "title": "Host protection",
    "fields": [
      {
        "path": "node",
        "label": "Node",
        "type": "text"
      },
      {
        "path": "interfaceName",
        "label": "Interface",
        "type": "text"
      },
      {
        "path": "expectedIPs",
        "label": "Expected IPs",
        "type": "list"
      },
      {
        "path": "profiles",
        "label": "Profiles in order",
        "type": "list"
      },
      {
        "path": "ports",
        "label": "Named ports",
        "type": "ports"
      }
    ],
    "schema": [
      "spec.node",
      "spec.interfaceName",
      "spec.expectedIPs",
      "spec.profiles",
      "spec.ports"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/hostendpoint.go"
  },
  {
    "kind": "IPPool",
    "resource": "ippools",
    "scope": "Cluster",
    "title": "Address allocation",
    "fields": [
      {
        "path": "cidr",
        "label": "Pool CIDR",
        "type": "cidr"
      },
      {
        "path": "blockSize",
        "label": "Block prefix length",
        "type": "number"
      },
      {
        "path": "ipipMode",
        "label": "IP-in-IP",
        "type": "ref:Never,Always,CrossSubnet"
      },
      {
        "path": "vxlanMode",
        "label": "VXLAN",
        "type": "ref:Never,Always,CrossSubnet"
      },
      {
        "path": "natOutgoing",
        "label": "Masquerade outgoing",
        "type": "bool"
      },
      {
        "path": "disabled",
        "label": "Stop new allocations",
        "type": "bool"
      },
      {
        "path": "nodeSelector",
        "label": "Eligible nodes",
        "type": "selector"
      },
      {
        "path": "assignmentMode",
        "label": "Assignment",
        "type": "ref:Automatic,Manual"
      },
      {
        "path": "allowedUses",
        "label": "Allowed uses",
        "type": "list"
      },
      {
        "path": "disableBGPExport",
        "label": "Disable BGP export",
        "type": "bool"
      }
    ],
    "schema": [
      "spec.cidr",
      "spec.vxlanMode",
      "spec.ipipMode",
      "spec.natOutgoing",
      "spec.disabled",
      "spec.disableBGPExport",
      "spec.blockSize",
      "spec.nodeSelector",
      "spec.ipip",
      "spec.nat-outgoing",
      "spec.allowedUses",
      "spec.assignmentMode"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/ippool.go"
  },
  {
    "kind": "IPReservation",
    "resource": "ipreservations",
    "scope": "Cluster",
    "title": "Reserved addresses",
    "fields": [
      {
        "path": "reservedCIDRs",
        "label": "Reserved IPs or CIDRs",
        "type": "list"
      }
    ],
    "schema": [
      "spec.reservedCIDRs"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/ipreservation.go"
  },
  {
    "kind": "BGPConfiguration",
    "resource": "bgpconfigurations",
    "scope": "Cluster",
    "title": "BGP routing",
    "fields": [
      {
        "path": "asNumber",
        "label": "Autonomous system",
        "type": "number"
      },
      {
        "path": "nodeToNodeMeshEnabled",
        "label": "Node mesh",
        "type": "bool"
      },
      {
        "path": "listenPort",
        "label": "Listen port",
        "type": "number"
      },
      {
        "path": "serviceClusterIPs",
        "label": "Advertised service CIDRs",
        "type": "cidrrows"
      },
      {
        "path": "communities",
        "label": "Communities",
        "type": "pairs"
      },
      {
        "path": "prefixAdvertisements",
        "label": "Prefix advertisements",
        "type": "prefix"
      },
      {
        "path": "logSeverityScreen",
        "label": "Log level",
        "type": "ref:Info,Warning,Error"
      }
    ],
    "schema": [
      "spec.logSeverityScreen",
      "spec.nodeToNodeMeshEnabled",
      "spec.asNumber",
      "spec.serviceLoadBalancerIPs",
      "spec.serviceExternalIPs",
      "spec.serviceClusterIPs",
      "spec.communities",
      "spec.prefixAdvertisements",
      "spec.listenPort",
      "spec.nodeMeshPassword",
      "spec.nodeMeshMaxRestartTime",
      "spec.bindMode",
      "spec.ignoredInterfaces",
      "spec.localWorkloadPeeringIPV4",
      "spec.localWorkloadPeeringIPV6"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/bgpconfig.go"
  },
  {
    "kind": "BGPFilter",
    "resource": "bgpfilters",
    "scope": "Cluster",
    "title": "Ordered route filters",
    "fields": [
      {
        "path": "importV4",
        "label": "Import IPv4",
        "type": "filters"
      },
      {
        "path": "exportV4",
        "label": "Export IPv4",
        "type": "filters"
      },
      {
        "path": "importV6",
        "label": "Import IPv6",
        "type": "filters"
      },
      {
        "path": "exportV6",
        "label": "Export IPv6",
        "type": "filters"
      }
    ],
    "schema": [
      "spec.exportV4",
      "spec.importV4",
      "spec.exportV6",
      "spec.importV6"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/bgpfilter.go"
  },
  {
    "kind": "BGPPeer",
    "resource": "bgppeers",
    "scope": "Cluster",
    "title": "Peer connection",
    "fields": [
      {
        "path": "nodeSelector",
        "label": "Local nodes",
        "type": "selector"
      },
      {
        "path": "peerIP",
        "label": "Peer address",
        "type": "text"
      },
      {
        "path": "asNumber",
        "label": "Peer AS number",
        "type": "number"
      },
      {
        "path": "peerSelector",
        "label": "Peer nodes alternative",
        "type": "selector"
      },
      {
        "path": "filters",
        "label": "Ordered filters",
        "type": "list"
      },
      {
        "path": "sourceAddress",
        "label": "Source address",
        "type": "ref:UseNodeIP,None"
      },
      {
        "path": "password.secretKeyRef.name",
        "label": "Password Secret reference",
        "type": "text"
      },
      {
        "path": "password.secretKeyRef.key",
        "label": "Secret key reference",
        "type": "text"
      }
    ],
    "schema": [
      "spec.node",
      "spec.nodeSelector",
      "spec.peerIP",
      "spec.asNumber",
      "spec.peerSelector",
      "spec.keepOriginalNextHop",
      "spec.password",
      "spec.sourceAddress",
      "spec.maxRestartTime",
      "spec.numAllowedLocalASNumbers",
      "spec.ttlSecurity",
      "spec.reachableBy",
      "spec.filters",
      "spec.localWorkloadSelector"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/bgppeer.go"
  },
  {
    "kind": "FelixConfiguration",
    "resource": "felixconfigurations",
    "scope": "Cluster",
    "title": "Dataplane settings",
    "fields": [
      {
        "path": "logSeverityScreen",
        "label": "Screen log level",
        "type": "ref:Info,Warning,Error,Debug"
      },
      {
        "path": "ipv6Support",
        "label": "IPv6 support",
        "type": "bool"
      },
      {
        "path": "iptablesBackend",
        "label": "iptables backend",
        "type": "ref:Auto,Legacy,NFT"
      },
      {
        "path": "defaultEndpointToHostAction",
        "label": "Workload to host",
        "type": "ref:Drop,Accept,Return"
      },
      {
        "path": "wireguardEnabled",
        "label": "WireGuard IPv4",
        "type": "bool"
      },
      {
        "path": "prometheusMetricsEnabled",
        "label": "Metrics endpoint",
        "type": "bool"
      },
      {
        "path": "failsafeInboundHostPorts",
        "label": "Inbound failsafes",
        "type": "protoports"
      }
    ],
    "schema": [
      "spec.useInternalDataplaneDriver",
      "spec.dataplaneDriver",
      "spec.dataplaneWatchdogTimeout",
      "spec.ipv6Support",
      "spec.routeRefreshInterval",
      "spec.interfaceRefreshInterval",
      "spec.iptablesRefreshInterval",
      "spec.iptablesPostWriteCheckInterval",
      "spec.iptablesLockFilePath",
      "spec.iptablesLockTimeout",
      "spec.iptablesLockProbeInterval",
      "spec.featureDetectOverride",
      "spec.featureGates",
      "spec.ipsetsRefreshInterval",
      "spec.maxIpsetSize",
      "spec.iptablesBackend",
      "spec.xdpRefreshInterval",
      "spec.netlinkTimeout",
      "spec.metadataAddr",
      "spec.metadataPort",
      "spec.openstackRegion",
      "spec.interfacePrefix",
      "spec.interfaceExclude",
      "spec.chainInsertMode",
      "spec.defaultEndpointToHostAction",
      "spec.iptablesFilterAllowAction",
      "spec.iptablesMangleAllowAction",
      "spec.iptablesFilterDenyAction",
      "spec.logPrefix",
      "spec.logFilePath",
      "spec.logSeverityFile",
      "spec.logSeverityScreen",
      "spec.logSeveritySys",
      "spec.logDebugFilenameRegex",
      "spec.ipipEnabled",
      "spec.ipipMTU",
      "spec.vxlanEnabled",
      "spec.vxlanMTU",
      "spec.vxlanMTUV6",
      "spec.vxlanPort",
      "spec.vxlanVNI",
      "spec.allowVXLANPacketsFromWorkloads",
      "spec.allowIPIPPacketsFromWorkloads",
      "spec.reportingInterval",
      "spec.reportingTTL",
      "spec.endpointReportingEnabled",
      "spec.endpointReportingDelay",
      "spec.endpointStatusPathPrefix",
      "spec.iptablesMarkMask",
      "spec.disableConntrackInvalidCheck",
      "spec.healthEnabled",
      "spec.healthHost",
      "spec.healthPort",
      "spec.healthTimeoutOverrides",
      "spec.prometheusMetricsEnabled",
      "spec.prometheusMetricsHost",
      "spec.prometheusMetricsPort",
      "spec.prometheusGoMetricsEnabled",
      "spec.prometheusProcessMetricsEnabled",
      "spec.prometheusWireGuardMetricsEnabled",
      "spec.failsafeInboundHostPorts",
      "spec.failsafeOutboundHostPorts",
      "spec.kubeNodePortRanges",
      "spec.policySyncPathPrefix",
      "spec.usageReportingEnabled",
      "spec.usageReportingInitialDelay",
      "spec.usageReportingInterval",
      "spec.natPortRange",
      "spec.natOutgoingAddress",
      "spec.deviceRouteSourceAddress",
      "spec.deviceRouteSourceAddressIPv6",
      "spec.deviceRouteProtocol",
      "spec.removeExternalRoutes",
      "spec.ipForwarding",
      "spec.externalNodesList",
      "spec.debugMemoryProfilePath",
      "spec.debugDisableLogDropping",
      "spec.debugSimulateCalcGraphHangAfter",
      "spec.debugSimulateDataplaneHangAfter",
      "spec.debugSimulateDataplaneApplyDelay",
      "spec.debugHost",
      "spec.debugPort",
      "spec.iptablesNATOutgoingInterfaceFilter",
      "spec.sidecarAccelerationEnabled",
      "spec.xdpEnabled",
      "spec.genericXDPEnabled",
      "spec.nftablesMode",
      "spec.nftablesRefreshInterval",
      "spec.nftablesFilterAllowAction",
      "spec.nftablesMangleAllowAction",
      "spec.nftablesFilterDenyAction",
      "spec.nftablesMarkMask",
      "spec.bpfEnabled",
      "spec.bpfDisableUnprivileged",
      "spec.bpfLogLevel",
      "spec.bpfConntrackLogLevel",
      "spec.bpfConntrackMode",
      "spec.bpfConntrackTimeouts",
      "spec.bpfLogFilters",
      "spec.bpfCTLBLogFilter",
      "spec.bpfDataIfacePattern",
      "spec.bpfL3IfacePattern",
      "spec.bpfConnectTimeLoadBalancingEnabled",
      "spec.bpfConnectTimeLoadBalancing",
      "spec.bpfHostNetworkedNATWithoutCTLB",
      "spec.bpfExternalServiceMode",
      "spec.bpfDSROptoutCIDRs",
      "spec.bpfExtToServiceConnmark",
      "spec.bpfKubeProxyIptablesCleanupEnabled",
      "spec.bpfKubeProxyMinSyncPeriod",
      "spec.bpfKubeProxyEndpointSlicesEnabled",
      "spec.bpfPSNATPorts",
      "spec.bpfMapSizeNATFrontend",
      "spec.bpfMapSizeNATBackend",
      "spec.bpfMapSizeNATAffinity",
      "spec.bpfMapSizeRoute",
      "spec.bpfMapSizeConntrack",
      "spec.bpfMapSizePerCpuConntrack",
      "spec.bpfMapSizeConntrackScaling",
      "spec.bpfMapSizeConntrackCleanupQueue",
      "spec.bpfMapSizeIPSets",
      "spec.bpfMapSizeIfState",
      "spec.bpfHostConntrackBypass",
      "spec.bpfEnforceRPF",
      "spec.bpfPolicyDebugEnabled",
      "spec.bpfForceTrackPacketsFromIfaces",
      "spec.bpfDisableGROForIfaces",
      "spec.bpfExcludeCIDRsFromNAT",
      "spec.bpfExportBufferSizeMB",
      "spec.flowLogsPolicyEvaluationMode",
      "spec.bpfRedirectToPeer",
      "spec.flowLogsFlushInterval",
      "spec.flowLogsCollectorDebugTrace",
      "spec.flowLogsGoldmaneServer",
      "spec.bpfProfiling",
      "spec.routeSource",
      "spec.routeTableRanges",
      "spec.routeTableRange",
      "spec.routeSyncDisabled",
      "spec.wireguardEnabled",
      "spec.wireguardEnabledV6",
      "spec.wireguardThreadingEnabled",
      "spec.wireguardListeningPort",
      "spec.wireguardListeningPortV6",
      "spec.wireguardRoutingRulePriority",
      "spec.wireguardInterfaceName",
      "spec.wireguardInterfaceNameV6",
      "spec.wireguardMTU",
      "spec.wireguardMTUV6",
      "spec.wireguardHostEncryptionEnabled",
      "spec.wireguardKeepAlive",
      "spec.awsSrcDstCheck",
      "spec.serviceLoopPrevention",
      "spec.workloadSourceSpoofing",
      "spec.mtuIfacePattern",
      "spec.floatingIPs",
      "spec.windowsManageFirewallRules",
      "spec.goGCThreshold",
      "spec.goMemoryLimitMB",
      "spec.goMaxProcs"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/felixconfig.go"
  },
  {
    "kind": "KubeControllersConfiguration",
    "resource": "kubecontrollersconfigurations",
    "scope": "Cluster",
    "title": "Controller configuration",
    "fields": [
      {
        "path": "healthChecks",
        "label": "Health checks",
        "type": "ref:Enabled,Disabled"
      },
      {
        "path": "logSeverityScreen",
        "label": "Screen log level",
        "type": "ref:Info,Warning,Error"
      },
      {
        "path": "controllers.node.syncLabels",
        "label": "Copy node labels",
        "type": "ref:Enabled,Disabled"
      },
      {
        "path": "controllers.node.hostEndpoint.autoCreate",
        "label": "Automatic host endpoints",
        "type": "ref:Enabled,Disabled"
      },
      {
        "path": "controllers.loadBalancer.assignIPs",
        "label": "Load balancer allocation",
        "type": "ref:AllServices,RequestedServicesOnly"
      }
    ],
    "schema": [
      "spec.logSeverityScreen",
      "spec.healthChecks",
      "spec.etcdV3CompactionPeriod",
      "spec.prometheusMetricsPort",
      "spec.controllers",
      "spec.debugProfilePort"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/kubecontrollersconfig.go"
  },
  {
    "kind": "IPAMConfiguration",
    "resource": "ipamconfigurations",
    "scope": "Cluster",
    "title": "IPAM behavior",
    "fields": [
      {
        "path": "strictAffinity",
        "label": "Prevent borrowing addresses",
        "type": "bool"
      },
      {
        "path": "maxBlocksPerHost",
        "label": "Maximum blocks per host",
        "type": "number"
      }
    ],
    "schema": [
      "spec.strictAffinity",
      "spec.maxBlocksPerHost"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/ipamconfig.go"
  },
  {
    "kind": "Tier",
    "resource": "tiers",
    "scope": "Cluster",
    "title": "Policy precedence",
    "fields": [
      {
        "path": "order",
        "label": "Tier order",
        "type": "number"
      },
      {
        "path": "defaultAction",
        "label": "Fall-through action",
        "type": "ref:Deny,Pass"
      }
    ],
    "schema": [
      "spec.order",
      "spec.defaultAction"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/tier.go"
  },
  {
    "kind": "CalicoNodeStatus",
    "resource": "caliconodestatuses",
    "scope": "Cluster",
    "title": "Diagnostic subscription",
    "fields": [
      {
        "path": "node",
        "label": "Node",
        "type": "text"
      },
      {
        "path": "classes",
        "label": "Diagnostic classes",
        "type": "list"
      },
      {
        "path": "updatePeriodSeconds",
        "label": "Update interval (seconds)",
        "type": "number"
      }
    ],
    "schema": [
      "spec.node",
      "spec.classes",
      "spec.updatePeriodSeconds"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/nodestatus.go"
  },
  {
    "kind": "Profile",
    "resource": "profiles",
    "scope": "Cluster",
    "title": "Independent profile",
    "fields": [
      {
        "path": "labelsToApply",
        "label": "Labels to apply",
        "type": "pairs"
      },
      {
        "path": "ingress",
        "label": "Ingress rules",
        "type": "rules"
      },
      {
        "path": "egress",
        "label": "Egress rules",
        "type": "rules"
      }
    ],
    "schema": [
      "spec.ingress",
      "spec.egress",
      "spec.labelsToApply"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/profile.go"
  },
  {
    "kind": "BlockAffinity",
    "resource": "blockaffinities",
    "scope": "Cluster",
    "title": "IPAM-owned record",
    "fields": [
      {
        "path": "node",
        "label": "Node",
        "type": "text"
      },
      {
        "path": "cidr",
        "label": "Block",
        "type": "text"
      },
      {
        "path": "state",
        "label": "State",
        "type": "text"
      },
      {
        "path": "deleted",
        "label": "Pending deletion",
        "type": "bool"
      }
    ],
    "schema": [
      "spec.state",
      "spec.node",
      "spec.cidr",
      "spec.deleted"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/blockaffinity.go"
  },
  {
    "kind": "ClusterInformation",
    "resource": "clusterinformations",
    "scope": "Cluster",
    "title": "System information",
    "fields": [
      {
        "path": "calicoVersion",
        "label": "Version",
        "type": "text"
      },
      {
        "path": "clusterType",
        "label": "Cluster type",
        "type": "text"
      },
      {
        "path": "datastoreReady",
        "label": "Datastore ready",
        "type": "bool"
      },
      {
        "path": "variant",
        "label": "Variant",
        "type": "text"
      }
    ],
    "schema": [
      "spec.clusterGUID",
      "spec.clusterType",
      "spec.calicoVersion",
      "spec.datastoreReady",
      "spec.variant"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/clusterinfo.go"
  },
  {
    "kind": "StagedNetworkPolicy",
    "resource": "stagednetworkpolicies",
    "scope": "Namespaced",
    "title": "Staged namespace policy",
    "fields": [
      {
        "path": "stagedAction",
        "label": "Staged action",
        "type": "ref:Set,Delete,Learn"
      },
      {
        "path": "selector",
        "label": "Endpoint selector",
        "type": "selector"
      },
      {
        "path": "tier",
        "label": "Tier",
        "type": "ref:default,security"
      },
      {
        "path": "order",
        "label": "Order",
        "type": "number"
      },
      {
        "path": "types",
        "label": "Directions",
        "type": "list"
      },
      {
        "path": "ingress",
        "label": "Ingress rules",
        "type": "rules"
      },
      {
        "path": "egress",
        "label": "Egress rules",
        "type": "rules"
      }
    ],
    "schema": [
      "spec.stagedAction",
      "spec.tier",
      "spec.order",
      "spec.ingress",
      "spec.egress",
      "spec.selector",
      "spec.types",
      "spec.serviceAccountSelector",
      "spec.performanceHints"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/stagednetworkpolicy.go"
  },
  {
    "kind": "StagedGlobalNetworkPolicy",
    "resource": "stagedglobalnetworkpolicies",
    "scope": "Cluster",
    "title": "Staged global policy",
    "fields": [
      {
        "path": "stagedAction",
        "label": "Staged action",
        "type": "ref:Set,Delete,Learn"
      },
      {
        "path": "selector",
        "label": "Endpoint selector",
        "type": "selector"
      },
      {
        "path": "namespaceSelector",
        "label": "Namespace selector",
        "type": "selector"
      },
      {
        "path": "tier",
        "label": "Tier",
        "type": "ref:default,security"
      },
      {
        "path": "order",
        "label": "Order",
        "type": "number"
      },
      {
        "path": "ingress",
        "label": "Ingress rules",
        "type": "rules"
      },
      {
        "path": "egress",
        "label": "Egress rules",
        "type": "rules"
      },
      {
        "path": "preDNAT",
        "label": "Pre-DNAT",
        "type": "bool"
      },
      {
        "path": "applyOnForward",
        "label": "Forward traffic",
        "type": "bool"
      },
      {
        "path": "doNotTrack",
        "label": "Untracked traffic",
        "type": "bool"
      }
    ],
    "schema": [
      "spec.stagedAction",
      "spec.tier",
      "spec.order",
      "spec.ingress",
      "spec.egress",
      "spec.selector",
      "spec.types",
      "spec.doNotTrack",
      "spec.preDNAT",
      "spec.applyOnForward",
      "spec.serviceAccountSelector",
      "spec.namespaceSelector",
      "spec.performanceHints"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/stagedglobalnetworkpolicy.go"
  },
  {
    "kind": "StagedKubernetesNetworkPolicy",
    "resource": "stagedkubernetesnetworkpolicies",
    "scope": "Namespaced",
    "title": "Staged Kubernetes policy",
    "fields": [
      {
        "path": "stagedAction",
        "label": "Staged action",
        "type": "ref:Set,Delete"
      },
      {
        "path": "podSelector.matchLabels",
        "label": "Pod labels",
        "type": "pairs"
      },
      {
        "path": "policyTypes",
        "label": "Directions",
        "type": "list"
      },
      {
        "path": "ingress",
        "label": "Ingress peers and ports",
        "type": "k8srules"
      },
      {
        "path": "egress",
        "label": "Egress peers and ports",
        "type": "k8srules"
      }
    ],
    "schema": [
      "spec.stagedAction",
      "spec.podSelector",
      "spec.ingress",
      "spec.egress",
      "spec.policyTypes"
    ],
    "source": "https://raw.githubusercontent.com/projectcalico/calico/v3.30.0/api/pkg/apis/projectcalico/v3/stagedkubernetesnetworkpolicy.go"
  }
];
