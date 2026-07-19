# inw

Save shell commands by name and run them from anywhere — globally, or scoped to a project.

Replaces the original `.bash_inw` script's ten numbered slots with unlimited named aliases, a searchable picker, and per-project command files.

```
$ inw
 ╭──────────────────────────────────────────────────────────╮
 │ Search: alias or command text...                         │
 ╰──────────────────────────────────────────────────────────╯

 ❯ [p] test            npm run test:integration
   [g] deploy          ./scripts/deploy.sh staging
   [g] ci              npm run lint && npm test
   [g] test            pytest

 [Enter] Run • [c] Copy • [e] Edit • [Del] Delete • [Esc] Exit
```

## Install

```bash
npm install
npm run build
npm link          # puts `inw` on your PATH
```

Then add the shell function to your `~/.bashrc`:

```bash
source /path/to/magic-inw/contracts/shell.sh
```

**The shell function is required.** Saved commands are `eval`'d in your interactive shell, which is what lets a saved `cd` or `export` actually affect your session. A Node process cannot do that — it would run them in a subprocess where the effect dies. Without the function, `inw` prints the command instead of running it.

Once it works, remove the old `source ~/.bash_inw` line from your `~/.bashrc` — but only after confirming your commands migrated (see below).

## Usage

| Command | What it does |
|---|---|
| `inw` | Open the picker |
| `inw <alias>` | Run a saved command |
| `inw <alias> <command...>` | Save a command globally |
| `inw <alias> -- <args...>` | Run a saved command with extra arguments appended |
| `inw -p ...` | Act on this project's commands |
| `inw -g ...` | Act on your global commands |

```bash
inw mem memory                    # save "memory" as alias "mem"
inw mem                           # run it
inw build npm run build           # save
inw build -- --watch              # runs: npm run build --watch
inw -p deploy ./scripts/ship.sh   # save to this project
inw -p deploy                     # run the project's version, no fallback
inw -g deploy                     # run the global version
```

Aliases are lowercase and may contain digits, hyphens, and underscores (`build-watch`, `deploy_prod`, `0`). That rule is what lets `inw mem memory` mean "save" without a flag: the first token is an alias only if it matches, so a flag can never be mistaken for one.

Two or more tokens is always a save. To pass arguments to a saved command, use `--`.

## Scopes

**Global** lives in `~/.inw_saved_commands` and is available everywhere.

**Project** lives in the nearest `.inw_commands` found by walking up from your current directory, so a project's commands are available from any subdirectory. Only the nearest one loads — exactly one project scope is ever active. A `.inw_commands` sitting directly in `$HOME` is ignored, since it would shadow-duplicate your global file everywhere.

Create one by saving with `-p`:

```bash
cd ~/work/api
inw -p test npm run test:integration    # creates ./.inw_commands
```

### When both scopes define the same alias

Running prefers the project's version, the way `PATH` does, and says so:

```
$ inw test
(project) shadows a global "test"
```

Saving without a flag always writes to **global**. If the alias you just saved is shadowed by a project entry, `inw` warns and tells you what will actually run — otherwise the save would silently appear to do nothing.

The picker shows both, flagged `[p]` and `[g]`. The flag column appears only when a project scope is active; with no project in play every entry is global and the column would just be noise.

## The command files

Plain TOML, one table per alias, meant to be edited by hand:

```toml
# Commands for the API service.

# --- deployment ---
[deploy]
cmd = "./scripts/deploy.sh staging"
desc = "optional description"

[release]
cmd = """
cd /srv/app
npm ci
npm run build"""
```

`inw` edits these in place, so your comments, blank lines, and ordering survive when it writes. Commit the project file or don't — it works either way, and per-user data (which commands you ran recently) is kept out of it, in `$XDG_STATE_HOME/inw/usage.json`.

Multi-line commands are supported. The picker collapses them to their first line with a `↵` marker, and pressing `e` on one opens `$EDITOR` instead of the inline editor.

## Migration from the old script

The first run converts `~/.inw_saved_commands` from the old `declare -a INW_CMDS` format automatically. Slots `0`–`9` become ordinary aliases named `"0"` through `"9"` — digits carry no special meaning now.

The original is backed up to `~/.inw_saved_commands.bak` first, and an existing backup is never overwritten. Verify your commands are all present before removing `source ~/.bash_inw` from your `~/.bashrc`:

```bash
inw          # everything you had should be listed
```

## Security note

Project scope introduces something the old global-only script did not have: **a `.inw_commands` file in a repository you cloned contains commands written by someone else.** Running `inw <alias>` inside that repository will `eval` them in your shell.

The picker shows the command text before you press Enter, so browsing is safe. A bare `inw <alias>` typed from muscle memory is not — it runs whatever that project defines.

Treat a repository's `.inw_commands` the way you'd treat its `Makefile` or `package.json` scripts: read it before running anything from it.

## Development

```bash
npm test              # unit + shell integration tests
npm run test:unit     # jest only
npm run test:shell    # shell wrapper and end-to-end command surface
```

The shell tests exist because the two things that matter most cannot be proven from Node: that a saved `cd` changes your actual shell's directory, and that a failing command's exit status propagates rather than always returning 0.

## Design notes

`inw` prints `__exec__:<command>` to stdout and the shell function `eval`s it. Everything else — the UI, errors, warnings — goes to stderr.

This means **stdout is a reserved channel**. Anything else written there gets executed in the user's live shell, which is why the Ink UI renders to stderr and why there are tests asserting stdout stays clean.

The same pattern is used by the sibling project [`magic-onw`](../magic-onw), which jumps to bookmarked directories via `__jump__:`.
