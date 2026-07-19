import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { ResolvedEntry } from '../../core/types.js';
import { theme } from '../../core/theme.js';
import { isMultiline } from '../../core/ui-utils.js';
import { SearchInput } from '../components/SearchInput.js';
import { CommandItem } from '../components/CommandItem.js';
import { useFilter } from '../hooks/useFilter.js';

export interface ListViewProps {
  entries: ResolvedEntry[];
  showScopeFlags: boolean;
  onRun: (entry: ResolvedEntry) => void;
  onDelete: (entry: ResolvedEntry) => void;
  onEdit: (entry: ResolvedEntry, next: string) => void;
  onCopy: (entry: ResolvedEntry) => { ok: boolean; reason?: string };
  /** Opens $EDITOR for multi-line entries. Injected so tests stay headless. */
  onEditExternal: (entry: ResolvedEntry) => string | null;
}

type Mode = 'browse' | 'confirmDelete' | 'edit';

export function ListView({
  entries: initialEntries,
  showScopeFlags,
  onRun,
  onDelete,
  onEdit,
  onCopy,
  onEditExternal,
}: ListViewProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState<ResolvedEntry | null>(null);
  const [mode, setMode] = useState<Mode>('browse');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const { exit } = useApp();

  const filtered = useFilter(entries, query);
  const current = focused ?? filtered[0] ?? null;

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 2500);
  };

  const items = filtered.map((entry) => ({
    // Alias alone is not unique — a collision shows both scopes as two rows.
    key: `${entry.scope}:${entry.alias}`,
    label: entry.alias,
    value: `${entry.scope}:${entry.alias}`,
    command: entry.cmd,
    scope: entry.scope,
    showScopeFlags,
  }));

  const byValue = (value: string) =>
    filtered.find((entry) => `${entry.scope}:${entry.alias}` === value) ?? null;

  useInput((input, key) => {
    if (mode === 'confirmDelete') {
      if (input.toLowerCase() === 'y' || key.return) {
        if (current) {
          onDelete(current);
          setEntries((previous) => previous.filter((entry) => entry !== current));
          flash(`Deleted ${current.alias} from ${current.scope}`);
        }
        setMode('browse');
      } else if (input.toLowerCase() === 'n' || key.escape) {
        setMode('browse');
      }
      return;
    }

    if (mode === 'edit') {
      if (key.escape) setMode('browse');
      return;
    }

    if (key.escape) {
      exit();
      return;
    }

    if (key.delete || key.backspace) {
      // Backspace belongs to the search box; only Delete removes an entry.
      if (key.delete && current) setMode('confirmDelete');
      return;
    }

    if (input === 'c' && current) {
      const result = onCopy(current);
      flash(result.ok ? `Copied ${current.alias}` : `Copy failed: ${result.reason}`);
      return;
    }

    if (input === 'e' && current) {
      if (isMultiline(current.cmd)) {
        // Multi-line does not fit the inline input, so hand off to $EDITOR.
        const next = onEditExternal(current);
        if (next !== null && next !== current.cmd) {
          onEdit(current, next);
          setEntries((previous) =>
            previous.map((entry) => (entry === current ? { ...entry, cmd: next } : entry)),
          );
          flash(`Updated ${current.alias}`);
        }
      } else {
        setDraft(current.cmd);
        setMode('edit');
      }
    }
  });

  const commitEdit = (next: string) => {
    if (current && next !== current.cmd) {
      onEdit(current, next);
      setEntries((previous) =>
        previous.map((entry) => (entry === current ? { ...entry, cmd: next } : entry)),
      );
      flash(`Updated ${current.alias}`);
    }
    setMode('browse');
  };

  return (
    <Box flexDirection="column" padding={1}>
      <SearchInput value={query} onChange={setQuery} focus={mode === 'browse'} />

      <Box marginTop={1} flexDirection="column">
        {status && (
          <Box borderStyle="single" borderColor="green" paddingX={1}>
            <Text color="green">{status}</Text>
          </Box>
        )}

        {mode === 'confirmDelete' && current ? (
          <Box borderStyle="round" borderColor="yellow" padding={1}>
            <Text>
              Delete <Text color="yellow">{current.alias}</Text> from{' '}
              <Text color="yellow">{current.scope}</Text> ({current.sourcePath})? [y/n]
            </Text>
          </Box>
        ) : mode === 'edit' && current ? (
          <Box flexDirection="column">
            <Text>
              Editing <Text color={theme.highlightColor}>{current.alias}</Text>{' '}
              <Text dimColor>({current.scope})</Text>
            </Text>
            <Box borderStyle="round" borderColor={theme.highlightColor} paddingX={1}>
              <TextInput value={draft} onChange={setDraft} onSubmit={commitEdit} focus={mode === 'edit'} />
            </Box>
          </Box>
        ) : entries.length === 0 ? (
          <Text color="yellow">No commands saved yet. Save one with: inw &lt;alias&gt; &lt;command&gt;</Text>
        ) : items.length === 0 ? (
          <Text color="yellow">No commands match &quot;{query}&quot;</Text>
        ) : (
          <SelectInput
            items={items}
            onSelect={(item) => {
              const entry = byValue(String(item.value));
              if (entry) {
                onRun(entry);
                exit();
              }
            }}
            onHighlight={(item) => setFocused(byValue(String(item.value)))}
            itemComponent={CommandItem as never}
          />
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {mode === 'edit'
            ? '[Enter] Save • [Esc] Cancel'
            : '[Enter] Run • [c] Copy • [e] Edit • [Del] Delete • [Esc] Exit'}
        </Text>
      </Box>
    </Box>
  );
}
