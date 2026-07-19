import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Open text in the user's editor and return what they saved.
 *
 * Used for multi-line commands, which the inline single-line input cannot
 * represent. Returns null when the editor exits non-zero, so an aborted edit
 * (`:cq` in vim) leaves the stored command untouched.
 *
 * stdio is inherited so the editor takes over the terminal. The caller is
 * responsible for unmounting Ink first — otherwise Ink and the editor fight
 * over the same screen.
 */
export function editInEditor(initial: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const editor = env.VISUAL || env.EDITOR || 'vi';
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inw-edit-')), 'command.sh');

  try {
    fs.writeFileSync(file, initial);
    const result = spawnSync(editor, [file], { stdio: 'inherit' });

    if (result.error || result.status !== 0) return null;

    // Editors commonly add a trailing newline; it is not part of the command.
    return fs.readFileSync(file, 'utf8').replace(/\n$/, '');
  } catch {
    return null;
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}
