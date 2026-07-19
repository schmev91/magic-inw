import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unquoteShellValue, isLegacyFormat, migrateGlobalScope } from '../../src/core/migrate.js';
import { readScope } from '../../src/storage/toml-store.js';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'legacy_saved_commands',
);

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inw-migrate-'));
  file = path.join(dir, '.inw_saved_commands');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('unquoteShellValue', () => {
  // These pairs come from running bash's own `printf %q` — see
  // tests/fixtures/legacy_saved_commands. Bash backslash-escapes by default
  // and only falls back to $'...' when the value contains control characters.
  it.each([
    ['echo\\ hello', 'echo hello'],
    ['cd\\ /tmp\\ \\&\\&\\ ls\\ -la', 'cd /tmp && ls -la'],
    ["echo\\ \\'single\\'\\ \\\"double\\\"\\ \\$USER", `echo 'single' "double" $USER`],
    ['npm\\ run\\ build', 'npm run build'],
    ['plain', 'plain'],
  ])('decodes backslash-escaped %p', (quoted, expected) => {
    expect(unquoteShellValue(quoted)).toBe(expected);
  });

  it('decodes the awk case with an escaped dollar inside double quotes', () => {
    const quoted = 'awk\\ \\"\\{print\\ \\\\\\$1\\}\\"\\ f.txt\\ \\|\\ grep\\ -v\\ \\"\\^#\\"';
    expect(unquoteShellValue(quoted)).toBe('awk "{print \\$1}" f.txt | grep -v "^#"');
  });

  it.each([
    ["$'echo tab\\there'", 'echo tab\there'],
    ["$'a\\nb'", 'a\nb'],
    ["$'a\\tb\\nc'", 'a\tb\nc'],
    ["$'it\\'s'", "it's"],
    ["$'back\\\\slash'", 'back\\slash'],
    ["$'carriage\\rreturn'", 'carriage\rreturn'],
  ])('decodes ANSI-C quoted %p', (quoted, expected) => {
    expect(unquoteShellValue(quoted)).toBe(expected);
  });

  it('decodes the multi-control-character fixture value', () => {
    expect(unquoteShellValue("$'echo tab\\there\\nand newline'")).toBe('echo tab\there\nand newline');
  });

  it('decodes single-quoted values', () => {
    expect(unquoteShellValue("'echo hello'")).toBe('echo hello');
  });

  it('decodes double-quoted values', () => {
    expect(unquoteShellValue('"echo hello"')).toBe('echo hello');
  });

  it('leaves an empty value empty', () => {
    expect(unquoteShellValue('')).toBe('');
  });
});

describe('isLegacyFormat', () => {
  it('detects the declare line the original script writes', () => {
    expect(isLegacyFormat(fs.readFileSync(FIXTURE, 'utf8'))).toBe(true);
  });

  it('does not treat hand-written TOML as legacy', () => {
    expect(isLegacyFormat('[deploy]\ncmd = "./deploy.sh"\n')).toBe(false);
  });

  it('does not treat TOML mentioning INW_CMDS in a command as legacy', () => {
    // A saved command could legitimately reference the old variable name.
    expect(isLegacyFormat('[old]\ncmd = "echo declare -a INW_CMDS"\n')).toBe(false);
  });

  it('does not treat an empty file as legacy', () => {
    expect(isLegacyFormat('')).toBe(false);
  });
});

describe('migrateGlobalScope', () => {
  const installFixture = () => fs.copyFileSync(FIXTURE, file);

  it('converts every populated slot to an alias named after its index', () => {
    installFixture();
    migrateGlobalScope(file);

    expect(readScope(file).map((e) => e.alias)).toEqual(['0', '1', '3', '5', '7', '9']);
  });

  it('skips absent slots rather than writing empty aliases', () => {
    installFixture();
    migrateGlobalScope(file);
    const aliases = readScope(file).map((e) => e.alias);

    expect(aliases).not.toContain('2');
    expect(aliases).not.toContain('4');
    expect(aliases).toHaveLength(6);
  });

  it('preserves values containing quotes and dollar signs', () => {
    installFixture();
    migrateGlobalScope(file);
    const byAlias = Object.fromEntries(readScope(file).map((e) => [e.alias, e.cmd]));

    expect(byAlias['0']).toBe('echo hello');
    expect(byAlias['1']).toBe('cd /tmp && ls -la');
    expect(byAlias['3']).toBe(`echo 'single' "double" $USER`);
    expect(byAlias['7']).toBe('awk "{print \\$1}" f.txt | grep -v "^#"');
    expect(byAlias['9']).toBe('npm run build');
  });

  it('decodes control characters into a real multi-line command', () => {
    installFixture();
    migrateGlobalScope(file);
    const byAlias = Object.fromEntries(readScope(file).map((e) => [e.alias, e.cmd]));

    expect(byAlias['5']).toBe('echo tab\there\nand newline');
  });

  it('writes a backup before modifying anything', () => {
    installFixture();
    const before = fs.readFileSync(file, 'utf8');
    migrateGlobalScope(file);

    expect(fs.readFileSync(`${file}.bak`, 'utf8')).toBe(before);
  });

  it('reports that it migrated', () => {
    installFixture();
    expect(migrateGlobalScope(file)).toEqual({ migrated: true, count: 6 });
  });

  it('is idempotent — a second run is a no-op', () => {
    installFixture();
    migrateGlobalScope(file);
    const afterFirst = fs.readFileSync(file, 'utf8');

    expect(migrateGlobalScope(file)).toEqual({ migrated: false });
    expect(fs.readFileSync(file, 'utf8')).toBe(afterFirst);
  });

  it('does not overwrite an existing backup on a second run', () => {
    installFixture();
    migrateGlobalScope(file);
    const backup = fs.readFileSync(`${file}.bak`, 'utf8');
    migrateGlobalScope(file);

    expect(fs.readFileSync(`${file}.bak`, 'utf8')).toBe(backup);
  });

  it('leaves a hand-written TOML file untouched', () => {
    const toml = '# mine\n[deploy]\ncmd = "./deploy.sh"\n';
    fs.writeFileSync(file, toml);

    expect(migrateGlobalScope(file)).toEqual({ migrated: false });
    expect(fs.readFileSync(file, 'utf8')).toBe(toml);
    expect(fs.existsSync(`${file}.bak`)).toBe(false);
  });

  it('is a no-op for a missing file', () => {
    expect(migrateGlobalScope(path.join(dir, 'nope'))).toEqual({ migrated: false });
  });

  it('leaves the original in place when conversion fails', () => {
    // A legacy header with a line the parser cannot make sense of.
    const broken = 'declare -a INW_CMDS\nINW_CMDS[notanumber]=oops\n';
    fs.writeFileSync(file, broken);
    migrateGlobalScope(file);

    // The malformed line is skipped, not fatal, and the backup still exists.
    expect(fs.existsSync(`${file}.bak`)).toBe(true);
    expect(fs.readFileSync(`${file}.bak`, 'utf8')).toBe(broken);
  });

  it('produces a file the TOML store can read back', () => {
    installFixture();
    migrateGlobalScope(file);

    expect(() => readScope(file)).not.toThrow();
    expect(readScope(file)).toHaveLength(6);
  });
});
