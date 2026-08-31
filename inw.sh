# inw.sh — save and run shell commands by name, from a single file.
#
#   source /path/to/inw.sh        # add this line to your ~/.bashrc
#
# This file is SOURCED, never executed. Saved commands are eval'd in the
# calling shell, so a saved `cd`, `export`, alias, or function affects your
# session — which is the whole point, and is impossible from a subprocess.
#
# Standalone by design: no Node, no install, no other file from this
# repository. Copy it onto a box and source it.
#
# It does NOT share storage with the TypeScript `inw` in this repo. That one
# reads `.inw_commands` (TOML, with project scopes); this one reads a flat
# file of its own. Sourcing this file replaces any `inw` function already
# defined, including the one from contracts/shell.sh.

# ---------------------------------------------------------------- load guards

# Executed rather than sourced? Say so and stop. Detection runs BEFORE the
# version check, because aborting a sourced file needs `return` while aborting
# an executed one needs `exit`, and using `exit` while sourced would close the
# user's shell.
if [ "${BASH_SOURCE[0]-$0}" = "$0" ]; then
  printf 'inw.sh: this file must be sourced, not executed.\n' >&2
  printf '  Run:  source %s\n' "$0" >&2
  printf '  Or add that line to your ~/.bashrc.\n' >&2
  printf 'Executing it would run saved commands in a subshell, where a saved\n' >&2
  printf '`cd` or `export` dies without affecting your session.\n' >&2
  exit 1
fi

# Takes the major version as an argument so the failure path is testable
# without an actual bash 3 binary — BASH_VERSINFO is readonly and cannot be
# faked by assignment.
_inw_check_bash_version() {
  local major=${1-${BASH_VERSINFO[0]-0}}
  if [ "$major" -ge 4 ] 2>/dev/null; then
    return 0
  fi
  printf 'inw.sh: needs bash 4.0 or later (found %s).\n' "${BASH_VERSION-unknown}" >&2
  printf '  Associative arrays are a bash 4 feature. On macOS, /bin/bash is\n' >&2
  printf '  3.2 — install a newer bash and source this from that shell.\n' >&2
  return 1
}

# `return` at file scope aborts the source. Only reachable when sourced.
_inw_check_bash_version || return 1

# ------------------------------------------------------------------- globals

# Declared at file scope so they are global without needing `declare -g`,
# which bash 4.0 and 4.1 lack.
declare -A _INW_CMD     # alias -> escaped command text
declare -a _INW_ORDER   # aliases in file order; assoc arrays have none
declare _INW_STORE_BAD  # 1 when the store had lines we could not parse

# ------------------------------------------------------------------ encoding

