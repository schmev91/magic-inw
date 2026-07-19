import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readUsage, recordUse, usageFilePath, usageKey, sortByRecency } from '../../src/storage/usage.js';
import { Scope } from '../../src/core/types.js';

let root: string;
let stateHome: string;
let home: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'inw-usage-'));
  stateHome = path.join(root, 'state');
  home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const env = (overrides: Record<string, string | undefined> = {}) => ({
  XDG_STATE_HOME: stateHome,
  HOME: home,
  ...overrides,
});

describe('usageFilePath', () => {
  it('honours XDG_STATE_HOME when set', () => {
    expect(usageFilePath(env())).toBe(path.join(stateHome, 'inw', 'usage.json'));
  });

  it('falls back to ~/.local/state when XDG_STATE_HOME is unset', () => {
    expect(usageFilePath(env({ XDG_STATE_HOME: undefined }))).toBe(
      path.join(home, '.local', 'state', 'inw', 'usage.json'),
    );
  });

  it('falls back when XDG_STATE_HOME is set but empty', () => {
    expect(usageFilePath(env({ XDG_STATE_HOME: '' }))).toBe(
      path.join(home, '.local', 'state', 'inw', 'usage.json'),
    );
  });
});

describe('usageKey', () => {
  it('namespaces by scope so the same alias tracks independently', () => {
    expect(usageKey('project', 'test')).not.toBe(usageKey('global', 'test'));
  });
});

describe('readUsage', () => {
  it('reads a missing file as an empty map', () => {
    expect(readUsage(env())).toEqual({});
  });

  it('reads corrupt JSON as an empty map without throwing', () => {
    const file = usageFilePath(env());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ this is not json');

    expect(readUsage(env())).toEqual({});
  });

  it('reads a JSON array as an empty map rather than a broken shape', () => {
    const file = usageFilePath(env());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '["not", "an", "object"]');

    expect(readUsage(env())).toEqual({});
  });

  it('drops non-string values rather than surfacing them', () => {
    const file = usageFilePath(env());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ 'global:a': '2026-01-01T00:00:00.000Z', 'global:b': 42 }));

    expect(readUsage(env())).toEqual({ 'global:a': '2026-01-01T00:00:00.000Z' });
  });
});

describe('recordUse', () => {
  it('creates the file and its parent directories on first call', () => {
    recordUse('global', 'deploy', env());
    const file = usageFilePath(env());

    expect(fs.existsSync(file)).toBe(true);
    expect(Object.keys(readUsage(env()))).toEqual(['global:deploy']);
  });

  it('tracks project and global entries with the same alias independently', () => {
    recordUse('global', 'test', env());
    recordUse('project', 'test', env());
    const usage = readUsage(env());

    expect(Object.keys(usage).sort()).toEqual(['global:test', 'project:test']);
  });

  it('keeps the later timestamp when the same entry is used twice', async () => {
    recordUse('global', 'deploy', env());
    const first = readUsage(env())['global:deploy'];

    await new Promise((resolve) => setTimeout(resolve, 5));
    recordUse('global', 'deploy', env());
    const second = readUsage(env())['global:deploy'];

    // One key, not two — recording a second use updates in place.
    expect(Object.keys(readUsage(env()))).toEqual(['global:deploy']);
    expect(new Date(second).getTime()).toBeGreaterThan(new Date(first).getTime());
  });

  it('preserves other entries when recording one', () => {
    recordUse('global', 'a', env());
    recordUse('global', 'b', env());

    expect(Object.keys(readUsage(env())).sort()).toEqual(['global:a', 'global:b']);
  });

  it('writes an ISO-8601 timestamp', () => {
    recordUse('global', 'deploy', env());

    expect(readUsage(env())['global:deploy']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('recovers from a corrupt file by starting fresh rather than throwing', () => {
    const file = usageFilePath(env());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'garbage');

    expect(() => recordUse('global', 'deploy', env())).not.toThrow();
    expect(Object.keys(readUsage(env()))).toEqual(['global:deploy']);
  });

  it('never throws when the state directory cannot be written', () => {
    // Usage data is derived. Failing to record it must not fail the command
    // the user actually asked for.
    const blocked = path.join(root, 'blocked');
    fs.writeFileSync(blocked, 'I am a file, not a directory');

    expect(() => recordUse('global', 'deploy', env({ XDG_STATE_HOME: blocked }))).not.toThrow();
  });
});

describe('sortByRecency', () => {
  const entry = (alias: string, scope: Scope = 'global') => ({ alias, scope });

  it('puts the most recently used first', () => {
    const entries = [entry('a'), entry('b'), entry('c')];
    const usage = {
      'global:a': '2026-01-01T00:00:00.000Z',
      'global:b': '2026-03-01T00:00:00.000Z',
      'global:c': '2026-02-01T00:00:00.000Z',
    };

    expect(sortByRecency(entries, usage).map((e) => e.alias)).toEqual(['b', 'c', 'a']);
  });

  it('sorts never-used entries after every used one', () => {
    const entries = [entry('never1'), entry('used'), entry('never2')];
    const usage = { 'global:used': '2026-01-01T00:00:00.000Z' };

    expect(sortByRecency(entries, usage).map((e) => e.alias)).toEqual(['used', 'never1', 'never2']);
  });

  it('preserves file order among never-used entries', () => {
    const entries = [entry('zebra'), entry('apple'), entry('mango')];

    expect(sortByRecency(entries, {}).map((e) => e.alias)).toEqual(['zebra', 'apple', 'mango']);
  });

  it('breaks identical timestamps by file order', () => {
    const entries = [entry('first'), entry('second')];
    const usage = {
      'global:first': '2026-01-01T00:00:00.000Z',
      'global:second': '2026-01-01T00:00:00.000Z',
    };

    expect(sortByRecency(entries, usage).map((e) => e.alias)).toEqual(['first', 'second']);
  });

  it('does not let a global timestamp affect a same-named project entry', () => {
    const entries = [entry('test', 'project'), entry('other', 'global')];
    const usage = {
      'global:test': '2026-06-01T00:00:00.000Z',
      'global:other': '2026-01-01T00:00:00.000Z',
    };

    // project:test is unused, so it sorts after the used global:other.
    expect(sortByRecency(entries, usage).map((e) => e.alias)).toEqual(['other', 'test']);
  });

  it('does not mutate the input array', () => {
    const entries = [entry('a'), entry('b')];
    const usage = { 'global:b': '2026-01-01T00:00:00.000Z' };
    sortByRecency(entries, usage);

    expect(entries.map((e) => e.alias)).toEqual(['a', 'b']);
  });
});
