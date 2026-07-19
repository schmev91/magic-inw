# Setting up inw

A complete walkthrough from `git clone` to a working `inw` command, including verification and troubleshooting.

If you just want the short version, it's four commands — but read step 4, because that's the one people miss and it's the one that makes the tool work at all.

```bash
git clone <repo-url> && cd magic-inw
npm install && npm run build && npm link
echo 'source '"$PWD"'/contracts/shell.sh' >> ~/.bashrc
exec bash
```

---

## Step 0 — Check prerequisites

| Requirement | Why | Check |
|---|---|---|
| **Node.js 18+** | `smol-toml` requires it | `node -v` |
| **npm** | install and linking | `npm -v` |
| **bash, zsh, dash, or ash** | the shell function | `echo $SHELL` |
| **A clipboard tool** *(optional)* | the `c` key in the picker | see below |

If `node -v` shows anything below 18, install a newer one first. With [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 20 && nvm use 20
```

**Clipboard is optional.** Everything except the copy key works without it. `inw` finds the first available of:

| Platform | Tool | Install |
|---|---|---|
| WSL | `clip.exe` | already present |
| macOS | `pbcopy` | already present |
| Linux / Wayland | `wl-copy` | `sudo apt install wl-clipboard` |
| Linux / X11 | `xclip` | `sudo apt install xclip` |
| Linux / X11 | `xsel` | `sudo apt install xsel` |

---

## Step 1 — Clone and install

```bash
git clone <repo-url>
cd magic-inw
npm install
```

Expect roughly 490 packages. Warnings about deprecated transitive dependencies (`inflight`, `glob`) come from jest's dependency tree and are harmless.

---

## Step 2 — Build

```bash
npm run build
```

This compiles `src/` to `dist/`. Silent output means success. You should now have `dist/index.js`.

---

## Step 3 — Put `inw` on your PATH

Pick one:

**Option A — `npm link` (recommended for development).** Symlinks the package, so `npm run build` after a code change takes effect immediately with no reinstall.

```bash
npm link
which inw     # → …/bin/inw
```

**Option B — global install.** A copied snapshot rather than a symlink; rebuilding won't update it until you reinstall.

```bash
npm install -g .
```

**Option C — no install at all.** Skip this step and point the shell function at `dist/index.js` directly — see the note in step 4.

---

## Step 4 — Install the shell function (required)

**Do not skip this.** Without it `inw` cannot run anything; it will only print the command it would have run.

The reason is the whole design of the tool. Saved commands are `eval`'d **in your shell**, which is what lets a saved `cd`, `export`, or alias actually affect your session. A Node process can't do that — anything it spawns runs in a subprocess where the effect dies with it. So the binary prints `__exec__:<command>` to stdout and a shell function `eval`s it.

Add this to your shell's startup file, using the **absolute path** to where you cloned:

```bash
source /absolute/path/to/magic-inw/contracts/shell.sh
```

| Shell | File |
|---|---|
| bash | `~/.bashrc` |
| zsh | `~/.zshrc` |
| ash / dash | `~/.profile` |

From inside the clone, this writes the correct absolute path for you:

```bash
echo "source $PWD/contracts/shell.sh" >> ~/.bashrc
```

Then reload:

```bash
exec bash        # or: exec zsh
```

> **If you skipped step 3**, edit `contracts/shell.sh` and replace `command inw` with the absolute path to `dist/index.js`:
> ```sh
> output=$(INW_SHELL_WRAPPER=1 node /absolute/path/to/magic-inw/dist/index.js "$@")
> ```

---

## Step 5 — Verify it works

Three checks, in increasing order of what they prove.

**1. The command exists and is wrapped.**

```bash
type inw
```

Should print `inw is a function`, followed by the body. If it says `inw is /path/to/bin/inw`, the binary is on your PATH but **the shell function is not loaded** — go back to step 4.

**2. Save and run.**

```bash
inw hello 'echo it works'
inw hello
```

Expect `✓ Saved hello to global` and then `it works`.

**3. Shell state actually persists — the real test.**

```bash
inw gotmp 'cd /tmp && export INW_PROOF=1'
inw gotmp
pwd            # → /tmp
echo $INW_PROOF # → 1
```

If `pwd` shows `/tmp` and `INW_PROOF` is `1`, the integration is correct. **If it doesn't, the shell function isn't doing its job** — no amount of the rest working matters, because saved `cd`s will silently do nothing.

Clean up the test aliases:

```bash
inw          # open the picker, highlight each, press Del
```

---

## Step 6 — Migrate from the old `.bash_inw` (only if upgrading)

If you used the previous shell-script version, your commands are in `~/.inw_saved_commands` in bash-array format. **Conversion happens automatically on first run** — you don't need to do anything.

```bash
inw          # you'll see: ✓ Migrated N command(s) from the old format.
```

Your original is copied to `~/.inw_saved_commands.bak` first, and an existing backup is never overwritten. Slots `0`–`9` become ordinary aliases named `"0"` through `"9"`.

Confirm everything survived, then remove the old wiring from your shell startup file:

```bash
# delete or comment out this line:
. ~/.bash_inw
```

To roll back at any point: `cp ~/.inw_saved_commands.bak ~/.inw_saved_commands` and restore that line.

---

## Step 7 — Set up a project scope (optional)

Global commands work everywhere. Project commands live with a specific codebase and are available from any subdirectory of it.

```bash
cd ~/work/my-api
inw -p test 'npm run test:integration'    # creates ./.inw_commands
inw -p deploy './scripts/deploy.sh staging'
```

Now from anywhere inside that project:

```bash
cd ~/work/my-api/src/handlers
inw test      # finds the project's version by walking up
```

The picker marks project entries `[p]` and global ones `[g]`. That column only appears when a project scope is active.

**Decide whether to commit `.inw_commands`.** It's designed for either — comments and ordering survive when `inw` writes, and per-user data (recency) is kept out of it. Commit it to share commands with your team; add it to `.gitignore` to keep it personal.

> **If you commit it, read the security note in the README.** A `.inw_commands` in a repo you clone contains commands written by someone else, and running them `eval`s them in your shell. Treat it like a `Makefile`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `inw: command not found` | Not on PATH | Re-run step 3; check `which inw` |
| `type inw` says "is /path/to/inw" not "is a function" | Shell function not loaded | Step 4, then `exec bash` |
| Warning about the shell function not being installed | Same as above | Step 4 |
| Saved `cd` doesn't change directory | Same as above — this is the signature symptom | Step 4, then verify with step 5 check 3 |
| `Raw mode is not supported` | stdin isn't a TTY | Expected in pipes/scripts; `inw` falls back to a plain listing |
| Picker opens but `c` does nothing | No clipboard tool | Install one from step 0 |
| `Could not parse <file>` | Hand-edit broke the TOML | Fix the syntax; that scope is skipped until you do |
| Commands vanished after upgrading | Migration ran | They're aliases `"0"`–`"9"` now; original at `~/.inw_saved_commands.bak` |
| `npm link` permission errors | Global dir not writable | Use `npm install -g .` with a user-level prefix, or option C |
| Changes to `src/` have no effect | Not rebuilt | `npm run build` (needed every time with `npm link` too) |

**Still stuck?** Confirm the binary works independently of the shell integration:

```bash
INW_SHELL_WRAPPER=1 command inw hello
```

That should print `__exec__:echo it works`. If it does, the binary is fine and the problem is in step 4. If it doesn't, rebuild.

---

## Uninstall

```bash
npm unlink -g inw                       # or: npm uninstall -g inw
```

Remove the `source .../contracts/shell.sh` line from your shell startup file, then `exec bash`.

Your saved commands are **not** removed. To delete them too:

```bash
rm ~/.inw_saved_commands ~/.inw_saved_commands.bak
rm -rf "${XDG_STATE_HOME:-$HOME/.local/state}/inw"
```

Project files are wherever you created them — `find ~ -name .inw_commands` will list them.

---

## Working on the code

```bash
npm test              # unit + shell integration
npm run test:unit     # jest only, fast
npm run test:shell    # rebuilds, then runs the shell suites
```

The shell suites exist because two guarantees can't be proven from Node: that a saved `cd` changes your real shell's directory, and that a failing command's exit status propagates instead of always returning 0.

After changing anything in `src/`, run `npm run build` before testing manually — `npm link` symlinks the package, not the TypeScript.
