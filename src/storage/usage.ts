import fs from 'node:fs';
import path from 'node:path';
import { Scope } from '../core/types.js';

/** alias-with-scope -> ISO timestamp of last use. */
export type UsageMap = Record<string, string>;

type Env = Record<string, string | undefined>;

/**
 * Key for one entry.
 *
 * Scoped so a project `test` and a global `test` track their recency
 * independently — they are different commands that happen to share a name.
 */
export function usageKey(scope: Scope, alias: string): string {
  return `${scope}:${alias}`;
}

/**
 * Location of the usage sidecar.
 *
 * This is *state*, not config: it is derived, machine-local, and disposable,
 * so it lives under XDG_STATE_HOME rather than alongside the scope files. That
 * keeps per-user churn out of a project file that may be committed.
 */
export function usageFilePath(env: Env = process.env): string {
  const stateHome = env.XDG_STATE_HOME?.trim()
    ? env.XDG_STATE_HOME
    : path.join(env.HOME ?? '', '.local', 'state');
  return path.join(stateHome, 'inw', 'usage.json');
}

/**
 * Read the usage map.
 *
 * Every failure mode degrades to an empty map. Usage data only affects sort
 * order, so a corrupt sidecar should cost the user their ordering, never their
 * ability to run a command.
 */
export function readUsage(env: Env = process.env): UsageMap {
  let raw: string;
  try {
    raw = fs.readFileSync(usageFilePath(env), 'utf8');
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  const usage: UsageMap = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      usage[key] = value;
    }
  }
  return usage;
}

/**
 * Record that an entry was just used.
 *
 * Never throws: this runs alongside the command the user actually asked for,
 * and an unwritable state directory must not take that command down with it.
 */
export function recordUse(scope: Scope, alias: string, env: Env = process.env): void {
  try {
    const usage = readUsage(env);
    usage[usageKey(scope, alias)] = new Date().toISOString();

    const file = usageFilePath(env);
    fs.mkdirSync(path.dirname(file), { recursive: true });

    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(usage, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } catch {
    // Derived data. Losing it is not worth failing the user's command.
  }
}

/**
 * Sort entries most-recently-used first (plan KTD5).
 *
 * Never-used entries keep their original file order and sort after every used
 * entry, so hand-ordering a scope file still means something for the tail.
 */
export function sortByRecency<T extends { alias: string; scope: Scope }>(
  entries: T[],
  usage: UsageMap,
): T[] {
  return entries
    .map((entry, index) => ({ entry, index, used: usage[usageKey(entry.scope, entry.alias)] }))
    .sort((a, b) => {
      if (a.used && b.used) {
        const diff = new Date(b.used).getTime() - new Date(a.used).getTime();
        return diff !== 0 ? diff : a.index - b.index;
      }
      if (a.used) return -1;
      if (b.used) return 1;
      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}