# The store holds data, never code. `printf %q` would have been the obvious
# encoding, but reversing it needs an eval — and listing has to decode every
# entry to display it, which would put every saved command through eval on a
# bare `inw`. These two are reversible with parameter expansion alone.
_inw_escape() {
  local s=$1
  s=${s//\\/\\\\}       # backslash first, or the escapes below get doubled
  s=${s//$'\t'/\\t}
  s=${s//$'\n'/\\n}
  printf '%s' "$s"
}

# Single left-to-right pass. Two sequential global replacements would be
# wrong: they cannot tell a real newline from a literal backslash-n the user
# actually typed.
_inw_unescape() {
  local s=$1 out='' head c
  while [[ $s == *'\'* ]]; do
    head=${s%%\\*}
    out+=$head
    s=${s#*\\}
    c=${s:0:1}
    case $c in
      n) out+=$'\n' ;;
      t) out+=$'\t' ;;
      \\) out+='\' ;;
      *) out+="\\$c" ;;
    esac
    s=${s:1}
  done
  out+=$s
  printf '%s' "$out"
}

# --------------------------------------------------------------------- store

_inw_store_path() {
  if [ -n "${INW_FILE-}" ]; then
    printf '%s' "$INW_FILE"
    return 0
  fi
  if [ -z "${HOME-}" ]; then
    printf 'inw: HOME is unset, so there is no default store.\n' >&2
    printf '  Set INW_FILE to the path you want.\n' >&2
    return 1
  fi
  printf '%s/.inw_cmds' "$HOME"
}

_inw_is_alias() {
  [[ $1 =~ ^[a-z0-9][a-z0-9_-]*$ ]]
}

# Reads the store into _INW_CMD / _INW_ORDER. Evaluates nothing.
_inw_load() {
  local file line name rest k
  for k in "${!_INW_CMD[@]}"; do unset "_INW_CMD[$k]"; done
  _INW_ORDER=()
  _INW_STORE_BAD=0

  file=$(_inw_store_path) || return 1
  [ -f "$file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    name=${line%%$'\t'*}
    rest=${line#*$'\t'}
    if [ "$name" = "$line" ] || ! _inw_is_alias "$name" || [ -z "$rest" ]; then
      _INW_STORE_BAD=1
      printf 'inw: skipping unreadable line in %s: %.40s\n' "$file" "$line" >&2
      continue
    fi
    if [ -z "${_INW_CMD[$name]+set}" ]; then
      _INW_ORDER+=("$name")
    fi
    _INW_CMD[$name]=$rest
  done < "$file"

  if [ "$_INW_STORE_BAD" -eq 1 ]; then
    printf 'inw: saving is disabled until those lines are fixed or removed.\n' >&2
  fi
  return 0
}

# Writes via a fresh temp file in the same directory, then renames. Mode 0600
# is set explicitly: the rename means the temp file's mode becomes the store's
# mode, so relying on the ambient umask would re-widen permissions on every
# save — and saved commands routinely carry tokens.
_inw_save_store() {
  local file dir tmp name
  file=$(_inw_store_path) || return 1

  if [ "$_INW_STORE_BAD" -eq 1 ]; then
    printf 'inw: refusing to write %s while it has unreadable lines.\n' "$file" >&2
    printf '  Fix or delete them first; nothing was changed.\n' >&2
    return 1
  fi

  dir=${file%/*}
  [ "$dir" = "$file" ] && dir=.
  if ! mkdir -p "$dir" 2>/dev/null; then
    printf 'inw: cannot create %s; nothing was changed.\n' "$dir" >&2
    return 1
  fi

  if ! tmp=$(mktemp "$dir/.inw_cmds.XXXXXX" 2>/dev/null); then
    printf 'inw: cannot write to %s; nothing was changed.\n' "$dir" >&2
    return 1
  fi
  chmod 600 "$tmp" 2>/dev/null

  for name in "${_INW_ORDER[@]}"; do
    printf '%s\t%s\n' "$name" "${_INW_CMD[$name]}" >> "$tmp" || {
      rm -f "$tmp"
      printf 'inw: write to %s failed; %s is unchanged.\n' "$tmp" "$file" >&2
      return 1
    }
  done

  if ! mv "$tmp" "$file" 2>/dev/null; then
    rm -f "$tmp"
    printf 'inw: could not replace %s; it is unchanged.\n' "$file" >&2
    return 1
  fi
  return 0
}

# ------------------------------------------------------------------- display

# One line per entry. A multi-line command shows its first line plus a marker.
_inw_collapse() {
  local s=$1
  if [[ $s == *$'\n'* ]]; then
    printf '%s ↵' "${s%%$'\n'*}"
  else
    printf '%s' "$s"
  fi
}

_inw_print_entry() {
  local name=$1 cmd
  cmd=$(_inw_unescape "${_INW_CMD[$name]}")
  printf '%s\t%s\n' "$name" "$(_inw_collapse "$cmd")"
}

_inw_help() {
  cat <<'HELP'
inw — save and run shell commands by name.

  inw                       list saved commands
  inw <alias>               run the command saved under <alias>
  inw <alias> <command...>  save a command under <alias>
  inw <alias> -- <args...>  run it with extra arguments appended
  inw -s <term>             list commands matching <term>
  inw -d <alias>            remove a saved command
  inw -h                    show this help

An alias is lowercase letters, digits, hyphens, and underscores, and starts
with a letter or digit. That rule is what lets `inw b npm run build` mean
"save" with no flag, and keeps a flag from ever being read as an alias.

Commands live in $INW_FILE, or ~/.inw_cmds by default.
HELP
}

# ------------------------------------------------------------------- actions

_inw_list() {
  local name
  for name in "${_INW_ORDER[@]}"; do
    _inw_print_entry "$name"
  done
  return 0
}

_inw_search() {
  local term=$1 name hay found=0
  if [ -z "$term" ]; then
    printf 'inw: -s needs something to search for.\n' >&2
    return 1
  fi
  term=${term,,}
  for name in "${_INW_ORDER[@]}"; do
    # Match the whole command, including the continuation lines the listing
    # collapses away — that is how you find a command saved months ago under
    # a name you have forgotten.
    hay="$name $(_inw_unescape "${_INW_CMD[$name]}")"
    if [[ ${hay,,} == *"$term"* ]]; then
      _inw_print_entry "$name"
      found=1
    fi
  done
  [ "$found" -eq 1 ]
}

_inw_save() {
  local name=$1 cmd=$2 file
  # An empty command would serialize to a line with nothing after the tab,
  # which the loader treats as unreadable — and an unreadable line disables
  # every later save. Refuse it here rather than let one keystroke wedge the
  # store.
  if [ -z "${cmd//[[:space:]]/}" ]; then
    printf 'inw: refusing to save an empty command under "%s".\n' "$name" >&2
    return 1
  fi
  _INW_CMD[$name]=$(_inw_escape "$cmd")
  local seen=0 existing
  for existing in "${_INW_ORDER[@]}"; do
    [ "$existing" = "$name" ] && seen=1 && break
  done
  [ "$seen" -eq 0 ] && _INW_ORDER+=("$name")

  _inw_save_store || return 1
  file=$(_inw_store_path)
  printf 'Saved %s\n' "$name" >&2
  printf '  %s\n' "$file" >&2
  return 0
}

_inw_remove() {
  local name=$1 file kept=() existing
  if [ -z "$name" ]; then
    printf 'inw: -d needs the alias to remove.\n' >&2
    return 1
  fi
  if [ -z "${_INW_CMD[$name]+set}" ]; then
    printf 'inw: no command saved as "%s".\n' "$name" >&2
    return 1
  fi
  unset "_INW_CMD[$name]"
  for existing in "${_INW_ORDER[@]}"; do
    [ "$existing" = "$name" ] || kept+=("$existing")
  done
  _INW_ORDER=("${kept[@]}")

  _inw_save_store || return 1
  file=$(_inw_store_path)
  printf 'Removed %s\n' "$name" >&2
  printf '  %s\n' "$file" >&2
  return 0
}

_inw_alias_error() {
  local token=$1
  if [[ $token == *[A-Z]* ]]; then
    printf 'inw: alias "%s" contains uppercase. Aliases are lowercase — try "%s".\n' \
      "$token" "${token,,}" >&2
  elif [[ $token != [a-z0-9]* ]]; then
    printf 'inw: alias "%s" must start with a letter or digit.\n' "$token" >&2
    printf '  Leading hyphens and underscores are reserved so flags are never\n' >&2
    printf '  mistaken for aliases.\n' >&2
  else
    printf 'inw: alias "%s" has characters that are not allowed. Use lowercase\n' "$token" >&2
    printf '  letters, digits, hyphens, and underscores.\n' >&2
  fi
  return 1
}

# ------------------------------------------------------------------ dispatch

inw() {
  # Split on the first `--` before anything else looks at the arguments.
  # Without this, `inw build -- --watch` is indistinguishable from saving
  # `--watch` under the alias `build`.
  local -a _inw_head=() _inw_pass=()
  local _inw_sep=0 _inw_a
  for _inw_a in "$@"; do
    if [ "$_inw_sep" -eq 0 ] && [ "$_inw_a" = "--" ]; then
      _inw_sep=1
      continue
    fi
    if [ "$_inw_sep" -eq 1 ]; then
      _inw_pass+=("$_inw_a")
    else
      _inw_head+=("$_inw_a")
    fi
  done

  _inw_load || return 1

  if [ ${#_inw_head[@]} -eq 0 ]; then
    _inw_list
    return $?
  fi

  local _inw_first=${_inw_head[0]}

  case $_inw_first in
    -h|--help) _inw_help; return 0 ;;
    -s) _inw_search "${_inw_head[1]-}"; return $? ;;
    -d) _inw_remove "${_inw_head[1]-}"; return $? ;;
    -*)
      printf 'inw: unknown option "%s". Try: inw -h\n' "$_inw_first" >&2
      return 1
      ;;
  esac

  if ! _inw_is_alias "$_inw_first"; then
    _inw_alias_error "$_inw_first"
    return 1
  fi

  # Two or more tokens: save.
  if [ ${#_inw_head[@]} -gt 1 ]; then
    if [ "$_inw_sep" -eq 1 ]; then
      printf 'inw: `--` is for running, not saving, so the words after it\n' >&2
      printf '  would be dropped from what gets saved. Quote the command:\n' >&2
      printf "  inw %s '%s -- %s'\n" "$_inw_first" \
        "${_inw_head[*]:1}" "${_inw_pass[*]}" >&2
      return 1
    fi
    _inw_save "$_inw_first" "${_inw_head[*]:1}"
    return $?
  fi

  # One token: run.
  if [ -z "${_INW_CMD[$_inw_first]+set}" ]; then
    printf 'inw: no command saved as "%s".\n' "$_inw_first" >&2
    return 1
  fi

  local _inw_cmd
  _inw_cmd=$(_inw_unescape "${_INW_CMD[$_inw_first]}")

  # Re-quote each passthrough word. Bash already word-split "$@" before this
  # function saw it, so joining raw would let `--flag="a b"` reach the command
  # as two arguments instead of one.
  if [ ${#_inw_pass[@]} -gt 0 ]; then
    local _inw_w
    for _inw_w in "${_inw_pass[@]}"; do
      _inw_cmd+=" $(printf '%q' "$_inw_w")"
    done
  fi

  eval "$_inw_cmd"
  return $?
}
