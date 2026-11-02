import type { ResourceEditorFormProps } from '@omniviewdev/runtime';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

type ValidityReporter = ResourceEditorFormProps['onValidityChange'];
interface ValidityLedger {
  buckets: Map<symbol, Map<string, string>>;
  report: ValidityReporter;
}
interface Registration {
  session: string;
  ledger: ValidityLedger;
  errors: Map<string, string>;
}
// Registries are touched only by committed effects/events, never during render.
const ledgers = new WeakMap<ValidityReporter, Map<string, ValidityLedger>>();

function reportLedger(ledger: ValidityLedger): void {
  for (const errors of ledger.buckets.values()) {
    const first = errors.values().next().value;
    if (first) { ledger.report(first); return; }
  }
  ledger.report(null);
}

/**
 * Reports uncommitted local input, patch failures, and form-only admission.
 * Contributions report canonical errors through validate, so invalid canonical
 * drafts can still switch to YAML while submission remains blocked.
 * Independent children sharing a host callback/session share admission. Every hook
 * owns a bucket; sibling validation and row unmount remove only that bucket's errors.
 * Wrapped callbacks intentionally create nested boundaries. Session changes reset
 * local errors; callback changes migrate the current bucket without discarding it.
 */
export function useFieldValidity(form: ResourceEditorFormProps): (field: string, error: string | null) => void {
  const [token] = useState(() => Symbol('resource-editor-validity'));
  const session = form.draft.sessionID;
  const report = form.onValidityChange;
  const bucket = useMemo(() => ({ session, errors: new Map<string, string>() }), [session]);
  const registered = useRef<Registration | null>(null);
  useLayoutEffect(() => {
    const sessions = ledgers.get(report) ?? new Map<string, ValidityLedger>();
    ledgers.set(report, sessions);
    const ledger = sessions.get(session) ?? { buckets: new Map<symbol, Map<string, string>>(), report };
    sessions.set(session, ledger);
    const registration = { session, ledger, errors: bucket.errors };
    registered.current = registration;
    ledger.buckets.set(token, bucket.errors);
    reportLedger(ledger);
    return () => {
      if (registered.current === registration) registered.current = null;
      ledger.buckets.delete(token);
      reportLedger(ledger);
      if (!ledger.buckets.size && sessions.get(session) === ledger) sessions.delete(session);
    };
  }, [report, session, token, bucket]);
  return useCallback((field, error) => {
    const registration = registered.current;
    if (!registration || registration.session !== session || registration.ledger.report !== report || registration.errors !== bucket.errors) return;
    if (error) bucket.errors.set(field, error);
    else bucket.errors.delete(field);
    reportLedger(registration.ledger);
  }, [session, report, bucket]);
}
