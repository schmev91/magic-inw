import { CommandEntry, ResolvedEntry, Resolution, Scope } from './types.js';

/** The two scope files, either of which may be absent. */
export interface ScopeSources {
  project: { path: string; entries: CommandEntry[] } | null;
  global: { path: string; entries: CommandEntry[] };
}

export type LookupScope = Scope | 'any';

export type LookupResult =
  | { found: true; resolution: Resolution }
  | { found: false; reason: string };

/** All entries from both scopes, project first, tagged with their origin. */
export function allEntries(sources: ScopeSources): ResolvedEntry[] {
  const tag = (scope: Scope, path: string, entries: CommandEntry[]): ResolvedEntry[] =>
    entries.map((entry) => ({ ...entry, scope, sourcePath: path }));

  return [
    ...(sources.project ? tag('project', sources.project.path, sources.project.entries) : []),
    ...tag('global', sources.global.path, sources.global.entries),
  ];
}

/** True when a project scope is active, which is what gates the [p]/[g] flags. */
export function hasProjectScope(sources: ScopeSources): boolean {
  return sources.project !== null;
}

/**
 * Resolve an alias.
 *
 * Unscoped lookups let project shadow global, the way PATH and .gitignore
 * work. Explicit `-p` / `-g` never fall back — the point of naming a scope is
 * to be certain which command runs, so a miss is an error rather than a
 * silent hop to the other file.
 */
export function lookup(sources: ScopeSources, alias: string, scope: LookupScope = 'any'): LookupResult {
  const inProject = sources.project
    ? find(sources.project.entries, alias, 'project', sources.project.path)
    : undefined;
  const inGlobal = find(sources.global.entries, alias, 'global', sources.global.path);

  if (scope === 'project') {
    if (!sources.project) {
      return {
        found: false,
        reason: `No project scope here. Create one with: inw -p ${alias} <command>`,
      };
    }
    if (!inProject) {
      return {
        found: false,
        reason: `"${alias}" is not in this project's scope (${sources.project.path}).`,
      };
    }
    return { found: true, resolution: { entry: inProject } };
  }

  if (scope === 'global') {
    if (!inGlobal) {
      return { found: false, reason: `"${alias}" is not in your global commands.` };
    }
    return { found: true, resolution: { entry: inGlobal } };
  }

  if (inProject) {
    // Report the shadow so the user is never guessing which one ran.
    return { found: true, resolution: { entry: inProject, shadowed: inGlobal } };
  }
  if (inGlobal) {
    return { found: true, resolution: { entry: inGlobal } };
  }

  const searched = sources.project ? 'this project or your global commands' : 'your global commands';
  return { found: false, reason: `"${alias}" is not saved in ${searched}.` };
}

function find(
  entries: CommandEntry[],
  alias: string,
  scope: Scope,
  sourcePath: string,
): ResolvedEntry | undefined {
  const entry = entries.find((candidate) => candidate.alias === alias);
  return entry ? { ...entry, scope, sourcePath } : undefined;
}
