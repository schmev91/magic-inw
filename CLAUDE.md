# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`inw` saves shell commands by name and runs them from anywhere, globally or scoped to a project. It replaces a bash script (`.bash_inw`, kept at the first commit as the migration reference) with a TypeScript CLI and an Ink picker.

## The signal protocol — read this before changing any output

A Node process cannot change its parent shell. A saved `cd`, `export`, or alias run through `child_process` dies in a subprocess, which makes the obvious implementation useless.

So **the binary never executes anything.** It prints `__exec__:<command>` to stdout, and the shell function in `contracts/shell.sh` `eval`s it in the user's interactive shell.

This produces the invariants that govern the whole codebase:

- **stdout is a reserved channel.** Anything else written there — a stray `console.log`, a dependency banner, a Node deprecation warning, an Ink frame — becomes text executed in the user's live shell. This is the highest-severity failure mode here, and it is silent.
- **Everything human-facing goes to stderr**: errors, warnings, status, and the entire Ink UI (`render(..., { stdout: process.stderr, patchConsole: false })`). Use the helpers in `core/output.ts`; only `writeExecSignal` may touch stdout.
- The signal carries **no trailing newline and no ANSI codes** — both would be captured into the string being `eval`'d.
- The wrapper exports `INW_SHELL_WRAPPER=1`. Unwrapped, the binary prints the command plus an install hint instead of emitting a signal nothing would evaluate.

When adding output anywhere, the question is "stdout or stderr?", and the answer is stderr unless it is the signal itself. `tests/unit/output.test.ts` and `tests/shell/surface.test.sh` both assert stdout stays clean; keep it that way.

A real instance of this: `core/clipboard.ts` probes PATH by scanning directories rather than calling `spawnSync('command -v', { shell: true })`, because the latter emits a Node 24 deprecation warning **on stderr**, which would corrupt the Ink display.

## Commands

```bash
npm run build              # tsc -> dist/
npm test                   # jest + both shell suites
npm run test:unit          # jest only (fast)
npm run test:shell         # rebuilds, then runs the shell suites

npm run test:unit -- scope              # one file, by name fragment
npm run test:unit -- -t "decodes ANSI"  # one test, by name
```

`npm link` symlinks the package but **not** the TypeScript. Always `npm run build` after editing `src/` before testing manually — `npm run test:shell` does this for you.

