import React from 'react';
import { renderInk, settle, DELETE_KEY, ENTER } from '../helpers/ink.js';
import { ListView } from '../../src/ui/views/ListView.js';
import { ResolvedEntry } from '../../src/core/types.js';

const entry = (
  alias: string,
  cmd: string,
  scope: 'project' | 'global' = 'global',
): ResolvedEntry => ({
  alias,
  cmd,
  scope,
  sourcePath: scope === 'project' ? '/work/api/.inw_commands' : '/home/user/.inw_saved_commands',
});

const noop = () => {};
const defaults = {
  onRun: noop,
  onDelete: noop,
  onEdit: noop,
  onCopy: () => ({ ok: true }),
  onEditExternal: () => null,
};

const setup = (props: Partial<React.ComponentProps<typeof ListView>> = {}) =>
  renderInk(
    <ListView
      entries={[entry('deploy', './deploy.sh')]}
      showScopeFlags={false}
      {...defaults}
      {...props}
    />,
  );

describe('rendering', () => {
  it('lists every entry from both scopes', async () => {
    const { lastFrame } = setup({
      entries: [entry('test', 'npm test', 'project'), entry('deploy', './deploy.sh')],
      showScopeFlags: true,
    });
    await settle();

    expect(lastFrame()).toContain('test');
    expect(lastFrame()).toContain('deploy');
  });

  it('shows [p] and [g] flags when a project scope is active', async () => {
    const { lastFrame } = setup({
      entries: [entry('test', 'npm test', 'project'), entry('deploy', './deploy.sh')],
      showScopeFlags: true,
    });
    await settle();

    expect(lastFrame()).toContain('[p]');
    expect(lastFrame()).toContain('[g]');
  });

  it('shows no flag column at all when no project scope is active', async () => {
    const { lastFrame } = setup({
      entries: [entry('deploy', './deploy.sh'), entry('test', 'npm test')],
      showScopeFlags: false,
    });
    await settle();

    expect(lastFrame()).not.toContain('[g]');
    expect(lastFrame()).not.toContain('[p]');
  });

  it('renders both sides of an alias collision as separate rows', async () => {
    const { lastFrame } = setup({
      entries: [entry('test', 'npm run test:int', 'project'), entry('test', 'pytest')],
      showScopeFlags: true,
    });
    await settle();

    expect(lastFrame()).toContain('npm run test:int');
    expect(lastFrame()).toContain('pytest');
  });

  it('collapses a multi-line command to its first line with a marker', async () => {
    const { lastFrame } = setup({ entries: [entry('rel', 'cd /srv\nnpm ci\nnpm run build')] });
    await settle();

    expect(lastFrame()).toContain('cd /srv');
    expect(lastFrame()).toContain('↵');
    expect(lastFrame()).not.toContain('npm ci');
  });

  it('shows an empty-state message when nothing is saved', async () => {
    const { lastFrame } = setup({ entries: [] });
    await settle();

    expect(lastFrame()).toMatch(/no commands saved/i);
  });

  it('shows the keymap hint', async () => {
    const { lastFrame } = setup();
    await settle();

    expect(lastFrame()).toContain('[Enter] Run');
    expect(lastFrame()).toContain('[c] Copy');
    expect(lastFrame()).toContain('[e] Edit');
    expect(lastFrame()).toContain('[Del] Delete');
  });
});

describe('search', () => {
  const entries = [
    entry('deploy', './scripts/deploy.sh staging'),
    entry('ci', 'npm run lint && npm test'),
  ];

  it('filters on an alias substring', async () => {
    const { write, lastFrame } = setup({ entries });
    await settle();
    write('dep');
    await settle();

    expect(lastFrame()).toContain('deploy');
    expect(lastFrame()).not.toContain('npm run lint');
  });

  it('filters on a command-body substring when the alias does not match', async () => {
    const { write, lastFrame } = setup({ entries });
    await settle();
    write('lint');
    await settle();

    expect(lastFrame()).toContain('ci');
    expect(lastFrame()).not.toContain('deploy.sh');
  });

  it('matches case-insensitively', async () => {
    const { write, lastFrame } = setup({ entries });
    await settle();
    write('DEPLOY');
    await settle();

    expect(lastFrame()).toContain('deploy');
  });

  it('matches text on a continuation line the row collapses away', async () => {
    const { write, lastFrame } = setup({ entries: [entry('rel', 'cd /srv\nnpm ci\nmake release')] });
    await settle();
    write('release');
    await settle();

    expect(lastFrame()).toContain('rel');
    expect(lastFrame()).not.toMatch(/no commands match/i);
  });

  it('shows a no-results message for a query that matches nothing', async () => {
    const { write, lastFrame } = setup({ entries });
    await settle();
    write('zzzz');
    await settle();

    expect(lastFrame()).toMatch(/no commands match/i);
  });
});

