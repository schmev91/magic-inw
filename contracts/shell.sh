# inw shell integration.
#
# Source this from your ~/.bashrc:
#   source /path/to/magic-inw/contracts/shell.sh
#
# The function is what makes `inw` work at all. Saved commands are eval'd in
# THIS shell, so `cd`, `export`, aliases, and shell functions inside a saved
# command affect your session — which is the whole point, and is impossible if
# the Node process runs them in a subprocess.

# Written for POSIX sh rather than bash specifically (case instead of [[ ]]),
# so it works in bash, zsh, dash, and ash alike.

inw() {
  local output status

  # INW_SHELL_WRAPPER tells the binary it is wrapped. Without it, the binary
  # prints the command instead of emitting a signal nothing would evaluate.
  output=$(INW_SHELL_WRAPPER=1 command inw "$@")
  status=$?

  case "$output" in
    __exec__:*)
      # Strip the prefix and run the rest in this shell.
      eval "${output#__exec__:}"
      # Propagate the command's own exit status, not the wrapper's: `inw test`
      # standing in for `npm test` is useless if it always returns 0.
      return $?
      ;;
  esac

  # Not a signal. Anything on stdout that is not the prefix is passed through;
  # human-facing output already went to stderr and reached the terminal.
  if [ -n "$output" ]; then
    printf '%s\n' "$output"
  fi
  return $status
}
