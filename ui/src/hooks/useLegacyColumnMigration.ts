import { useSnackbar } from '@omniviewdev/runtime';
import { useEffect, useRef, useState } from 'react';
import { migrateColumnPreferences } from '../utils/legacyMigration';

export function useLegacyColumnMigration(connectionIDs: readonly string[] | undefined): boolean {
  const snackbar = useSnackbar();
  const connectionKey = connectionIDs === undefined ? undefined : JSON.stringify([...new Set(connectionIDs)].sort());
  const migrate = () => {
    if (connectionIDs === undefined) {
      return [];
    }

    try {
      const issues = migrateColumnPreferences(window.localStorage, connectionIDs);
      const bootstrap = (window as Window & { __OMNIVIEW_BOOTSTRAP__?: { storageKey(key: string): string | null } }).__OMNIVIEW_BOOTSTRAP__;
      const prefix = bootstrap?.storageKey('');
      if (prefix) {
        issues.push(...migrateColumnPreferences(window.localStorage, connectionIDs, prefix));
      }

      return issues;
    }
    catch (error) {
      console.warn('Kubernetes column preference migration failed', error);
      return ['Browser storage was unavailable'];
    }
  };
  const [migration, setMigration] = useState(() => ({ key: connectionKey, issues: migrate() }));
  // Children read column choices in their state initializers, before effects run.
  if (migration.key !== connectionKey) {
    setMigration({ key: connectionKey, issues: migrate() });
  }

  const reported = useRef<typeof migration | null>(null);
  useEffect(() => {
    if (reported.current === migration) {
      return;
    }

    reported.current = migration;
    if (!migration.issues.length) {
      return;
    }

    const details = migration.issues.join('\n');
    console.warn('Kubernetes legacy column preferences could not be migrated:', details);
    snackbar.showSnackbar({ message: 'Some Kubernetes column preferences could not be migrated', status: 'warning', details, showOnce: true });
  }, [migration, snackbar]);

  return connectionKey !== undefined && migration.key === connectionKey;
}
