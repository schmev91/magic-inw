/**
 * Output channels.
 *
 * stdout is RESERVED for the exec signal. The shell wrapper eval's whatever
 * arrives there, so anything else written to stdout — a stray console.log, a
 * dependency banner, an Ink frame — becomes arbitrary code executed in the
 * user's live interactive shell. Every human-facing message goes to stderr.
 */

/** Prefix the shell wrapper looks for. */
export const EXEC_PREFIX = '__exec__:';

/** Env marker the shell function exports so the binary knows it is wrapped. */
export const WRAPPER_MARKER = 'INW_SHELL_WRAPPER';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Emit the command for the shell wrapper to eval.
 *
 * No trailing newline: the wrapper strips the prefix and eval's the remainder,
 * and a trailing newline would be captured into the command string.
 */
export function writeExecSignal(command: string): void {
  process.stdout.write(`${EXEC_PREFIX}${command}`);
}

/** True when running under the shell function rather than bare. */
export function isWrapped(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[WRAPPER_MARKER] === '1';
}

export function logError(message: string): void {
  process.stderr.write(`${RED}Error:${RESET} ${message}\n`);
}

export function logSuccess(message: string): void {
  process.stderr.write(`${GREEN}✓${RESET} ${message}\n`);
}

export function logWarning(message: string): void {
  process.stderr.write(`${YELLOW}Warning:${RESET} ${message}\n`);
}

export function logNote(message: string): void {
  process.stderr.write(`${DIM}${message}${RESET}\n`);
}

export function bold(text: string): string {
  return `${BOLD}${text}${RESET}`;
}

/**
 * Explain that the command cannot be run because the shell function is not
 * installed, and print it so the user can still copy it.
 *
 * Emitting the signal here would be worse than useless: nothing would eval it,
 * and the raw `__exec__:` line would just be printed by the user's shell.
 */
export function reportUnwrapped(command: string): void {
  logWarning('The inw shell function is not installed, so commands cannot be run.');
  logNote('Add this to your ~/.bashrc:');
  logNote('  source /path/to/magic-inw/contracts/shell.sh');
  process.stderr.write(`\n${bold('Command:')} ${command}\n`);
}
