import { lookup, allEntries, hasProjectScope, ScopeSources } from '../../src/core/resolve.js';
import { CommandEntry } from '../../src/core/types.js';

const PROJECT_PATH = '/work/api/.inw_commands';
const GLOBAL_PATH = '/home/user/.inw_saved_commands';

const sources = (
  project: CommandEntry[] | null,
  global: CommandEntry[] = [],
): ScopeSources => ({
  project: project === null ? null : { path: PROJECT_PATH, entries: project },
  global: { path: GLOBAL_PATH, entries: global },
});

const cmd = (alias: string, command: string): CommandEntry => ({ alias, cmd: command });

describe('lookup — unscoped', () => {
  it('prefers the project entry and reports the shadow', () => {
    const result = lookup(
      sources([cmd('test', 'npm run test:int')], [cmd('test', 'pytest')]),
      'test',
    );

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.resolution.entry.cmd).toBe('npm run test:int');
    expect(result.resolution.entry.scope).toBe('project');
    expect(result.resolution.shadowed?.cmd).toBe('pytest');
    expect(result.resolution.shadowed?.scope).toBe('global');
  });

  it('falls back to global with no shadow when the project lacks the alias', () => {
    const result = lookup(sources([cmd('other', 'x')], [cmd('test', 'pytest')]), 'test');

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.resolution.entry.scope).toBe('global');
    expect(result.resolution.shadowed).toBeUndefined();
  });

  it('reports no shadow when only the project has the alias', () => {
    const result = lookup(sources([cmd('test', 'npm test')], []), 'test');

    expect(result.found && result.resolution.shadowed).toBeUndefined();
  });

  it('resolves from global when there is no project scope at all', () => {
    const result = lookup(sources(null, [cmd('test', 'pytest')]), 'test');

    expect(result.found && result.resolution.entry.scope).toBe('global');
  });

  it('carries the source path so the caller can name the file', () => {
    const result = lookup(sources([cmd('test', 'x')]), 'test');

    expect(result.found && result.resolution.entry.sourcePath).toBe(PROJECT_PATH);
  });

  it('fails with a message naming both places it looked', () => {
    const result = lookup(sources([], []), 'missing');

    expect(result.found).toBe(false);
    if (result.found) return;
    expect(result.reason).toContain('missing');
    expect(result.reason).toMatch(/project/i);
  });

  it('fails with a global-only message when there is no project scope', () => {
    const result = lookup(sources(null, []), 'missing');

    if (result.found) return;
    expect(result.reason).toMatch(/global/i);
    expect(result.reason).not.toMatch(/project/i);
  });
});

describe('lookup — explicit project scope', () => {
  it('finds the project entry', () => {
    const result = lookup(sources([cmd('test', 'npm test')], [cmd('test', 'pytest')]), 'test', 'project');

    expect(result.found && result.resolution.entry.cmd).toBe('npm test');
  });

  it('never falls back to global', () => {
    const result = lookup(sources([], [cmd('test', 'pytest')]), 'test', 'project');

    expect(result.found).toBe(false);
  });

  it('distinguishes "no project scope" from "alias not in it"', () => {
    const noScope = lookup(sources(null, []), 'test', 'project');
    const emptyScope = lookup(sources([], []), 'test', 'project');

    expect(noScope.found).toBe(false);
    expect(emptyScope.found).toBe(false);
    if (noScope.found || emptyScope.found) return;
    expect(noScope.reason).not.toBe(emptyScope.reason);
    expect(noScope.reason).toMatch(/no project scope/i);
    expect(emptyScope.reason).toContain(PROJECT_PATH);
  });

  it('suggests how to create a project scope when there is none', () => {
    const result = lookup(sources(null, []), 'deploy', 'project');

    if (result.found) return;
    expect(result.reason).toContain('inw -p deploy');
  });
});

describe('lookup — explicit global scope', () => {
  it('finds the global entry even when a project entry shadows it', () => {
    const result = lookup(sources([cmd('test', 'npm test')], [cmd('test', 'pytest')]), 'test', 'global');

    expect(result.found && result.resolution.entry.cmd).toBe('pytest');
    expect(result.found && result.resolution.entry.scope).toBe('global');
  });

  it('never falls back to a project entry', () => {
    const result = lookup(sources([cmd('test', 'npm test')], []), 'test', 'global');

    expect(result.found).toBe(false);
  });

  it('reports no shadow, since an explicit scope has nothing to shadow', () => {
    const result = lookup(sources([cmd('test', 'npm test')], [cmd('test', 'pytest')]), 'test', 'global');

    expect(result.found && result.resolution.shadowed).toBeUndefined();
  });
});

describe('allEntries', () => {
  it('lists project entries before global ones', () => {
    const entries = allEntries(sources([cmd('a', 'x')], [cmd('b', 'y')]));

    expect(entries.map((e) => [e.alias, e.scope])).toEqual([
      ['a', 'project'],
      ['b', 'global'],
    ]);
  });

  it('keeps both sides of a collision as separate entries', () => {
    const entries = allEntries(sources([cmd('test', 'npm test')], [cmd('test', 'pytest')]));

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.scope)).toEqual(['project', 'global']);
  });

  it('tags every entry with its source path', () => {
    const entries = allEntries(sources([cmd('a', 'x')], [cmd('b', 'y')]));

    expect(entries[0].sourcePath).toBe(PROJECT_PATH);
    expect(entries[1].sourcePath).toBe(GLOBAL_PATH);
  });

  it('returns only global entries when there is no project scope', () => {
    const entries = allEntries(sources(null, [cmd('b', 'y')]));

    expect(entries.map((e) => e.scope)).toEqual(['global']);
  });
});

describe('hasProjectScope', () => {
  it('is true when a project file was found, even if it is empty', () => {
    expect(hasProjectScope(sources([]))).toBe(true);
  });

  it('is false when no project file was found', () => {
    expect(hasProjectScope(sources(null))).toBe(false);
  });
});
