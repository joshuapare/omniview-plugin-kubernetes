import { Input } from '@omniviewdev/base-ui';
import { useEffect } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { EditorHelp, EditorSection } from '../../editor-controls';
import { decisionLabels, imageReviewAnnotationCount, imageReviewDecision, imageReviewImages, imageReviewNamespace } from './model';
import styles from './ImageReviewInspector.module.css';

function Fact({ label, value, help }: { label: string; value: string; help?: string }) {
  return <div className={styles.fact}><dt>{label}{help && <EditorHelp label={label}>{help}</EditorHelp>}</dt><dd>{value}</dd></div>;
}

function countLabel(value: number | null): string {
  return value === null ? 'Unsupported shape · hidden' : `${value} · values hidden`;
}

export default function ImageReviewInspector({ draft, context, section, onValidityChange }: ResourceEditorFormProps) {
  useEffect(() => { onValidityChange(null); }, [draft.sessionID, onValidityChange]);
  const decision = imageReviewDecision(draft);
  const images = imageReviewImages(draft);
  const evidenceAccess = context.capabilities.get;
  const hasEvidence = draft.has(['spec']) || draft.has(['status']);
  const accessMessage = evidenceAccess === 'denied' ? 'Evidence access denied'
    : evidenceAccess === 'unavailable' ? 'Evidence access unavailable' : null;

  return <div className={styles.inspector}>
    <div className={styles.boundary} role="note">Protocol snapshot · read-only · no replay</div>
    {accessMessage && <div role="status" className={styles.warning}>{accessMessage}</div>}
    {!hasEvidence && <div role="status" className={styles.warning}>No captured ImageReview evidence.</div>}
    {section === 'decision' ? <EditorSection title="Webhook decision">
      <dl className={styles.facts}>
        <Fact label="Decision" value={decisionLabels[decision]} help="Only an explicit boolean response is interpreted. This snapshot is not a new admission decision or proof that images are safe." />
        <Fact label="Denial reason" value={draft.has(['status', 'reason']) ? 'Present · hidden' : 'Not supplied'} help="Webhook free text may contain credentials. It stays hidden in structured and source views." />
        <Fact label="Audit annotations" value={countLabel(imageReviewAnnotationCount(draft, ['status', 'auditAnnotations']))} help="Webhook keys are suffixes. The API server adds imagepolicywebhook.image-policy.k8s.io/. No values or keys are displayed." />
      </dl>
      {decision === 'invalid' && <div role="alert" className={styles.warning}>Response needs an explicit boolean allowed value.</div>}
      <div role="note" className={styles.consequence}>Decision applies to the image set, not individual rows.</div>
    </EditorSection> : section === 'integration' ? <EditorSection title="Integration & ownership">
      <dl className={styles.facts}>
        <Fact label="Protocol" value="imagepolicy.k8s.io/v1alpha1 · ImageReview" />
        <Fact label="Resource collection" value="None · no CRUD verbs" help="ImageReview is an alpha, non-namespaced webhook protocol. It has no Kubernetes REST collection or ordinary Create/Edit operation." />
        <Fact label="Evidence" value={accessMessage ?? (hasEvidence ? 'Supplied snapshot' : 'Absent')} />
        <Fact label="Webhook availability" value="Unknown" help="Published schemas and discovery do not prove that ImagePolicyWebhook or its backend is configured. This inspector does not read backend kubeconfig or contact its URL." />
        <Fact label="Failure policy & cache" value="Unknown" help="Backend failure may allow or deny admission according to server defaultAllow and cache configuration. Missing responses never imply approval here." />
        <Fact label="Request owner" value="API server" />
        <Fact label="Response owner" value="Webhook backend" />
      </dl>
    </EditorSection> : <EditorSection title="Image review request">
      <dl className={styles.facts}>
        <Fact label="Pod namespace" value={imageReviewNamespace(draft)} help="spec.namespace identifies the Pod admission namespace. It is not ImageReview resource scope and cannot be edited here." />
        <Fact label="Policy annotations" value={countLabel(imageReviewAnnotationCount(draft, ['spec', 'annotations']))} help="The API server forwards Pod annotations matching *.image-policy.k8s.io/*. Keys and values remain hidden." />
      </dl>
      <div className={styles.heading}><h4>Images{images && ` (${images.length})`}</h4><EditorHelp label="Images">The API server supplies an atomic image list. Container names and per-image decisions are not included. Image references stay masked because they may contain credentials.</EditorHelp></div>
      {images === null ? <div role="alert" className={styles.warning}>Unsupported image list · source retained unchanged.</div>
        : images.length === 0 ? <div role="status" className={styles.empty}>No images supplied.</div>
          : <ol className={styles.images}>{images.map((image, index) => <li key={index}>
            <span className={styles.index}>{index + 1}</span><Input.Root size="sm"><Input.Control aria-label={`Image ${index + 1}`} readOnly value={image.hasImage ? 'Image reference hidden' : 'Image not supplied'} /></Input.Root>
          </li>)}</ol>}
      <div role="note" className={styles.consequence}>Inspection only. No Pod or webhook request is sent.</div>
    </EditorSection>}
  </div>;
}
