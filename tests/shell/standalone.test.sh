#!/usr/bin/env bash
# End-to-end check of the standalone inw.sh.
#
# Every case runs in a fresh `bash -c` that SOURCES the file, because that is
# the tool's actual contract. Three guarantees are only observable from inside
# that shell and cannot be proven any other way: a saved `cd` moving the
# caller, a saved `export` reaching it, and a failing command's status
# propagating instead of always returning 0.

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SH="$ROOT/inw.sh"

SANDBOX=$(mktemp -d)
export HOME="$SANDBOX/home"
mkdir -p "$HOME"

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

# Run a snippet in a fresh shell with inw sourced and an isolated store.
# $1 = store file, rest = script.
run() {
  local store=$1; shift
  INW_FILE="$store" bash -c "source '$SH'; $*"
}
# stdout only
out() { run "$@" 2>/dev/null; }
# stderr only
err() { run "$@" 2>&1 >/dev/null; }
# exit status only
rc() { run "$@" >/dev/null 2>&1; echo $?; }

S="$SANDBOX/store"

echo "--- load guards ---"
check "executing instead of sourcing fails" "$(bash "$SH" >/dev/null 2>&1; echo $?)" "1"
check "executing explains it must be sourced" \
  "$(bash "$SH" 2>&1 >/dev/null | grep -c -i 'must be sourced')" "1"
check "version guard rejects bash 3" \
  "$(run "$S" '_inw_check_bash_version 3 >/dev/null 2>&1; echo $?')" "1"
check "version guard names the version" \
  "$(err "$S" '_inw_check_bash_version 3' | grep -c 'bash 4.0 or later')" "1"
check "version guard accepts bash 4" \
  "$(run "$S" '_inw_check_bash_version 4 >/dev/null 2>&1; echo $?')" "0"
check "sourcing twice still defines inw" \
  "$(out "$S" "source '$SH'; type -t inw")" "function"

echo "--- save and run ---"
rm -f "$S"
check "empty store lists nothing" "$(out "$S" 'inw')" ""
check "empty store returns zero" "$(rc "$S" 'inw')" "0"
check "save then run" "$(out "$S" 'inw b echo hi >/dev/null 2>&1; inw b')" "hi"
check "save joins words with single spaces" \
  "$(out "$S" 'inw b   echo   a   b >/dev/null 2>&1; inw' | cut -f2)" "echo a b"
check "save writes nothing to stdout" "$(out "$S" 'inw c echo x')" ""
check "save names the store on stderr" \
  "$(err "$S" 'inw c echo x' | grep -c "$S")" "1"
check "saving over an alias replaces it" \
  "$(out "$S" 'inw b echo one >/dev/null 2>&1; inw b echo two >/dev/null 2>&1; inw b')" "two"

echo "--- store permissions ---"
rm -f "$S"
run "$S" 'inw b echo hi' >/dev/null 2>&1
check "store is not group/world readable" "$(stat -c %a "$S")" "600"
run "$S" 'inw c echo hi' >/dev/null 2>&1
check "permissions survive a second save" "$(stat -c %a "$S")" "600"

echo "--- the command reaches the calling shell ---"
rm -f "$S"
check "saved cd changes the caller's directory" \
  "$(out "$S" "inw t cd /tmp >/dev/null 2>&1; inw t; pwd")" "/tmp"
check "saved export reaches the caller" \
  "$(out "$S" 'inw e export INW_PROOF=yes >/dev/null 2>&1; inw e; echo "$INW_PROOF"')" "yes"
# An alias cannot be exercised here: bash expands aliases at parse time, so a
# whole `bash -c` one-liner is parsed before `inw a` ever runs. The claim holds
# in an interactive shell, where each line is parsed on its own. A shell
# function is resolved at execution time, so it proves the same reach.
check "saved shell function reaches the caller" \
  "$(INW_FN='greet() { echo greeted; }' out "$S" 'inw fn "$INW_FN" >/dev/null 2>&1; inw fn; greet')" "greeted"

echo "--- exit status ---"
rm -f "$S"
check "failing command returns non-zero" \
  "$(rc "$S" 'inw f false >/dev/null 2>&1; inw f')" "1"
