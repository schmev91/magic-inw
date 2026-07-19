/** Which storage a command came from. */
export type Scope = 'project' | 'global';

/** A saved command as it appears in a scope file. */
export interface CommandEntry {
  alias: string;
  cmd: string;
  desc?: string;
}

/** A command entry plus the scope it was resolved from. */
export interface ResolvedEntry extends CommandEntry {
  scope: Scope;
  /** Absolute path of the file this entry lives in. */
  sourcePath: string;
}

/** Result of resolving an alias across scopes. */
export interface Resolution {
  /** The entry that wins under the precedence rules. */
  entry: ResolvedEntry;
  /**
   * An entry with the same alias that lost to `entry`. Present only when a
   * project entry shadowed a global one on an unscoped lookup.
   */
  shadowed?: ResolvedEntry;
}

/** A validation outcome that explains itself when it fails. */
export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };
