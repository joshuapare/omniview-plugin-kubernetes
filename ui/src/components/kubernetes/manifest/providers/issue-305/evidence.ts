export const TIGERA_EVIDENCE_PROTOCOL = 'kubernetes.tigera-evidence.v1';
/** Unique original image identifiers in upstream v1.38.0 pkg/components/calico.go CalicoImages.
 * Includes optional/Windows components, so this complete pinned inventory remains valid when enabled later.
 * Operator init is intentionally excluded: upstream CalicoImages does not include it.
 * Source SHA a0009188d478747ef2561808d65fae5dbbbcb049.
 */
export const CALICO_330_IMAGES = [
 'calico/cni','calico/cni-windows','calico/key-cert-provisioner','calico/kube-controllers',
 'calico/node','calico/node-windows','calico/typha','calico/pod2daemon-flexvol','calico/apiserver',
 'calico/csi','calico/node-driver-registrar','calico/goldmane','calico/whisker','calico/whisker-backend',
 'calico/envoy-gateway','calico/envoy-proxy','calico/envoy-ratelimit','calico/guardian',
] as const;
function record(value:unknown): value is Record<string,unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function evidenceFailure(value:unknown,kind:string):string|null {
 if (!record(value) || !record(value.controller) || !record(value.installation)) return 'Installed operator evidence is unavailable.';
 const controller = value.controller;
 if (controller.status !== 'ready') return `Operator evidence ${controller.status === 'denied' || controller.status === 'absent' || controller.status === 'unavailable' ? controller.status : 'unknown'}.`;
 if (!Array.isArray(controller.deployments) || controller.deployments.length !== 1) return 'Installed operator identity is missing or ambiguous.';
 const deployments: readonly unknown[] = controller.deployments;
 const deployment = deployments[0];
 if (!record(deployment) || !Array.isArray(deployment.images)) return 'Operator image evidence is unavailable.';
 const imageRows: readonly unknown[] = deployment.images;
 const images = imageRows.filter(image=>record(image) && image.name === 'tigera-operator');
 if (images.length !== 1 || !record(images[0]) || typeof images[0].image !== 'string' || !/(?:^|\/)tigera\/operator:v1\.38\.0$/.test(images[0].image)) return 'Guided authoring requires the observed operator v1.38.0 cohort. Other releases remain source-only.';
 if (kind === 'Installation') return null;
 const installation = value.installation;
 if (installation.status !== 'ready') return 'An observed Installation/default is required. No companion configuration will be created.';
 const observed = installation.observed;
 if (!record(observed) || observed.variant !== 'Calico' || (observed.calicoVersion !== 'v3.30.0' && observed.calicoVersion !== '3.30.0')) return 'Resolve Installation to observed Calico v3.30.0 before authoring this configuration.';
 if (kind === 'Whisker' && (!record(value.goldmane) || value.goldmane.status !== 'ready')) return 'Whisker requires an existing Goldmane/default configuration. Configure it separately.';
 return null;
}