check "succeeding command returns zero" \
  "$(rc "$S" 'inw f true >/dev/null 2>&1; inw f')" "0"
check "specific status propagates" \
  "$(rc "$S" 'inw f "exit 42" >/dev/null 2>&1; inw f')" "42"

echo "--- passthrough ---"
rm -f "$S"
check "args are appended" \
  "$(out "$S" 'inw t echo run >/dev/null 2>&1; inw t -- --watch')" "run --watch"
check "bare -- appends nothing" \
  "$(out "$S" 'inw t echo run >/dev/null 2>&1; inw t --')" "run"
check "an arg containing a space stays one argument" \
  "$(out "$S" 'inw n printf "[%s]" >/dev/null 2>&1; inw n -- "a b"')" "[a b]"
check "passthrough does not save" \
  "$(out "$S" 'inw t echo run >/dev/null 2>&1; inw t -- --watch >/dev/null 2>&1; inw t')" "run"
check "save carrying -- is refused" \
  "$(rc "$S" 'inw z npm test -- --watch')" "1"
check "refusal suggests quoting" \
  "$(err "$S" 'inw z npm test -- --watch' | grep -c 'inw z')" "1"
check "refused save stored nothing" \
  "$(rc "$S" 'inw z npm test -- --watch >/dev/null 2>&1; inw z')" "1"

echo "--- hostile values round-trip ---"
rm -f "$S"
export INW_HOSTILE='echo "a" '"'"'b'"'"' \ $HOME	tab'
run "$S" 'inw h "$INW_HOSTILE"' >/dev/null 2>&1
check "quotes, backslash, dollar, and tab survive" \
  "$(out "$S" 'printf "%s" "$(_inw_load; _inw_unescape "${_INW_CMD[h]}")"')" "$INW_HOSTILE"
rm -f "$S"
run "$S" "inw m \$'first\nsecond'" >/dev/null 2>&1
check "an embedded newline survives" \
  "$(out "$S" 'printf "%s" "$(_inw_load; _inw_unescape "${_INW_CMD[m]}")"' | wc -l)" "1"
rm -f "$S"
run "$S" 'inw lit '"'"'echo a\nb'"'"'' >/dev/null 2>&1
check "a literal backslash-n stays two characters" \
  "$(out "$S" 'printf "%s" "$(_inw_load; _inw_unescape "${_INW_CMD[lit]}")"')" 'echo a\nb'
check "running it produces no newline" \
  "$(out "$S" 'inw lit' | wc -l)" "1"

echo "--- reading the store executes nothing ---"
rm -f "$S"
CANARY="$SANDBOX/canary"
run "$S" "inw danger touch '$CANARY'" >/dev/null 2>&1
run "$S" 'inw' >/dev/null 2>&1
run "$S" 'inw -s danger' >/dev/null 2>&1
run "$S" 'inw other echo hi' >/dev/null 2>&1
check "list, search, and save do not run stored commands" \
  "$([ -e "$CANARY" ] && echo ran || echo clean)" "clean"
run "$S" 'inw danger' >/dev/null 2>&1
check "running the alias does run it" \
  "$([ -e "$CANARY" ] && echo ran || echo clean)" "ran"

echo "--- listing and multi-line collapse ---"
rm -f "$S"
run "$S" "inw m \$'first\nsecond'" >/dev/null 2>&1
check "multi-line collapses to one line" "$(out "$S" 'inw' | wc -l)" "1"
check "collapse marks the hidden remainder" "$(out "$S" 'inw' | grep -c '↵')" "1"
check "listing goes to stdout and pipes" "$(out "$S" 'inw' | cut -f1)" "m"

echo "--- search ---"
rm -f "$S"
run "$S" 'inw build npm run build' >/dev/null 2>&1
run "$S" "inw multi \$'one\nneedle-here'" >/dev/null 2>&1
check "matches on alias" "$(out "$S" 'inw -s buil' | cut -f1)" "build"
check "matches on command body" "$(out "$S" 'inw -s "run build"' | cut -f1)" "build"
check "matches a collapsed continuation line" "$(out "$S" 'inw -s needle-here' | cut -f1)" "multi"
check "is case-insensitive" "$(out "$S" 'inw -s BUIL' | cut -f1)" "build"
check "treats the term literally, not as a pattern" "$(rc "$S" 'inw -s "b.ild"')" "1"
check "no term is an error" "$(rc "$S" 'inw -s')" "1"

