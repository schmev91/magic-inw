import React from 'react';
import { render } from 'ink';
import { ResolvedEntry } from '../core/types.js';
import { upsertEntry, deleteEntry } from '../storage/toml-store.js';
import { copyToClipboard } from '../core/clipboard.js';
import { editInEditor } from '../core/editor.js';
import { collapseCommand } from '../core/ui-utils.js';
import { ListView } from './views/ListView.js';

export interface LaunchOptions {
  entries: ResolvedEntry[];
  /** Only true when a project scope is active — gates the [p]/[g] column. */
  showScopeFlags: boolean;
}

/**
 * Show the picker and return the entry the user chose, or null if they quit.
 *
 * The chosen command is deliberately NOT run here. Running it can write the
 * exec signal and call process.exit, and doing that from inside the render
 * tree tears down Ink mid-frame and can leave the terminal in raw mode. The
 * UI decides; the caller acts once Ink has fully unmounted.
 */
export async function launchUI({
  entries,
  showScopeFlags,
}: LaunchOptions): Promise<ResolvedEntry | null> {
  // The picker needs raw mode, which needs a TTY. Piped or scripted stdin
  // would otherwise crash inside ink-text-input with a React stack trace, so
  // fall back to listing the commands the way the old `ina` did.
  if (!process.stdin.isTTY) {
    listEntries(entries, showScopeFlags);
    return null;
  }

  let chosen: ResolvedEntry | null = null;

  const { waitUntilExit } = render(
    <ListView
      entries={entries}
      showScopeFlags={showScopeFlags}
      onRun={(entry) => {
        chosen = entry;
      }}
      onDelete={(entry) => deleteEntry(entry.sourcePath, entry.alias)}
      onEdit={(entry, next) => upsertEntry(entry.sourcePath, { ...entry, cmd: next })}
      onCopy={(entry) => copyToClipboard(entry.cmd)}
      onEditExternal={(entry) => editInEditor(entry.cmd)}
    />,
    {
      // Ink renders to stderr because stdout is the reserved exec channel —
      // a frame written there would be eval'd by the shell wrapper.
      stdout: process.stderr,
      patchConsole: false,
    },
  );

  await waitUntilExit();
  return chosen;
}

/** Plain-text listing for non-interactive stdin. */
function listEntries(entries: ResolvedEntry[], showScopeFlags: boolean): void {
  if (entries.length === 0) {
    process.stderr.write('No commands saved yet. Save one with: inw <alias> <command>\n');
    return;
  }

  process.stderr.write('Saved commands:\n');
  for (const entry of entries) {
    const flag = showScopeFlags ? (entry.scope === 'project' ? '[p] ' : '[g] ') : '';
    process.stderr.write(`  ${flag}${entry.alias.padEnd(18)} ${collapseCommand(entry.cmd)}\n`);
  }
}
