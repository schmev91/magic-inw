import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ResolvedEntry } from '../../core/types.js';
import { theme } from '../../core/theme.js';
import { isMultiline } from '../../core/ui-utils.js';
import { deleteCharBefore, deleteWordBefore, printableInput } from '../../core/text-edit.js';
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
  /** Rows visible at once before the list scrolls. */
  pageSize?: number;
}

type Mode = 'browse' | 'confirmDelete' | 'edit';

/**
 * The picker owns ALL key handling.
 *
 * Every third-party input component conflicts with a search-as-you-type list:
 * ink-text-input inserts characters even when key.ctrl is set, and
 * ink-select-input treats plain j/k as navigation, so typing "jest" would jump
 * the selection. Both are replaced with local handling so there is exactly one
 * useInput and each key has one meaning.
 */
export function ListView({
  entries: initialEntries,
  showScopeFlags,
  onRun,
  onDelete,
  onEdit,
  onCopy,
  onEditExternal,
  pageSize = 10,
}: ListViewProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<Mode>('browse');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const { exit } = useApp();

  const filtered = useFilter(entries, query);
  const index = Math.min(selected, Math.max(filtered.length - 1, 0));
  const current = filtered[index] ?? null;

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 2500);
  };

  const search = (next: string) => {
    setQuery(next);
    setSelected(0);
  };

  const applyEdit = (entry: ResolvedEntry, next: string) => {
    if (next === entry.cmd) return;
    onEdit(entry, next);
    setEntries((previous) =>
      previous.map((candidate) => (candidate === entry ? { ...candidate, cmd: next } : candidate)),
    );
    flash(`Updated ${entry.alias}`);
  };

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
      if (key.escape) {
        setMode('browse');
      } else if (key.return) {
        if (current) applyEdit(current, draft);
        setMode('browse');
      } else if (key.ctrl && input === 'u') {
        setDraft('');
      } else if ((key.ctrl && input === 'w') || (key.meta && (key.backspace || key.delete))) {
        setDraft(deleteWordBefore(draft));
      } else if (key.backspace || key.delete) {
        setDraft(deleteCharBefore(draft));
      } else {
        const text = printableInput(input, key);
        if (text) setDraft(draft + text);
      }
      return;
    }

    // --- browse mode ---

    if (key.escape) {
      exit();
      return;
    }

    if (key.return) {
      if (current) {
        onRun(current);
        exit();
      }
      return;
    }

    if (key.upArrow) {
      setSelected((previous) => Math.max(previous - 1, 0));
      return;
    }

    if (key.downArrow) {
      setSelected((previous) => Math.min(previous + 1, Math.max(filtered.length - 1, 0)));
      return;
    }

    if (key.ctrl) {
      switch (input) {
        case 'u':
          search('');
          return;
        case 'w':
          search(deleteWordBefore(query));
          return;
        case 'y':
          if (current) {
            const result = onCopy(current);
            flash(result.ok ? `Copied ${current.alias}` : `Copy failed: ${result.reason}`);
          }
          return;
        case 'e':
          if (current) {
            if (isMultiline(current.cmd)) {
              // Multi-line does not fit a single-line editor, so hand off.
              const next = onEditExternal(current);
              if (next !== null) applyEdit(current, next);
            } else {
              setDraft(current.cmd);
              setMode('edit');
            }
          }
          return;
        case 'x':
          if (current) setMode('confirmDelete');
          return;
        default:
          // Any other Ctrl combo is ignored rather than typed into the query.
          return;
      }
    }

    // Alt+Backspace deletes a word. Terminals encode Backspace as either \x7f
    // or \x08, which ink surfaces as `delete` and `backspace` respectively —
    // both must be handled or the binding works on some terminals only.
    if (key.meta && (key.backspace || key.delete)) {
      search(deleteWordBefore(query));
      return;
    }

    // Ink cannot distinguish Backspace from Delete (both arrive as `delete`),
    // so both edit the query. Removing an entry is Ctrl+X for that reason.
    if (key.backspace || key.delete) {
      search(deleteCharBefore(query));
      return;
    }

    const text = printableInput(input, key);
    if (text) search(query + text);
  });

  // Scroll window that keeps the selection visible.
  const start = Math.max(0, Math.min(index - Math.floor(pageSize / 2), filtered.length - pageSize));
  const visible = filtered.slice(Math.max(start, 0), Math.max(start, 0) + pageSize);
  const hiddenAbove = Math.max(start, 0);
  const hiddenBelow = filtered.length - hiddenAbove - visible.length;

  return (
    <Box flexDirection="column" padding={1}>
      <SearchInput value={query} />

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
              <Text>
                {draft}
                <Text inverse> </Text>
              </Text>
            </Box>
          </Box>
        ) : entries.length === 0 ? (
          <Text color="yellow">No commands saved yet. Save one with: inw &lt;alias&gt; &lt;command&gt;</Text>
        ) : filtered.length === 0 ? (
          <Text color="yellow">No commands match &quot;{query}&quot;</Text>
        ) : (
          <Box flexDirection="column">
            {hiddenAbove > 0 && <Text dimColor>  ↑ {hiddenAbove} more</Text>}
            {visible.map((entry, offset) => {
              const isSelected = hiddenAbove + offset === index;
              return (
                <Box key={`${entry.scope}:${entry.alias}`} flexDirection="row">
                  <Text color={isSelected ? theme.highlightColor : undefined}>
                    {isSelected ? '❯ ' : '  '}
                  </Text>
                  <CommandItem
                    label={entry.alias}
                    command={entry.cmd}
                    scope={entry.scope}
                    showScopeFlags={showScopeFlags}
                    isSelected={isSelected}
                  />
                </Box>
              );
            })}
            {hiddenBelow > 0 && <Text dimColor>  ↓ {hiddenBelow} more</Text>}
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {mode === 'edit'
            ? '[Enter] Save • [Esc] Cancel • [^W] Delete word • [^U] Clear'
            : '[Enter] Run • [^Y] Copy • [^E] Edit • [^X] Delete • [^W] Delete word • [Esc] Exit'}
        </Text>
      </Box>
    </Box>
  );
}
