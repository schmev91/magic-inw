import {
  writeExecSignal,
  isWrapped,
  logError,
  logSuccess,
  logWarning,
  logNote,
  reportUnwrapped,
  EXEC_PREFIX,
} from '../../src/core/output.js';

let stdout: string;
let stderr: string;
let realStdoutWrite: typeof process.stdout.write;
let realStderrWrite: typeof process.stderr.write;

beforeEach(() => {
  stdout = '';
  stderr = '';
  realStdoutWrite = process.stdout.write.bind(process.stdout);
  realStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string) => {
    stdout += chunk;
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => {
    stderr += chunk;
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  process.stdout.write = realStdoutWrite;
  process.stderr.write = realStderrWrite;
});

describe('writeExecSignal', () => {
  it('writes exactly the prefixed command with no trailing newline', () => {
    // A trailing newline would be captured into the string the shell eval's.
    writeExecSignal('npm test');

    expect(stdout).toBe(`${EXEC_PREFIX}npm test`);
    expect(stdout.endsWith('\n')).toBe(false);
  });

  it('writes nothing to stderr', () => {
    writeExecSignal('npm test');

    expect(stderr).toBe('');
  });

  it('carries a multi-line command intact', () => {
    const multi = 'cd /srv/app\nnpm ci\nnpm run build';
    writeExecSignal(multi);

    expect(stdout).toBe(`${EXEC_PREFIX}${multi}`);
  });

  it('carries shell metacharacters through unmodified', () => {
    const cmd = 'grep -r "$USER" . | awk \'{print $1}\' && echo done';
    writeExecSignal(cmd);

    expect(stdout.slice(EXEC_PREFIX.length)).toBe(cmd);
  });

  it('emits no ANSI colour codes, which would be eval\'d as text', () => {
    writeExecSignal('npm test');

    expect(stdout).not.toContain('\x1b[');
  });
});

describe('human-facing output', () => {
  it.each([
    ['logError', logError],
    ['logSuccess', logSuccess],
    ['logWarning', logWarning],
    ['logNote', logNote],
  ])('%s writes to stderr and never stdout', (_name, fn) => {
    fn('a message');

    expect(stderr).toContain('a message');
    expect(stdout).toBe('');
  });

  it('reportUnwrapped writes only to stderr', () => {
    reportUnwrapped('npm test');

    expect(stdout).toBe('');
    expect(stderr).toContain('npm test');
  });

  it('reportUnwrapped explains how to install the shell function', () => {
    reportUnwrapped('npm test');

    expect(stderr).toMatch(/shell function/i);
    expect(stderr).toContain('shell.sh');
  });

  it('reportUnwrapped does not emit the exec prefix', () => {
    // Emitting it unwrapped would print a raw __exec__: line at the user.
    reportUnwrapped('npm test');

    expect(stdout).not.toContain(EXEC_PREFIX);
    expect(stderr).not.toContain(EXEC_PREFIX);
  });
});

describe('isWrapped', () => {
  it('is true only when the wrapper marker is set to 1', () => {
    expect(isWrapped({ INW_SHELL_WRAPPER: '1' })).toBe(true);
  });

  it.each([{}, { INW_SHELL_WRAPPER: '' }, { INW_SHELL_WRAPPER: '0' }])(
    'is false for env %p',
    (env) => {
      expect(isWrapped(env as NodeJS.ProcessEnv)).toBe(false);
    },
  );
});
