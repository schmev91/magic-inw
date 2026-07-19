import { useMemo } from 'react';
import { ResolvedEntry } from '../../core/types.js';

/**
 * Case-insensitive substring match across the alias AND the full command body.
 *
 * Matching the body is the point: it is how you find a command you saved
 * months ago under a name you no longer remember. The match runs against the
 * whole command, including continuation lines that the list row collapses
 * away.
 */
export function filterEntries(entries: ResolvedEntry[], query: string): ResolvedEntry[] {
  if (!query) return entries;
  const needle = query.toLowerCase();

  return entries.filter(
    (entry) =>
      entry.alias.toLowerCase().includes(needle) ||
      entry.cmd.toLowerCase().includes(needle) ||
      (entry.desc?.toLowerCase().includes(needle) ?? false),
  );
}

export function useFilter(entries: ResolvedEntry[], query: string): ResolvedEntry[] {
  return useMemo(() => filterEntries(entries, query), [entries, query]);
}
