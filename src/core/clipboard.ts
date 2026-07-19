import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ClipboardCommand {
  bin: string;
  args: string[];
}

export type ClipboardResolution =
  | { ok: true; command: ClipboardCommand }
  | { ok: false; reason: string };

/**
 * Clipboard tools in probe order.
 *
 * clip.exe comes first because on WSL the Linux X tools are often installed
 * but not connected to the Windows clipboard the user is actually looking at.
 *
 * The selection arguments matter: a bare `xclip` or `xsel` writes to the
 * PRIMARY selection, which the user experiences as the copy silently failing.
 */
export const CLIPBOARD_CANDIDATES: ClipboardCommand[] = [
  { bin: 'clip.exe', args: [] },
  { bin: 'pbcopy', args: [] },
  { bin: 'wl-copy', args: [] },
  { bin: 'xclip', args: ['-selection', 'clipboard'] },
  { bin: 'xsel', args: ['--clipboard', '--input'] },
];

/** Whether a binary exists on PATH. */
export type ProbeFn = (bin: string) => boolean;

/**
 * Look for `bin` on PATH by scanning directories directly.
 *
 * Deliberately not `spawnSync('command -v', { shell: true })`: passing args
 * with `shell: true` is deprecated in Node 24 and emits a warning on *stderr*,
 * which is exactly where the Ink UI renders. A stray warning would corrupt the
 * display. Scanning PATH is also faster and involves no subprocess at all.
 */
const defaultProbe: ProbeFn = (bin) => {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return dirs.some((dir) => {
    try {
      fs.accessSync(path.join(dir, bin), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
};

let cached: ClipboardResolution | null = null;

/**
 * Find an available clipboard tool.
 *
 * `probe` is injectable so tests do not depend on what happens to be installed
 * on the host running them.
 */
export function resolveClipboardCommand(probe: ProbeFn = defaultProbe): ClipboardResolution {
  for (const command of CLIPBOARD_CANDIDATES) {
    if (probe(command.bin)) {
      return { ok: true, command };
    }
  }

  return {
    ok: false,
    reason: `No clipboard tool found. Install one of: ${CLIPBOARD_CANDIDATES.map((c) => c.bin).join(', ')}.`,
  };
}

/**
 * Copy text to the system clipboard.
 *
 * Resolution is cached for the process lifetime — the answer cannot change
 * mid-run, and probing five binaries on every keystroke would be wasteful.
 */
export function copyToClipboard(text: string): { ok: true } | { ok: false; reason: string } {
  cached ??= resolveClipboardCommand();
  if (!cached.ok) return cached;

  const { bin, args } = cached.command;
  const result = spawnSync(bin, args, { input: text });

  if (result.error) {
    return { ok: false, reason: `${bin} failed: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return { ok: false, reason: `${bin} exited with status ${result.status}` };
  }
  return { ok: true };
}

/** Test seam: forget the cached resolution. */
export function resetClipboardCache(): void {
  cached = null;
}
