/** Marker appended to a collapsed multi-line command in the list. */
export const CONTINUATION_MARKER = ' ↵';

/** Truncate at the end with an ellipsis when longer than maxLength. */
export function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3)}...`;
}

/** True when the command spans more than one line. */
export function isMultiline(command: string): boolean {
  return command.includes('\n');
}

/**
 * Render a command for a single list row.
 *
 * Multi-line commands collapse to their first line plus a marker, so the list
 * stays one-row-per-entry while still signalling there is more to see.
 */
export function collapseCommand(command: string): string {
  if (!isMultiline(command)) return command;
  const [first] = command.split('\n');
  return `${first}${CONTINUATION_MARKER}`;
}
