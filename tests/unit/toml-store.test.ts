import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readScope, upsertEntry, deleteEntry, TomlParseError } from '../../src/storage/toml-store.js';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inw-toml-'));
  file = path.join(dir, '.inw_commands');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const HAND_AUTHORED = `# inw saved commands
# Edit by hand freely — comments and ordering survive CLI writes.

# --- deployment ---
[deploy]
cmd = "./scripts/deploy.sh staging"  # staging only
desc = "Deploy to staging"

# --- testing ---
[test]
cmd = "npm run test:integration"
`;

describe('readScope', () => {
  it('reads several aliases into entries', () => {
    fs.writeFileSync(file, HAND_AUTHORED);

    expect(readScope(file)).toEqual([
      { alias: 'deploy', cmd: './scripts/deploy.sh staging', desc: 'Deploy to staging' },
      { alias: 'test', cmd: 'npm run test:integration' },
    ]);
  });

  it('omits desc when absent rather than emitting undefined', () => {
    fs.writeFileSync(file, '[test]\ncmd = "npm test"\n');
    const [entry] = readScope(file);

    expect(entry).toEqual({ alias: 'test', cmd: 'npm test' });
    expect('desc' in entry).toBe(false);
  });

  it('reads a missing file as an empty list', () => {
    expect(readScope(path.join(dir, 'nope'))).toEqual([]);
  });

  it('reads an empty file as an empty list', () => {
    fs.writeFileSync(file, '');
    expect(readScope(file)).toEqual([]);
  });

  it('preserves file order', () => {
    fs.writeFileSync(file, '[zebra]\ncmd = "z"\n\n[apple]\ncmd = "a"\n');
    expect(readScope(file).map((e) => e.alias)).toEqual(['zebra', 'apple']);
  });

  it('skips a table that has no cmd key rather than emitting a broken entry', () => {
    fs.writeFileSync(file, '[good]\ncmd = "ok"\n\n[bad]\ndesc = "no command here"\n');
    expect(readScope(file).map((e) => e.alias)).toEqual(['good']);
  });

  it('throws TomlParseError naming the file on malformed TOML', () => {
    fs.writeFileSync(file, '[deploy\ncmd = "broken"\n');

    expect(() => readScope(file)).toThrow(TomlParseError);
    try {
      readScope(file);
    } catch (err) {
      expect((err as Error).message).toContain(file);
    }
  });
});

describe('upsertEntry', () => {
  it('preserves comments, spacing, and order when adding a new alias', () => {
    fs.writeFileSync(file, HAND_AUTHORED);
    upsertEntry(file, { alias: 'lint', cmd: 'npm run lint' });
    const after = fs.readFileSync(file, 'utf8');

    // Everything the user wrote is still there, byte for byte.
    expect(after).toContain('# inw saved commands');
    expect(after).toContain('# Edit by hand freely');
    expect(after).toContain('# --- deployment ---');
    expect(after).toContain('# --- testing ---');
    expect(after).toContain('cmd = "./scripts/deploy.sh staging"  # staging only');
    expect(after.indexOf('[deploy]')).toBeLessThan(after.indexOf('[test]'));
    expect(after).toContain('[lint]');
    expect(readScope(file).map((e) => e.alias)).toEqual(['deploy', 'test', 'lint']);
  });

  it('replaces only the cmd value when updating an existing alias', () => {
    fs.writeFileSync(file, HAND_AUTHORED);
    upsertEntry(file, { alias: 'deploy', cmd: './scripts/deploy.sh prod', desc: 'Deploy to staging' });
    const after = fs.readFileSync(file, 'utf8');

    expect(after).toContain('./scripts/deploy.sh prod');
    expect(after).not.toContain('./scripts/deploy.sh staging');
    // The inline comment on the very line whose value changed survives.
    expect(after).toContain('# staging only');
    expect(after).toContain('# --- testing ---');
    expect(after).toContain('cmd = "npm run test:integration"');
  });

  it('creates the file with a header comment when it does not exist', () => {
    upsertEntry(file, { alias: 'test', cmd: 'npm test' });
    const after = fs.readFileSync(file, 'utf8');

    expect(after.startsWith('#')).toBe(true);
    expect(after).toContain('[test]');
    expect(readScope(file)).toEqual([{ alias: 'test', cmd: 'npm test' }]);
  });

  it('round-trips a command containing quotes, backslashes, and dollar signs', () => {
    const nasty = 'echo "hello $USER" | sed \'s/a\\/b/c/\' && printf %q "$PWD"';
    upsertEntry(file, { alias: 'nasty', cmd: nasty });

    expect(readScope(file)[0].cmd).toBe(nasty);
  });

  it('round-trips a multi-line command', () => {
    const multi = 'cd /srv/app\nnpm ci\nnpm run build';
    upsertEntry(file, { alias: 'release', cmd: multi });

    expect(readScope(file)[0].cmd).toBe(multi);
  });

  it('round-trips a command containing a literal newline escape sequence', () => {
    const literal = 'printf "a\\nb"';
    upsertEntry(file, { alias: 'esc', cmd: literal });

    expect(readScope(file)[0].cmd).toBe(literal);
  });

  it('writes desc when provided and omits it when not', () => {
    upsertEntry(file, { alias: 'a', cmd: 'x', desc: 'described' });
    upsertEntry(file, { alias: 'b', cmd: 'y' });
    const after = fs.readFileSync(file, 'utf8');

    expect(after).toContain('desc = "described"');
    expect(readScope(file)).toEqual([
      { alias: 'a', cmd: 'x', desc: 'described' },
      { alias: 'b', cmd: 'y' },
    ]);
  });

  it('does not write when the existing file is malformed', () => {
    const broken = '[deploy\ncmd = "broken"\n';
    fs.writeFileSync(file, broken);

    expect(() => upsertEntry(file, { alias: 'new', cmd: 'x' })).toThrow(TomlParseError);
    expect(fs.readFileSync(file, 'utf8')).toBe(broken);
  });
});

describe('deleteEntry', () => {
  it('removes a block without disturbing neighbouring comments', () => {
    fs.writeFileSync(file, HAND_AUTHORED);
    deleteEntry(file, 'test');
    const after = fs.readFileSync(file, 'utf8');

    expect(after).not.toContain('[test]');
    expect(after).not.toContain('npm run test:integration');
    expect(after).toContain('# inw saved commands');
    expect(after).toContain('# --- deployment ---');
    expect(after).toContain('cmd = "./scripts/deploy.sh staging"  # staging only');
    expect(readScope(file).map((e) => e.alias)).toEqual(['deploy']);
  });

  it('is a no-op for an alias that is not present', () => {
    fs.writeFileSync(file, HAND_AUTHORED);
    deleteEntry(file, 'nonexistent');

    expect(fs.readFileSync(file, 'utf8')).toBe(HAND_AUTHORED);
  });

  it('is a no-op for a missing file', () => {
    expect(() => deleteEntry(path.join(dir, 'nope'), 'x')).not.toThrow();
  });

  it('can empty the file completely', () => {
    upsertEntry(file, { alias: 'only', cmd: 'x' });
    deleteEntry(file, 'only');

    expect(readScope(file)).toEqual([]);
  });
});
