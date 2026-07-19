/**
 * Argv preprocessing.
 *
 * meow wraps yargs-parser, which by default folds tokens after `--` into
 * positional input. That would make `inw build -- --watch` indistinguishable
 * from saving `--watch` under the alias `build`, so the split happens here,
 * before meow ever sees the arguments.
 *
 * Kept free of any `process` access so it is testable as a pure function.
 */

export interface SplitArgv {
  /** Tokens before `--`, handed to meow. */
  head: string[];
  /**
   * Tokens after the first `--`, appended to the resolved command.
   * Null when no separator was present — distinct from an empty array, which
   * means `--` appeared with nothing after it.
   */
  passthrough: string[] | null;
}

export function splitArgv(argv: string[]): SplitArgv {
  const index = argv.indexOf('--');
  if (index === -1) {
    return { head: argv, passthrough: null };
  }

  return {
    head: argv.slice(0, index),
    // Everything after the FIRST separator, including any later `--`, belongs
    // to the command being run.
    passthrough: argv.slice(index + 1),
  };
}

/**
 * Append passthrough arguments to a command.
 *
 * Arguments are joined with spaces rather than shell-quoted: they were typed
 * by the user at their own shell prompt and are being handed back to that same
 * shell to eval. Re-quoting would break `inw build -- --flag="a b"`.
 */
export function applyPassthrough(command: string, passthrough: string[] | null): string {
  if (passthrough === null || passthrough.length === 0) {
    return command;
  }
  return `${command} ${passthrough.join(' ')}`;
}
