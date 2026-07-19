import os from 'node:os';
import path from 'node:path';
import { splitArgv, applyPassthrough } from './cli/argv.js';
import { buildCli } from './cli/index.js';
import { validateAlias } from './core/grammar.js';
import { findProjectScope, globalScopePath } from './core/scope.js';
import { migrateGlobalScope } from './core/migrate.js';
import { lookup, allEntries, hasProjectScope, ScopeSources, LookupScope } from './core/resolve.js';
import { readScope, upsertEntry, TomlParseError } from './storage/toml-store.js';
import { recordUse, readUsage, sortByRecency } from './storage/usage.js';
import { Scope } from './core/types.js';
import {
  writeExecSignal,
  isWrapped,
  reportUnwrapped,
  logError,
  logSuccess,
  logWarning,
  logNote,
  bold,
} from './core/output.js';
import { launchUI } from './ui/index.js';

export async function main(): Promise<void> {
  const { head, passthrough } = splitArgv(process.argv.slice(2));
  const cli = buildCli(head);
  const { input, flags } = cli;

  if (flags.project && flags.global) {
    logError('Use either -p or -g, not both.');
    process.exit(1);
  }

  const home = os.homedir();
  const globalPath = globalScopePath(home);

  // One-time import of the old bash-array format.
  const migration = migrateGlobalScope(globalPath);
  if (migration.migrated) {
    logSuccess(`Migrated ${migration.count} command(s) from the old format.`);
    logNote(`  Backup: ${globalPath}.bak`);
  }

  const sources = loadScopes(globalPath, process.cwd(), home);

  // No alias: open the picker.
  if (input.length === 0) {
    const entries = sortByRecency(allEntries(sources), readUsage());
    const chosen = await launchUI({
      entries,
      showScopeFlags: hasProjectScope(sources),
    });

    // Run only after Ink has unmounted — see launchUI.
    if (chosen) {
      runCommand(chosen.cmd, chosen.scope, chosen.alias, passthrough);
    }
    return;
  }

  const alias = input[0];
  const validation = validateAlias(alias);
  if (!validation.ok) {
    logError(validation.reason);
    process.exit(1);
  }

  const scopeFlag: LookupScope = flags.project ? 'project' : flags.global ? 'global' : 'any';

  // Two or more tokens: save.
  if (input.length > 1) {
    saveCommand(alias, input.slice(1).join(' '), scopeFlag, sources, globalPath);
    return;
  }

  // One token: run.
  const result = lookup(sources, alias, scopeFlag);
  if (!result.found) {
    logError(result.reason);
    process.exit(1);
  }

  const { entry, shadowed } = result.resolution;
  if (shadowed) {
    logNote(`(project) shadows a global "${alias}"`);
  }
  runCommand(entry.cmd, entry.scope, entry.alias, passthrough);
}

function loadScopes(globalPath: string, cwd: string, home: string): ScopeSources {
  const projectPath = findProjectScope(cwd, home);

  return {
    project: projectPath ? { path: projectPath, entries: readScopeSafely(projectPath) } : null,
    global: { path: globalPath, entries: readScopeSafely(globalPath) },
  };
}

/**
 * Read a scope, reporting a parse error rather than silently treating a
 * malformed file as empty — which would look like data loss.
 */
function readScopeSafely(filePath: string) {
  try {
    return readScope(filePath);
  } catch (err) {
    if (err instanceof TomlParseError) {
      logWarning(err.message);
      logNote('  That scope is unavailable until the syntax error is fixed.');
      return [];
    }
    throw err;
  }
}

function saveCommand(
  alias: string,
  command: string,
  scopeFlag: LookupScope,
  sources: ScopeSources,
  globalPath: string,
): void {
  // Saving defaults to global; -p targets the project, creating the file here.
  const target: Scope = scopeFlag === 'project' ? 'project' : 'global';
  const targetPath =
    target === 'project'
      ? (sources.project?.path ?? path.join(process.cwd(), '.inw_commands'))
      : globalPath;

  try {
    upsertEntry(targetPath, { alias, cmd: command });
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  logSuccess(`Saved ${bold(alias)} to ${target}`);
  logNote(`  ${targetPath}`);

  // The save/exec asymmetry's named mitigation: a global save that a project
  // entry shadows would otherwise look like it did nothing.
  if (target === 'global') {
    const shadowing = sources.project?.entries.find((entry) => entry.alias === alias);
    if (shadowing) {
      logWarning(`This project also defines "${alias}", so it stays shadowed.`);
      logNote(`  inw ${alias}  still runs:  ${shadowing.cmd}`);
      logNote(`  inw -g ${alias}  runs what you just saved.`);
    }
  }
}

function runCommand(
  command: string,
  scope: Scope,
  alias: string,
  passthrough: string[] | null,
): void {
  const final = applyPassthrough(command, passthrough);
  recordUse(scope, alias);

  if (!isWrapped()) {
    reportUnwrapped(final);
    process.exit(1);
  }

  writeExecSignal(final);
}
