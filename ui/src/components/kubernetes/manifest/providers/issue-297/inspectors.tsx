import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorField, EditorHelp, EditorSection } from '../../editor-controls';
import { observedState, scalar, items } from './model';

function Fact({ label, value, help }: { label: string; value: unknown; help?: string }) {
  return <EditorField label={label} value={scalar(value)} readOnly onChange={() => undefined} help={help} />;
}
function Common({ draft, context }: ResourceEditorFormProps) {
  const owners = items(draft.get(['metadata', 'ownerReferences']));
  return <EditorSection title="Controller ownership">
    <p role="note">Inspection only · no lifecycle changes</p>
    <Fact label="Read availability" value={context.capabilities.get} />
    <Fact label="Discovery" value={context.discovery.status} />
    <Fact label="Schema" value={context.schema.status} />
    {owners.length ? owners.map((owner, index) => <div key={index} className="resource-editor-section">
      <Fact label="Owner kind" value={owner.kind} /><Fact label="Owner name" value={owner.name} />
      <Fact label="Owner API" value={owner.apiVersion} /><Fact label="Owner UID" value={owner.uid} />
      <Fact label="Controlling owner" value={owner.controller} />
    </div>) : <p role="status">Owner unresolved. This does not allow adoption or editing.</p>}
    <Fact label="Issuer name" value={draft.get(['spec', 'issuerRef', 'name'])} />
    <Fact label="Issuer kind" value={draft.get(['spec', 'issuerRef', 'kind'])} help="Omitted kind defaults to Issuer in cert-manager. No issuer health claim is made." />
    <Fact label="Issuer group" value={draft.get(['spec', 'issuerRef', 'group'])} />
    <Fact label="Observed state" value={observedState(draft.get(['status', 'state']))} />
    <Fact label="Reason" value={draft.has(['status', 'reason']) ? 'Protected diagnostic text' : undefined} help="Arbitrary controller messages can contain credentials or endpoint URLs and are not rendered." />
  </EditorSection>;
}
export function OrderInspector(props: ResourceEditorFormProps) {
  const { draft, section } = props;
  if (section === 'details') {
    const authorizations = items(draft.get(['status', 'authorizations']));
    return <EditorSection title="Authorization snapshot">
      <EditorHelp label="Authorization reuse">An initially valid authorization may be reused without creating a Challenge. This snapshot is not event history.</EditorHelp>
      {authorizations.length ? authorizations.map((authorization, index) => <EditorSection key={index} title={`Authorization ${index + 1}`}>
        <Fact label="Identifier" value={authorization.identifier} /><Fact label="Wildcard" value={authorization.wildcard} />
        <Fact label="Initial state" value={observedState(authorization.initialState)} />
        <Fact label="Offered challenge types" value={items(authorization.challenges).map(challenge => scalar(challenge.type)).join(', ') || undefined} />
      </EditorSection>) : <p role="status">No authorizations observed.</p>}
    </EditorSection>;
  }
  return <><Common {...props} /><EditorSection title="Requested certificate">
    <Fact label="DNS names" value={stringList(draft.get(['spec', 'dnsNames']))} />
    <Fact label="IP addresses" value={stringList(draft.get(['spec', 'ipAddresses']))} />
    <Fact label="Common name" value={draft.get(['spec', 'commonName'])} />
    <Fact label="Requested duration" value={draft.get(['spec', 'duration'])} help="Requested duration does not prove issued certificate validity." />
    <Fact label="ACME profile" value={draft.get(['spec', 'profile'])} />
    <Fact label="Failure time" value={draft.get(['status', 'failureTime'])} />
    <Fact label="Order endpoint" value={draft.has(['status', 'url']) ? 'Present · protected' : undefined} />
    <Fact label="Finalize endpoint" value={draft.has(['status', 'finalizeURL']) ? 'Present · protected' : undefined} />
    <Fact label="Certificate" value={draft.has(['status', 'certificate']) ? 'Present · protected' : undefined} />
  </EditorSection></>;
}
function stringList(value: unknown) { return Array.isArray(value) ? value.filter(item => typeof item === 'string').join(', ') || undefined : undefined; }
export function ChallengeInspector(props: ResourceEditorFormProps) {
  const { draft, section } = props;
  if (section === 'details') return <EditorSection title="Solver diagnostics boundary">
    <Fact label="Challenge mechanism" value={draft.get(['spec', 'type'])} />
    <Fact label="Solver configuration" value={draft.has(['spec', 'solver']) ? 'Present · protected provider payload' : undefined} />
    <Fact label="DNS solver provider" value={draft.get(['spec', 'solver', 'dns01']) && typeof draft.get(['spec', 'solver', 'dns01']) === 'object' ? Object.keys(draft.get(['spec', 'solver', 'dns01']) as object).filter(key => !['cnameStrategy'].includes(key)).join(', ') : undefined} />
    <Fact label="Ingress class" value={draft.get(['spec', 'solver', 'http01', 'ingress', 'ingressClassName'])} />
    <Fact label="Legacy ingress class" value={draft.get(['spec', 'solver', 'http01', 'ingress', 'class'])} />
    <Fact label="Existing solver ingress" value={draft.get(['spec', 'solver', 'http01', 'ingress', 'name'])} />
    <EditorHelp label="Solver privacy">DNS provider payloads may contain credentials. HTTP solver configuration may contain token-bearing data. No Secret read, DNS probe, HTTP probe, propagation claim or self-check result is inferred.</EditorHelp>
    <Fact label="Challenge endpoint" value={draft.has(['spec', 'url']) ? 'Present · protected' : undefined} />
    <Fact label="Authorization endpoint" value={draft.has(['spec', 'authorizationURL']) ? 'Present · protected' : undefined} />
  </EditorSection>;
  return <><Common {...props} /><EditorSection title="Challenge progress">
    <Fact label="Identifier" value={draft.get(['spec', 'dnsName'])} help="Wildcard identifiers omit the *. prefix here; inspect the separate wildcard flag." />
    <Fact label="Wildcard" value={draft.get(['spec', 'wildcard'])} />
    <Fact label="Challenge mechanism" value={draft.get(['spec', 'type'])} />
    <Fact label="Scheduled processing" value={draft.get(['status', 'processing'])} />
    <Fact label="Presented" value={draft.get(['status', 'presented'])} help="Presented means values were submitted. It does not mean self-check passed." />
  </EditorSection></>;
}