describe('actions', () => {
  it('runs the highlighted entry on Enter', async () => {
    const ran: string[] = [];
    const { write } = setup({
      entries: [entry('deploy', './deploy.sh')],
      onRun: (e) => ran.push(e.alias),
    });
    await settle();
    write('\r');
    await settle();

    expect(ran).toEqual(['deploy']);
  });

  it('copies the highlighted entry on c', async () => {
    const copied: string[] = [];
    const { write, lastFrame } = setup({
      onCopy: (e) => {
        copied.push(e.cmd);
        return { ok: true };
      },
    });
    await settle();
    write('c');
    await settle();

    expect(copied).toEqual(['./deploy.sh']);
    expect(lastFrame()).toMatch(/copied/i);
  });

  it('surfaces a clipboard failure instead of claiming success', async () => {
    const { write, lastFrame } = setup({
      onCopy: () => ({ ok: false, reason: 'no clipboard tool' }),
    });
    await settle();
    write('c');
    await settle();

    expect(lastFrame()).toMatch(/copy failed/i);
    expect(lastFrame()).toContain('no clipboard tool');
  });

  it('prompts before deleting and names the scope and file', async () => {
    const { write, lastFrame } = setup({
      entries: [entry('test', 'npm test', 'project')],
      showScopeFlags: true,
    });
    await settle();
    write('[3~'); // Delete key
    await settle();

    expect(lastFrame()).toMatch(/delete/i);
    expect(lastFrame()).toContain('project');
    expect(lastFrame()).toContain('/work/api/.inw_commands');
  });

  it('deletes from the correct scope on y', async () => {
    const deleted: { alias: string; scope: string }[] = [];
    const { write, lastFrame } = setup({
      entries: [entry('test', 'npm test', 'project')],
      onDelete: (e) => deleted.push({ alias: e.alias, scope: e.scope }),
    });
    await settle();
    write('[3~');
    await settle();
    write('y');
    await settle();

    expect(deleted).toEqual([{ alias: 'test', scope: 'project' }]);
    expect(lastFrame()).toMatch(/deleted/i);
  });

  it('cancels the delete on n', async () => {
    const deleted: string[] = [];
    const { write, lastFrame } = setup({ onDelete: (e) => deleted.push(e.alias) });
    await settle();
    write('[3~');
    await settle();
    write('n');
    await settle();

    expect(deleted).toEqual([]);
    expect(lastFrame()).not.toMatch(/delete .* from/i);
  });

  it('opens an inline editor prefilled for a single-line entry', async () => {
    const { write, lastFrame } = setup({ entries: [entry('deploy', './deploy.sh')] });
    await settle();
    write('e');
    await settle();

    expect(lastFrame()).toMatch(/editing/i);
    expect(lastFrame()).toContain('./deploy.sh');
  });

  it('saves an inline edit back to the entry scope', async () => {
    const edits: { alias: string; next: string }[] = [];
    const { write } = setup({
      entries: [entry('deploy', './old.sh')],
      onEdit: (e, next) => edits.push({ alias: e.alias, next }),
    });
    await settle();
    write('e');
    await settle();
    write('X');
    await settle();
    write('\r');
    await settle();

    expect(edits).toHaveLength(1);
    expect(edits[0].alias).toBe('deploy');
    expect(edits[0].next).toContain('X');
  });

  it('does not filter the list while an inline edit is open', async () => {
    // Both text inputs are mounted at once; keystrokes must not reach the
    // search box while the editor has focus.
    const { write, lastFrame } = setup({
      entries: [entry('deploy', './deploy.sh'), entry('other', 'echo other')],
    });
    await settle();
    write('e');
    await settle();
    write('zzz');
    await settle();

    expect(lastFrame()).not.toMatch(/no commands match/i);
    expect(lastFrame()).toMatch(/editing/i);
  });

  it('routes a multi-line entry to the external editor instead of the inline one', async () => {
    const opened: string[] = [];
    const { write, lastFrame } = setup({
      entries: [entry('rel', 'cd /srv\nnpm ci')],
      onEditExternal: (e) => {
        opened.push(e.alias);
        return 'cd /srv\nnpm ci\nnpm run build';
      },
    });
    await settle();
    write('e');
    await settle();

    expect(opened).toEqual(['rel']);
    expect(lastFrame()).not.toMatch(/editing/i);
  });

  it('leaves the command untouched when the external editor is aborted', async () => {
    const edits: string[] = [];
    const { write } = setup({
      entries: [entry('rel', 'cd /srv\nnpm ci')],
      onEdit: (e) => edits.push(e.alias),
      onEditExternal: () => null,
    });
    await settle();
    write('e');
    await settle();

    expect(edits).toEqual([]);
  });
});
