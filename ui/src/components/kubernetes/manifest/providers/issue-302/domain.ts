import type { ResourceEditorContext, ResourceEditorDraft } from '@omniviewdev/runtime';
export interface CiliumDesign { kind: string; resource: string; version: string; namespaced?: boolean; inspect?: boolean; fields: readonly string[] }
const design = (kind: string, resource: string, fields: string[], options: Partial<CiliumDesign> = {}): CiliumDesign => ({ kind, resource, fields, version: 'v2', ...options });
export const designs: readonly CiliumDesign[] = [
 design('CiliumNetworkPolicy','ciliumnetworkpolicies',['endpointSelector.matchLabels.app','ingress.0.fromEndpoints.0.matchLabels.app','ingress.0.toPorts.0.ports.0.port','ingress.0.toPorts.0.ports.0.protocol','ingress.0.toPorts.0.rules.http.0.method','ingress.0.toPorts.0.rules.http.0.path','enableDefaultDeny.ingress'],{namespaced:true}),
 design('CiliumClusterwideNetworkPolicy','ciliumclusterwidenetworkpolicies',['nodeSelector.matchLabels.role','ingress.0.fromEntities','egressDeny.0.toCIDR','enableDefaultDeny.egress']),
 design('CiliumCIDRGroup','ciliumcidrgroups',['externalCIDRs']),
 design('CiliumEgressGatewayPolicy','ciliumegressgatewaypolicies',['selectors.0.podSelector.matchLabels.app','destinationCIDRs','excludedCIDRs','egressGateway.nodeSelector.matchLabels.role','egressGateway.egressIP']),
 design('CiliumLocalRedirectPolicy','ciliumlocalredirectpolicies',['redirectFrontend.serviceMatcher.serviceName','redirectFrontend.serviceMatcher.namespace','redirectBackend.localEndpointSelector.matchLabels.app','redirectBackend.toPorts.0.port','redirectBackend.toPorts.0.protocol','skipRedirectFromBackend'],{namespaced:true}),
 design('CiliumLoadBalancerIPPool','ciliumloadbalancerippools',['blocks.0.cidr','serviceSelector.matchLabels.team','allowFirstLastIPs','disabled']),
 design('CiliumNodeConfig','ciliumnodeconfigs',['nodeSelector.matchLabels.role','defaults.enable-ipv4'],{namespaced:true}),
 design('CiliumBGPAdvertisement','ciliumbgpadvertisements',['advertisements.0.advertisementType','advertisements.0.service.addresses','advertisements.0.selector.matchLabels.advertise','advertisements.0.attributes.communities.standard']),
 design('CiliumBGPClusterConfig','ciliumbgpclusterconfigs',['nodeSelector.matchLabels.role','bgpInstances.0.name','bgpInstances.0.localASN','bgpInstances.0.peers.0.name','bgpInstances.0.peers.0.peerASN','bgpInstances.0.peers.0.peerAddress','bgpInstances.0.peers.0.peerConfigRef.name']),
 design('CiliumBGPPeerConfig','ciliumbgppeerconfigs',['transport.peerPort','timers.holdTimeSeconds','timers.keepAliveTimeSeconds','gracefulRestart.enabled','families.0.afi','families.0.safi','families.0.advertisements.matchLabels.advertise','authSecretRef']),
 design('CiliumBGPNodeConfigOverride','ciliumbgpnodeconfigoverrides',['bgpInstances.0.name','bgpInstances.0.routerID','bgpInstances.0.localPort','bgpInstances.0.peers.0.name','bgpInstances.0.peers.0.localAddress']),
 ...['CiliumEnvoyConfig','CiliumClusterwideEnvoyConfig'].map(kind => design(kind,kind === 'CiliumEnvoyConfig' ? 'ciliumenvoyconfigs':'ciliumclusterwideenvoyconfigs',['services.0.name','services.0.namespace','services.0.listener','backendServices.0.name','backendServices.0.namespace','resources.0.@type','resources.0.name'],{namespaced:kind === 'CiliumEnvoyConfig'})),
 design('CiliumBGPPeeringPolicy','ciliumbgppeeringpolicies',['nodeSelector.matchLabels.role','virtualRouters.0.localASN','virtualRouters.0.exportPodCIDR','virtualRouters.0.neighbors.0.peerAddress','virtualRouters.0.neighbors.0.peerASN'],{version:'v2alpha1'}),
 design('CiliumGatewayClassConfig','ciliumgatewayclassconfigs',['service.type','service.externalTrafficPolicy','service.allocateLoadBalancerNodePorts','service.loadBalancerClass','service.loadBalancerSourceRanges','service.ipFamilyPolicy'],{version:'v2alpha1',namespaced:true}),
 design('CiliumL2AnnouncementPolicy','ciliuml2announcementpolicies',['nodeSelector.matchLabels.role','serviceSelector.matchLabels.team','interfaces','externalIPs','loadBalancerIPs'],{version:'v2alpha1'}),
 design('CiliumPodIPPool','ciliumpodippools',['ipv4.cidrs','ipv4.maskSize','ipv6.cidrs','ipv6.maskSize'],{version:'v2alpha1'}),
 design('CiliumEndpoint','ciliumendpoints',['status.identity.id','status.networking.addressing','status.policy'],{inspect:true,namespaced:true}),
 design('CiliumEndpointSlice','ciliumendpointslices',['namespace','endpoints'],{inspect:true,version:'v2alpha1'}),
 design('CiliumIdentity','ciliumidentities',['security-labels'],{inspect:true}),
 design('CiliumNode','ciliumnodes',['spec.addresses','spec.ipam.podCIDRs','status.ipam'],{inspect:true}),
 design('CiliumBGPNodeConfig','ciliumbgpnodeconfigs',['spec.bgpInstances','status.bgpInstances'],{inspect:true}),
];
export const pathOf = (field: string, inspect = false): (string|number)[] => (inspect ? field : `spec.${field}`).split('.').map(part => /^\d+$/.test(part) ? Number(part) : part);
export function isReadOnly(design: CiliumDesign, draft: ResourceEditorDraft, context: ResourceEditorContext): boolean {
 const owners=draft.get(['metadata','ownerReferences']);
 return !!design.inspect || context.intent === 'inspect' || context.ownership?.status === 'controller' || context.ownership?.status === 'system' || (context.intent !== 'create' && context.ownership?.status !== 'application') || (Array.isArray(owners) && owners.length > 0) || (design.kind === 'CiliumLocalRedirectPolicy' && context.intent !== 'create');
}
export const choices: Record<string, readonly string[]> = { protocol:['TCP','UDP','SCTP','ANY'], advertisementType:['PodCIDR','CiliumPodIPPool','Service'], afi:['ipv4','ipv6'], safi:['unicast'], allowFirstLastIPs:['Yes','No'], type:['LoadBalancer','NodePort','ClusterIP'], externalTrafficPolicy:['Cluster','Local'], ipFamilyPolicy:['SingleStack','PreferDualStack','RequireDualStack'] };
export const isBoolean = (name: string) => ['ingress','egress','enabled','disabled','exportPodCIDR','skipRedirectFromBackend','allocateLoadBalancerNodePorts','externalIPs','loadBalancerIPs'].includes(name);
export const isInteger = (name: string) => ['localASN','peerASN','localPort','peerPort','holdTimeSeconds','keepAliveTimeSeconds','maskSize'].includes(name);
export const isList = (name: string) => ['externalCIDRs','destinationCIDRs','excludedCIDRs','fromEntities','toCIDR','addresses','standard','loadBalancerSourceRanges','interfaces','cidrs'].includes(name);
