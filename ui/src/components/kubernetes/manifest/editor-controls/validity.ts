import { useCallback, useEffect, useRef } from 'react';
import type { ResourceEditorFormProps } from '@omniviewdev/runtime';

type ValidityReporter = ResourceEditorFormProps['onValidityChange'];
interface ValidityLedger {
  buckets: Map<symbol, Map<string, string>>;
  report: ValidityReporter;
}
// Callback identity is the host's form boundary. Weak keys do not retain closed editors.
const ledgers = new WeakMap<ValidityReporter, Map<string, ValidityLedger>>();

function reportLedger(ledger: ValidityLedger): void {
  for (const errors of ledger.buckets.values()) {
    const first = errors.values().next().value;
    if (first) { ledger.report(first); return; }
  }
  ledger.report(null);
}

/**
 * Independent children sharing the same form callback/session also share admission.
 * Each hook owns its error bucket: unmounting or validating one child cannot clear a
 * sibling. A wrapped callback intentionally creates a nested boundary (for example,
 * a map control reporting its aggregate through a parent's named validity field).
 */
export function useFieldValidity(form: ResourceEditorFormProps): (field: string, error: string | null) => void {
  const token = useRef(Symbol('resource-editor-validity'));
  const local = useRef({ session: form.draft.sessionID, errors: new Map<string, string>() });
  if (local.current.session !== form.draft.sessionID) local.current = { session: form.draft.sessionID, errors: new Map() };
  const errors = local.current.errors;
  const sessions = ledgers.get(form.onValidityChange) ?? new Map<string, ValidityLedger>();
  if (!ledgers.has(form.onValidityChange)) ledgers.set(form.onValidityChange, sessions);
  const ledger = sessions.get(form.draft.sessionID) ?? { buckets: new Map<symbol, Map<string, string>>(), report: form.onValidityChange };
  if (!sessions.has(form.draft.sessionID)) sessions.set(form.draft.sessionID, ledger);
  const current = useRef(ledger);
  current.current = ledger;
  const session = form.draft.sessionID;
  useEffect(() => {
    sessions.set(session, ledger);
    ledger.buckets.set(token.current, errors);
    reportLedger(ledger);
    return () => {
      ledger.buckets.delete(token.current);
      reportLedger(ledger);
      if (!ledger.buckets.size && sessions.get(session) === ledger) sessions.delete(session);
    };
  }, [ledger, errors, sessions, session]);
  return useCallback((field, error) => {
    if (current.current !== ledger) return;
    if (error) errors.set(field, error);
    else errors.delete(field);
    ledger.buckets.set(token.current, errors);
    reportLedger(ledger);
  }, [ledger, errors]);
}