Requires Node 18+ (`smol-toml`'s floor, declared in `engines`).

## Architecture

Layered so each piece is testable without the others. Dependencies point downward: `main.ts` → `cli`/`core`/`storage`/`ui`.

### The grammar is load-bearing

`core/grammar.ts` owns `^[a-z0-9][a-z0-9_-]*$`. This one rule makes the positional command surface unambiguous — token 1 is an alias **iff** it matches — which is what lets `inw mem memory` mean "save" with no flag, and what guarantees `-p`/`-g` can never be parsed as an alias. It is declared once and exported; do not restate the pattern elsewhere.

Command surface, all of it driven by that rule:

| Invocation | Action |
|---|---|
| `inw` | picker |
| `inw <alias>` | run (project first, then global) |
| `inw <alias> <cmd...>` | save to **global** |
| `inw <alias> -- <args...>` | run with args appended |
| `-p` / `-g` prefix | pin the scope, for both running and saving |

### `cli/argv.ts` splits on `--` before meow sees argv

meow wraps yargs-parser, which folds post-`--` tokens into positional input. Without this pre-split, `inw build -- --watch` is indistinguishable from saving `--watch` under alias `build`. Keep this a pure function over `string[]` — it is the most test-sensitive part of parsing.

### Scope resolution

`core/scope.ts` walks up from cwd to the nearest `.inw_commands`, stopping **exclusively** at `$HOME` (a scope file in `$HOME` would shadow-duplicate the global file everywhere). Only the nearest loads — exactly one project scope is ever active.

`core/resolve.ts` applies precedence: unscoped lookups let project shadow global the way `PATH` does **and report the shadow**; explicit `-p`/`-g` never fall back, and distinguish "no project scope here" from "not in this one".

Saving defaults to global while running prefers project, so a global save can land shadowed and appear to do nothing. Every save therefore echoes its target file, and a shadowed global save warns and names what `inw <alias>` will actually run. That warning is a requirement, not polish — do not remove it.

### Two storage engines, deliberately

`storage/toml-store.ts` reads with `smol-toml` but writes with `@decimalturn/toml-patch`. Scope files are hand-edited and may be committed, so writes must preserve comments, blank lines, and ordering — a `parse`/`stringify` round trip rebuilds the document and destroys all of it. `toml-patch` edits in place.

The `toml-patch` import is confined to this one module so the writer stays swappable. Round-trip tests assert on **exact file text**, not parsed structures, because textual fidelity is the entire point.

`storage/usage.ts` keeps per-user recency in a plain JSON sidecar under `$XDG_STATE_HOME/inw/`, deliberately *outside* the scope files, so a committed `.inw_commands` stays free of per-user churn. (`conf`, which the sibling `magic-onw` uses for everything, was dropped — it is not worth the weight for one flat map, and a config directory is the wrong home for disposable state.)

**Failure policy differs by storage kind, on purpose:**

- Malformed TOML **raises**. Treating a syntax error as "no entries" would look like data loss and would let the next write clobber a file the user was mid-edit on.
- A corrupt or unwritable usage sidecar **degrades silently** to `{}`. It is derived data affecting only sort order and must never block the command the user asked for.

### Migration

`core/migrate.ts` converts the legacy `declare -a INW_CMDS` format on first run. Detection is anchored to a **full-line** match so a saved command containing the text `INW_CMDS` cannot cause a TOML file to be misread as legacy and clobbered. It backs up to `.bak` first and never overwrites an existing backup.

The unquoting handles bash `printf %q` output, which picks its style per value: backslash-escaping normally, `$'...'` ANSI-C quoting when the value contains control characters. Both appear in real files. `tests/fixtures/legacy_saved_commands` was generated by running the original script's own `save_inw`, not hand-written — regenerate it the same way if you extend this.

### UI

Mirrors `magic-onw`'s structure: `SearchInput` above, `SelectInput` with a custom `itemComponent` below, `useInput` for the keymap.

- Search matches alias, command body, **and** description — matching the body is how you find a command saved months ago under a forgotten name, including continuation lines the row collapses away.
- The `[p]`/`[g]` column renders only when a project scope is active; otherwise every entry is global and the column is noise.
- Multi-line commands collapse to first line + `↵`; `e` routes them to `$EDITOR` rather than the inline input.
- `SearchInput` and the edit `TextInput` are both mounted at once, so their `focus` props are gated on mode. Without that, keystrokes during an edit also filter the list.
- Non-TTY stdin falls back to a plain listing — the picker needs raw mode and would otherwise crash inside `ink-text-input` with a React stack trace.

**Never call `process.exit` or write the signal from inside the render tree.** It tears down Ink mid-frame and can leave the terminal in raw mode. `launchUI` returns the chosen entry; `main.ts` acts on it after `waitUntilExit` resolves.

## Testing

TypeScript ESM (`NodeNext`), jest + ts-jest ESM preset, `.js` extensions in relative imports (`moduleNameMapper` strips them). `jest` needs `NODE_OPTIONS=--experimental-vm-modules`, already baked into the scripts.

**Ink 4 and `ink-testing-library` are incompatible.** Its fake stdin lacks `ref`/`unref`, and ink 4 drains input via `readable` + `stdin.read()` rather than a `data` listener — the stock harness renders an error frame instead of the UI. Use `tests/helpers/ink.tsx`, which implements the interface ink actually expects and supports keystrokes.

**`tests/shell/` drives the real built binary in bash.** These exist because two guarantees cannot be proven from Node:

- `wrapper.test.sh` — a saved `cd`/`export` changes the *actual* calling shell, and a failing command's exit status propagates instead of always returning 0. Runs against a fake binary so the wrapper is tested independently.
- `surface.test.sh` — every row of the command surface, with an isolated `HOME` and cwd.

Changes to argv parsing, resolution, or the signal contract must be verified here, not only in jest. Tests that touch the filesystem drive real temp trees with injected `HOME`/`startDir` rather than mocking `fs`.

`contracts/shell.sh` is POSIX sh (uses `case`, not `[[ ]]`) so it works in bash, zsh, dash, and ash. Keep it that way.

## Security-relevant behavior

Project scope is a code-execution surface the global-only script did not have: a `.inw_commands` in a cloned repository holds commands written by someone else, and `inw <alias>` will `eval` them in the user's shell. The picker shows command text before Enter; a bare `inw <alias>` typed from memory does not.

This is documented in `README.md`. Trust-on-first-use prompting is an **open product question**, not a settled decision — don't implement or remove mitigations here without treating it as a product change.

## Docs

`README.md` is reference (what it does, file format, scopes). `SETUP.md` is the clone-to-working walkthrough with troubleshooting. Both are user-facing; keep the install steps in `SETUP.md` rather than duplicating them.
