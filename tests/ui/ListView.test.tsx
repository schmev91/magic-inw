import React from 'react';
import { renderInk, settle, KEYS } from '../helpers/ink.js';
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
    expect(lastFrame()).toContain('[^Y] Copy');
    expect(lastFrame()).toContain('[^E] Edit');
    expect(lastFrame()).toContain('[^X] Delete');
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
    write(KEYS.enter);
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
    write(KEYS.ctrlY);
    await settle();

    expect(copied).toEqual(['./deploy.sh']);
    expect(lastFrame()).toMatch(/copied/i);
  });

  it('surfaces a clipboard failure instead of claiming success', async () => {
    const { write, lastFrame } = setup({
      onCopy: () => ({ ok: false, reason: 'no clipboard tool' }),
    });
    await settle();
    write(KEYS.ctrlY);
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
    write(KEYS.ctrlX);
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
    write(KEYS.ctrlX);
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
    write(KEYS.ctrlX);
    await settle();
    write('n');
    await settle();

    expect(deleted).toEqual([]);
    expect(lastFrame()).not.toMatch(/delete .* from/i);
  });

  it('opens an inline editor prefilled for a single-line entry', async () => {
    const { write, lastFrame } = setup({ entries: [entry('deploy', './deploy.sh')] });
    await settle();
    write(KEYS.ctrlE);
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
    write(KEYS.ctrlE);
    await settle();
    write('X');
    await settle();
    write(KEYS.enter);
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
    write(KEYS.ctrlE);
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
    write(KEYS.ctrlE);
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
    write(KEYS.ctrlE);
    await settle();

    expect(edits).toEqual([]);
  });
});

describe('search editing', () => {
  const entries = [entry('deploy', './scripts/deploy.sh'), entry('ci', 'npm run lint')];

  it('deletes a character on Backspace without touching the entry list', async () => {
    const deleted: string[] = [];
    const { write, lastFrame } = setup({ entries, onDelete: (e) => deleted.push(e.alias) });
    await settle();
    write('dep');
    await settle();
    write(KEYS.backspace);
    await settle();

    expect(lastFrame()).toContain('Search: de');
    // Regression: Backspace used to open the delete-entry confirmation,
    // because ink reports it as key.delete — same as the Delete key.
    expect(lastFrame()).not.toMatch(/\[y\/n\]/);
    expect(deleted).toEqual([]);
  });

  it('deletes a character on the Delete key too', async () => {
    const { write, lastFrame } = setup({ entries });
    await settle();
    write('dep');
    await settle();
    write(KEYS.deleteKey);
    await settle();

    expect(lastFrame()).toContain('Search: de');
  });

  it.each([
    ['Alt+Backspace (DEL encoding)', KEYS.altBackspace],
    ['Alt+Backspace (BS encoding)', KEYS.altBackspaceBS],
    ['Ctrl+W', KEYS.ctrlW],
  ])('deletes the previous word on %s', async (_name, seq) => {
    const { write, lastFrame } = setup({ entries });
    await settle();
    write('npm run');
    await settle();
    write(seq);
    await settle();

    expect(lastFrame()).toContain('Search: npm');
    expect(lastFrame()).not.toContain('Search: npm run');
  });

  it('clears the whole query on Ctrl+U', async () => {
    const { write, lastFrame } = setup({ entries });
    await settle();
    write('deploy');
    await settle();
    write(KEYS.ctrlU);
    await settle();

    expect(lastFrame()).toContain('alias or command text...');
    expect(lastFrame()).toContain('deploy');
    expect(lastFrame()).toContain('ci');
  });

  it('deletes one word per press, not the whole query', async () => {
    const { write, lastFrame } = setup({ entries });
    await settle();
    write('a b c');
    await settle();
    write(KEYS.ctrlW);
    await settle();

    expect(lastFrame()).toContain('Search: a b');
  });

  it('does not type action keys into the query', async () => {
    // Regression: 'c' and 'e' were both actions and printable, so pressing
    // them ran the action AND filtered the list to nothing.
    const { write, lastFrame } = setup({ entries });
    await settle();
    write(KEYS.ctrlY);
    await settle();
    expect(lastFrame()).not.toContain('Search: y');
    expect(lastFrame()).not.toContain('Search: x');
  });

  it('lets you type letters that used to be action keys', async () => {
    // 'c' and 'e' must now be ordinary search characters.
    const { write, lastFrame } = setup({ entries: [entry('ci', 'npm run lint')] });
    await settle();
    write('ci');
    await settle();

    expect(lastFrame()).toContain('Search: ci');
    expect(lastFrame()).toContain('npm run lint');
  });

  it('lets you type j and k, which used to move the selection', async () => {
    // Regression: ink-select-input treated bare j/k as navigation.
    const { write, lastFrame } = setup({ entries: [entry('jk-tool', 'echo jk')] });
    await settle();
    write('jk');
    await settle();

    expect(lastFrame()).toContain('Search: jk');
    expect(lastFrame()).toContain('jk-tool');
  });

  it('accepts a multi-character paste as one chunk', async () => {
    const { write, lastFrame } = setup({ entries });
    await settle();
    write('deploy.sh');
    await settle();

    expect(lastFrame()).toContain('Search: deploy.sh');
  });
});

describe('navigation', () => {
  const many = Array.from({ length: 5 }, (_, i) => entry(`cmd${i}`, `echo ${i}`));

  it('moves the selection with arrow keys', async () => {
    const ran: string[] = [];
    const { write } = setup({ entries: many, onRun: (e) => ran.push(e.alias) });
    await settle();
    write(KEYS.down);
    await settle();
    write(KEYS.down);
    await settle();
    write(KEYS.enter);
    await settle();

    expect(ran).toEqual(['cmd2']);
  });

  it('does not move above the first entry', async () => {
    const ran: string[] = [];
    const { write } = setup({ entries: many, onRun: (e) => ran.push(e.alias) });
    await settle();
    write(KEYS.up);
    await settle();
    write(KEYS.up);
    await settle();
    write(KEYS.enter);
    await settle();

    expect(ran).toEqual(['cmd0']);
  });

  it('resets the selection to the top when the query changes', async () => {
    const ran: string[] = [];
    const { write } = setup({ entries: many, onRun: (e) => ran.push(e.alias) });
    await settle();
    write(KEYS.down);
    await settle();
    write('cmd');
    await settle();
    write(KEYS.enter);
    await settle();

    expect(ran).toEqual(['cmd0']);
  });

  it('shows a scroll indicator when entries overflow the page', async () => {
    const lots = Array.from({ length: 20 }, (_, i) => entry(`c${i}`, `echo ${i}`));
    const { lastFrame } = setup({ entries: lots, pageSize: 5 });
    await settle();

    expect(lastFrame()).toMatch(/↓ \d+ more/);
  });
});
