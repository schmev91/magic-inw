import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { patch as patchToml } from '@decimalturn/toml-patch';
import { CommandEntry } from '../core/types.js';

const HEADER = `# inw saved commands
# One table per alias. Edit by hand freely — inw preserves your comments,
# spacing, and ordering when it writes.
#
#   [deploy]
#   cmd = "./scripts/deploy.sh staging"
#   desc = "optional description"

`;

/** Thrown when a scope file exists but is not valid TOML. */
export class TomlParseError extends Error {
  constructor(readonly filePath: string, readonly cause: unknown) {
    super(
      `Could not parse ${filePath}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'TomlParseError';
  }
}

/**
 * Read a scope file into entries, preserving file order.
 *
 * A missing file reads as an empty list — an absent scope is not an error.
 * Malformed TOML *is* an error: swallowing it would make a syntax error look
 * like data loss, and would let a subsequent write silently clobber the file
 * the user was halfway through editing.
 */
export function readScope(filePath: string): CommandEntry[] {
  const raw = readIfExists(filePath);
  if (raw === null) return [];

  const data = parseFileContents(filePath, raw);
  const entries: CommandEntry[] = [];

  for (const [alias, table] of Object.entries(data)) {
    if (!isTable(table)) continue;
    const cmd = table.cmd;
    if (typeof cmd !== 'string') continue;

    const entry: CommandEntry = { alias, cmd };
    if (typeof table.desc === 'string') {
      entry.desc = table.desc;
    }
    entries.push(entry);
  }

  return entries;
}

/**
 * Create or update one alias, leaving the rest of the file untouched.
 *
 * Writes go through toml-patch rather than a stringify of parsed data: a
 * parse/stringify round trip rebuilds the document and destroys every comment
 * and blank line, which matters because these files are hand-edited and may be
 * committed.
 */
export function upsertEntry(filePath: string, entry: CommandEntry): void {
  const existing = readIfExists(filePath);
  const source = existing === null ? HEADER : existing;
  const data = parseFileContents(filePath, source);

  const table: Record<string, string> = { cmd: entry.cmd };
  if (entry.desc !== undefined) {
    table.desc = entry.desc;
  }

  writeAtomic(filePath, patchToml(source, { ...data, [entry.alias]: table }));
}

/** Remove one alias. No-op when the alias or the file is absent. */
export function deleteEntry(filePath: string, alias: string): void {
  const source = readIfExists(filePath);
  if (source === null) return;

  const data = parseFileContents(filePath, source);
  if (!(alias in data)) return;

  const { [alias]: _removed, ...rest } = data;
  writeAtomic(filePath, patchToml(source, rest));
}

function readIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

function parseFileContents(filePath: string, raw: string): Record<string, unknown> {
  try {
    return parseToml(raw) as Record<string, unknown>;
  } catch (err) {
    throw new TomlParseError(filePath, err);
  }
}

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Write via temp file + rename so an interrupted write cannot truncate a file
 * the user may have hand-authored.
 */
function writeAtomic(filePath: string, contents: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}
