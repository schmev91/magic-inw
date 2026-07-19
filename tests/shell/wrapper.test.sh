#!/usr/bin/env bash
# Exercises contracts/shell.sh against a fake `inw` binary so the wrapper's
# own behavior is tested independently of the Node implementation.
FAKE=$(mktemp -d)
cat > "$FAKE/inw" <<'BIN'
#!/usr/bin/env bash
case "$1" in
  exec-cd)      printf '__exec__:cd /tmp' ;;
  exec-export)  printf '__exec__:export INW_PROOF=1' ;;
  exec-fail)    printf '__exec__:bash -c "exit 42"' ;;
  exec-ok)      printf '__exec__:true' ;;
  plain)        echo "just some output" ;;
  errout)       echo "human message" >&2; exit 3 ;;
  checkenv)     echo "WRAPPED=$INW_SHELL_WRAPPER" ;;
esac
BIN
chmod +x "$FAKE/inw"
export PATH="$FAKE:$PATH"
source contracts/shell.sh

fail=0
check() { if [ "$2" = "$3" ]; then echo "  ok: $1"; else echo "  FAIL: $1 (got '$2' want '$3')"; fail=1; fi; }

start=$PWD
inw exec-cd
check "cd persists in the calling shell" "$PWD" "/tmp"
cd "$start" || exit 1

inw exec-export
check "export persists in the calling shell" "$INW_PROOF" "1"

inw exec-fail
check "exit status propagates (42)" "$?" "42"

inw exec-ok
check "success status propagates (0)" "$?" "0"

out=$(inw plain)
check "non-signal stdout passes through" "$out" "just some output"

inw errout 2>/dev/null
check "binary exit status propagates when not a signal" "$?" "3"

out=$(inw checkenv)
check "wrapper marker is exported to the binary" "$out" "WRAPPED=1"

rm -rf "$FAKE"
exit $fail
