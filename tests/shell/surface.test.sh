#!/usr/bin/env bash
# End-to-end check of the command surface table from the plan's Product
# Contract. Drives the real built binary with an isolated HOME and cwd, so it
# exercises argv parsing, scope discovery, TOML storage, and the exec signal
# together rather than in isolation.

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BIN="node $ROOT/dist/index.js"

SANDBOX=$(mktemp -d)
export HOME="$SANDBOX/home"
export XDG_STATE_HOME="$SANDBOX/state"
mkdir -p "$HOME" "$SANDBOX/proj/sub"

fail=0
check() {
  if [ "$2" = "$3" ]; then
    echo "  ok: $1"
  else
    echo "  FAIL: $1"
    echo "        got:  $2"
    echo "        want: $3"
    fail=1
  fi
}

# stdout only, so the exec signal is isolated from human-facing stderr.
sig() { INW_SHELL_WRAPPER=1 $BIN "$@" 2>/dev/null; }
# stderr only.
msg() { INW_SHELL_WRAPPER=1 $BIN "$@" 2>&1 >/dev/null; }

echo "--- save and run, global ---"
msg mem memory >/dev/null
check "global save then run" "$(sig mem)" "__exec__:memory"

echo "--- alias grammar ---"
check "uppercase alias rejected" "$(msg Mem 2>&1 | grep -c -i lowercase)" "1"
check "invalid alias exits non-zero" "$(INW_SHELL_WRAPPER=1 $BIN 'bad.alias' >/dev/null 2>&1; echo $?)" "1"

echo "--- passthrough ---"
msg build 'npm run build' >/dev/null
check "run with -- appends args" "$(sig build -- --watch)" "__exec__:npm run build --watch"
check "bare -- appends nothing" "$(sig build --)" "__exec__:npm run build"
check "-- does not save" "$(sig build)" "__exec__:npm run build"

echo "--- project scope ---"
cd "$SANDBOX/proj" || exit 1
msg -p test 'npm run test:int' >/dev/null
check "project file created in cwd" "$([ -f "$SANDBOX/proj/.inw_commands" ] && echo yes)" "yes"

msg -g test 'pytest' >/dev/null
check "project wins unscoped" "$(sig test)" "__exec__:npm run test:int"
check "-g forces global" "$(sig -g test)" "__exec__:pytest"
check "-p forces project" "$(sig -p test)" "__exec__:npm run test:int"
check "shadow is reported" "$(msg test | grep -c -i shadow)" "1"

echo "--- scope discovery from a child directory ---"
cd "$SANDBOX/proj/sub" || exit 1
check "project scope found from child dir" "$(sig test)" "__exec__:npm run test:int"

echo "--- no fallback on explicit scope ---"
check "-p misses without falling back to global" \
  "$(INW_SHELL_WRAPPER=1 $BIN -p mem >/dev/null 2>&1; echo $?)" "1"
check "-g misses without falling back to project" \
  "$(cd "$SANDBOX/proj" && INW_SHELL_WRAPPER=1 $BIN -g nothinghere >/dev/null 2>&1; echo $?)" "1"

echo "--- shadow warning on save ---"
cd "$SANDBOX/proj" || exit 1
check "global save warns when project shadows" "$(msg test 'echo new' | grep -c -i shadow)" "1"

echo "--- stdout hygiene ---"
check "no stdout output for a save" "$(sig mem2 'echo hi')" ""
check "missing alias emits no signal" "$(sig nosuchalias)" ""

echo "--- unwrapped degradation ---"
out=$($BIN mem 2>&1 >/dev/null)
check "unwrapped prints install hint" "$(echo "$out" | grep -c -i 'shell function')" "1"
check "unwrapped emits no signal" "$($BIN mem 2>/dev/null)" ""

cd / || exit 1
rm -rf "$SANDBOX"
exit $fail
