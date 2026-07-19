import fs from 'node:fs';
import { upsertEntry } from '../storage/toml-store.js';

/** Marker the original .bash_inw writes as the first line of its save file. */
const LEGACY_HEADER = /^declare -a INW_CMDS\s*$/m;

/** `INW_CMDS[<index>]=<shell-quoted value>` */
const SLOT_LINE = /^INW_CMDS\[(\d+)\]=(.*)$/;

export interface MigrationResult {
  migrated: boolean;
  count?: number;
}

/**
 * True when `contents` is the bash-array format written by the old script.
 *
 * Detection is anchored to a line that is exactly the declare statement, not a
 * substring search: a saved command could legitimately contain the text
 * "declare -a INW_CMDS", and misreading a TOML file as legacy would overwrite
 * it.
 */
export function isLegacyFormat(contents: string): boolean {
  return LEGACY_HEADER.test(contents);
}

/**
 * Decode one value written by bash's `printf %q`.
 *
 * Bash picks its quoting style per value, so all of these appear in real save
 * files:
 *   - backslash-escaped (the common case):  echo\ hello
 *   - ANSI-C quoted (when control chars):   $'echo tab\there'
 *   - single or double quoted (other shells and older bash)
 *   - bare (nothing needed quoting):        plain
 */
export function unquoteShellValue(value: string): string {
  if (value.length === 0) return '';

  if (value.startsWith("$'") && value.endsWith("'")) {
    return decodeAnsiC(value.slice(2, -1));
  }

  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\$`])/g, '$1');
  }

  // Backslash-escaped: every backslash protects exactly the next character.
  return value.replace(/\\(.)/g, '$1');
}

/** Decode the escape sequences bash uses inside $'...'. */
function decodeAnsiC(body: string): string {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\' || i === body.length - 1) {
      out += body[i];
      continue;
    }

    const next = body[++i];
    switch (next) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case 'a': out += '\x07'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '0': out += '\0'; break;
      case 'e': out += '\x1b'; break;
      case '\\': out += '\\'; break;
      case "'": out += "'"; break;
      case '"': out += '"'; break;
      default: out += next; break;
    }
  }
  return out;
}

/**
 * Convert a legacy bash-array save file to TOML, once.
 *
 * Non-destructive: the original is copied to `<file>.bak` before anything is
 * written, and an existing backup is never overwritten (so re-running can't
 * clobber the only surviving copy of the original).
 *
 * Slots become aliases named after their index — digits carry no special
 * meaning in the new model, so slot 3 is simply an alias called "3".
 */
export function migrateGlobalScope(filePath: string): MigrationResult {
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { migrated: false };
  }

  if (!isLegacyFormat(contents)) {
    return { migrated: false };
  }

  if (!fs.existsSync(`${filePath}.bak`)) {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  }

  const entries: { alias: string; cmd: string }[] = [];
  for (const line of contents.split('\n')) {
    const match = SLOT_LINE.exec(line.trim());
    if (!match) continue;

    const cmd = unquoteShellValue(match[2]);
    if (cmd.length === 0) continue;

    entries.push({ alias: match[1], cmd });
  }

  // Drop the file so upsertEntry recreates it with the TOML header — the
  // legacy bash syntax must not survive alongside the converted entries.
  fs.rmSync(filePath);
  for (const entry of entries) {
    upsertEntry(filePath, entry);
  }

  return { migrated: true, count: entries.length };
}
