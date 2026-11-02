/** Calico v3.30.0 backing schema. Inspection only; no mutation paths. */
export interface FieldSchema { [key: string]: unknown; type?: string; description?: string; properties?: Record<string, FieldSchema>; items?: FieldSchema; additionalProperties?: boolean | FieldSchema }
export interface BackingResource { kind: string; resource: string; scope: 'Cluster' | 'Namespaced'; publicKind: string | null; primary: string[]; fields: Record<string, FieldSchema> }
export const backingResources: readonly BackingResource[] = [
  {
    "kind": "BGPConfiguration",
    "resource": "bgpconfigurations",
    "scope": "Cluster",
    "publicKind": "BGPConfiguration",
    "primary": [
      "asNumber",
      "nodeToNodeMeshEnabled",
      "listenPort",
      "serviceClusterIPs"
    ],
    "fields": {
      "asNumber": {
        "description": "ASNumber is the default AS number used by a node. [Default: 64512]",
        "format": "int32",
        "type": "integer"
      },
      "bindMode": {
        "description": "BindMode indicates whether to listen for BGP connections on all addresses (None)\nor only on the node's canonical IP address Node.Spec.BGP.IPvXAddress (NodeIP).\nDefault behaviour is to listen for BGP connections on all addresses.",
        "type": "string"
      },
      "communities": {
        "description": "Communities is a list of BGP community values and their arbitrary names for tagging routes.",
        "items": {
          "description": "Community contains standard or large community value and its name.",
          "properties": {
            "name": {
              "description": "Name given to community value.",
              "type": "string"
            },
            "value": {
              "description": "Value must be of format `aa:nn` or `aa:nn:mm`.\nFor standard community use `aa:nn` format, where `aa` and `nn` are 16 bit number.\nFor large community use `aa:nn:mm` format, where `aa`, `nn` and `mm` are 32 bit number.\nWhere, `aa` is an AS Number, `nn` and `mm` are per-AS identifier.",
              "pattern": "^(\\d+):(\\d+)$|^(\\d+):(\\d+):(\\d+)$",
              "type": "string"
            }
          },
          "type": "object"
        },
        "type": "array"
      },
      "ignoredInterfaces": {
        "description": "IgnoredInterfaces indicates the network interfaces that needs to be excluded when reading device routes.",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "listenPort": {
        "description": "ListenPort is the port where BGP protocol should listen. Defaults to 179",
        "maximum": 65535,
        "minimum": 1,
        "type": "integer"
      },
      "localWorkloadPeeringIPV4": {
        "description": "The virtual IPv4 address of the node with which its local workload is expected to peer.\nIt is recommended to use a link-local address.",
        "type": "string"
      },
      "localWorkloadPeeringIPV6": {
        "description": "The virtual IPv6 address of the node with which its local workload is expected to peer.\nIt is recommended to use a link-local address.",
        "type": "string"
      },
      "logSeverityScreen": {
        "description": "LogSeverityScreen is the log severity above which logs are sent to the stdout. [Default: INFO]",
        "type": "string"
      },
      "nodeMeshMaxRestartTime": {
        "description": "Time to allow for software restart for node-to-mesh peerings.  When specified, this is configured\nas the graceful restart timeout.  When not specified, the BIRD default of 120s is used.\nThis field can only be set on the default BGPConfiguration instance and requires that NodeMesh is enabled",
        "type": "string"
      },
      "nodeMeshPassword": {
        "description": "Optional BGP password for full node-to-mesh peerings.\nThis field can only be set on the default BGPConfiguration instance and requires that NodeMesh is enabled",
        "properties": {
          "secretKeyRef": {
            "description": "Selects a key of a secret in the node pod's namespace.",
            "properties": {
              "key": {
                "description": "The key of the secret to select from.  Must be a valid secret key.",
                "type": "string"
              },
              "name": {
                "default": "",
                "description": "Name of the referent.\nThis field is effectively required, but due to backwards compatibility is\nallowed to be empty. Instances of this type with an empty value here are\nalmost certainly wrong.\nMore info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names",
                "type": "string"
              },
              "optional": {
                "description": "Specify whether the Secret or its key must be defined",
                "type": "boolean"
              }
            },
            "required": [
              "key"
            ],
            "type": "object",
            "x-kubernetes-map-type": "atomic"
          }
        },
        "type": "object"
      },
      "nodeToNodeMeshEnabled": {
        "description": "NodeToNodeMeshEnabled sets whether full node to node BGP mesh is enabled. [Default: true]",
        "type": "boolean"
      },
      "prefixAdvertisements": {
        "description": "PrefixAdvertisements contains per-prefix advertisement configuration.",
        "items": {
          "description": "PrefixAdvertisement configures advertisement properties for the specified CIDR.",
          "properties": {
            "cidr": {
              "description": "CIDR for which properties should be advertised.",
              "type": "string"
            },
            "communities": {
              "description": "Communities can be list of either community names already defined in `Specs.Communities` or community value of format `aa:nn` or `aa:nn:mm`.\nFor standard community use `aa:nn` format, where `aa` and `nn` are 16 bit number.\nFor large community use `aa:nn:mm` format, where `aa`, `nn` and `mm` are 32 bit number.\nWhere,`aa` is an AS Number, `nn` and `mm` are per-AS identifier.",
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          },
          "type": "object"
        },
        "type": "array"
      },
      "serviceClusterIPs": {
        "description": "ServiceClusterIPs are the CIDR blocks from which service cluster IPs are allocated.\nIf specified, Calico will advertise these blocks, as well as any cluster IPs within them.",
        "items": {
          "description": "ServiceClusterIPBlock represents a single allowed ClusterIP CIDR block.",
          "properties": {
            "cidr": {
              "type": "string"
            }
          },
          "type": "object"
        },
        "type": "array"
      },
      "serviceExternalIPs": {
        "description": "ServiceExternalIPs are the CIDR blocks for Kubernetes Service External IPs.\nKubernetes Service ExternalIPs will only be advertised if they are within one of these blocks.",
        "items": {
          "description": "ServiceExternalIPBlock represents a single allowed External IP CIDR block.",
          "properties": {
            "cidr": {
              "type": "string"
            }
          },
          "type": "object"
        },
        "type": "array"
      },
      "serviceLoadBalancerIPs": {
        "description": "ServiceLoadBalancerIPs are the CIDR blocks for Kubernetes Service LoadBalancer IPs.\nKubernetes Service status.LoadBalancer.Ingress IPs will only be advertised if they are within one of these blocks.",
        "items": {
          "description": "ServiceLoadBalancerIPBlock represents a single allowed LoadBalancer IP CIDR block.",
          "properties": {
            "cidr": {
              "type": "string"
            }
          },
          "type": "object"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "BGPFilter",
    "resource": "bgpfilters",
    "scope": "Cluster",
    "publicKind": "BGPFilter",
    "primary": [
      "importV4",
      "exportV4",
      "importV6",
      "exportV6"
    ],
    "fields": {
      "exportV4": {
        "description": "The ordered set of IPv4 BGPFilter rules acting on exporting routes to a peer.",
        "items": {
          "description": "BGPFilterRuleV4 defines a BGP filter rule consisting a single IPv4 CIDR block and a filter action for this CIDR.",
          "properties": {
            "action": {
              "type": "string"
            },
            "cidr": {
              "type": "string"
            },
            "interface": {
              "type": "string"
            },
            "matchOperator": {
              "type": "string"
            },
            "prefixLength": {
              "properties": {
                "max": {
                  "format": "int32",
                  "maximum": 32,
                  "minimum": 0,
                  "type": "integer"
                },
                "min": {
                  "format": "int32",
                  "maximum": 32,
                  "minimum": 0,
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "source": {
              "type": "string"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "exportV6": {
        "description": "The ordered set of IPv6 BGPFilter rules acting on exporting routes to a peer.",
        "items": {
          "description": "BGPFilterRuleV6 defines a BGP filter rule consisting a single IPv6 CIDR block and a filter action for this CIDR.",
          "properties": {
            "action": {
              "type": "string"
            },
            "cidr": {
              "type": "string"
            },
            "interface": {
              "type": "string"
            },
            "matchOperator": {
              "type": "string"
            },
            "prefixLength": {
              "properties": {
                "max": {
                  "format": "int32",
                  "maximum": 128,
                  "minimum": 0,
                  "type": "integer"
                },
                "min": {
                  "format": "int32",
                  "maximum": 128,
                  "minimum": 0,
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "source": {
              "type": "string"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "importV4": {
        "description": "The ordered set of IPv4 BGPFilter rules acting on importing routes from a peer.",
        "items": {
          "description": "BGPFilterRuleV4 defines a BGP filter rule consisting a single IPv4 CIDR block and a filter action for this CIDR.",
          "properties": {
            "action": {
              "type": "string"
            },
            "cidr": {
              "type": "string"
            },
            "interface": {
              "type": "string"
            },
            "matchOperator": {
              "type": "string"
            },
            "prefixLength": {
              "properties": {
                "max": {
                  "format": "int32",
                  "maximum": 32,
                  "minimum": 0,
                  "type": "integer"
                },
                "min": {
                  "format": "int32",
                  "maximum": 32,
                  "minimum": 0,
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "source": {
              "type": "string"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "importV6": {
        "description": "The ordered set of IPv6 BGPFilter rules acting on importing routes from a peer.",
        "items": {
          "description": "BGPFilterRuleV6 defines a BGP filter rule consisting a single IPv6 CIDR block and a filter action for this CIDR.",
          "properties": {
            "action": {
              "type": "string"
            },
            "cidr": {
              "type": "string"
            },
            "interface": {
              "type": "string"
            },
            "matchOperator": {
              "type": "string"
            },
            "prefixLength": {
              "properties": {
                "max": {
                  "format": "int32",
                  "maximum": 128,
                  "minimum": 0,
                  "type": "integer"
                },
                "min": {
                  "format": "int32",
                  "maximum": 128,
                  "minimum": 0,
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "source": {
              "type": "string"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "BGPPeer",
    "resource": "bgppeers",
    "scope": "Cluster",
    "publicKind": "BGPPeer",
    "primary": [
      "peerIP",
      "asNumber",
      "nodeSelector",
      "filters"
    ],
    "fields": {
      "asNumber": {
        "description": "The AS Number of the peer.",
        "format": "int32",
        "type": "integer"
      },
      "filters": {
        "description": "The ordered set of BGPFilters applied on this BGP peer.",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "keepOriginalNextHop": {
        "description": "Option to keep the original nexthop field when routes are sent to a BGP Peer.\nSetting \"true\" configures the selected BGP Peers node to use the \"next hop keep;\"\ninstead of \"next hop self;\"(default) in the specific branch of the Node on \"bird.cfg\".",
        "type": "boolean"
      },
      "localWorkloadSelector": {
        "description": "Selector for the local workload that the node should peer with. When this is set, the peerSelector and peerIP fields must be empty,\nand the ASNumber must not be empty.",
        "type": "string"
      },
      "maxRestartTime": {
        "description": "Time to allow for software restart.  When specified, this is configured as the graceful\nrestart timeout.  When not specified, the BIRD default of 120s is used.",
        "type": "string"
      },
      "node": {
        "description": "The node name identifying the Calico node instance that is targeted by this peer.\nIf this is not set, and no nodeSelector is specified, then this BGP peer selects all\nnodes in the cluster.",
        "type": "string"
      },
      "nodeSelector": {
        "description": "Selector for the nodes that should have this peering.  When this is set, the Node\nfield must be empty.",
        "type": "string"
      },
      "numAllowedLocalASNumbers": {
        "description": "Maximum number of local AS numbers that are allowed in the AS path for received routes.\nThis removes BGP loop prevention and should only be used if absolutely necessary.",
        "format": "int32",
        "type": "integer"
      },
      "password": {
        "description": "Optional BGP password for the peerings generated by this BGPPeer resource.",
        "properties": {
          "secretKeyRef": {
            "description": "Selects a key of a secret in the node pod's namespace.",
            "properties": {
              "key": {
                "description": "The key of the secret to select from.  Must be a valid secret key.",
                "type": "string"
              },
              "name": {
                "default": "",
                "description": "Name of the referent.\nThis field is effectively required, but due to backwards compatibility is\nallowed to be empty. Instances of this type with an empty value here are\nalmost certainly wrong.\nMore info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names",
                "type": "string"
              },
              "optional": {
                "description": "Specify whether the Secret or its key must be defined",
                "type": "boolean"
              }
            },
            "required": [
              "key"
            ],
            "type": "object",
            "x-kubernetes-map-type": "atomic"
          }
        },
        "type": "object"
      },
      "peerIP": {
        "description": "The IP address of the peer followed by an optional port number to peer with.\nIf port number is given, format should be `[<IPv6>]:port` or `<IPv4>:<port>` for IPv4.\nIf optional port number is not set, and this peer IP and ASNumber belongs to a calico/node\nwith ListenPort set in BGPConfiguration, then we use that port to peer.",
        "type": "string"
      },
      "peerSelector": {
        "description": "Selector for the remote nodes to peer with.  When this is set, the PeerIP and\nASNumber fields must be empty.  For each peering between the local node and\nselected remote nodes, we configure an IPv4 peering if both ends have\nNodeBGPSpec.IPv4Address specified, and an IPv6 peering if both ends have\nNodeBGPSpec.IPv6Address specified.  The remote AS number comes from the remote\nnode's NodeBGPSpec.ASNumber, or the global default if that is not set.",
        "type": "string"
      },
      "reachableBy": {
        "description": "Add an exact, i.e. /32, static route toward peer IP in order to prevent route flapping.\nReachableBy contains the address of the gateway which peer can be reached by.",
        "type": "string"
      },
      "sourceAddress": {
        "description": "Specifies whether and how to configure a source address for the peerings generated by\nthis BGPPeer resource.  Default value \"UseNodeIP\" means to configure the node IP as the\nsource address.  \"None\" means not to configure a source address.",
        "type": "string"
      },
      "ttlSecurity": {
        "description": "TTLSecurity enables the generalized TTL security mechanism (GTSM) which protects against spoofed packets by\nignoring received packets with a smaller than expected TTL value. The provided value is the number of hops\n(edges) between the peers.",
        "type": "integer"
      }
    }
  },
  {
    "kind": "BlockAffinity",
    "resource": "blockaffinities",
    "scope": "Cluster",
    "publicKind": null,
    "primary": [
      "cidr",
      "node",
      "state",
      "deleted"
    ],
    "fields": {
      "cidr": {
        "type": "string"
      },
      "deleted": {
        "description": "Deleted indicates that this block affinity is being deleted.\nThis field is a string for compatibility with older releases that\nmistakenly treat this field as a string.",
        "type": "string"
      },
      "node": {
        "type": "string"
      },
      "state": {
        "type": "string"
      },
      "type": {
        "type": "string"
      }
    }
  },
  {
    "kind": "CalicoNodeStatus",
    "resource": "caliconodestatuses",
    "scope": "Cluster",
    "publicKind": "CalicoNodeStatus",
    "primary": [
      "node",
      "classes",
      "updatePeriodSeconds"
    ],
    "fields": {
      "classes": {
        "description": "Classes declares the types of information to monitor for this calico/node,\nand allows for selective status reporting about certain subsets of information.",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "node": {
        "description": "The node name identifies the Calico node instance for node status.",
        "type": "string"
      },
      "updatePeriodSeconds": {
        "description": "UpdatePeriodSeconds is the period at which CalicoNodeStatus should be updated.\nSet to 0 to disable CalicoNodeStatus refresh. Maximum update period is one day.",
        "format": "int32",
        "type": "integer"
      }
    }
  },
  {
    "kind": "ClusterInformation",
    "resource": "clusterinformations",
    "scope": "Cluster",
    "publicKind": null,
    "primary": [
      "calicoVersion",
      "clusterType",
      "datastoreReady",
      "variant"
    ],
    "fields": {
      "calicoVersion": {
        "description": "CalicoVersion is the version of Calico that the cluster is running",
        "type": "string"
      },
      "clusterGUID": {
        "description": "ClusterGUID is the GUID of the cluster",
        "type": "string"
      },
      "clusterType": {
        "description": "ClusterType describes the type of the cluster",
        "type": "string"
      },
      "datastoreReady": {
        "description": "DatastoreReady is used during significant datastore migrations to signal to components\nsuch as Felix that it should wait before accessing the datastore.",
        "type": "boolean"
      },
      "variant": {
        "description": "Variant declares which variant of Calico should be active.",
        "type": "string"
      }
    }
  },
  {
    "kind": "FelixConfiguration",
    "resource": "felixconfigurations",
    "scope": "Cluster",
    "publicKind": "FelixConfiguration",
    "primary": [
      "bpfEnabled",
      "iptablesBackend",
      "defaultEndpointToHostAction",
      "failsafeInboundHostPorts"
    ],
    "fields": {
      "allowIPIPPacketsFromWorkloads": {
        "description": "AllowIPIPPacketsFromWorkloads controls whether Felix will add a rule to drop IPIP encapsulated traffic\nfrom workloads. [Default: false]",
        "type": "boolean"
      },
      "allowVXLANPacketsFromWorkloads": {
        "description": "AllowVXLANPacketsFromWorkloads controls whether Felix will add a rule to drop VXLAN encapsulated traffic\nfrom workloads. [Default: false]",
        "type": "boolean"
      },
      "awsSrcDstCheck": {
        "description": "AWSSrcDstCheck controls whether Felix will try to change the \"source/dest check\" setting on the EC2 instance\non which it is running. A value of \"Disable\" will try to disable the source/dest check. Disabling the check\nallows for sending workload traffic without encapsulation within the same AWS subnet.\n[Default: DoNothing]",
        "enum": [
          "DoNothing",
          "Enable",
          "Disable"
        ],
        "type": "string"
      },
      "bpfCTLBLogFilter": {
        "description": "BPFCTLBLogFilter specifies, what is logged by connect time load balancer when BPFLogLevel is\ndebug. Currently has to be specified as 'all' when BPFLogFilters is set\nto see CTLB logs.\n[Default: unset - means logs are emitted when BPFLogLevel id debug and BPFLogFilters not set.]",
        "type": "string"
      },
      "bpfConnectTimeLoadBalancing": {
        "description": "BPFConnectTimeLoadBalancing when in BPF mode, controls whether Felix installs the connect-time load\nbalancer. The connect-time load balancer is required for the host to be able to reach Kubernetes services\nand it improves the performance of pod-to-service connections.When set to TCP, connect time load balancing\nis available only for services with TCP ports. [Default: TCP]",
        "enum": [
          "TCP",
          "Enabled",
          "Disabled"
        ],
        "type": "string"
      },
      "bpfConnectTimeLoadBalancingEnabled": {
        "description": "BPFConnectTimeLoadBalancingEnabled when in BPF mode, controls whether Felix installs the connection-time load\nbalancer.  The connect-time load balancer is required for the host to be able to reach Kubernetes services\nand it improves the performance of pod-to-service connections.  The only reason to disable it is for debugging\npurposes.\n\nDeprecated: Use BPFConnectTimeLoadBalancing [Default: true]",
        "type": "boolean"
      },
      "bpfConntrackLogLevel": {
        "description": "BPFConntrackLogLevel controls the log level of the BPF conntrack cleanup program, which runs periodically\nto clean up expired BPF conntrack entries.\n[Default: Off].",
        "enum": [
          "Off",
          "Debug"
        ],
        "type": "string"
      },
      "bpfConntrackMode": {
        "description": "BPFConntrackCleanupMode controls how BPF conntrack entries are cleaned up.  `Auto` will use a BPF program if supported,\nfalling back to userspace if not.  `Userspace` will always use the userspace cleanup code.  `BPFProgram` will\nalways use the BPF program (failing if not supported).\n[Default: Auto]",
        "enum": [
          "Auto",
          "Userspace",
          "BPFProgram"
        ],
        "type": "string"
      },
      "bpfConntrackTimeouts": {
        "description": "BPFConntrackTimers overrides the default values for the specified conntrack timer if\nset. Each value can be either a duration or `Auto` to pick the value from\na Linux conntrack timeout.\n\nConfigurable timers are: CreationGracePeriod, TCPSynSent,\nTCPEstablished, TCPFinsSeen, TCPResetSeen, UDPTimeout, GenericTimeout,\nICMPTimeout.\n\nUnset values are replaced by the default values with a warning log for\nincorrect values.",
        "properties": {
          "creationGracePeriod": {
            "description": " CreationGracePeriod gives a generic grace period to new connection\n before they are considered for cleanup [Default: 10s].",
            "pattern": "^(([0-9]*(\\.[0-9]*)?(ms|s|h|m|us)+)+|Auto)$",
            "type": "string"
          },
          "genericTimeout": {
            "description": "GenericTimeout controls how long it takes before considering this\nentry for cleanup after the connection became idle. If set to 'Auto', the\nvalue from nf_conntrack_generic_timeout is used. If nil, Calico uses its\nown default value. [Default: 10m].",
            "pattern": "^(([0-9]*(\\.[0-9]*)?(ms|s|h|m|us)+)+|Auto)$",
            "type": "string"
          },
          "icmpTimeout": {
            "description": "ICMPTimeout controls how long it takes before considering this\nentry for cleanup after the connection became idle. If set to 'Auto', the\nvalue from nf_conntrack_icmp_timeout is used. If nil, Calico uses its\nown default value. [Default: 5s].",
            "pattern": "^(([0-9]*(\\.[0-9]*)?(ms|s|h|m|us)+)+|Auto)$",
            "type": "string"
          },
          "tcpEstablished": {
            "description": "TCPEstablished controls how long it takes before considering this entry for\ncleanup after the connection became idle. If set to 'Auto', the\nvalue from nf_conntrack_tcp_timeout_established is used. If nil, Calico uses\nits own default value. [Default: 1h].",
            "pattern": "^(([0-9]*(\\.[0-9]*)?(ms|s|h|m|us)+)+|Auto)$",
            "type": "string"
          },
          "tcpFinsSeen": {
            "description": "TCPFinsSeen controls how long it takes before considering this entry for\ncleanup after the connection was closed gracefully. If set to 'Auto', the\nvalue from nf_conntrack_tcp_timeout_time_wait is used. If nil, Calico uses\nits own default value. [Default: Auto].",
            "pattern": "^(([0-9]*(\\.[0-9]*)?(ms|s|h|m|us)+)+|Auto)$",
            "type": "string"
          },
          "tcpResetSeen": {
            "description": "TCPResetSeen controls how long it takes before considering this entry for\ncleanup after the connection was aborted. If nil, Calico uses its own\ndefault value. [Default: 40s].",
            "pattern": "^(([0-9]*(\\.[0-9]*)?(ms|s|h|m|us)+)+|Auto)$",
            "type": "string"
          },
          "tcpSynSent": {
            "description": "TCPSynSent controls how long it takes before considering this entry for\ncleanup after the last SYN without a response. If set to 'Auto', the\nvalue from nf_conntrack_tcp_timeout_syn_sent is used. If nil, Calico uses\nits own default value. [Default: 20s].",
            "pattern": "^(([0-9]*(\\.[0-9]*)?(ms|s|h|m|us)+)+|Auto)$",
            "type": "string"
          },
          "udpTimeout": {
            "description": "UDPTimeout controls how long it takes before considering this entry for\ncleanup after the connection became idle. If nil, Calico uses its own\ndefault value. [Default: 60s].",
            "pattern": "^(([0-9]*(\\.[0-9]*)?(ms|s|h|m|us)+)+|Auto)$",
            "type": "string"
          }
        },
        "type": "object"
      },
      "bpfDSROptoutCIDRs": {
        "description": "BPFDSROptoutCIDRs is a list of CIDRs which are excluded from DSR. That is, clients\nin those CIDRs will access service node ports as if BPFExternalServiceMode was set to\nTunnel.",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "bpfDataIfacePattern": {
        "description": "BPFDataIfacePattern is a regular expression that controls which interfaces Felix should attach BPF programs to\nin order to catch traffic to/from the network.  This needs to match the interfaces that Calico workload traffic\nflows over as well as any interfaces that handle incoming traffic to nodeports and services from outside the\ncluster.  It should not match the workload interfaces (usually named cali...) or any other special device managed\nby Calico itself (e.g., tunnels).",
        "type": "string"
      },
      "bpfDisableGROForIfaces": {
        "description": "BPFDisableGROForIfaces is a regular expression that controls which interfaces Felix should disable the\nGeneric Receive Offload [GRO] option.  It should not match the workload interfaces (usually named cali...).",
        "type": "string"
      },
      "bpfDisableUnprivileged": {
        "description": "BPFDisableUnprivileged, if enabled, Felix sets the kernel.unprivileged_bpf_disabled sysctl to disable\nunprivileged use of BPF.  This ensures that unprivileged users cannot access Calico's BPF maps and\ncannot insert their own BPF programs to interfere with Calico's. [Default: true]",
        "type": "boolean"
      },
      "bpfEnabled": {
        "description": "BPFEnabled, if enabled Felix will use the BPF dataplane. [Default: false]",
        "type": "boolean"
      },
      "bpfEnforceRPF": {
        "description": "BPFEnforceRPF enforce strict RPF on all host interfaces with BPF programs regardless of\nwhat is the per-interfaces or global setting. Possible values are Disabled, Strict\nor Loose. [Default: Loose]",
        "pattern": "^(?i)(Disabled|Strict|Loose)?$",
        "type": "string"
      },
      "bpfExcludeCIDRsFromNAT": {
        "description": "BPFExcludeCIDRsFromNAT is a list of CIDRs that are to be excluded from NAT\nresolution so that host can handle them. A typical usecase is node local\nDNS cache.",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "bpfExportBufferSizeMB": {
        "description": "BPFExportBufferSizeMB in BPF mode, controls the buffer size used for sending BPF events to felix.\n[Default: 1]",
        "type": "integer"
      },
      "bpfExtToServiceConnmark": {
        "description": "BPFExtToServiceConnmark in BPF mode, controls a 32bit mark that is set on connections from an\nexternal client to a local service. This mark allows us to control how packets of that\nconnection are routed within the host and how is routing interpreted by RPF check. [Default: 0]",
        "type": "integer"
      },
      "bpfExternalServiceMode": {
        "description": "BPFExternalServiceMode in BPF mode, controls how connections from outside the cluster to services (node ports\nand cluster IPs) are forwarded to remote workloads.  If set to \"Tunnel\" then both request and response traffic\nis tunneled to the remote node.  If set to \"DSR\", the request traffic is tunneled but the response traffic\nis sent directly from the remote node.  In \"DSR\" mode, the remote node appears to use the IP of the ingress\nnode; this requires a permissive L2 network.  [Default: Tunnel]",
        "pattern": "^(?i)(Tunnel|DSR)?$",
        "type": "string"
      },
      "bpfForceTrackPacketsFromIfaces": {
        "description": "BPFForceTrackPacketsFromIfaces in BPF mode, forces traffic from these interfaces\nto skip Calico's iptables NOTRACK rule, allowing traffic from those interfaces to be\ntracked by Linux conntrack.  Should only be used for interfaces that are not used for\nthe Calico fabric.  For example, a docker bridge device for non-Calico-networked\ncontainers. [Default: docker+]",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "bpfHostConntrackBypass": {
        "description": "BPFHostConntrackBypass Controls whether to bypass Linux conntrack in BPF mode for\nworkloads and services. [Default: true - bypass Linux conntrack]",
        "type": "boolean"
      },
      "bpfHostNetworkedNATWithoutCTLB": {
        "description": "BPFHostNetworkedNATWithoutCTLB when in BPF mode, controls whether Felix does a NAT without CTLB. This along with BPFConnectTimeLoadBalancing\ndetermines the CTLB behavior. [Default: Enabled]",
        "enum": [
          "Enabled",
          "Disabled"
        ],
        "type": "string"
      },
      "bpfKubeProxyEndpointSlicesEnabled": {
        "description": "BPFKubeProxyEndpointSlicesEnabled is deprecated and has no effect. BPF\nkube-proxy always accepts endpoint slices. This option will be removed in\nthe next release.",
        "type": "boolean"
      },
      "bpfKubeProxyIptablesCleanupEnabled": {
        "description": "BPFKubeProxyIptablesCleanupEnabled, if enabled in BPF mode, Felix will proactively clean up the upstream\nKubernetes kube-proxy's iptables chains.  Should only be enabled if kube-proxy is not running.  [Default: true]",
        "type": "boolean"
      },
      "bpfKubeProxyMinSyncPeriod": {
        "description": "BPFKubeProxyMinSyncPeriod, in BPF mode, controls the minimum time between updates to the dataplane for Felix's\nembedded kube-proxy.  Lower values give reduced set-up latency.  Higher values reduce Felix CPU usage by\nbatching up more work.  [Default: 1s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "bpfL3IfacePattern": {
        "description": "BPFL3IfacePattern is a regular expression that allows to list tunnel devices like wireguard or vxlan (i.e., L3 devices)\nin addition to BPFDataIfacePattern. That is, tunnel interfaces not created by Calico, that Calico workload traffic flows\nover as well as any interfaces that handle incoming traffic to nodeports and services from outside the cluster.",
        "type": "string"
      },
      "bpfLogFilters": {
        "additionalProperties": {
          "type": "string"
        },
        "description": "BPFLogFilters is a map of key=values where the value is\na pcap filter expression and the key is an interface name with 'all'\ndenoting all interfaces, 'weps' all workload endpoints and 'heps' all host\nendpoints.\n\nWhen specified as an env var, it accepts a comma-separated list of\nkey=values.\n[Default: unset - means all debug logs are emitted]",
        "type": "object"
      },
      "bpfLogLevel": {
        "description": "BPFLogLevel controls the log level of the BPF programs when in BPF dataplane mode.  One of \"Off\", \"Info\", or\n\"Debug\".  The logs are emitted to the BPF trace pipe, accessible with the command `tc exec bpf debug`.\n[Default: Off].",
        "pattern": "^(?i)(Off|Info|Debug)?$",
        "type": "string"
      },
      "bpfMapSizeConntrack": {
        "description": "BPFMapSizeConntrack sets the size for the conntrack map.  This map must be large enough to hold\nan entry for each active connection.  Warning: changing the size of the conntrack map can cause disruption.",
        "type": "integer"
      },
      "bpfMapSizeConntrackCleanupQueue": {
        "description": "BPFMapSizeConntrackCleanupQueue sets the size for the map used to hold NAT conntrack entries that are queued\nfor cleanup.  This should be big enough to hold all the NAT entries that expire within one cleanup interval.",
        "minimum": 1,
        "type": "integer"
      },
      "bpfMapSizeConntrackScaling": {
        "description": "BPFMapSizeConntrackScaling controls whether and how we scale the conntrack map size depending\non its usage. 'Disabled' make the size stay at the default or whatever is set by\nBPFMapSizeConntrack*. 'DoubleIfFull' doubles the size when the map is pretty much full even\nafter cleanups. [Default: DoubleIfFull]",
        "pattern": "^(?i)(Disabled|DoubleIfFull)?$",
        "type": "string"
      },
      "bpfMapSizeIPSets": {
        "description": "BPFMapSizeIPSets sets the size for ipsets map.  The IP sets map must be large enough to hold an entry\nfor each endpoint matched by every selector in the source/destination matches in network policy.  Selectors\nsuch as \"all()\" can result in large numbers of entries (one entry per endpoint in that case).",
        "type": "integer"
      },
      "bpfMapSizeIfState": {
        "description": "BPFMapSizeIfState sets the size for ifstate map.  The ifstate map must be large enough to hold an entry\nfor each device (host + workloads) on a host.",
        "type": "integer"
      },
      "bpfMapSizeNATAffinity": {
        "description": "BPFMapSizeNATAffinity sets the size of the BPF map that stores the affinity of a connection (for services that\nenable that feature.",
        "type": "integer"
      },
      "bpfMapSizeNATBackend": {
        "description": "BPFMapSizeNATBackend sets the size for NAT back end map.\nThis is the total number of endpoints. This is mostly\nmore than the size of the number of services.",
        "type": "integer"
      },
      "bpfMapSizeNATFrontend": {
        "description": "BPFMapSizeNATFrontend sets the size for NAT front end map.\nFrontendMap should be large enough to hold an entry for each nodeport,\nexternal IP and each port in each service.",
        "type": "integer"
      },
      "bpfMapSizePerCpuConntrack": {
        "description": "BPFMapSizePerCPUConntrack determines the size of conntrack map based on the number of CPUs. If set to a\nnon-zero value, overrides BPFMapSizeConntrack with `BPFMapSizePerCPUConntrack * (Number of CPUs)`.\nThis map must be large enough to hold an entry for each active connection.  Warning: changing the size of the\nconntrack map can cause disruption.",
        "type": "integer"
      },
      "bpfMapSizeRoute": {
        "description": "BPFMapSizeRoute sets the size for the routes map.  The routes map should be large enough\nto hold one entry per workload and a handful of entries per host (enough to cover its own IPs and\ntunnel IPs).",
        "type": "integer"
      },
      "bpfPSNATPorts": {
        "anyOf": [
          {
            "type": "integer"
          },
          {
            "type": "string"
          }
        ],
        "description": "BPFPSNATPorts sets the range from which we randomly pick a port if there is a source port\ncollision. This should be within the ephemeral range as defined by RFC 6056 (1024–65535) and\npreferably outside the  ephemeral ranges used by common operating systems. Linux uses\n32768–60999, while others mostly use the IANA defined range 49152–65535. It is not necessarily\na problem if this range overlaps with the operating systems. Both ends of the range are\ninclusive. [Default: 20000:29999]",
        "pattern": "^.*",
        "x-kubernetes-int-or-string": true
      },
      "bpfPolicyDebugEnabled": {
        "description": "BPFPolicyDebugEnabled when true, Felix records detailed information\nabout the BPF policy programs, which can be examined with the calico-bpf command-line tool.",
        "type": "boolean"
      },
      "bpfProfiling": {
        "description": "BPFProfiling controls profiling of BPF programs. At the monent, it can be\nDisabled or Enabled. [Default: Disabled]",
        "enum": [
          "Enabled",
          "Disabled"
        ],
        "type": "string"
      },
      "bpfRedirectToPeer": {
        "description": "BPFRedirectToPeer controls which whether it is allowed to forward straight to the\npeer side of the workload devices. It is allowed for any host L2 devices by default\n(L2Only), but it breaks TCP dump on the host side of workload device as it bypasses\nit on ingress. Value of Enabled also allows redirection from L3 host devices like\nIPIP tunnel or Wireguard directly to the peer side of the workload's device. This\nmakes redirection faster, however, it breaks tools like tcpdump on the peer side.\nUse Enabled with caution. [Default: L2Only]",
        "enum": [
          "Enabled",
          "Disabled",
          "L2Only"
        ],
        "type": "string"
      },
      "chainInsertMode": {
        "description": "ChainInsertMode controls whether Felix hooks the kernel's top-level iptables chains by inserting a rule\nat the top of the chain or by appending a rule at the bottom. insert is the safe default since it prevents\nCalico's rules from being bypassed. If you switch to append mode, be sure that the other rules in the chains\nsignal acceptance by falling through to the Calico rules, otherwise the Calico policy will be bypassed.\n[Default: insert]",
        "pattern": "^(?i)(Insert|Append)?$",
        "type": "string"
      },
      "dataplaneDriver": {
        "description": "DataplaneDriver filename of the external dataplane driver to use.  Only used if UseInternalDataplaneDriver\nis set to false.",
        "type": "string"
      },
      "dataplaneWatchdogTimeout": {
        "description": "DataplaneWatchdogTimeout is the readiness/liveness timeout used for Felix's (internal) dataplane driver.\nDeprecated: replaced by the generic HealthTimeoutOverrides.",
        "type": "string"
      },
      "debugDisableLogDropping": {
        "description": "DebugDisableLogDropping disables the dropping of log messages when the log buffer is full.  This can\nsignificantly impact performance if log write-out is a bottleneck. [Default: false]",
        "type": "boolean"
      },
      "debugHost": {
        "description": "DebugHost is the host IP or hostname to bind the debug port to.  Only used\nif DebugPort is set. [Default:localhost]",
        "type": "string"
      },
      "debugMemoryProfilePath": {
        "description": "DebugMemoryProfilePath is the path to write the memory profile to when triggered by signal.",
        "type": "string"
      },
      "debugPort": {
        "description": "DebugPort if set, enables Felix's debug HTTP port, which allows memory and CPU profiles\nto be retrieved.  The debug port is not secure, it should not be exposed to the internet.",
        "type": "integer"
      },
      "debugSimulateCalcGraphHangAfter": {
        "description": "DebugSimulateCalcGraphHangAfter is used to simulate a hang in the calculation graph after the specified duration.\nThis is useful in tests of the watchdog system only!",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "debugSimulateDataplaneApplyDelay": {
        "description": "DebugSimulateDataplaneApplyDelay adds an artificial delay to every dataplane operation.  This is useful for\nsimulating a heavily loaded system for test purposes only.",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "debugSimulateDataplaneHangAfter": {
        "description": "DebugSimulateDataplaneHangAfter is used to simulate a hang in the dataplane after the specified duration.\nThis is useful in tests of the watchdog system only!",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "defaultEndpointToHostAction": {
        "description": "DefaultEndpointToHostAction controls what happens to traffic that goes from a workload endpoint to the host\nitself (after the endpoint's egress policy is applied). By default, Calico blocks traffic from workload\nendpoints to the host itself with an iptables \"DROP\" action. If you want to allow some or all traffic from\nendpoint to host, set this parameter to RETURN or ACCEPT. Use RETURN if you have your own rules in the iptables\n\"INPUT\" chain; Calico will insert its rules at the top of that chain, then \"RETURN\" packets to the \"INPUT\" chain\nonce it has completed processing workload endpoint egress policy. Use ACCEPT to unconditionally accept packets\nfrom workloads after processing workload endpoint egress policy. [Default: Drop]",
        "pattern": "^(?i)(Drop|Accept|Return)?$",
        "type": "string"
      },
      "deviceRouteProtocol": {
        "description": "DeviceRouteProtocol controls the protocol to set on routes programmed by Felix. The protocol is an 8-bit label\nused to identify the owner of the route.",
        "type": "integer"
      },
      "deviceRouteSourceAddress": {
        "description": "DeviceRouteSourceAddress IPv4 address to set as the source hint for routes programmed by Felix. When not set\nthe source address for local traffic from host to workload will be determined by the kernel.",
        "type": "string"
      },
      "deviceRouteSourceAddressIPv6": {
        "description": "DeviceRouteSourceAddressIPv6 IPv6 address to set as the source hint for routes programmed by Felix. When not set\nthe source address for local traffic from host to workload will be determined by the kernel.",
        "type": "string"
      },
      "disableConntrackInvalidCheck": {
        "description": "DisableConntrackInvalidCheck disables the check for invalid connections in conntrack. While the conntrack\ninvalid check helps to detect malicious traffic, it can also cause issues with certain multi-NIC scenarios.",
        "type": "boolean"
      },
      "endpointReportingDelay": {
        "description": "EndpointReportingDelay is the delay before Felix reports endpoint status to the datastore. This is only used\nby the OpenStack integration. [Default: 1s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "endpointReportingEnabled": {
        "description": "EndpointReportingEnabled controls whether Felix reports endpoint status to the datastore. This is only used\nby the OpenStack integration. [Default: false]",
        "type": "boolean"
      },
      "endpointStatusPathPrefix": {
        "description": "EndpointStatusPathPrefix is the path to the directory where endpoint status will be written. Endpoint status\nfile reporting is disabled if field is left empty.\n\nChosen directory should match the directory used by the CNI plugin for PodStartupDelay.\n[Default: /var/run/calico]",
        "type": "string"
      },
      "externalNodesList": {
        "description": "ExternalNodesCIDRList is a list of CIDR's of external, non-Calico nodes from which VXLAN/IPIP overlay traffic\nwill be allowed.  By default, external tunneled traffic is blocked to reduce attack surface.",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "failsafeInboundHostPorts": {
        "description": "FailsafeInboundHostPorts is a list of ProtoPort struct objects including UDP/TCP/SCTP ports and CIDRs that Felix will\nallow incoming traffic to host endpoints on irrespective of the security policy. This is useful to avoid accidentally\ncutting off a host with incorrect configuration. For backwards compatibility, if the protocol is not specified,\nit defaults to \"tcp\". If a CIDR is not specified, it will allow traffic from all addresses. To disable all inbound host ports,\nuse the value \"[]\". The default value allows ssh access, DHCP, BGP, etcd and the Kubernetes API.\n[Default: tcp:22, udp:68, tcp:179, tcp:2379, tcp:2380, tcp:5473, tcp:6443, tcp:6666, tcp:6667 ]",
        "items": {
          "description": "ProtoPort is combination of protocol, port, and CIDR. Protocol and port must be specified.",
          "properties": {
            "net": {
              "type": "string"
            },
            "port": {
              "type": "integer"
            },
            "protocol": {
              "type": "string"
            }
          },
          "required": [
            "port"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "failsafeOutboundHostPorts": {
        "description": "FailsafeOutboundHostPorts is a list of PortProto struct objects including UDP/TCP/SCTP ports and CIDRs that Felix\nwill allow outgoing traffic from host endpoints to irrespective of the security policy. This is useful to avoid accidentally\ncutting off a host with incorrect configuration. For backwards compatibility, if the protocol is not specified, it defaults\nto \"tcp\". If a CIDR is not specified, it will allow traffic from all addresses. To disable all outbound host ports,\nuse the value \"[]\". The default value opens etcd's standard ports to ensure that Felix does not get cut off from etcd\nas well as allowing DHCP, DNS, BGP and the Kubernetes API.\n[Default: udp:53, udp:67, tcp:179, tcp:2379, tcp:2380, tcp:5473, tcp:6443, tcp:6666, tcp:6667 ]",
        "items": {
          "description": "ProtoPort is combination of protocol, port, and CIDR. Protocol and port must be specified.",
          "properties": {
            "net": {
              "type": "string"
            },
            "port": {
              "type": "integer"
            },
            "protocol": {
              "type": "string"
            }
          },
          "required": [
            "port"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "featureDetectOverride": {
        "description": "FeatureDetectOverride is used to override feature detection based on auto-detected platform\ncapabilities.  Values are specified in a comma separated list with no spaces, example;\n\"SNATFullyRandom=true,MASQFullyRandom=false,RestoreSupportsLock=\". A value of \"true\" or \"false\" will\nforce enable/disable feature, empty or omitted values fall back to auto-detection.",
        "pattern": "^([a-zA-Z0-9-_]+=(true|false|),)*([a-zA-Z0-9-_]+=(true|false|))?$",
        "type": "string"
      },
      "featureGates": {
        "description": "FeatureGates is used to enable or disable tech-preview Calico features.\nValues are specified in a comma separated list with no spaces, example;\n\"BPFConnectTimeLoadBalancingWorkaround=enabled,XyZ=false\". This is\nused to enable features that are not fully production ready.",
        "pattern": "^([a-zA-Z0-9-_]+=([^=]+),)*([a-zA-Z0-9-_]+=([^=]+))?$",
        "type": "string"
      },
      "floatingIPs": {
        "description": "FloatingIPs configures whether or not Felix will program non-OpenStack floating IP addresses.  (OpenStack-derived\nfloating IPs are always programmed, regardless of this setting.)",
        "enum": [
          "Enabled",
          "Disabled"
        ],
        "type": "string"
      },
      "flowLogsCollectorDebugTrace": {
        "description": "When FlowLogsCollectorDebugTrace is set to true, enables the logs in the collector to be\nprinted in their entirety.",
        "type": "boolean"
      },
      "flowLogsFlushInterval": {
        "description": "FlowLogsFlushInterval configures the interval at which Felix exports flow logs.",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "flowLogsGoldmaneServer": {
        "description": "FlowLogGoldmaneServer is the flow server endpoint to which flow data should be published.",
        "type": "string"
      },
      "flowLogsPolicyEvaluationMode": {
        "description": "Continuous - Felix evaluates active flows on a regular basis to determine the rule\ntraces in the flow logs. Any policy updates that impact a flow will be reflected in the\npending_policies field, offering a near-real-time view of policy changes across flows.\nNone - Felix stops evaluating pending traces.\n[Default: Continuous]",
        "enum": [
          "None",
          "Continuous"
        ],
        "type": "string"
      },
      "genericXDPEnabled": {
        "description": "GenericXDPEnabled enables Generic XDP so network cards that don't support XDP offload or driver\nmodes can use XDP. This is not recommended since it doesn't provide better performance than\niptables. [Default: false]",
        "type": "boolean"
      },
      "goGCThreshold": {
        "description": "GoGCThreshold Sets the Go runtime's garbage collection threshold.  I.e. the percentage that the heap is\nallowed to grow before garbage collection is triggered.  In general, doubling the value halves the CPU time\nspent doing GC, but it also doubles peak GC memory overhead.  A special value of -1 can be used\nto disable GC entirely; this should only be used in conjunction with the GoMemoryLimitMB setting.\n\nThis setting is overridden by the GOGC environment variable.\n\n[Default: 40]",
        "type": "integer"
      },
      "goMaxProcs": {
        "description": "GoMaxProcs sets the maximum number of CPUs that the Go runtime will use concurrently.  A value of -1 means\n\"use the system default\"; typically the number of real CPUs on the system.\n\nthis setting is overridden by the GOMAXPROCS environment variable.\n\n[Default: -1]",
        "type": "integer"
      },
      "goMemoryLimitMB": {
        "description": "GoMemoryLimitMB sets a (soft) memory limit for the Go runtime in MB.  The Go runtime will try to keep its memory\nusage under the limit by triggering GC as needed.  To avoid thrashing, it will exceed the limit if GC starts to\ntake more than 50% of the process's CPU time.  A value of -1 disables the memory limit.\n\nNote that the memory limit, if used, must be considerably less than any hard resource limit set at the container\nor pod level.  This is because felix is not the only process that must run in the container or pod.\n\nThis setting is overridden by the GOMEMLIMIT environment variable.\n\n[Default: -1]",
        "type": "integer"
      },
      "healthEnabled": {
        "description": "HealthEnabled if set to true, enables Felix's health port, which provides readiness and liveness endpoints.\n[Default: false]",
        "type": "boolean"
      },
      "healthHost": {
        "description": "HealthHost is the host that the health server should bind to. [Default: localhost]",
        "type": "string"
      },
      "healthPort": {
        "description": "HealthPort is the TCP port that the health server should bind to. [Default: 9099]",
        "type": "integer"
      },
      "healthTimeoutOverrides": {
        "description": "HealthTimeoutOverrides allows the internal watchdog timeouts of individual subcomponents to be\noverridden.  This is useful for working around \"false positive\" liveness timeouts that can occur\nin particularly stressful workloads or if CPU is constrained.  For a list of active\nsubcomponents, see Felix's logs.",
        "items": {
          "properties": {
            "name": {
              "type": "string"
            },
            "timeout": {
              "type": "string"
            }
          },
          "required": [
            "name",
            "timeout"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "interfaceExclude": {
        "description": "InterfaceExclude A comma-separated list of interface names that should be excluded when Felix is resolving\nhost endpoints. The default value ensures that Felix ignores Kubernetes' internal `kube-ipvs0` device. If you\nwant to exclude multiple interface names using a single value, the list supports regular expressions. For\nregular expressions you must wrap the value with `/`. For example having values `/^kube/,veth1` will exclude\nall interfaces that begin with `kube` and also the interface `veth1`. [Default: kube-ipvs0]",
        "type": "string"
      },
      "interfacePrefix": {
        "description": "InterfacePrefix is the interface name prefix that identifies workload endpoints and so distinguishes\nthem from host endpoint interfaces. Note: in environments other than bare metal, the orchestrators\nconfigure this appropriately. For example our Kubernetes and Docker integrations set the 'cali' value,\nand our OpenStack integration sets the 'tap' value. [Default: cali]",
        "type": "string"
      },
      "interfaceRefreshInterval": {
        "description": "InterfaceRefreshInterval is the period at which Felix rescans local interfaces to verify their state.\nThe rescan can be disabled by setting the interval to 0.",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "ipForwarding": {
        "description": "IPForwarding controls whether Felix sets the host sysctls to enable IP forwarding.  IP forwarding is required\nwhen using Calico for workload networking.  This should be disabled only on hosts where Calico is used solely for\nhost protection. In BPF mode, due to a kernel interaction, either IPForwarding must be enabled or BPFEnforceRPF\nmust be disabled. [Default: Enabled]",
        "enum": [
          "Enabled",
          "Disabled"
        ],
        "type": "string"
      },
      "ipipEnabled": {
        "description": "IPIPEnabled overrides whether Felix should configure an IPIP interface on the host. Optional as Felix\ndetermines this based on the existing IP pools. [Default: nil (unset)]",
        "type": "boolean"
      },
      "ipipMTU": {
        "description": "IPIPMTU controls the MTU to set on the IPIP tunnel device.  Optional as Felix auto-detects the MTU based on the\nMTU of the host's interfaces. [Default: 0 (auto-detect)]",
        "type": "integer"
      },
      "ipsetsRefreshInterval": {
        "description": "IpsetsRefreshInterval controls the period at which Felix re-checks all IP sets to look for discrepancies.\nSet to 0 to disable the periodic refresh. [Default: 90s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "iptablesBackend": {
        "description": "IptablesBackend controls which backend of iptables will be used. The default is `Auto`.\n\nWarning: changing this on a running system can leave \"orphaned\" rules in the \"other\" backend. These\nshould be cleaned up to avoid confusing interactions.",
        "pattern": "^(?i)(Auto|Legacy|NFT)?$",
        "type": "string"
      },
      "iptablesFilterAllowAction": {
        "description": "IptablesFilterAllowAction controls what happens to traffic that is accepted by a Felix policy chain in the\niptables filter table (which is used for \"normal\" policy). The default will immediately `Accept` the traffic. Use\n`Return` to send the traffic back up to the system chains for further processing.",
        "pattern": "^(?i)(Accept|Return)?$",
        "type": "string"
      },
      "iptablesFilterDenyAction": {
        "description": "IptablesFilterDenyAction controls what happens to traffic that is denied by network policy. By default Calico blocks traffic\nwith an iptables \"DROP\" action. If you want to use \"REJECT\" action instead you can configure it in here.",
        "pattern": "^(?i)(Drop|Reject)?$",
        "type": "string"
      },
      "iptablesLockFilePath": {
        "description": "IptablesLockFilePath is the location of the iptables lock file. You may need to change this\nif the lock file is not in its standard location (for example if you have mapped it into Felix's\ncontainer at a different path). [Default: /run/xtables.lock]",
        "type": "string"
      },
      "iptablesLockProbeInterval": {
        "description": "IptablesLockProbeInterval when IptablesLockTimeout is enabled: the time that Felix will wait between\nattempts to acquire the iptables lock if it is not available. Lower values make Felix more\nresponsive when the lock is contended, but use more CPU. [Default: 50ms]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "iptablesLockTimeout": {
        "description": "IptablesLockTimeout is the time that Felix itself will wait for the iptables lock (rather than delegating the\nlock handling to the `iptables` command).\n\nDeprecated: `iptables-restore` v1.8+ always takes the lock, so enabling this feature results in deadlock.\n[Default: 0s disabled]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "iptablesMangleAllowAction": {
        "description": "IptablesMangleAllowAction controls what happens to traffic that is accepted by a Felix policy chain in the\niptables mangle table (which is used for \"pre-DNAT\" policy). The default will immediately `Accept` the traffic.\nUse `Return` to send the traffic back up to the system chains for further processing.",
        "pattern": "^(?i)(Accept|Return)?$",
        "type": "string"
      },
      "iptablesMarkMask": {
        "description": "IptablesMarkMask is the mask that Felix selects its IPTables Mark bits from. Should be a 32 bit hexadecimal\nnumber with at least 8 bits set, none of which clash with any other mark bits in use on the system.\n[Default: 0xffff0000]",
        "format": "int32",
        "type": "integer"
      },
      "iptablesNATOutgoingInterfaceFilter": {
        "description": "This parameter can be used to limit the host interfaces on which Calico will apply SNAT to traffic leaving a\nCalico IPAM pool with \"NAT outgoing\" enabled. This can be useful if you have a main data interface, where\ntraffic should be SNATted and a secondary device (such as the docker bridge) which is local to the host and\ndoesn't require SNAT. This parameter uses the iptables interface matching syntax, which allows + as a\nwildcard. Most users will not need to set this. Example: if your data interfaces are eth0 and eth1 and you\nwant to exclude the docker bridge, you could set this to eth+",
        "type": "string"
      },
      "iptablesPostWriteCheckInterval": {
        "description": "IptablesPostWriteCheckInterval is the period after Felix has done a write\nto the dataplane that it schedules an extra read back in order to check the write was not\nclobbered by another process. This should only occur if another application on the system\ndoesn't respect the iptables lock. [Default: 1s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "iptablesRefreshInterval": {
        "description": "IptablesRefreshInterval is the period at which Felix re-checks the IP sets\nin the dataplane to ensure that no other process has accidentally broken Calico's rules.\nSet to 0 to disable IP sets refresh. Note: the default for this value is lower than the\nother refresh intervals as a workaround for a Linux kernel bug that was fixed in kernel\nversion 4.11. If you are using v4.11 or greater you may want to set this to, a higher value\nto reduce Felix CPU usage. [Default: 10s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "ipv6Support": {
        "description": "IPv6Support controls whether Felix enables support for IPv6 (if supported by the in-use dataplane).",
        "type": "boolean"
      },
      "kubeNodePortRanges": {
        "description": "KubeNodePortRanges holds list of port ranges used for service node ports. Only used if felix detects kube-proxy running in ipvs mode.\nFelix uses these ranges to separate host and workload traffic. [Default: 30000:32767].",
        "items": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "string"
            }
          ],
          "pattern": "^.*",
          "x-kubernetes-int-or-string": true
        },
        "type": "array"
      },
      "logDebugFilenameRegex": {
        "description": "LogDebugFilenameRegex controls which source code files have their Debug log output included in the logs.\nOnly logs from files with names that match the given regular expression are included.  The filter only applies\nto Debug level logs.",
        "type": "string"
      },
      "logFilePath": {
        "description": "LogFilePath is the full path to the Felix log. Set to none to disable file logging. [Default: /var/log/calico/felix.log]",
        "type": "string"
      },
      "logPrefix": {
        "description": "LogPrefix is the log prefix that Felix uses when rendering LOG rules. [Default: calico-packet]",
        "type": "string"
      },
      "logSeverityFile": {
        "description": "LogSeverityFile is the log severity above which logs are sent to the log file. [Default: Info]",
        "pattern": "^(?i)(Debug|Info|Warning|Error|Fatal)?$",
        "type": "string"
      },
      "logSeverityScreen": {
        "description": "LogSeverityScreen is the log severity above which logs are sent to the stdout. [Default: Info]",
        "pattern": "^(?i)(Debug|Info|Warning|Error|Fatal)?$",
        "type": "string"
      },
      "logSeveritySys": {
        "description": "LogSeveritySys is the log severity above which logs are sent to the syslog. Set to None for no logging to syslog.\n[Default: Info]",
        "pattern": "^(?i)(Debug|Info|Warning|Error|Fatal)?$",
        "type": "string"
      },
      "maxIpsetSize": {
        "description": "MaxIpsetSize is the maximum number of IP addresses that can be stored in an IP set. Not applicable\nif using the nftables backend.",
        "type": "integer"
      },
      "metadataAddr": {
        "description": "MetadataAddr is the IP address or domain name of the server that can answer VM queries for\ncloud-init metadata. In OpenStack, this corresponds to the machine running nova-api (or in\nUbuntu, nova-api-metadata). A value of none (case-insensitive) means that Felix should not\nset up any NAT rule for the metadata path. [Default: 127.0.0.1]",
        "type": "string"
      },
      "metadataPort": {
        "description": "MetadataPort is the port of the metadata server. This, combined with global.MetadataAddr (if\nnot 'None'), is used to set up a NAT rule, from 169.254.169.254:80 to MetadataAddr:MetadataPort.\nIn most cases this should not need to be changed [Default: 8775].",
        "type": "integer"
      },
      "mtuIfacePattern": {
        "description": "MTUIfacePattern is a regular expression that controls which interfaces Felix should scan in order\nto calculate the host's MTU.\nThis should not match workload interfaces (usually named cali...).",
        "type": "string"
      },
      "natOutgoingAddress": {
        "description": "NATOutgoingAddress specifies an address to use when performing source NAT for traffic in a natOutgoing pool that\nis leaving the network. By default the address used is an address on the interface the traffic is leaving on\n(i.e. it uses the iptables MASQUERADE target).",
        "type": "string"
      },
      "natPortRange": {
        "anyOf": [
          {
            "type": "integer"
          },
          {
            "type": "string"
          }
        ],
        "description": "NATPortRange specifies the range of ports that is used for port mapping when doing outgoing NAT. When unset the default behavior of the\nnetwork stack is used.",
        "pattern": "^.*",
        "x-kubernetes-int-or-string": true
      },
      "netlinkTimeout": {
        "description": "NetlinkTimeout is the timeout when talking to the kernel over the netlink protocol, used for programming\nroutes, rules, and other kernel objects. [Default: 10s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "nftablesFilterAllowAction": {
        "description": "NftablesFilterAllowAction controls the nftables action that Felix uses to represent the \"allow\" policy verdict\nin the filter table. The default is to `ACCEPT` the traffic, which is a terminal action.  Alternatively,\n`RETURN` can be used to return the traffic back to the top-level chain for further processing by your rules.",
        "pattern": "^(?i)(Accept|Return)?$",
        "type": "string"
      },
      "nftablesFilterDenyAction": {
        "description": "NftablesFilterDenyAction controls what happens to traffic that is denied by network policy. By default, Calico\nblocks traffic with a \"drop\" action. If you want to use a \"reject\" action instead you can configure it here.",
        "pattern": "^(?i)(Drop|Reject)?$",
        "type": "string"
      },
      "nftablesMangleAllowAction": {
        "description": "NftablesMangleAllowAction controls the nftables action that Felix uses to represent the \"allow\" policy verdict\nin the mangle table. The default is to `ACCEPT` the traffic, which is a terminal action.  Alternatively,\n`RETURN` can be used to return the traffic back to the top-level chain for further processing by your rules.",
        "pattern": "^(?i)(Accept|Return)?$",
        "type": "string"
      },
      "nftablesMarkMask": {
        "description": "NftablesMarkMask is the mask that Felix selects its nftables Mark bits from. Should be a 32 bit hexadecimal\nnumber with at least 8 bits set, none of which clash with any other mark bits in use on the system.\n[Default: 0xffff0000]",
        "format": "int32",
        "type": "integer"
      },
      "nftablesMode": {
        "description": "NFTablesMode configures nftables support in Felix. [Default: Disabled]",
        "enum": [
          "Disabled",
          "Enabled",
          "Auto"
        ],
        "type": "string"
      },
      "nftablesRefreshInterval": {
        "description": "NftablesRefreshInterval controls the interval at which Felix periodically refreshes the nftables rules. [Default: 90s]",
        "type": "string"
      },
      "openstackRegion": {
        "description": "OpenstackRegion is the name of the region that a particular Felix belongs to. In a multi-region\nCalico/OpenStack deployment, this must be configured somehow for each Felix (here in the datamodel,\nor in felix.cfg or the environment on each compute node), and must match the [calico]\nopenstack_region value configured in neutron.conf on each node. [Default: Empty]",
        "type": "string"
      },
      "policySyncPathPrefix": {
        "description": "PolicySyncPathPrefix is used to by Felix to communicate policy changes to external services,\nlike Application layer policy. [Default: Empty]",
        "type": "string"
      },
      "prometheusGoMetricsEnabled": {
        "description": "PrometheusGoMetricsEnabled disables Go runtime metrics collection, which the Prometheus client does by default, when\nset to false. This reduces the number of metrics reported, reducing Prometheus load. [Default: true]",
        "type": "boolean"
      },
      "prometheusMetricsEnabled": {
        "description": "PrometheusMetricsEnabled enables the Prometheus metrics server in Felix if set to true. [Default: false]",
        "type": "boolean"
      },
      "prometheusMetricsHost": {
        "description": "PrometheusMetricsHost is the host that the Prometheus metrics server should bind to. [Default: empty]",
        "type": "string"
      },
      "prometheusMetricsPort": {
        "description": "PrometheusMetricsPort is the TCP port that the Prometheus metrics server should bind to. [Default: 9091]",
        "type": "integer"
      },
      "prometheusProcessMetricsEnabled": {
        "description": "PrometheusProcessMetricsEnabled disables process metrics collection, which the Prometheus client does by default, when\nset to false. This reduces the number of metrics reported, reducing Prometheus load. [Default: true]",
        "type": "boolean"
      },
      "prometheusWireGuardMetricsEnabled": {
        "description": "PrometheusWireGuardMetricsEnabled disables wireguard metrics collection, which the Prometheus client does by default, when\nset to false. This reduces the number of metrics reported, reducing Prometheus load. [Default: true]",
        "type": "boolean"
      },
      "removeExternalRoutes": {
        "description": "RemoveExternalRoutes Controls whether Felix will remove unexpected routes to workload interfaces. Felix will\nalways clean up expected routes that use the configured DeviceRouteProtocol.  To add your own routes, you must\nuse a distinct protocol (in addition to setting this field to false).",
        "type": "boolean"
      },
      "reportingInterval": {
        "description": "ReportingInterval is the interval at which Felix reports its status into the datastore or 0 to disable.\nMust be non-zero in OpenStack deployments. [Default: 30s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "reportingTTL": {
        "description": "ReportingTTL is the time-to-live setting for process-wide status reports. [Default: 90s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "routeRefreshInterval": {
        "description": "RouteRefreshInterval is the period at which Felix re-checks the routes\nin the dataplane to ensure that no other process has accidentally broken Calico's rules.\nSet to 0 to disable route refresh. [Default: 90s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "routeSource": {
        "description": "RouteSource configures where Felix gets its routing information.\n- WorkloadIPs: use workload endpoints to construct routes.\n- CalicoIPAM: the default - use IPAM data to construct routes.",
        "pattern": "^(?i)(WorkloadIPs|CalicoIPAM)?$",
        "type": "string"
      },
      "routeSyncDisabled": {
        "description": "RouteSyncDisabled will disable all operations performed on the route table. Set to true to\nrun in network-policy mode only.",
        "type": "boolean"
      },
      "routeTableRange": {
        "description": "Deprecated in favor of RouteTableRanges.\nCalico programs additional Linux route tables for various purposes.\nRouteTableRange specifies the indices of the route tables that Calico should use.",
        "properties": {
          "max": {
            "type": "integer"
          },
          "min": {
            "type": "integer"
          }
        },
        "required": [
          "max",
          "min"
        ],
        "type": "object"
      },
      "routeTableRanges": {
        "description": "Calico programs additional Linux route tables for various purposes.\nRouteTableRanges specifies a set of table index ranges that Calico should use.\nDeprecates`RouteTableRange`, overrides `RouteTableRange`.",
        "items": {
          "properties": {
            "max": {
              "type": "integer"
            },
            "min": {
              "type": "integer"
            }
          },
          "required": [
            "max",
            "min"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "serviceLoopPrevention": {
        "description": "When service IP advertisement is enabled, prevent routing loops to service IPs that are\nnot in use, by dropping or rejecting packets that do not get DNAT'd by kube-proxy.\nUnless set to \"Disabled\", in which case such routing loops continue to be allowed.\n[Default: Drop]",
        "pattern": "^(?i)(Drop|Reject|Disabled)?$",
        "type": "string"
      },
      "sidecarAccelerationEnabled": {
        "description": "SidecarAccelerationEnabled enables experimental sidecar acceleration [Default: false]",
        "type": "boolean"
      },
      "usageReportingEnabled": {
        "description": "UsageReportingEnabled reports anonymous Calico version number and cluster size to projectcalico.org. Logs warnings returned by the usage\nserver. For example, if a significant security vulnerability has been discovered in the version of Calico being used. [Default: true]",
        "type": "boolean"
      },
      "usageReportingInitialDelay": {
        "description": "UsageReportingInitialDelay controls the minimum delay before Felix makes a report. [Default: 300s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "usageReportingInterval": {
        "description": "UsageReportingInterval controls the interval at which Felix makes reports. [Default: 86400s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "useInternalDataplaneDriver": {
        "description": "UseInternalDataplaneDriver, if true, Felix will use its internal dataplane programming logic.  If false, it\nwill launch an external dataplane driver and communicate with it over protobuf.",
        "type": "boolean"
      },
      "vxlanEnabled": {
        "description": "VXLANEnabled overrides whether Felix should create the VXLAN tunnel device for IPv4 VXLAN networking.\nOptional as Felix determines this based on the existing IP pools. [Default: nil (unset)]",
        "type": "boolean"
      },
      "vxlanMTU": {
        "description": "VXLANMTU is the MTU to set on the IPv4 VXLAN tunnel device.  Optional as Felix auto-detects the MTU based on the\nMTU of the host's interfaces. [Default: 0 (auto-detect)]",
        "type": "integer"
      },
      "vxlanMTUV6": {
        "description": "VXLANMTUV6 is the MTU to set on the IPv6 VXLAN tunnel device. Optional as Felix auto-detects the MTU based on the\nMTU of the host's interfaces. [Default: 0 (auto-detect)]",
        "type": "integer"
      },
      "vxlanPort": {
        "description": "VXLANPort is the UDP port number to use for VXLAN traffic. [Default: 4789]",
        "type": "integer"
      },
      "vxlanVNI": {
        "description": "VXLANVNI is the VXLAN VNI to use for VXLAN traffic.  You may need to change this if the default value is\nin use on your system. [Default: 4096]",
        "type": "integer"
      },
      "windowsManageFirewallRules": {
        "description": "WindowsManageFirewallRules configures whether or not Felix will program Windows Firewall rules (to allow inbound access to its own metrics ports). [Default: Disabled]",
        "enum": [
          "Enabled",
          "Disabled"
        ],
        "type": "string"
      },
      "wireguardEnabled": {
        "description": "WireguardEnabled controls whether Wireguard is enabled for IPv4 (encapsulating IPv4 traffic over an IPv4 underlay network). [Default: false]",
        "type": "boolean"
      },
      "wireguardEnabledV6": {
        "description": "WireguardEnabledV6 controls whether Wireguard is enabled for IPv6 (encapsulating IPv6 traffic over an IPv6 underlay network). [Default: false]",
        "type": "boolean"
      },
      "wireguardHostEncryptionEnabled": {
        "description": "WireguardHostEncryptionEnabled controls whether Wireguard host-to-host encryption is enabled. [Default: false]",
        "type": "boolean"
      },
      "wireguardInterfaceName": {
        "description": "WireguardInterfaceName specifies the name to use for the IPv4 Wireguard interface. [Default: wireguard.cali]",
        "type": "string"
      },
      "wireguardInterfaceNameV6": {
        "description": "WireguardInterfaceNameV6 specifies the name to use for the IPv6 Wireguard interface. [Default: wg-v6.cali]",
        "type": "string"
      },
      "wireguardKeepAlive": {
        "description": "WireguardPersistentKeepAlive controls Wireguard PersistentKeepalive option. Set 0 to disable. [Default: 0]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      },
      "wireguardListeningPort": {
        "description": "WireguardListeningPort controls the listening port used by IPv4 Wireguard. [Default: 51820]",
        "type": "integer"
      },
      "wireguardListeningPortV6": {
        "description": "WireguardListeningPortV6 controls the listening port used by IPv6 Wireguard. [Default: 51821]",
        "type": "integer"
      },
      "wireguardMTU": {
        "description": "WireguardMTU controls the MTU on the IPv4 Wireguard interface. See Configuring MTU [Default: 1440]",
        "type": "integer"
      },
      "wireguardMTUV6": {
        "description": "WireguardMTUV6 controls the MTU on the IPv6 Wireguard interface. See Configuring MTU [Default: 1420]",
        "type": "integer"
      },
      "wireguardRoutingRulePriority": {
        "description": "WireguardRoutingRulePriority controls the priority value to use for the Wireguard routing rule. [Default: 99]",
        "type": "integer"
      },
      "wireguardThreadingEnabled": {
        "description": "WireguardThreadingEnabled controls whether Wireguard has Threaded NAPI enabled. [Default: false]\nThis increases the maximum number of packets a Wireguard interface can process.\nConsider threaded NAPI only if you have high packets per second workloads that are causing dropping packets due to a saturated `softirq` CPU core.\nThere is a [known issue](https://lore.kernel.org/netdev/CALrw=nEoT2emQ0OAYCjM1d_6Xe_kNLSZ6dhjb5FxrLFYh4kozA@mail.gmail.com/T/) with this setting\nthat may cause NAPI to get stuck holding the global `rtnl_mutex` when a peer is removed.\nWorkaround: Make sure your Linux kernel [includes this patch](https://github.com/torvalds/linux/commit/56364c910691f6d10ba88c964c9041b9ab777bd6) to unwedge NAPI.",
        "type": "boolean"
      },
      "workloadSourceSpoofing": {
        "description": "WorkloadSourceSpoofing controls whether pods can use the allowedSourcePrefixes annotation to send traffic with a source IP\naddress that is not theirs. This is disabled by default. When set to \"Any\", pods can request any prefix.",
        "pattern": "^(?i)(Disabled|Any)?$",
        "type": "string"
      },
      "xdpEnabled": {
        "description": "XDPEnabled enables XDP acceleration for suitable untracked incoming deny rules. [Default: true]",
        "type": "boolean"
      },
      "xdpRefreshInterval": {
        "description": "XDPRefreshInterval is the period at which Felix re-checks all XDP state to ensure that no\nother process has accidentally broken Calico's BPF maps or attached programs. Set to 0 to\ndisable XDP refresh. [Default: 90s]",
        "pattern": "^([0-9]+(\\\\.[0-9]+)?(ms|s|m|h))*$",
        "type": "string"
      }
    }
  },
  {
    "kind": "GlobalNetworkPolicy",
    "resource": "globalnetworkpolicies",
    "scope": "Cluster",
    "publicKind": "GlobalNetworkPolicy",
    "primary": [
      "tier",
      "order",
      "selector",
      "ingress",
      "egress"
    ],
    "fields": {
      "applyOnForward": {
        "description": "ApplyOnForward indicates to apply the rules in this policy on forward traffic.",
        "type": "boolean"
      },
      "doNotTrack": {
        "description": "DoNotTrack indicates whether packets matched by the rules in this policy should go through\nthe data plane's connection tracking, such as Linux conntrack.  If True, the rules in\nthis policy are applied before any data plane connection tracking, and packets allowed by\nthis policy are marked as not to be tracked.",
        "type": "boolean"
      },
      "egress": {
        "description": "The ordered set of egress rules.  Each rule contains a set of packet match criteria and\na corresponding action to apply.",
        "items": {
          "description": "A Rule encapsulates a set of match criteria and an action.  Both selector-based security Policy\nand security Profiles reference rules - separated out as a list of rules for both\ningress and egress packet matching.\n\nEach positive match criteria has a negated version, prefixed with \"Not\". All the match\ncriteria within a rule must be satisfied for a packet to match. A single rule can contain\nthe positive and negative version of a match and both must be satisfied for the rule to match.",
          "properties": {
            "action": {
              "type": "string"
            },
            "destination": {
              "description": "Destination contains the match criteria that apply to destination entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            },
            "http": {
              "description": "HTTP contains match criteria that apply to HTTP requests.",
              "properties": {
                "methods": {
                  "description": "Methods is an optional field that restricts the rule to apply only to HTTP requests that use one of the listed\nHTTP Methods (e.g. GET, PUT, etc.)\nMultiple methods are OR'd together.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "paths": {
                  "description": "Paths is an optional field that restricts the rule to apply to HTTP requests that use one of the listed\nHTTP Paths.\nMultiple paths are OR'd together.\ne.g:\n- exact: /foo\n- prefix: /bar\nNOTE: Each entry may ONLY specify either a `exact` or a `prefix` match. The validator will check for it.",
                  "items": {
                    "description": "HTTPPath specifies an HTTP path to match. It may be either of the form:\nexact: <path>: which matches the path exactly or\nprefix: <path-prefix>: which matches the path prefix",
                    "properties": {
                      "exact": {
                        "type": "string"
                      },
                      "prefix": {
                        "type": "string"
                      }
                    },
                    "type": "object"
                  },
                  "type": "array"
                }
              },
              "type": "object"
            },
            "icmp": {
              "description": "ICMP is an optional field that restricts the rule to apply to a specific type and\ncode of ICMP traffic.  This should only be specified if the Protocol field is set to\n\"ICMP\" or \"ICMPv6\".",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "ipVersion": {
              "description": "IPVersion is an optional field that restricts the rule to only match a specific IP\nversion.",
              "type": "integer"
            },
            "metadata": {
              "description": "Metadata contains additional information for this rule",
              "properties": {
                "annotations": {
                  "additionalProperties": {
                    "type": "string"
                  },
                  "description": "Annotations is a set of key value pairs that give extra information about the rule",
                  "type": "object"
                }
              },
              "type": "object"
            },
            "notICMP": {
              "description": "NotICMP is the negated version of the ICMP field.",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "notProtocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "NotProtocol is the negated version of the Protocol field.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "protocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "Protocol is an optional field that restricts the rule to only apply to traffic of\na specific IP protocol. Required if any of the EntityRules contain Ports\n(because ports only apply to certain protocols).\n\nMust be one of these string values: \"TCP\", \"UDP\", \"ICMP\", \"ICMPv6\", \"SCTP\", \"UDPLite\"\nor an integer in the range 1-255.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "source": {
              "description": "Source contains the match criteria that apply to source entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "ingress": {
        "description": "The ordered set of ingress rules.  Each rule contains a set of packet match criteria and\na corresponding action to apply.",
        "items": {
          "description": "A Rule encapsulates a set of match criteria and an action.  Both selector-based security Policy\nand security Profiles reference rules - separated out as a list of rules for both\ningress and egress packet matching.\n\nEach positive match criteria has a negated version, prefixed with \"Not\". All the match\ncriteria within a rule must be satisfied for a packet to match. A single rule can contain\nthe positive and negative version of a match and both must be satisfied for the rule to match.",
          "properties": {
            "action": {
              "type": "string"
            },
            "destination": {
              "description": "Destination contains the match criteria that apply to destination entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            },
            "http": {
              "description": "HTTP contains match criteria that apply to HTTP requests.",
              "properties": {
                "methods": {
                  "description": "Methods is an optional field that restricts the rule to apply only to HTTP requests that use one of the listed\nHTTP Methods (e.g. GET, PUT, etc.)\nMultiple methods are OR'd together.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "paths": {
                  "description": "Paths is an optional field that restricts the rule to apply to HTTP requests that use one of the listed\nHTTP Paths.\nMultiple paths are OR'd together.\ne.g:\n- exact: /foo\n- prefix: /bar\nNOTE: Each entry may ONLY specify either a `exact` or a `prefix` match. The validator will check for it.",
                  "items": {
                    "description": "HTTPPath specifies an HTTP path to match. It may be either of the form:\nexact: <path>: which matches the path exactly or\nprefix: <path-prefix>: which matches the path prefix",
                    "properties": {
                      "exact": {
                        "type": "string"
                      },
                      "prefix": {
                        "type": "string"
                      }
                    },
                    "type": "object"
                  },
                  "type": "array"
                }
              },
              "type": "object"
            },
            "icmp": {
              "description": "ICMP is an optional field that restricts the rule to apply to a specific type and\ncode of ICMP traffic.  This should only be specified if the Protocol field is set to\n\"ICMP\" or \"ICMPv6\".",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "ipVersion": {
              "description": "IPVersion is an optional field that restricts the rule to only match a specific IP\nversion.",
              "type": "integer"
            },
            "metadata": {
              "description": "Metadata contains additional information for this rule",
              "properties": {
                "annotations": {
                  "additionalProperties": {
                    "type": "string"
                  },
                  "description": "Annotations is a set of key value pairs that give extra information about the rule",
                  "type": "object"
                }
              },
              "type": "object"
            },
            "notICMP": {
              "description": "NotICMP is the negated version of the ICMP field.",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "notProtocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "NotProtocol is the negated version of the Protocol field.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "protocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "Protocol is an optional field that restricts the rule to only apply to traffic of\na specific IP protocol. Required if any of the EntityRules contain Ports\n(because ports only apply to certain protocols).\n\nMust be one of these string values: \"TCP\", \"UDP\", \"ICMP\", \"ICMPv6\", \"SCTP\", \"UDPLite\"\nor an integer in the range 1-255.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "source": {
              "description": "Source contains the match criteria that apply to source entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "namespaceSelector": {
        "description": "NamespaceSelector is an optional field for an expression used to select a pod based on namespaces.",
        "type": "string"
      },
      "order": {
        "description": "Order is an optional field that specifies the order in which the policy is applied.\nPolicies with higher \"order\" are applied after those with lower\norder within the same tier.  If the order is omitted, it may be considered to be \"infinite\" - i.e. the\npolicy will be applied last.  Policies with identical order will be applied in\nalphanumerical order based on the Policy \"Name\" within the tier.",
        "type": "number"
      },
      "performanceHints": {
        "description": "PerformanceHints contains a list of hints to Calico's policy engine to\nhelp process the policy more efficiently.  Hints never change the\nenforcement behaviour of the policy.\n\nCurrently, the only available hint is \"AssumeNeededOnEveryNode\".  When\nthat hint is set on a policy, Felix will act as if the policy matches\na local endpoint even if it does not. This is useful for \"preloading\"\nany large static policies that are known to be used on every node.\nIf the policy is _not_ used on a particular node then the work\ndone to preload the policy (and to maintain it) is wasted.",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "preDNAT": {
        "description": "PreDNAT indicates to apply the rules in this policy before any DNAT.",
        "type": "boolean"
      },
      "selector": {
        "description": "The selector is an expression used to pick out the endpoints that the policy should\nbe applied to.\n\nSelector expressions follow this syntax:\n\n\tlabel == \"string_literal\"  ->  comparison, e.g. my_label == \"foo bar\"\n\tlabel != \"string_literal\"   ->  not equal; also matches if label is not present\n\tlabel in { \"a\", \"b\", \"c\", ... }  ->  true if the value of label X is one of \"a\", \"b\", \"c\"\n\tlabel not in { \"a\", \"b\", \"c\", ... }  ->  true if the value of label X is not one of \"a\", \"b\", \"c\"\n\thas(label_name)  -> True if that label is present\n\t! expr -> negation of expr\n\texpr && expr  -> Short-circuit and\n\texpr || expr  -> Short-circuit or\n\t( expr ) -> parens for grouping\n\tall() or the empty selector -> matches all endpoints.\n\nLabel names are allowed to contain alphanumerics, -, _ and /. String literals are more permissive\nbut they do not support escape characters.\n\nExamples (with made-up labels):\n\n\ttype == \"webserver\" && deployment == \"prod\"\n\ttype in {\"frontend\", \"backend\"}\n\tdeployment != \"dev\"\n\t! has(label_name)",
        "type": "string"
      },
      "serviceAccountSelector": {
        "description": "ServiceAccountSelector is an optional field for an expression used to select a pod based on service accounts.",
        "type": "string"
      },
      "tier": {
        "description": "The name of the tier that this policy belongs to.  If this is omitted, the default\ntier (name is \"default\") is assumed.  The specified tier must exist in order to create\nsecurity policies within the tier, the \"default\" tier is created automatically if it\ndoes not exist, this means for deployments requiring only a single Tier, the tier name\nmay be omitted on all policy management requests.",
        "type": "string"
      },
      "types": {
        "description": "Types indicates whether this policy applies to ingress, or to egress, or to both.  When\nnot explicitly specified (and so the value on creation is empty or nil), Calico defaults\nTypes according to what Ingress and Egress rules are present in the policy.  The\ndefault is:\n\n- [ PolicyTypeIngress ], if there are no Egress rules (including the case where there are\n  also no Ingress rules)\n\n- [ PolicyTypeEgress ], if there are Egress rules but no Ingress rules\n\n- [ PolicyTypeIngress, PolicyTypeEgress ], if there are both Ingress and Egress rules.\n\nWhen the policy is read back again, Types will always be one of these values, never empty\nor nil.",
        "items": {
          "description": "PolicyType enumerates the possible values of the PolicySpec Types field.",
          "type": "string"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "GlobalNetworkSet",
    "resource": "globalnetworksets",
    "scope": "Cluster",
    "publicKind": "GlobalNetworkSet",
    "primary": [
      "nets"
    ],
    "fields": {
      "nets": {
        "description": "The list of IP networks that belong to this set.",
        "items": {
          "type": "string"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "HostEndpoint",
    "resource": "hostendpoints",
    "scope": "Cluster",
    "publicKind": "HostEndpoint",
    "primary": [
      "node",
      "interfaceName",
      "expectedIPs",
      "ports",
      "profiles"
    ],
    "fields": {
      "expectedIPs": {
        "description": "The expected IP addresses (IPv4 and IPv6) of the endpoint.\nIf \"InterfaceName\" is not present, Calico will look for an interface matching any\nof the IPs in the list and apply policy to that.\nNote:\n\tWhen using the selector match criteria in an ingress or egress security Policy\n\tor Profile, Calico converts the selector into a set of IP addresses. For host\n\tendpoints, the ExpectedIPs field is used for that purpose. (If only the interface\n\tname is specified, Calico does not learn the IPs of the interface for use in match\n\tcriteria.)",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "interfaceName": {
        "description": "Either \"*\", or the name of a specific Linux interface to apply policy to; or empty.  \"*\"\nindicates that this HostEndpoint governs all traffic to, from or through the default\nnetwork namespace of the host named by the \"Node\" field; entering and leaving that\nnamespace via any interface, including those from/to non-host-networked local workloads.\n\nIf InterfaceName is not \"*\", this HostEndpoint only governs traffic that enters or leaves\nthe host through the specific interface named by InterfaceName, or - when InterfaceName\nis empty - through the specific interface that has one of the IPs in ExpectedIPs.\nTherefore, when InterfaceName is empty, at least one expected IP must be specified.  Only\nexternal interfaces (such as \"eth0\") are supported here; it isn't possible for a\nHostEndpoint to protect traffic through a specific local workload interface.\n\nNote: Only some kinds of policy are implemented for \"*\" HostEndpoints; initially just\npre-DNAT policy.  Please check Calico documentation for the latest position.",
        "type": "string"
      },
      "node": {
        "description": "The node name identifying the Calico node instance.",
        "type": "string"
      },
      "ports": {
        "description": "Ports contains the endpoint's named ports, which may be referenced in security policy rules.",
        "items": {
          "properties": {
            "name": {
              "type": "string"
            },
            "port": {
              "type": "integer"
            },
            "protocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            }
          },
          "required": [
            "name",
            "port",
            "protocol"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "profiles": {
        "description": "A list of identifiers of security Profile objects that apply to this endpoint. Each\nprofile is applied in the order that they appear in this list.  Profile rules are applied\nafter the selector-based security policy.",
        "items": {
          "type": "string"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "IPAMBlock",
    "resource": "ipamblocks",
    "scope": "Cluster",
    "publicKind": null,
    "primary": [
      "cidr",
      "affinity",
      "allocations",
      "unallocated",
      "sequenceNumber"
    ],
    "fields": {
      "affinity": {
        "description": "Affinity of the block, if this block has one. If set, it will be of the form\n\"host:<hostname>\". If not set, this block is not affine to a host.",
        "type": "string"
      },
      "allocations": {
        "description": "Array of allocations in-use within this block. nil entries mean the allocation is free.\nFor non-nil entries at index i, the index is the ordinal of the allocation within this block\nand the value is the index of the associated attributes in the Attributes array.",
        "items": {
          "type": "integer",
          "nullable": true
        },
        "type": "array"
      },
      "attributes": {
        "description": "Attributes is an array of arbitrary metadata associated with allocations in the block. To find\nattributes for a given allocation, use the value of the allocation's entry in the Allocations array\nas the index of the element in this array.",
        "items": {
          "properties": {
            "handle_id": {
              "type": "string"
            },
            "secondary": {
              "additionalProperties": {
                "type": "string"
              },
              "type": "object"
            }
          },
          "type": "object"
        },
        "type": "array"
      },
      "cidr": {
        "description": "The block's CIDR.",
        "type": "string"
      },
      "deleted": {
        "description": "Deleted is an internal boolean used to workaround a limitation in the Kubernetes API whereby\ndeletion will not return a conflict error if the block has been updated. It should not be set manually.",
        "type": "boolean"
      },
      "sequenceNumber": {
        "default": 0,
        "description": "We store a sequence number that is updated each time the block is written.\nEach allocation will also store the sequence number of the block at the time of its creation.\nWhen releasing an IP, passing the sequence number associated with the allocation allows us\nto protect against a race condition and ensure the IP hasn't been released and re-allocated\nsince the release request.",
        "format": "int64",
        "type": "integer"
      },
      "sequenceNumberForAllocation": {
        "additionalProperties": {
          "format": "int64",
          "type": "integer"
        },
        "description": "Map of allocated ordinal within the block to sequence number of the block at\nthe time of allocation. Kubernetes does not allow numerical keys for maps, so\nthe key is cast to a string.",
        "type": "object"
      },
      "strictAffinity": {
        "description": "StrictAffinity on the IPAMBlock is deprecated and no longer used by the code. Use IPAMConfig StrictAffinity instead.",
        "type": "boolean"
      },
      "unallocated": {
        "description": "Unallocated is an ordered list of allocations which are free in the block.",
        "items": {
          "type": "integer"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "IPAMConfig",
    "resource": "ipamconfigs",
    "scope": "Cluster",
    "publicKind": "IPAMConfiguration",
    "primary": [
      "autoAllocateBlocks",
      "strictAffinity",
      "maxBlocksPerHost"
    ],
    "fields": {
      "autoAllocateBlocks": {
        "type": "boolean"
      },
      "maxBlocksPerHost": {
        "description": "MaxBlocksPerHost, if non-zero, is the max number of blocks that can be\naffine to each host.",
        "maximum": 2147483647,
        "minimum": 0,
        "type": "integer"
      },
      "strictAffinity": {
        "type": "boolean"
      }
    }
  },
  {
    "kind": "IPAMHandle",
    "resource": "ipamhandles",
    "scope": "Cluster",
    "publicKind": null,
    "primary": [
      "handleID",
      "block",
      "deleted"
    ],
    "fields": {
      "block": {
        "additionalProperties": {
          "type": "integer"
        },
        "type": "object"
      },
      "deleted": {
        "type": "boolean"
      },
      "handleID": {
        "type": "string"
      }
    }
  },
  {
    "kind": "IPPool",
    "resource": "ippools",
    "scope": "Cluster",
    "publicKind": "IPPool",
    "primary": [
      "cidr",
      "blockSize",
      "natOutgoing",
      "ipipMode",
      "vxlanMode",
      "disabled"
    ],
    "fields": {
      "allowedUses": {
        "description": "AllowedUse controls what the IP pool will be used for.  If not specified or empty, defaults to\n[\"Tunnel\", \"Workload\"] for back-compatibility",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "assignmentMode": {
        "description": "Determines the mode how IP addresses should be assigned from this pool",
        "enum": [
          "Automatic",
          "Manual"
        ],
        "type": "string"
      },
      "blockSize": {
        "description": "The block size to use for IP address assignments from this pool. Defaults to 26 for IPv4 and 122 for IPv6.",
        "type": "integer"
      },
      "cidr": {
        "description": "The pool CIDR.",
        "type": "string"
      },
      "disableBGPExport": {
        "description": "Disable exporting routes from this IP Pool's CIDR over BGP. [Default: false]",
        "type": "boolean"
      },
      "disabled": {
        "description": "When disabled is true, Calico IPAM will not assign addresses from this pool.",
        "type": "boolean"
      },
      "ipip": {
        "description": "Deprecated: this field is only used for APIv1 backwards compatibility.\nSetting this field is not allowed, this field is for internal use only.",
        "properties": {
          "enabled": {
            "description": "When enabled is true, ipip tunneling will be used to deliver packets to\ndestinations within this pool.",
            "type": "boolean"
          },
          "mode": {
            "description": "The IPIP mode.  This can be one of \"always\" or \"cross-subnet\".  A mode\nof \"always\" will also use IPIP tunneling for routing to destination IP\naddresses within this pool.  A mode of \"cross-subnet\" will only use IPIP\ntunneling when the destination node is on a different subnet to the\noriginating node.  The default value (if not specified) is \"always\".",
            "type": "string"
          }
        },
        "type": "object"
      },
      "ipipMode": {
        "description": "Contains configuration for IPIP tunneling for this pool. If not specified,\nthen this is defaulted to \"Never\" (i.e. IPIP tunneling is disabled).",
        "type": "string"
      },
      "nat-outgoing": {
        "description": "Deprecated: this field is only used for APIv1 backwards compatibility.\nSetting this field is not allowed, this field is for internal use only.",
        "type": "boolean"
      },
      "natOutgoing": {
        "description": "When natOutgoing is true, packets sent from Calico networked containers in\nthis pool to destinations outside of this pool will be masqueraded.",
        "type": "boolean"
      },
      "nodeSelector": {
        "description": "Allows IPPool to allocate for a specific node by label selector.",
        "type": "string"
      },
      "vxlanMode": {
        "description": "Contains configuration for VXLAN tunneling for this pool. If not specified,\nthen this is defaulted to \"Never\" (i.e. VXLAN tunneling is disabled).",
        "type": "string"
      }
    }
  },
  {
    "kind": "IPReservation",
    "resource": "ipreservations",
    "scope": "Cluster",
    "publicKind": "IPReservation",
    "primary": [
      "reservedCIDRs"
    ],
    "fields": {
      "reservedCIDRs": {
        "description": "ReservedCIDRs is a list of CIDRs and/or IP addresses that Calico IPAM will exclude from new allocations.",
        "items": {
          "type": "string"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "KubeControllersConfiguration",
    "resource": "kubecontrollersconfigurations",
    "scope": "Cluster",
    "publicKind": "KubeControllersConfiguration",
    "primary": [
      "controllers",
      "healthChecks",
      "logSeverityScreen"
    ],
    "fields": {
      "controllers": {
        "description": "Controllers enables and configures individual Kubernetes controllers",
        "properties": {
          "loadBalancer": {
            "description": "LoadBalancer enables and configures the LoadBalancer controller. Enabled by default, set to nil to disable.",
            "properties": {
              "assignIPs": {
                "type": "string"
              }
            },
            "type": "object"
          },
          "namespace": {
            "description": "Namespace enables and configures the namespace controller. Enabled by default, set to nil to disable.",
            "properties": {
              "reconcilerPeriod": {
                "description": "ReconcilerPeriod is the period to perform reconciliation with the Calico datastore. [Default: 5m]",
                "type": "string"
              }
            },
            "type": "object"
          },
          "node": {
            "description": "Node enables and configures the node controller. Enabled by default, set to nil to disable.",
            "properties": {
              "hostEndpoint": {
                "description": "HostEndpoint controls syncing nodes to host endpoints. Disabled by default, set to nil to disable.",
                "properties": {
                  "autoCreate": {
                    "description": "AutoCreate enables automatic creation of host endpoints for every node. [Default: Disabled]",
                    "type": "string"
                  },
                  "createDefaultHostEndpoint": {
                    "type": "string"
                  },
                  "templates": {
                    "description": "Templates contains definition for creating AutoHostEndpoints",
                    "items": {
                      "properties": {
                        "generateName": {
                          "description": "GenerateName is appended to the end of the generated AutoHostEndpoint name",
                          "type": "string"
                        },
                        "interfaceCIDRs": {
                          "description": "InterfaceCIDRs contains a list of CIRDs used for matching nodeIPs to the AutoHostEndpoint",
                          "items": {
                            "type": "string"
                          },
                          "type": "array"
                        },
                        "labels": {
                          "additionalProperties": {
                            "type": "string"
                          },
                          "description": "Labels adds the specified labels to the generated AutoHostEndpoint, labels from node with the same name will be overwritten by values from the template label",
                          "type": "object"
                        },
                        "nodeSelector": {
                          "description": "NodeSelector allows the AutoHostEndpoint to be created only for specific nodes",
                          "type": "string"
                        }
                      },
                      "type": "object"
                    },
                    "type": "array"
                  }
                },
                "type": "object"
              },
              "leakGracePeriod": {
                "description": "LeakGracePeriod is the period used by the controller to determine if an IP address has been leaked.\nSet to 0 to disable IP garbage collection. [Default: 15m]",
                "type": "string"
              },
              "reconcilerPeriod": {
                "description": "ReconcilerPeriod is the period to perform reconciliation with the Calico datastore. [Default: 5m]",
                "type": "string"
              },
              "syncLabels": {
                "description": "SyncLabels controls whether to copy Kubernetes node labels to Calico nodes. [Default: Enabled]",
                "type": "string"
              }
            },
            "type": "object"
          },
          "policy": {
            "description": "Policy enables and configures the policy controller. Enabled by default, set to nil to disable.",
            "properties": {
              "reconcilerPeriod": {
                "description": "ReconcilerPeriod is the period to perform reconciliation with the Calico datastore. [Default: 5m]",
                "type": "string"
              }
            },
            "type": "object"
          },
          "serviceAccount": {
            "description": "ServiceAccount enables and configures the service account controller. Enabled by default, set to nil to disable.",
            "properties": {
              "reconcilerPeriod": {
                "description": "ReconcilerPeriod is the period to perform reconciliation with the Calico datastore. [Default: 5m]",
                "type": "string"
              }
            },
            "type": "object"
          },
          "workloadEndpoint": {
            "description": "WorkloadEndpoint enables and configures the workload endpoint controller. Enabled by default, set to nil to disable.",
            "properties": {
              "reconcilerPeriod": {
                "description": "ReconcilerPeriod is the period to perform reconciliation with the Calico datastore. [Default: 5m]",
                "type": "string"
              }
            },
            "type": "object"
          }
        },
        "type": "object"
      },
      "debugProfilePort": {
        "description": "DebugProfilePort configures the port to serve memory and cpu profiles on. If not specified, profiling\nis disabled.",
        "format": "int32",
        "type": "integer"
      },
      "etcdV3CompactionPeriod": {
        "description": "EtcdV3CompactionPeriod is the period between etcdv3 compaction requests. Set to 0 to disable. [Default: 10m]",
        "type": "string"
      },
      "healthChecks": {
        "description": "HealthChecks enables or disables support for health checks [Default: Enabled]",
        "type": "string"
      },
      "logSeverityScreen": {
        "description": "LogSeverityScreen is the log severity above which logs are sent to the stdout. [Default: Info]",
        "type": "string"
      },
      "prometheusMetricsPort": {
        "description": "PrometheusMetricsPort is the TCP port that the Prometheus metrics server should bind to. Set to 0 to disable. [Default: 9094]",
        "type": "integer"
      }
    }
  },
  {
    "kind": "NetworkPolicy",
    "resource": "networkpolicies",
    "scope": "Namespaced",
    "publicKind": "NetworkPolicy",
    "primary": [
      "tier",
      "order",
      "selector",
      "ingress",
      "egress"
    ],
    "fields": {
      "egress": {
        "description": "The ordered set of egress rules.  Each rule contains a set of packet match criteria and\na corresponding action to apply.",
        "items": {
          "description": "A Rule encapsulates a set of match criteria and an action.  Both selector-based security Policy\nand security Profiles reference rules - separated out as a list of rules for both\ningress and egress packet matching.\n\nEach positive match criteria has a negated version, prefixed with \"Not\". All the match\ncriteria within a rule must be satisfied for a packet to match. A single rule can contain\nthe positive and negative version of a match and both must be satisfied for the rule to match.",
          "properties": {
            "action": {
              "type": "string"
            },
            "destination": {
              "description": "Destination contains the match criteria that apply to destination entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            },
            "http": {
              "description": "HTTP contains match criteria that apply to HTTP requests.",
              "properties": {
                "methods": {
                  "description": "Methods is an optional field that restricts the rule to apply only to HTTP requests that use one of the listed\nHTTP Methods (e.g. GET, PUT, etc.)\nMultiple methods are OR'd together.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "paths": {
                  "description": "Paths is an optional field that restricts the rule to apply to HTTP requests that use one of the listed\nHTTP Paths.\nMultiple paths are OR'd together.\ne.g:\n- exact: /foo\n- prefix: /bar\nNOTE: Each entry may ONLY specify either a `exact` or a `prefix` match. The validator will check for it.",
                  "items": {
                    "description": "HTTPPath specifies an HTTP path to match. It may be either of the form:\nexact: <path>: which matches the path exactly or\nprefix: <path-prefix>: which matches the path prefix",
                    "properties": {
                      "exact": {
                        "type": "string"
                      },
                      "prefix": {
                        "type": "string"
                      }
                    },
                    "type": "object"
                  },
                  "type": "array"
                }
              },
              "type": "object"
            },
            "icmp": {
              "description": "ICMP is an optional field that restricts the rule to apply to a specific type and\ncode of ICMP traffic.  This should only be specified if the Protocol field is set to\n\"ICMP\" or \"ICMPv6\".",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "ipVersion": {
              "description": "IPVersion is an optional field that restricts the rule to only match a specific IP\nversion.",
              "type": "integer"
            },
            "metadata": {
              "description": "Metadata contains additional information for this rule",
              "properties": {
                "annotations": {
                  "additionalProperties": {
                    "type": "string"
                  },
                  "description": "Annotations is a set of key value pairs that give extra information about the rule",
                  "type": "object"
                }
              },
              "type": "object"
            },
            "notICMP": {
              "description": "NotICMP is the negated version of the ICMP field.",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "notProtocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "NotProtocol is the negated version of the Protocol field.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "protocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "Protocol is an optional field that restricts the rule to only apply to traffic of\na specific IP protocol. Required if any of the EntityRules contain Ports\n(because ports only apply to certain protocols).\n\nMust be one of these string values: \"TCP\", \"UDP\", \"ICMP\", \"ICMPv6\", \"SCTP\", \"UDPLite\"\nor an integer in the range 1-255.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "source": {
              "description": "Source contains the match criteria that apply to source entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "ingress": {
        "description": "The ordered set of ingress rules.  Each rule contains a set of packet match criteria and\na corresponding action to apply.",
        "items": {
          "description": "A Rule encapsulates a set of match criteria and an action.  Both selector-based security Policy\nand security Profiles reference rules - separated out as a list of rules for both\ningress and egress packet matching.\n\nEach positive match criteria has a negated version, prefixed with \"Not\". All the match\ncriteria within a rule must be satisfied for a packet to match. A single rule can contain\nthe positive and negative version of a match and both must be satisfied for the rule to match.",
          "properties": {
            "action": {
              "type": "string"
            },
            "destination": {
              "description": "Destination contains the match criteria that apply to destination entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            },
            "http": {
              "description": "HTTP contains match criteria that apply to HTTP requests.",
              "properties": {
                "methods": {
                  "description": "Methods is an optional field that restricts the rule to apply only to HTTP requests that use one of the listed\nHTTP Methods (e.g. GET, PUT, etc.)\nMultiple methods are OR'd together.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "paths": {
                  "description": "Paths is an optional field that restricts the rule to apply to HTTP requests that use one of the listed\nHTTP Paths.\nMultiple paths are OR'd together.\ne.g:\n- exact: /foo\n- prefix: /bar\nNOTE: Each entry may ONLY specify either a `exact` or a `prefix` match. The validator will check for it.",
                  "items": {
                    "description": "HTTPPath specifies an HTTP path to match. It may be either of the form:\nexact: <path>: which matches the path exactly or\nprefix: <path-prefix>: which matches the path prefix",
                    "properties": {
                      "exact": {
                        "type": "string"
                      },
                      "prefix": {
                        "type": "string"
                      }
                    },
                    "type": "object"
                  },
                  "type": "array"
                }
              },
              "type": "object"
            },
            "icmp": {
              "description": "ICMP is an optional field that restricts the rule to apply to a specific type and\ncode of ICMP traffic.  This should only be specified if the Protocol field is set to\n\"ICMP\" or \"ICMPv6\".",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "ipVersion": {
              "description": "IPVersion is an optional field that restricts the rule to only match a specific IP\nversion.",
              "type": "integer"
            },
            "metadata": {
              "description": "Metadata contains additional information for this rule",
              "properties": {
                "annotations": {
                  "additionalProperties": {
                    "type": "string"
                  },
                  "description": "Annotations is a set of key value pairs that give extra information about the rule",
                  "type": "object"
                }
              },
              "type": "object"
            },
            "notICMP": {
              "description": "NotICMP is the negated version of the ICMP field.",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "notProtocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "NotProtocol is the negated version of the Protocol field.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "protocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "Protocol is an optional field that restricts the rule to only apply to traffic of\na specific IP protocol. Required if any of the EntityRules contain Ports\n(because ports only apply to certain protocols).\n\nMust be one of these string values: \"TCP\", \"UDP\", \"ICMP\", \"ICMPv6\", \"SCTP\", \"UDPLite\"\nor an integer in the range 1-255.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "source": {
              "description": "Source contains the match criteria that apply to source entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "order": {
        "description": "Order is an optional field that specifies the order in which the policy is applied.\nPolicies with higher \"order\" are applied after those with lower\norder within the same tier.  If the order is omitted, it may be considered to be \"infinite\" - i.e. the\npolicy will be applied last.  Policies with identical order will be applied in\nalphanumerical order based on the Policy \"Name\" within the tier.",
        "type": "number"
      },
      "performanceHints": {
        "description": "PerformanceHints contains a list of hints to Calico's policy engine to\nhelp process the policy more efficiently.  Hints never change the\nenforcement behaviour of the policy.\n\nCurrently, the only available hint is \"AssumeNeededOnEveryNode\".  When\nthat hint is set on a policy, Felix will act as if the policy matches\na local endpoint even if it does not. This is useful for \"preloading\"\nany large static policies that are known to be used on every node.\nIf the policy is _not_ used on a particular node then the work\ndone to preload the policy (and to maintain it) is wasted.",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "selector": {
        "description": "The selector is an expression used to pick out the endpoints that the policy should\nbe applied to.\n\nSelector expressions follow this syntax:\n\n\tlabel == \"string_literal\"  ->  comparison, e.g. my_label == \"foo bar\"\n\tlabel != \"string_literal\"   ->  not equal; also matches if label is not present\n\tlabel in { \"a\", \"b\", \"c\", ... }  ->  true if the value of label X is one of \"a\", \"b\", \"c\"\n\tlabel not in { \"a\", \"b\", \"c\", ... }  ->  true if the value of label X is not one of \"a\", \"b\", \"c\"\n\thas(label_name)  -> True if that label is present\n\t! expr -> negation of expr\n\texpr && expr  -> Short-circuit and\n\texpr || expr  -> Short-circuit or\n\t( expr ) -> parens for grouping\n\tall() or the empty selector -> matches all endpoints.\n\nLabel names are allowed to contain alphanumerics, -, _ and /. String literals are more permissive\nbut they do not support escape characters.\n\nExamples (with made-up labels):\n\n\ttype == \"webserver\" && deployment == \"prod\"\n\ttype in {\"frontend\", \"backend\"}\n\tdeployment != \"dev\"\n\t! has(label_name)",
        "type": "string"
      },
      "serviceAccountSelector": {
        "description": "ServiceAccountSelector is an optional field for an expression used to select a pod based on service accounts.",
        "type": "string"
      },
      "tier": {
        "description": "The name of the tier that this policy belongs to.  If this is omitted, the default\ntier (name is \"default\") is assumed.  The specified tier must exist in order to create\nsecurity policies within the tier, the \"default\" tier is created automatically if it\ndoes not exist, this means for deployments requiring only a single Tier, the tier name\nmay be omitted on all policy management requests.",
        "type": "string"
      },
      "types": {
        "description": "Types indicates whether this policy applies to ingress, or to egress, or to both.  When\nnot explicitly specified (and so the value on creation is empty or nil), Calico defaults\nTypes according to what Ingress and Egress are present in the policy.  The\ndefault is:\n\n- [ PolicyTypeIngress ], if there are no Egress rules (including the case where there are\n  also no Ingress rules)\n\n- [ PolicyTypeEgress ], if there are Egress rules but no Ingress rules\n\n- [ PolicyTypeIngress, PolicyTypeEgress ], if there are both Ingress and Egress rules.\n\nWhen the policy is read back again, Types will always be one of these values, never empty\nor nil.",
        "items": {
          "description": "PolicyType enumerates the possible values of the PolicySpec Types field.",
          "type": "string"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "NetworkSet",
    "resource": "networksets",
    "scope": "Namespaced",
    "publicKind": "NetworkSet",
    "primary": [
      "nets"
    ],
    "fields": {
      "nets": {
        "description": "The list of IP networks that belong to this set.",
        "items": {
          "type": "string"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "StagedGlobalNetworkPolicy",
    "resource": "stagedglobalnetworkpolicies",
    "scope": "Cluster",
    "publicKind": "StagedGlobalNetworkPolicy",
    "primary": [
      "stagedAction",
      "tier",
      "selector",
      "ingress",
      "egress"
    ],
    "fields": {
      "applyOnForward": {
        "description": "ApplyOnForward indicates to apply the rules in this policy on forward traffic.",
        "type": "boolean"
      },
      "doNotTrack": {
        "description": "DoNotTrack indicates whether packets matched by the rules in this policy should go through\nthe data plane's connection tracking, such as Linux conntrack.  If True, the rules in\nthis policy are applied before any data plane connection tracking, and packets allowed by\nthis policy are marked as not to be tracked.",
        "type": "boolean"
      },
      "egress": {
        "description": "The ordered set of egress rules.  Each rule contains a set of packet match criteria and\na corresponding action to apply.",
        "items": {
          "description": "A Rule encapsulates a set of match criteria and an action.  Both selector-based security Policy\nand security Profiles reference rules - separated out as a list of rules for both\ningress and egress packet matching.\n\nEach positive match criteria has a negated version, prefixed with \"Not\". All the match\ncriteria within a rule must be satisfied for a packet to match. A single rule can contain\nthe positive and negative version of a match and both must be satisfied for the rule to match.",
          "properties": {
            "action": {
              "type": "string"
            },
            "destination": {
              "description": "Destination contains the match criteria that apply to destination entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            },
            "http": {
              "description": "HTTP contains match criteria that apply to HTTP requests.",
              "properties": {
                "methods": {
                  "description": "Methods is an optional field that restricts the rule to apply only to HTTP requests that use one of the listed\nHTTP Methods (e.g. GET, PUT, etc.)\nMultiple methods are OR'd together.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "paths": {
                  "description": "Paths is an optional field that restricts the rule to apply to HTTP requests that use one of the listed\nHTTP Paths.\nMultiple paths are OR'd together.\ne.g:\n- exact: /foo\n- prefix: /bar\nNOTE: Each entry may ONLY specify either a `exact` or a `prefix` match. The validator will check for it.",
                  "items": {
                    "description": "HTTPPath specifies an HTTP path to match. It may be either of the form:\nexact: <path>: which matches the path exactly or\nprefix: <path-prefix>: which matches the path prefix",
                    "properties": {
                      "exact": {
                        "type": "string"
                      },
                      "prefix": {
                        "type": "string"
                      }
                    },
                    "type": "object"
                  },
                  "type": "array"
                }
              },
              "type": "object"
            },
            "icmp": {
              "description": "ICMP is an optional field that restricts the rule to apply to a specific type and\ncode of ICMP traffic.  This should only be specified if the Protocol field is set to\n\"ICMP\" or \"ICMPv6\".",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "ipVersion": {
              "description": "IPVersion is an optional field that restricts the rule to only match a specific IP\nversion.",
              "type": "integer"
            },
            "metadata": {
              "description": "Metadata contains additional information for this rule",
              "properties": {
                "annotations": {
                  "additionalProperties": {
                    "type": "string"
                  },
                  "description": "Annotations is a set of key value pairs that give extra information about the rule",
                  "type": "object"
                }
              },
              "type": "object"
            },
            "notICMP": {
              "description": "NotICMP is the negated version of the ICMP field.",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "notProtocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "NotProtocol is the negated version of the Protocol field.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "protocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "Protocol is an optional field that restricts the rule to only apply to traffic of\na specific IP protocol. Required if any of the EntityRules contain Ports\n(because ports only apply to certain protocols).\n\nMust be one of these string values: \"TCP\", \"UDP\", \"ICMP\", \"ICMPv6\", \"SCTP\", \"UDPLite\"\nor an integer in the range 1-255.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "source": {
              "description": "Source contains the match criteria that apply to source entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "ingress": {
        "description": "The ordered set of ingress rules.  Each rule contains a set of packet match criteria and\na corresponding action to apply.",
        "items": {
          "description": "A Rule encapsulates a set of match criteria and an action.  Both selector-based security Policy\nand security Profiles reference rules - separated out as a list of rules for both\ningress and egress packet matching.\n\nEach positive match criteria has a negated version, prefixed with \"Not\". All the match\ncriteria within a rule must be satisfied for a packet to match. A single rule can contain\nthe positive and negative version of a match and both must be satisfied for the rule to match.",
          "properties": {
            "action": {
              "type": "string"
            },
            "destination": {
              "description": "Destination contains the match criteria that apply to destination entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            },
            "http": {
              "description": "HTTP contains match criteria that apply to HTTP requests.",
              "properties": {
                "methods": {
                  "description": "Methods is an optional field that restricts the rule to apply only to HTTP requests that use one of the listed\nHTTP Methods (e.g. GET, PUT, etc.)\nMultiple methods are OR'd together.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "paths": {
                  "description": "Paths is an optional field that restricts the rule to apply to HTTP requests that use one of the listed\nHTTP Paths.\nMultiple paths are OR'd together.\ne.g:\n- exact: /foo\n- prefix: /bar\nNOTE: Each entry may ONLY specify either a `exact` or a `prefix` match. The validator will check for it.",
                  "items": {
                    "description": "HTTPPath specifies an HTTP path to match. It may be either of the form:\nexact: <path>: which matches the path exactly or\nprefix: <path-prefix>: which matches the path prefix",
                    "properties": {
                      "exact": {
                        "type": "string"
                      },
                      "prefix": {
                        "type": "string"
                      }
                    },
                    "type": "object"
                  },
                  "type": "array"
                }
              },
              "type": "object"
            },
            "icmp": {
              "description": "ICMP is an optional field that restricts the rule to apply to a specific type and\ncode of ICMP traffic.  This should only be specified if the Protocol field is set to\n\"ICMP\" or \"ICMPv6\".",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "ipVersion": {
              "description": "IPVersion is an optional field that restricts the rule to only match a specific IP\nversion.",
              "type": "integer"
            },
            "metadata": {
              "description": "Metadata contains additional information for this rule",
              "properties": {
                "annotations": {
                  "additionalProperties": {
                    "type": "string"
                  },
                  "description": "Annotations is a set of key value pairs that give extra information about the rule",
                  "type": "object"
                }
              },
              "type": "object"
            },
            "notICMP": {
              "description": "NotICMP is the negated version of the ICMP field.",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "notProtocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "NotProtocol is the negated version of the Protocol field.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "protocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "Protocol is an optional field that restricts the rule to only apply to traffic of\na specific IP protocol. Required if any of the EntityRules contain Ports\n(because ports only apply to certain protocols).\n\nMust be one of these string values: \"TCP\", \"UDP\", \"ICMP\", \"ICMPv6\", \"SCTP\", \"UDPLite\"\nor an integer in the range 1-255.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "source": {
              "description": "Source contains the match criteria that apply to source entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "namespaceSelector": {
        "description": "NamespaceSelector is an optional field for an expression used to select a pod based on namespaces.",
        "type": "string"
      },
      "order": {
        "description": "Order is an optional field that specifies the order in which the policy is applied.\nPolicies with higher \"order\" are applied after those with lower\norder within the same tier.  If the order is omitted, it may be considered to be \"infinite\" - i.e. the\npolicy will be applied last.  Policies with identical order will be applied in\nalphanumerical order based on the Policy \"Name\" within the tier.",
        "type": "number"
      },
      "performanceHints": {
        "description": "PerformanceHints contains a list of hints to Calico's policy engine to\nhelp process the policy more efficiently.  Hints never change the\nenforcement behaviour of the policy.\n\nCurrently, the only available hint is \"AssumeNeededOnEveryNode\".  When\nthat hint is set on a policy, Felix will act as if the policy matches\na local endpoint even if it does not. This is useful for \"preloading\"\nany large static policies that are known to be used on every node.\nIf the policy is _not_ used on a particular node then the work\ndone to preload the policy (and to maintain it) is wasted.",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "preDNAT": {
        "description": "PreDNAT indicates to apply the rules in this policy before any DNAT.",
        "type": "boolean"
      },
      "selector": {
        "description": "The selector is an expression used to pick pick out the endpoints that the policy should\nbe applied to.\n\nSelector expressions follow this syntax:\n\n\tlabel == \"string_literal\"  ->  comparison, e.g. my_label == \"foo bar\"\n\tlabel != \"string_literal\"   ->  not equal; also matches if label is not present\n\tlabel in { \"a\", \"b\", \"c\", ... }  ->  true if the value of label X is one of \"a\", \"b\", \"c\"\n\tlabel not in { \"a\", \"b\", \"c\", ... }  ->  true if the value of label X is not one of \"a\", \"b\", \"c\"\n\thas(label_name)  -> True if that label is present\n\t! expr -> negation of expr\n\texpr && expr  -> Short-circuit and\n\texpr || expr  -> Short-circuit or\n\t( expr ) -> parens for grouping\n\tall() or the empty selector -> matches all endpoints.\n\nLabel names are allowed to contain alphanumerics, -, _ and /. String literals are more permissive\nbut they do not support escape characters.\n\nExamples (with made-up labels):\n\n\ttype == \"webserver\" && deployment == \"prod\"\n\ttype in {\"frontend\", \"backend\"}\n\tdeployment != \"dev\"\n\t! has(label_name)",
        "type": "string"
      },
      "serviceAccountSelector": {
        "description": "ServiceAccountSelector is an optional field for an expression used to select a pod based on service accounts.",
        "type": "string"
      },
      "stagedAction": {
        "description": "The staged action. If this is omitted, the default is Set.",
        "type": "string"
      },
      "tier": {
        "description": "The name of the tier that this policy belongs to.  If this is omitted, the default\ntier (name is \"default\") is assumed.  The specified tier must exist in order to create\nsecurity policies within the tier, the \"default\" tier is created automatically if it\ndoes not exist, this means for deployments requiring only a single Tier, the tier name\nmay be omitted on all policy management requests.",
        "type": "string"
      },
      "types": {
        "description": "Types indicates whether this policy applies to ingress, or to egress, or to both.  When\nnot explicitly specified (and so the value on creation is empty or nil), Calico defaults\nTypes according to what Ingress and Egress rules are present in the policy.  The\ndefault is:\n\n- [ PolicyTypeIngress ], if there are no Egress rules (including the case where there are\n  also no Ingress rules)\n\n- [ PolicyTypeEgress ], if there are Egress rules but no Ingress rules\n\n- [ PolicyTypeIngress, PolicyTypeEgress ], if there are both Ingress and Egress rules.\n\nWhen the policy is read back again, Types will always be one of these values, never empty\nor nil.",
        "items": {
          "description": "PolicyType enumerates the possible values of the PolicySpec Types field.",
          "type": "string"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "StagedKubernetesNetworkPolicy",
    "resource": "stagedkubernetesnetworkpolicies",
    "scope": "Namespaced",
    "publicKind": "StagedKubernetesNetworkPolicy",
    "primary": [
      "stagedAction",
      "podSelector",
      "policyTypes",
      "ingress",
      "egress"
    ],
    "fields": {
      "egress": {
        "description": "List of egress rules to be applied to the selected pods. Outgoing traffic is\nallowed if there are no NetworkPolicies selecting the pod (and cluster policy\notherwise allows the traffic), OR if the traffic matches at least one egress rule\nacross all of the NetworkPolicy objects whose podSelector matches the pod. If\nthis field is empty then this NetworkPolicy limits all outgoing traffic (and serves\nsolely to ensure that the pods it selects are isolated by default).\nThis field is beta-level in 1.8",
        "items": {
          "description": "NetworkPolicyEgressRule describes a particular set of traffic that is allowed out of pods\nmatched by a NetworkPolicySpec's podSelector. The traffic must match both ports and to.\nThis type is beta-level in 1.8",
          "properties": {
            "ports": {
              "description": "ports is a list of destination ports for outgoing traffic.\nEach item in this list is combined using a logical OR. If this field is\nempty or missing, this rule matches all ports (traffic not restricted by port).\nIf this field is present and contains at least one item, then this rule allows\ntraffic only if the traffic matches at least one port in the list.",
              "items": {
                "description": "NetworkPolicyPort describes a port to allow traffic on",
                "properties": {
                  "endPort": {
                    "description": "endPort indicates that the range of ports from port to endPort if set, inclusive,\nshould be allowed by the policy. This field cannot be defined if the port field\nis not defined or if the port field is defined as a named (string) port.\nThe endPort must be equal or greater than port.",
                    "format": "int32",
                    "type": "integer"
                  },
                  "port": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "description": "port represents the port on the given protocol. This can either be a numerical or named\nport on a pod. If this field is not provided, this matches all port names and\nnumbers.\nIf present, only traffic on the specified protocol AND port will be matched.",
                    "x-kubernetes-int-or-string": true
                  },
                  "protocol": {
                    "description": "protocol represents the protocol (TCP, UDP, or SCTP) which traffic must match.\nIf not specified, this field defaults to TCP.",
                    "type": "string"
                  }
                },
                "type": "object"
              },
              "type": "array",
              "x-kubernetes-list-type": "atomic"
            },
            "to": {
              "description": "to is a list of destinations for outgoing traffic of pods selected for this rule.\nItems in this list are combined using a logical OR operation. If this field is\nempty or missing, this rule matches all destinations (traffic not restricted by\ndestination). If this field is present and contains at least one item, this rule\nallows traffic only if the traffic matches at least one item in the to list.",
              "items": {
                "description": "NetworkPolicyPeer describes a peer to allow traffic to/from. Only certain combinations of\nfields are allowed",
                "properties": {
                  "ipBlock": {
                    "description": "ipBlock defines policy on a particular IPBlock. If this field is set then\nneither of the other fields can be.",
                    "properties": {
                      "cidr": {
                        "description": "cidr is a string representing the IPBlock\nValid examples are \"192.168.1.0/24\" or \"2001:db8::/64\"",
                        "type": "string"
                      },
                      "except": {
                        "description": "except is a slice of CIDRs that should not be included within an IPBlock\nValid examples are \"192.168.1.0/24\" or \"2001:db8::/64\"\nExcept values will be rejected if they are outside the cidr range",
                        "items": {
                          "type": "string"
                        },
                        "type": "array",
                        "x-kubernetes-list-type": "atomic"
                      }
                    },
                    "required": [
                      "cidr"
                    ],
                    "type": "object"
                  },
                  "namespaceSelector": {
                    "description": "namespaceSelector selects namespaces using cluster-scoped labels. This field follows\nstandard label selector semantics; if present but empty, it selects all namespaces.\n\nIf podSelector is also set, then the NetworkPolicyPeer as a whole selects\nthe pods matching podSelector in the namespaces selected by namespaceSelector.\nOtherwise it selects all pods in the namespaces selected by namespaceSelector.",
                    "properties": {
                      "matchExpressions": {
                        "description": "matchExpressions is a list of label selector requirements. The requirements are ANDed.",
                        "items": {
                          "description": "A label selector requirement is a selector that contains values, a key, and an operator that\nrelates the key and values.",
                          "properties": {
                            "key": {
                              "description": "key is the label key that the selector applies to.",
                              "type": "string"
                            },
                            "operator": {
                              "description": "operator represents a key's relationship to a set of values.\nValid operators are In, NotIn, Exists and DoesNotExist.",
                              "type": "string"
                            },
                            "values": {
                              "description": "values is an array of string values. If the operator is In or NotIn,\nthe values array must be non-empty. If the operator is Exists or DoesNotExist,\nthe values array must be empty. This array is replaced during a strategic\nmerge patch.",
                              "items": {
                                "type": "string"
                              },
                              "type": "array",
                              "x-kubernetes-list-type": "atomic"
                            }
                          },
                          "required": [
                            "key",
                            "operator"
                          ],
                          "type": "object"
                        },
                        "type": "array",
                        "x-kubernetes-list-type": "atomic"
                      },
                      "matchLabels": {
                        "additionalProperties": {
                          "type": "string"
                        },
                        "description": "matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels\nmap is equivalent to an element of matchExpressions, whose key field is \"key\", the\noperator is \"In\", and the values array contains only \"value\". The requirements are ANDed.",
                        "type": "object"
                      }
                    },
                    "type": "object",
                    "x-kubernetes-map-type": "atomic"
                  },
                  "podSelector": {
                    "description": "podSelector is a label selector which selects pods. This field follows standard label\nselector semantics; if present but empty, it selects all pods.\n\nIf namespaceSelector is also set, then the NetworkPolicyPeer as a whole selects\nthe pods matching podSelector in the Namespaces selected by NamespaceSelector.\nOtherwise it selects the pods matching podSelector in the policy's own namespace.",
                    "properties": {
                      "matchExpressions": {
                        "description": "matchExpressions is a list of label selector requirements. The requirements are ANDed.",
                        "items": {
                          "description": "A label selector requirement is a selector that contains values, a key, and an operator that\nrelates the key and values.",
                          "properties": {
                            "key": {
                              "description": "key is the label key that the selector applies to.",
                              "type": "string"
                            },
                            "operator": {
                              "description": "operator represents a key's relationship to a set of values.\nValid operators are In, NotIn, Exists and DoesNotExist.",
                              "type": "string"
                            },
                            "values": {
                              "description": "values is an array of string values. If the operator is In or NotIn,\nthe values array must be non-empty. If the operator is Exists or DoesNotExist,\nthe values array must be empty. This array is replaced during a strategic\nmerge patch.",
                              "items": {
                                "type": "string"
                              },
                              "type": "array",
                              "x-kubernetes-list-type": "atomic"
                            }
                          },
                          "required": [
                            "key",
                            "operator"
                          ],
                          "type": "object"
                        },
                        "type": "array",
                        "x-kubernetes-list-type": "atomic"
                      },
                      "matchLabels": {
                        "additionalProperties": {
                          "type": "string"
                        },
                        "description": "matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels\nmap is equivalent to an element of matchExpressions, whose key field is \"key\", the\noperator is \"In\", and the values array contains only \"value\". The requirements are ANDed.",
                        "type": "object"
                      }
                    },
                    "type": "object",
                    "x-kubernetes-map-type": "atomic"
                  }
                },
                "type": "object"
              },
              "type": "array",
              "x-kubernetes-list-type": "atomic"
            }
          },
          "type": "object"
        },
        "type": "array"
      },
      "ingress": {
        "description": "List of ingress rules to be applied to the selected pods. Traffic is allowed to\na pod if there are no NetworkPolicies selecting the pod\n(and cluster policy otherwise allows the traffic), OR if the traffic source is\nthe pod's local node, OR if the traffic matches at least one ingress rule\nacross all of the NetworkPolicy objects whose podSelector matches the pod. If\nthis field is empty then this NetworkPolicy does not allow any traffic (and serves\nsolely to ensure that the pods it selects are isolated by default)",
        "items": {
          "description": "NetworkPolicyIngressRule describes a particular set of traffic that is allowed to the pods\nmatched by a NetworkPolicySpec's podSelector. The traffic must match both ports and from.",
          "properties": {
            "from": {
              "description": "from is a list of sources which should be able to access the pods selected for this rule.\nItems in this list are combined using a logical OR operation. If this field is\nempty or missing, this rule matches all sources (traffic not restricted by\nsource). If this field is present and contains at least one item, this rule\nallows traffic only if the traffic matches at least one item in the from list.",
              "items": {
                "description": "NetworkPolicyPeer describes a peer to allow traffic to/from. Only certain combinations of\nfields are allowed",
                "properties": {
                  "ipBlock": {
                    "description": "ipBlock defines policy on a particular IPBlock. If this field is set then\nneither of the other fields can be.",
                    "properties": {
                      "cidr": {
                        "description": "cidr is a string representing the IPBlock\nValid examples are \"192.168.1.0/24\" or \"2001:db8::/64\"",
                        "type": "string"
                      },
                      "except": {
                        "description": "except is a slice of CIDRs that should not be included within an IPBlock\nValid examples are \"192.168.1.0/24\" or \"2001:db8::/64\"\nExcept values will be rejected if they are outside the cidr range",
                        "items": {
                          "type": "string"
                        },
                        "type": "array",
                        "x-kubernetes-list-type": "atomic"
                      }
                    },
                    "required": [
                      "cidr"
                    ],
                    "type": "object"
                  },
                  "namespaceSelector": {
                    "description": "namespaceSelector selects namespaces using cluster-scoped labels. This field follows\nstandard label selector semantics; if present but empty, it selects all namespaces.\n\nIf podSelector is also set, then the NetworkPolicyPeer as a whole selects\nthe pods matching podSelector in the namespaces selected by namespaceSelector.\nOtherwise it selects all pods in the namespaces selected by namespaceSelector.",
                    "properties": {
                      "matchExpressions": {
                        "description": "matchExpressions is a list of label selector requirements. The requirements are ANDed.",
                        "items": {
                          "description": "A label selector requirement is a selector that contains values, a key, and an operator that\nrelates the key and values.",
                          "properties": {
                            "key": {
                              "description": "key is the label key that the selector applies to.",
                              "type": "string"
                            },
                            "operator": {
                              "description": "operator represents a key's relationship to a set of values.\nValid operators are In, NotIn, Exists and DoesNotExist.",
                              "type": "string"
                            },
                            "values": {
                              "description": "values is an array of string values. If the operator is In or NotIn,\nthe values array must be non-empty. If the operator is Exists or DoesNotExist,\nthe values array must be empty. This array is replaced during a strategic\nmerge patch.",
                              "items": {
                                "type": "string"
                              },
                              "type": "array",
                              "x-kubernetes-list-type": "atomic"
                            }
                          },
                          "required": [
                            "key",
                            "operator"
                          ],
                          "type": "object"
                        },
                        "type": "array",
                        "x-kubernetes-list-type": "atomic"
                      },
                      "matchLabels": {
                        "additionalProperties": {
                          "type": "string"
                        },
                        "description": "matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels\nmap is equivalent to an element of matchExpressions, whose key field is \"key\", the\noperator is \"In\", and the values array contains only \"value\". The requirements are ANDed.",
                        "type": "object"
                      }
                    },
                    "type": "object",
                    "x-kubernetes-map-type": "atomic"
                  },
                  "podSelector": {
                    "description": "podSelector is a label selector which selects pods. This field follows standard label\nselector semantics; if present but empty, it selects all pods.\n\nIf namespaceSelector is also set, then the NetworkPolicyPeer as a whole selects\nthe pods matching podSelector in the Namespaces selected by NamespaceSelector.\nOtherwise it selects the pods matching podSelector in the policy's own namespace.",
                    "properties": {
                      "matchExpressions": {
                        "description": "matchExpressions is a list of label selector requirements. The requirements are ANDed.",
                        "items": {
                          "description": "A label selector requirement is a selector that contains values, a key, and an operator that\nrelates the key and values.",
                          "properties": {
                            "key": {
                              "description": "key is the label key that the selector applies to.",
                              "type": "string"
                            },
                            "operator": {
                              "description": "operator represents a key's relationship to a set of values.\nValid operators are In, NotIn, Exists and DoesNotExist.",
                              "type": "string"
                            },
                            "values": {
                              "description": "values is an array of string values. If the operator is In or NotIn,\nthe values array must be non-empty. If the operator is Exists or DoesNotExist,\nthe values array must be empty. This array is replaced during a strategic\nmerge patch.",
                              "items": {
                                "type": "string"
                              },
                              "type": "array",
                              "x-kubernetes-list-type": "atomic"
                            }
                          },
                          "required": [
                            "key",
                            "operator"
                          ],
                          "type": "object"
                        },
                        "type": "array",
                        "x-kubernetes-list-type": "atomic"
                      },
                      "matchLabels": {
                        "additionalProperties": {
                          "type": "string"
                        },
                        "description": "matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels\nmap is equivalent to an element of matchExpressions, whose key field is \"key\", the\noperator is \"In\", and the values array contains only \"value\". The requirements are ANDed.",
                        "type": "object"
                      }
                    },
                    "type": "object",
                    "x-kubernetes-map-type": "atomic"
                  }
                },
                "type": "object"
              },
              "type": "array",
              "x-kubernetes-list-type": "atomic"
            },
            "ports": {
              "description": "ports is a list of ports which should be made accessible on the pods selected for\nthis rule. Each item in this list is combined using a logical OR. If this field is\nempty or missing, this rule matches all ports (traffic not restricted by port).\nIf this field is present and contains at least one item, then this rule allows\ntraffic only if the traffic matches at least one port in the list.",
              "items": {
                "description": "NetworkPolicyPort describes a port to allow traffic on",
                "properties": {
                  "endPort": {
                    "description": "endPort indicates that the range of ports from port to endPort if set, inclusive,\nshould be allowed by the policy. This field cannot be defined if the port field\nis not defined or if the port field is defined as a named (string) port.\nThe endPort must be equal or greater than port.",
                    "format": "int32",
                    "type": "integer"
                  },
                  "port": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "description": "port represents the port on the given protocol. This can either be a numerical or named\nport on a pod. If this field is not provided, this matches all port names and\nnumbers.\nIf present, only traffic on the specified protocol AND port will be matched.",
                    "x-kubernetes-int-or-string": true
                  },
                  "protocol": {
                    "description": "protocol represents the protocol (TCP, UDP, or SCTP) which traffic must match.\nIf not specified, this field defaults to TCP.",
                    "type": "string"
                  }
                },
                "type": "object"
              },
              "type": "array",
              "x-kubernetes-list-type": "atomic"
            }
          },
          "type": "object"
        },
        "type": "array"
      },
      "podSelector": {
        "description": "Selects the pods to which this NetworkPolicy object applies. The array of\ningress rules is applied to any pods selected by this field. Multiple network\npolicies can select the same set of pods. In this case, the ingress rules for\neach are combined additively. This field is NOT optional and follows standard\nlabel selector semantics. An empty podSelector matches all pods in this\nnamespace.",
        "properties": {
          "matchExpressions": {
            "description": "matchExpressions is a list of label selector requirements. The requirements are ANDed.",
            "items": {
              "description": "A label selector requirement is a selector that contains values, a key, and an operator that\nrelates the key and values.",
              "properties": {
                "key": {
                  "description": "key is the label key that the selector applies to.",
                  "type": "string"
                },
                "operator": {
                  "description": "operator represents a key's relationship to a set of values.\nValid operators are In, NotIn, Exists and DoesNotExist.",
                  "type": "string"
                },
                "values": {
                  "description": "values is an array of string values. If the operator is In or NotIn,\nthe values array must be non-empty. If the operator is Exists or DoesNotExist,\nthe values array must be empty. This array is replaced during a strategic\nmerge patch.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array",
                  "x-kubernetes-list-type": "atomic"
                }
              },
              "required": [
                "key",
                "operator"
              ],
              "type": "object"
            },
            "type": "array",
            "x-kubernetes-list-type": "atomic"
          },
          "matchLabels": {
            "additionalProperties": {
              "type": "string"
            },
            "description": "matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels\nmap is equivalent to an element of matchExpressions, whose key field is \"key\", the\noperator is \"In\", and the values array contains only \"value\". The requirements are ANDed.",
            "type": "object"
          }
        },
        "type": "object",
        "x-kubernetes-map-type": "atomic"
      },
      "policyTypes": {
        "description": "List of rule types that the NetworkPolicy relates to.\nValid options are Ingress, Egress, or Ingress,Egress.\nIf this field is not specified, it will default based on the existence of Ingress or Egress rules;\npolicies that contain an Egress section are assumed to affect Egress, and all policies\n(whether or not they contain an Ingress section) are assumed to affect Ingress.\nIf you want to write an egress-only policy, you must explicitly specify policyTypes [ \"Egress\" ].\nLikewise, if you want to write a policy that specifies that no egress is allowed,\nyou must specify a policyTypes value that include \"Egress\" (since such a policy would not include\nan Egress section and would otherwise default to just [ \"Ingress\" ]).\nThis field is beta-level in 1.8",
        "items": {
          "description": "PolicyType string describes the NetworkPolicy type\nThis type is beta-level in 1.8",
          "type": "string"
        },
        "type": "array"
      },
      "stagedAction": {
        "description": "The staged action. If this is omitted, the default is Set.",
        "type": "string"
      }
    }
  },
  {
    "kind": "StagedNetworkPolicy",
    "resource": "stagednetworkpolicies",
    "scope": "Namespaced",
    "publicKind": "StagedNetworkPolicy",
    "primary": [
      "stagedAction",
      "tier",
      "selector",
      "ingress",
      "egress"
    ],
    "fields": {
      "egress": {
        "description": "The ordered set of egress rules.  Each rule contains a set of packet match criteria and\na corresponding action to apply.",
        "items": {
          "description": "A Rule encapsulates a set of match criteria and an action.  Both selector-based security Policy\nand security Profiles reference rules - separated out as a list of rules for both\ningress and egress packet matching.\n\nEach positive match criteria has a negated version, prefixed with \"Not\". All the match\ncriteria within a rule must be satisfied for a packet to match. A single rule can contain\nthe positive and negative version of a match and both must be satisfied for the rule to match.",
          "properties": {
            "action": {
              "type": "string"
            },
            "destination": {
              "description": "Destination contains the match criteria that apply to destination entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            },
            "http": {
              "description": "HTTP contains match criteria that apply to HTTP requests.",
              "properties": {
                "methods": {
                  "description": "Methods is an optional field that restricts the rule to apply only to HTTP requests that use one of the listed\nHTTP Methods (e.g. GET, PUT, etc.)\nMultiple methods are OR'd together.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "paths": {
                  "description": "Paths is an optional field that restricts the rule to apply to HTTP requests that use one of the listed\nHTTP Paths.\nMultiple paths are OR'd together.\ne.g:\n- exact: /foo\n- prefix: /bar\nNOTE: Each entry may ONLY specify either a `exact` or a `prefix` match. The validator will check for it.",
                  "items": {
                    "description": "HTTPPath specifies an HTTP path to match. It may be either of the form:\nexact: <path>: which matches the path exactly or\nprefix: <path-prefix>: which matches the path prefix",
                    "properties": {
                      "exact": {
                        "type": "string"
                      },
                      "prefix": {
                        "type": "string"
                      }
                    },
                    "type": "object"
                  },
                  "type": "array"
                }
              },
              "type": "object"
            },
            "icmp": {
              "description": "ICMP is an optional field that restricts the rule to apply to a specific type and\ncode of ICMP traffic.  This should only be specified if the Protocol field is set to\n\"ICMP\" or \"ICMPv6\".",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "ipVersion": {
              "description": "IPVersion is an optional field that restricts the rule to only match a specific IP\nversion.",
              "type": "integer"
            },
            "metadata": {
              "description": "Metadata contains additional information for this rule",
              "properties": {
                "annotations": {
                  "additionalProperties": {
                    "type": "string"
                  },
                  "description": "Annotations is a set of key value pairs that give extra information about the rule",
                  "type": "object"
                }
              },
              "type": "object"
            },
            "notICMP": {
              "description": "NotICMP is the negated version of the ICMP field.",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "notProtocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "NotProtocol is the negated version of the Protocol field.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "protocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "Protocol is an optional field that restricts the rule to only apply to traffic of\na specific IP protocol. Required if any of the EntityRules contain Ports\n(because ports only apply to certain protocols).\n\nMust be one of these string values: \"TCP\", \"UDP\", \"ICMP\", \"ICMPv6\", \"SCTP\", \"UDPLite\"\nor an integer in the range 1-255.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "source": {
              "description": "Source contains the match criteria that apply to source entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "ingress": {
        "description": "The ordered set of ingress rules.  Each rule contains a set of packet match criteria and\na corresponding action to apply.",
        "items": {
          "description": "A Rule encapsulates a set of match criteria and an action.  Both selector-based security Policy\nand security Profiles reference rules - separated out as a list of rules for both\ningress and egress packet matching.\n\nEach positive match criteria has a negated version, prefixed with \"Not\". All the match\ncriteria within a rule must be satisfied for a packet to match. A single rule can contain\nthe positive and negative version of a match and both must be satisfied for the rule to match.",
          "properties": {
            "action": {
              "type": "string"
            },
            "destination": {
              "description": "Destination contains the match criteria that apply to destination entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            },
            "http": {
              "description": "HTTP contains match criteria that apply to HTTP requests.",
              "properties": {
                "methods": {
                  "description": "Methods is an optional field that restricts the rule to apply only to HTTP requests that use one of the listed\nHTTP Methods (e.g. GET, PUT, etc.)\nMultiple methods are OR'd together.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "paths": {
                  "description": "Paths is an optional field that restricts the rule to apply to HTTP requests that use one of the listed\nHTTP Paths.\nMultiple paths are OR'd together.\ne.g:\n- exact: /foo\n- prefix: /bar\nNOTE: Each entry may ONLY specify either a `exact` or a `prefix` match. The validator will check for it.",
                  "items": {
                    "description": "HTTPPath specifies an HTTP path to match. It may be either of the form:\nexact: <path>: which matches the path exactly or\nprefix: <path-prefix>: which matches the path prefix",
                    "properties": {
                      "exact": {
                        "type": "string"
                      },
                      "prefix": {
                        "type": "string"
                      }
                    },
                    "type": "object"
                  },
                  "type": "array"
                }
              },
              "type": "object"
            },
            "icmp": {
              "description": "ICMP is an optional field that restricts the rule to apply to a specific type and\ncode of ICMP traffic.  This should only be specified if the Protocol field is set to\n\"ICMP\" or \"ICMPv6\".",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "ipVersion": {
              "description": "IPVersion is an optional field that restricts the rule to only match a specific IP\nversion.",
              "type": "integer"
            },
            "metadata": {
              "description": "Metadata contains additional information for this rule",
              "properties": {
                "annotations": {
                  "additionalProperties": {
                    "type": "string"
                  },
                  "description": "Annotations is a set of key value pairs that give extra information about the rule",
                  "type": "object"
                }
              },
              "type": "object"
            },
            "notICMP": {
              "description": "NotICMP is the negated version of the ICMP field.",
              "properties": {
                "code": {
                  "description": "Match on a specific ICMP code.  If specified, the Type value must also be specified.\nThis is a technical limitation imposed by the kernel's iptables firewall, which\nCalico uses to enforce the rule.",
                  "type": "integer"
                },
                "type": {
                  "description": "Match on a specific ICMP type.  For example a value of 8 refers to ICMP Echo Request\n(i.e. pings).",
                  "type": "integer"
                }
              },
              "type": "object"
            },
            "notProtocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "NotProtocol is the negated version of the Protocol field.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "protocol": {
              "anyOf": [
                {
                  "type": "integer"
                },
                {
                  "type": "string"
                }
              ],
              "description": "Protocol is an optional field that restricts the rule to only apply to traffic of\na specific IP protocol. Required if any of the EntityRules contain Ports\n(because ports only apply to certain protocols).\n\nMust be one of these string values: \"TCP\", \"UDP\", \"ICMP\", \"ICMPv6\", \"SCTP\", \"UDPLite\"\nor an integer in the range 1-255.",
              "pattern": "^.*",
              "x-kubernetes-int-or-string": true
            },
            "source": {
              "description": "Source contains the match criteria that apply to source entity.",
              "properties": {
                "namespaceSelector": {
                  "description": "NamespaceSelector is an optional field that contains a selector expression. Only traffic\nthat originates from (or terminates at) endpoints within the selected namespaces will be\nmatched. When both NamespaceSelector and another selector are defined on the same rule, then only\nworkload endpoints that are matched by both selectors will be selected by the rule.\n\nFor NetworkPolicy, an empty NamespaceSelector implies that the Selector is limited to selecting\nonly workload endpoints in the same namespace as the NetworkPolicy.\n\nFor NetworkPolicy, `global()` NamespaceSelector implies that the Selector is limited to selecting\nonly GlobalNetworkSet or HostEndpoint.\n\nFor GlobalNetworkPolicy, an empty NamespaceSelector implies the Selector applies to workload\nendpoints across all namespaces.",
                  "type": "string"
                },
                "nets": {
                  "description": "Nets is an optional field that restricts the rule to only apply to traffic that\noriginates from (or terminates at) IP addresses in any of the given subnets.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notNets": {
                  "description": "NotNets is the negated version of the Nets field.",
                  "items": {
                    "type": "string"
                  },
                  "type": "array"
                },
                "notPorts": {
                  "description": "NotPorts is the negated version of the Ports field.\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "notSelector": {
                  "description": "NotSelector is the negated version of the Selector field.  See Selector field for\nsubtleties with negated selectors.",
                  "type": "string"
                },
                "ports": {
                  "description": "Ports is an optional field that restricts the rule to only apply to traffic that has a\nsource (destination) port that matches one of these ranges/values. This value is a\nlist of integers or strings that represent ranges of ports.\n\nSince only some protocols have ports, if any ports are specified it requires the\nProtocol match in the Rule to be set to \"TCP\" or \"UDP\".",
                  "items": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "string"
                      }
                    ],
                    "pattern": "^.*",
                    "x-kubernetes-int-or-string": true
                  },
                  "type": "array"
                },
                "selector": {
                  "description": "Selector is an optional field that contains a selector expression (see Policy for\nsample syntax).  Only traffic that originates from (terminates at) endpoints matching\nthe selector will be matched.\n\nNote that: in addition to the negated version of the Selector (see NotSelector below), the\nselector expression syntax itself supports negation.  The two types of negation are subtly\ndifferent. One negates the set of matched endpoints, the other negates the whole match:\n\n\tSelector = \"!has(my_label)\" matches packets that are from other Calico-controlled\n\tendpoints that do not have the label \"my_label\".\n\n\tNotSelector = \"has(my_label)\" matches packets that are not from Calico-controlled\n\tendpoints that do have the label \"my_label\".\n\nThe effect is that the latter will accept packets from non-Calico sources whereas the\nformer is limited to packets from Calico-controlled endpoints.",
                  "type": "string"
                },
                "serviceAccounts": {
                  "description": "ServiceAccounts is an optional field that restricts the rule to only apply to traffic that originates from (or\nterminates at) a pod running as a matching service account.",
                  "properties": {
                    "names": {
                      "description": "Names is an optional field that restricts the rule to only apply to traffic that originates from (or terminates\nat) a pod running as a service account whose name is in the list.",
                      "items": {
                        "type": "string"
                      },
                      "type": "array"
                    },
                    "selector": {
                      "description": "Selector is an optional field that restricts the rule to only apply to traffic that originates from\n(or terminates at) a pod running as a service account that matches the given label selector.\nIf both Names and Selector are specified then they are AND'ed.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                },
                "services": {
                  "description": "Services is an optional field that contains options for matching Kubernetes Services.\nIf specified, only traffic that originates from or terminates at endpoints within the selected\nservice(s) will be matched, and only to/from each endpoint's port.\n\nServices cannot be specified on the same rule as Selector, NotSelector, NamespaceSelector, Nets,\nNotNets or ServiceAccounts.\n\nPorts and NotPorts can only be specified with Services on ingress rules.",
                  "properties": {
                    "name": {
                      "description": "Name specifies the name of a Kubernetes Service to match.",
                      "type": "string"
                    },
                    "namespace": {
                      "description": "Namespace specifies the namespace of the given Service. If left empty, the rule\nwill match within this policy's namespace.",
                      "type": "string"
                    }
                  },
                  "type": "object"
                }
              },
              "type": "object"
            }
          },
          "required": [
            "action"
          ],
          "type": "object"
        },
        "type": "array"
      },
      "order": {
        "description": "Order is an optional field that specifies the order in which the policy is applied.\nPolicies with higher \"order\" are applied after those with lower\norder within the same tier.  If the order is omitted, it may be considered to be \"infinite\" - i.e. the\npolicy will be applied last.  Policies with identical order will be applied in\nalphanumerical order based on the Policy \"Name\" within the tier.",
        "type": "number"
      },
      "performanceHints": {
        "description": "PerformanceHints contains a list of hints to Calico's policy engine to\nhelp process the policy more efficiently.  Hints never change the\nenforcement behaviour of the policy.\n\nCurrently, the only available hint is \"AssumeNeededOnEveryNode\".  When\nthat hint is set on a policy, Felix will act as if the policy matches\na local endpoint even if it does not. This is useful for \"preloading\"\nany large static policies that are known to be used on every node.\nIf the policy is _not_ used on a particular node then the work\ndone to preload the policy (and to maintain it) is wasted.",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "selector": {
        "description": "The selector is an expression used to pick pick out the endpoints that the policy should\nbe applied to.\n\nSelector expressions follow this syntax:\n\n\tlabel == \"string_literal\"  ->  comparison, e.g. my_label == \"foo bar\"\n\tlabel != \"string_literal\"   ->  not equal; also matches if label is not present\n\tlabel in { \"a\", \"b\", \"c\", ... }  ->  true if the value of label X is one of \"a\", \"b\", \"c\"\n\tlabel not in { \"a\", \"b\", \"c\", ... }  ->  true if the value of label X is not one of \"a\", \"b\", \"c\"\n\thas(label_name)  -> True if that label is present\n\t! expr -> negation of expr\n\texpr && expr  -> Short-circuit and\n\texpr || expr  -> Short-circuit or\n\t( expr ) -> parens for grouping\n\tall() or the empty selector -> matches all endpoints.\n\nLabel names are allowed to contain alphanumerics, -, _ and /. String literals are more permissive\nbut they do not support escape characters.\n\nExamples (with made-up labels):\n\n\ttype == \"webserver\" && deployment == \"prod\"\n\ttype in {\"frontend\", \"backend\"}\n\tdeployment != \"dev\"\n\t! has(label_name)",
        "type": "string"
      },
      "serviceAccountSelector": {
        "description": "ServiceAccountSelector is an optional field for an expression used to select a pod based on service accounts.",
        "type": "string"
      },
      "stagedAction": {
        "description": "The staged action. If this is omitted, the default is Set.",
        "type": "string"
      },
      "tier": {
        "description": "The name of the tier that this policy belongs to.  If this is omitted, the default\ntier (name is \"default\") is assumed.  The specified tier must exist in order to create\nsecurity policies within the tier, the \"default\" tier is created automatically if it\ndoes not exist, this means for deployments requiring only a single Tier, the tier name\nmay be omitted on all policy management requests.",
        "type": "string"
      },
      "types": {
        "description": "Types indicates whether this policy applies to ingress, or to egress, or to both.  When\nnot explicitly specified (and so the value on creation is empty or nil), Calico defaults\nTypes according to what Ingress and Egress are present in the policy.  The\ndefault is:\n\n- [ PolicyTypeIngress ], if there are no Egress rules (including the case where there are\n  also no Ingress rules)\n\n- [ PolicyTypeEgress ], if there are Egress rules but no Ingress rules\n\n- [ PolicyTypeIngress, PolicyTypeEgress ], if there are both Ingress and Egress rules.\n\nWhen the policy is read back again, Types will always be one of these values, never empty\nor nil.",
        "items": {
          "description": "PolicyType enumerates the possible values of the PolicySpec Types field.",
          "type": "string"
        },
        "type": "array"
      }
    }
  },
  {
    "kind": "Tier",
    "resource": "tiers",
    "scope": "Cluster",
    "publicKind": "Tier",
    "primary": [
      "order",
      "defaultAction"
    ],
    "fields": {
      "defaultAction": {
        "description": "DefaultAction specifies the action applied to workloads selected by a policy in the tier,\nbut not rule matched the workload's traffic.\n[Default: Deny]",
        "enum": [
          "Pass",
          "Deny"
        ],
        "type": "string"
      },
      "order": {
        "description": "Order is an optional field that specifies the order in which the tier is applied.\nTiers with higher \"order\" are applied after those with lower order.  If the order\nis omitted, it may be considered to be \"infinite\" - i.e. the tier will be applied\nlast.  Tiers with identical order will be applied in alphanumerical order based\non the Tier \"Name\".",
        "type": "number"
      }
    }
  }
];
