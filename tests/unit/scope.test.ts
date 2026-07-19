import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findProjectScope, PROJECT_FILENAME } from '../../src/core/scope.js';

let root: string;
let home: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'inw-scope-'));
  home = path.join(root, 'home', 'user');
  fs.mkdirSync(home, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Create a directory tree under $HOME and return the deepest path. */
function tree(...segments: string[]): string {
  const dir = path.join(home, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function placeScope(dir: string, contents = '[demo]\ncmd = "echo hi"\n'): string {
  const file = path.join(dir, PROJECT_FILENAME);
  fs.writeFileSync(file, contents);
  return file;
}

describe('findProjectScope', () => {
  it('finds the file when cwd is the project root', () => {
    const project = tree('work', 'api');
    const file = placeScope(project);

    expect(findProjectScope(project, home)).toBe(file);
  });

  it('finds the file from three levels deep', () => {
    const project = tree('work', 'api');
    const file = placeScope(project);
    const deep = tree('work', 'api', 'src', 'handlers', 'v2');

    expect(findProjectScope(deep, home)).toBe(file);
  });

  it('returns the nearest when two ancestors both have one', () => {
    const outer = tree('work');
    placeScope(outer);
    const inner = tree('work', 'api');
    const innerFile = placeScope(inner);
    const deep = tree('work', 'api', 'src');

    expect(findProjectScope(deep, home)).toBe(innerFile);
  });

  it('returns null when no ancestor has one', () => {
    const deep = tree('work', 'api', 'src');

    expect(findProjectScope(deep, home)).toBeNull();
  });

  it('returns null when the only scope file is at $HOME itself', () => {
    // A .inw_commands in $HOME would shadow-duplicate the global file, so it
    // is deliberately not treated as a project scope.
    placeScope(home);
    const deep = tree('work', 'api');

    expect(findProjectScope(deep, home)).toBeNull();
  });

  it('does not escape upward past $HOME', () => {
    // A scope file above $HOME must never be picked up.
    placeScope(path.join(root, 'home'));
    const deep = tree('work');

    expect(findProjectScope(deep, home)).toBeNull();
  });

  it('stops at filesystem root when cwd is outside $HOME entirely', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'inw-outside-'));
    const deep = path.join(outside, 'a', 'b');
    fs.mkdirSync(deep, { recursive: true });

    try {
      expect(findProjectScope(deep, home)).toBeNull();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('finds a scope file outside $HOME when one exists on the way to root', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'inw-outside-'));
    const project = path.join(outside, 'proj');
    fs.mkdirSync(project, { recursive: true });
    const file = placeScope(project);
    const deep = path.join(project, 'src');
    fs.mkdirSync(deep, { recursive: true });

    try {
      expect(findProjectScope(deep, home)).toBe(file);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('skips a .inw_commands that is a directory rather than a file', () => {
    const project = tree('work', 'api');
    fs.mkdirSync(path.join(project, PROJECT_FILENAME));

    expect(findProjectScope(project, home)).toBeNull();
  });

  it('prefers a real file lower down over a directory higher up', () => {
    const outer = tree('work');
    fs.mkdirSync(path.join(outer, PROJECT_FILENAME));
    const inner = tree('work', 'api');
    const file = placeScope(inner);

    expect(findProjectScope(path.join(inner), home)).toBe(file);
  });

  it('returns an absolute path even when given a relative start', () => {
    const project = tree('work', 'api');
    const file = placeScope(project);
    const previous = process.cwd();
    process.chdir(project);

    try {
      const found = findProjectScope('.', home);
      expect(found).not.toBeNull();
      expect(path.isAbsolute(found!)).toBe(true);
      expect(fs.realpathSync(found!)).toBe(fs.realpathSync(file));
    } finally {
      process.chdir(previous);
    }
  });

  it('treats an empty scope file as a valid scope', () => {
    // An empty file is a deliberate "this project has a scope, with nothing in
    // it yet" signal — distinct from having no scope at all.
    const project = tree('work', 'api');
    const file = placeScope(project, '');

    expect(findProjectScope(project, home)).toBe(file);
  });
});
