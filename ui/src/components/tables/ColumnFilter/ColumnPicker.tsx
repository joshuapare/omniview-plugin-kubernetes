import type { DataTableFeatures } from '@omniviewdev/base-ui';
import { Button, Checkbox, IconButton, Popover, SearchInput, Tabs } from '@omniviewdev/base-ui';
import type { Column, RowData } from '@tanstack/react-table';
import React, { useRef, useState } from 'react';
import { LuColumns2, LuLockKeyhole, LuX } from 'react-icons/lu';

import styles from './ColumnPicker.module.css';

type Props<T extends RowData> = {
  labels: Record<string, boolean>;
  setLabels: (values: Record<string, boolean>) => void;
  annotations: Record<string, boolean>;
  setAnnotations: (values: Record<string, boolean>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: Array<Column<DataTableFeatures, T>>;
  onReset: () => void;
};

const tabs = ['Fields', 'Labels', 'Annotations', 'Selected'] as const;
type Tab = (typeof tabs)[number];

type Entry<T extends RowData> = {
  id: string;
  name: string;
  selected: boolean;
  locked: boolean;
} & (
  | { kind: 'Fields'; column: Column<DataTableFeatures, T> }
  | { kind: 'Labels' | 'Annotations'; key: string }
);

function EntryName({ name, metadata }: { name: string; metadata: boolean }) {
  const separator = metadata ? name.lastIndexOf('/') : -1;
  return (
    <span className={metadata ? styles.metadataName : styles.name} title={name}>
      {separator >= 0 ? (
        <>
          <span className={styles.namespace}>{name.slice(0, separator + 1)}</span>
          <span>{name.slice(separator + 1)}</span>
        </>
      ) : (
        name
      )}
    </span>
  );
}

const requiredMark = (
  <span className={styles.required} role="img" aria-label="Required column" title="Required column">
    <LuLockKeyhole size={12} aria-hidden="true" />
  </span>
);

function moveChecklistFocus(event: React.KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const controls = Array.from(
    event.currentTarget
      .closest('[data-column-checklist]')
      ?.querySelectorAll<HTMLElement>('[role="checkbox"]:not([data-disabled]):not([disabled])') ??
      [],
  );
  const index = controls.indexOf(event.target as HTMLElement);
  if (index < 0 || !controls.length) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? controls.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
  controls[next].focus();
}

const ColumnPicker = <T extends RowData>({
  labels,
  setLabels,
  annotations,
  setAnnotations,
  open,
  onOpenChange,
  columns,
  onReset,
}: Props<T>) => {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('Fields');
  const searchRef = useRef<HTMLInputElement>(null);

  const columnName = (column: Column<DataTableFeatures, T>) => {
    if (typeof column.columnDef.header === 'string') return column.columnDef.header;
    const meta = column.columnDef.meta;
    return meta && 'sortAriaLabel' in meta && typeof meta.sortAriaLabel === 'string'
      ? meta.sortAriaLabel
      : column.id;
  };

  const fields: Entry<T>[] = columns
    .filter(
      (column) =>
        column.id !== 'select' &&
        column.id !== 'menu' &&
        !column.id.startsWith('label-') &&
        !column.id.startsWith('annotation-'),
    )
    .map((column) => ({
      id: `field:${column.id}`,
      name: columnName(column),
      kind: 'Fields',
      selected: column.getIsVisible(),
      locked: !column.getCanHide(),
      column,
    }));

  const metadataEntries = (
    kind: 'Labels' | 'Annotations',
    values: Record<string, boolean>,
  ): Entry<T>[] =>
    Object.entries(values)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, selected]) => ({
        id: `${kind}:${key}`,
        name: key,
        key,
        kind,
        selected,
        locked: false,
      }));

  const labelEntries = metadataEntries('Labels', labels);
  const annotationEntries = metadataEntries('Annotations', annotations);
  const entries = [...fields, ...labelEntries, ...annotationEntries];
  const selected = entries.filter((entry) => entry.selected);
  const search = query.trim().toLowerCase();
  const results = entries.filter(
    (entry) =>
      (tab === 'Selected' ? entry.selected : search.length > 0 || entry.kind === tab) &&
      entry.name.toLowerCase().includes(search),
  );
  const counts: Record<Tab, number> = {
    Fields: fields.length,
    Labels: labelEntries.length,
    Annotations: annotationEntries.length,
    Selected: selected.length,
  };

  // Metadata setters merge partial maps, so each batch must reach the parent in one call.
  const setSelected = (targets: Entry<T>[], next: boolean) => {
    const labelChanges = Object.create(null) as Record<string, boolean>;
    const annotationChanges = Object.create(null) as Record<string, boolean>;
    for (const entry of targets) {
      if (entry.locked || entry.selected === next) continue;
      if (entry.kind === 'Fields') entry.column.toggleVisibility(next);
      else if (entry.kind === 'Labels') labelChanges[entry.key] = next;
      else annotationChanges[entry.key] = next;
    }
    if (Object.keys(labelChanges).length) setLabels(labelChanges);
    if (Object.keys(annotationChanges).length) setAnnotations(annotationChanges);
  };

  const canSelect = results.some((entry) => !entry.locked && !entry.selected);
  const canClear = results.some((entry) => !entry.locked && entry.selected);

  return (
    <Popover.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Popover.Trigger
        render={
          <Button variant="outline" color="neutral" size="sm" className={styles.trigger}>
            <LuColumns2 size={14} aria-hidden="true" />
            Columns
            <span className={styles.badge}>{selected.length}</span>
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12}>
          <Popover.Popup className={styles.popup} initialFocus={searchRef} finalFocus>
            <div className={styles.header}>
              <Popover.Title className={styles.title}>
                <LuColumns2 size={15} aria-hidden="true" />
                Columns
              </Popover.Title>
              <Popover.Close
                render={
                  <IconButton
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    aria-label="Close column picker"
                  >
                    <LuX size={15} aria-hidden="true" />
                  </IconButton>
                }
              />
            </div>
            <div className={styles.search}>
              <SearchInput
                ref={searchRef}
                size="sm"
                variant="outline"
                value={query}
                onValueChange={setQuery}
                placeholder="Search columns…"
                aria-label="Search all columns"
              />
            </div>
            <div className={styles.workspace}>
              <Tabs.Root
                className={styles.catalog}
                value={tab}
                onValueChange={(value) => setTab(value as Tab)}
                variant="flat"
                size="sm"
              >
                <Tabs.List className={styles.tabs} aria-label="Column groups">
                  {tabs.map((group) => (
                    <Tabs.Tab key={group} value={group} className={styles.tab}>
                      {group}
                      <span className={styles.count}>{counts[group]}</span>
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
                {tabs.map((group) => (
                  <Tabs.Panel key={group} value={group} className={styles.panel}>
                    {group === tab && (
                      <>
                        <div className={styles.listTools}>
                          <span role="status" aria-live="polite">
                            {search ? `${results.length} results` : ''}
                          </span>
                          <div className={styles.bulkActions}>
                            <Button
                              variant="ghost"
                              color="brand"
                              size="sm"
                              disabled={!canSelect}
                              onClick={() => setSelected(results, true)}
                            >
                              {search ? 'Select results' : 'Select all'}
                            </Button>
                            <Button
                              variant="ghost"
                              color="brand"
                              size="sm"
                              disabled={!canClear}
                              onClick={() => setSelected(results, false)}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                        <div className={styles.checklist} data-column-checklist>
                          {results.length ? (
                            results.map((entry) => (
                              <Checkbox
                                key={entry.id}
                                size="sm"
                                checked={entry.selected}
                                disabled={entry.locked}
                                aria-label={`${entry.name} (${entry.kind})${entry.locked ? ', required' : ''}`}
                                onCheckedChange={(checked) => {
                                  if (tab === 'Selected' && !checked) searchRef.current?.focus();
                                  setSelected([entry], checked);
                                }}
                                onKeyDown={moveChecklistFocus}
                                className={styles.checkRow}
                              >
                                <span className={styles.rowContent}>
                                  <EntryName name={entry.name} metadata={entry.kind !== 'Fields'} />
                                  {(search || tab === 'Selected') && (
                                    <span className={styles.kind}>{entry.kind}</span>
                                  )}
                                  {entry.locked && requiredMark}
                                </span>
                              </Checkbox>
                            ))
                          ) : (
                            <div className={styles.empty}>No results</div>
                          )}
                        </div>
                      </>
                    )}
                  </Tabs.Panel>
                ))}
              </Tabs.Root>
              <aside className={styles.selection} aria-label="Selected columns">
                <h3 className={styles.selectedTitle}>
                  Selected <span className={styles.badge}>{selected.length}</span>
                </h3>
                <ul className={styles.selectedList}>
                  {selected.map((entry) => (
                    <li key={entry.id} className={styles.selectedRow}>
                      <div className={styles.selectedName}>
                        <EntryName name={entry.name} metadata={entry.kind !== 'Fields'} />
                        {entry.kind !== 'Fields' && (
                          <span className={styles.selectedKind}>{entry.kind}</span>
                        )}
                      </div>
                      {entry.locked ? (
                        requiredMark
                      ) : (
                        <IconButton
                          variant="ghost"
                          color="neutral"
                          size="sm"
                          aria-label={`Remove ${entry.name} (${entry.kind})`}
                          onClick={() => {
                            searchRef.current?.focus();
                            setSelected([entry], false);
                          }}
                        >
                          <LuX size={13} aria-hidden="true" />
                        </IconButton>
                      )}
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
            <div className={styles.footer}>
              <Button variant="outline" color="neutral" size="sm" onClick={onReset}>
                Reset
              </Button>
              <Popover.Close render={<Button variant="solid" color="brand" size="sm" />}>
                Done
              </Popover.Close>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default ColumnPicker;
