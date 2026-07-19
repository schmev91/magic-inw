import { splitArgv, applyPassthrough } from '../../src/cli/argv.js';

describe('splitArgv', () => {
  it('returns null passthrough when there is no separator', () => {
    expect(splitArgv(['build'])).toEqual({ head: ['build'], passthrough: null });
  });

  it('splits head and passthrough at the separator', () => {
    expect(splitArgv(['build', '--', '--watch'])).toEqual({
      head: ['build'],
      passthrough: ['--watch'],
    });
  });

  it('distinguishes a trailing separator from no separator', () => {
    // `inw build --` means "run build with nothing extra", which is different
    // from `inw build` only in that the user typed a separator.
    expect(splitArgv(['build', '--'])).toEqual({ head: ['build'], passthrough: [] });
  });

  it('keeps scope flags in the head', () => {
    expect(splitArgv(['-p', 'build', '--', '--watch'])).toEqual({
      head: ['-p', 'build'],
      passthrough: ['--watch'],
    });
  });

  it('treats a second separator as part of the passthrough', () => {
    expect(splitArgv(['run', '--', 'npm', 'test', '--', '--bail'])).toEqual({
      head: ['run'],
      passthrough: ['npm', 'test', '--', '--bail'],
    });
  });

  it('handles an empty argv', () => {
    expect(splitArgv([])).toEqual({ head: [], passthrough: null });
  });

  it('handles a separator in first position', () => {
    expect(splitArgv(['--', 'x'])).toEqual({ head: [], passthrough: ['x'] });
  });

  it('does not treat a token merely containing dashes as a separator', () => {
    expect(splitArgv(['build', '--watch'])).toEqual({
      head: ['build', '--watch'],
      passthrough: null,
    });
  });
});

describe('applyPassthrough', () => {
  it('returns the command unchanged when there is no passthrough', () => {
    expect(applyPassthrough('npm run build', null)).toBe('npm run build');
  });

  it('returns the command unchanged for an empty passthrough', () => {
    expect(applyPassthrough('npm run build', [])).toBe('npm run build');
  });

  it('appends a single argument', () => {
    expect(applyPassthrough('npm run build', ['--watch'])).toBe('npm run build --watch');
  });

  it('appends several arguments in order', () => {
    expect(applyPassthrough('npm test', ['--bail', '--verbose'])).toBe('npm test --bail --verbose');
  });

  it('does not re-quote arguments the user already quoted at their prompt', () => {
    // The result goes back to the same shell the user typed at, so re-quoting
    // would break --flag="a b".
    expect(applyPassthrough('run', ['--flag=a b'])).toBe('run --flag=a b');
  });
});
