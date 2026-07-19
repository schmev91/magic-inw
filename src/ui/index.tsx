import { ResolvedEntry } from '../core/types.js';

export interface LaunchOptions {
  entries: ResolvedEntry[];
  /** Only true when a project scope is active — gates the [p]/[g] column. */
  showScopeFlags: boolean;
  onRun: (entry: ResolvedEntry) => void;
}

/** Replaced by the Ink picker in U9. */
export async function launchUI(_options: LaunchOptions): Promise<void> {
  process.stderr.write('inw: picker not yet implemented\n');
}
