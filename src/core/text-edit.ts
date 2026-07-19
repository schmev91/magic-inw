/**
 * Pure text-buffer edits for the search box and inline editor.
 *
 * The picker manages its own input rather than delegating to ink-text-input,
 * because that component inserts any character it receives — including ones
 * with key.ctrl set — which makes a Ctrl-based keymap impossible and lets
 * action keys corrupt the search query.
 */

/** Remove the character before the cursor (cursor is always at the end). */
export function deleteCharBefore(value: string): string {
  return value.slice(0, -1);
}

/**
 * Remove the word before the cursor, readline-style.
 *
 * Trailing whitespace goes first, then the run of non-whitespace before it, so
 * "npm run " and "npm run" both collapse to "npm ".
 */
export function deleteWordBefore(value: string): string {
  const trimmed = value.replace(/\s+$/, '');
  if (trimmed.length === 0) return '';

  const lastBoundary = trimmed.search(/\S+$/);
  return lastBoundary === -1 ? '' : trimmed.slice(0, lastBoundary);
}

/**
 * The printable portion of a keypress, or '' when there is none.
 *
 * Ink reports the raw letter for Ctrl combos (Ctrl+W arrives as "w" with
 * key.ctrl set), so modifiers must be checked explicitly — testing the string
 * alone would type a "w" every time the user asked to delete a word.
 */
export function printableInput(
  input: string,
  key: { ctrl?: boolean; meta?: boolean; return?: boolean; escape?: boolean; tab?: boolean },
): string {
  if (key.ctrl || key.meta || key.return || key.escape || key.tab) return '';

  // Strip control characters; a paste can arrive as one multi-character chunk.
  const printable = [...input].filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 0x20 && code !== 0x7f;
  });

  return printable.join('');
}
