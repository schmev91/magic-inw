import fs from 'node:fs';
import path from 'node:path';

/** Filename that marks a directory as an inw project scope. */
export const PROJECT_FILENAME = '.inw_commands';

/** Default filename for the global scope, relative to $HOME. */
export const GLOBAL_FILENAME = '.inw_saved_commands';

/**
 * Walk up from `startDir` looking for the nearest project scope file.
 *
 * Only the nearest one loads — ancestors above it are ignored, so exactly one
 * project scope is ever active. The walk stops *exclusively* at `homeDir`: a
 * scope file sitting directly in $HOME is not a project scope, because it
 * would shadow-duplicate the global file for every directory the user visits.
 *
 * When `startDir` is outside $HOME entirely, the walk runs to the filesystem
 * root instead, so a scope file in e.g. /srv/app is still found.
 *
 * `startDir` and `homeDir` are parameters rather than reads of `process.cwd()`
 * and `os.homedir()` so tests can drive real directory trees without mocking
 * the filesystem.
 *
 * @returns absolute path of the scope file, or null when there is none.
 */
export function findProjectScope(startDir: string, homeDir: string): string | null {
  const home = path.resolve(homeDir);
  let current = path.resolve(startDir);

  while (true) {
    // $HOME itself is never a project scope — stop before testing it.
    if (current === home) {
      return null;
    }

    const candidate = path.join(current, PROJECT_FILENAME);
    if (isFile(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // Reached the filesystem root.
      return null;
    }
    current = parent;
  }
}

/**
 * Absolute path of the global scope file.
 */
export function globalScopePath(homeDir: string): string {
  return path.join(path.resolve(homeDir), GLOBAL_FILENAME);
}

/**
 * True when the path exists and is a regular file.
 *
 * A directory named `.inw_commands` is not a scope — treating it as one would
 * surface an unreadable "scope" and fail confusingly later.
 */
function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}