echo "--- remove ---"
rm -f "$S"
run "$S" 'inw a echo a; inw b echo b' >/dev/null 2>&1
run "$S" 'inw -d a' >/dev/null 2>&1
check "removes the named entry" "$(out "$S" 'inw' | cut -f1)" "b"
check "removing an absent alias is an error" "$(rc "$S" 'inw -d nosuch')" "1"
check "a failed remove changes nothing" "$(out "$S" 'inw -d nosuch >/dev/null 2>&1; inw' | cut -f1)" "b"

echo "--- file order is stable across writes ---"
rm -f "$S"
run "$S" 'inw zeta echo z; inw alpha echo a; inw make echo m; inw delta echo d' >/dev/null 2>&1
BEFORE=$(out "$S" 'inw' | cut -f1 | tr '\n' ' ')
run "$S" 'inw newone echo n' >/dev/null 2>&1
AFTER=$(out "$S" 'inw' | cut -f1 | tr '\n' ' ')
check "insertion order is preserved" "$BEFORE" "zeta alpha make delta "
check "an unrelated save does not reshuffle" "$AFTER" "zeta alpha make delta newone "

echo "--- alias grammar ---"
rm -f "$S"
check "uppercase is rejected" "$(err "$S" 'inw Bad' | grep -c -i uppercase)" "1"
check "uppercase exits non-zero" "$(rc "$S" 'inw Bad')" "1"
check "a dot is rejected" "$(rc "$S" 'inw bad.alias')" "1"
check "the dot message names the rule" \
  "$(err "$S" 'inw bad.alias' | grep -c -i 'not allowed')" "1"
check "an unknown flag is rejected, not saved" "$(rc "$S" 'inw -x')" "1"
check "an unknown flag is never read as an alias" \
  "$(err "$S" 'inw -x' | grep -c -i 'unknown option')" "1"

echo "--- malformed store ---"
rm -f "$S"
printf 'good\techo ok\nthis line has no tab\nalso-good\techo two\n' > "$S"
check "good lines still read" "$(out "$S" 'inw' | wc -l)" "2"
check "the bad line is reported" "$(err "$S" 'inw' | grep -c -i 'unreadable line')" "1"
check "saving is refused" "$(rc "$S" 'inw new echo x')" "1"
check "the store is left untouched" "$(wc -l < "$S")" "3"

echo "--- unwritable store ---"
RO="$SANDBOX/readonly"
mkdir -p "$RO" && chmod 500 "$RO"
check "a failed write is reported" \
  "$(err "$RO/store" 'inw b echo hi' | grep -c -i 'cannot write')" "1"
check "a failed write returns non-zero" "$(rc "$RO/store" 'inw b echo hi')" "1"
chmod 700 "$RO"

echo "--- missing alias ---"
rm -f "$S"
check "returns non-zero" "$(rc "$S" 'inw nosuchalias')" "1"
check "writes nothing to stdout" "$(out "$S" 'inw nosuchalias')" ""
check "reports on stderr" "$(err "$S" 'inw nosuchalias' | grep -c 'nosuchalias')" "1"

echo "--- help ---"
check "help goes to stdout" "$(out "$S" 'inw -h' | grep -c 'save a command under')" "1"
check "help covers every row of the surface" \
  "$(out "$S" 'inw -h' | grep -c -e '^  inw')" "7"
check "help returns zero" "$(rc "$S" 'inw -h')" "0"

echo "--- self-containment ---"
ISOLATED="$SANDBOX/isolated"
mkdir -p "$ISOLATED"
cp "$SH" "$ISOLATED/inw.sh"
check "works with no other repo file present" \
  "$(cd "$ISOLATED" && INW_FILE="$ISOLATED/s" bash -c 'source ./inw.sh; inw b echo alone >/dev/null 2>&1; inw b' 2>/dev/null)" "alone"

cd / || exit 1
rm -rf "$SANDBOX"
exit $fail
