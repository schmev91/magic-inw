import { isValidAlias, validateAlias, ALIAS_PATTERN } from '../../src/core/grammar.js';

describe('isValidAlias', () => {
  it.each([
    ['mem', 'lowercase word'],
    ['build-watch', 'kebab-case'],
    ['deploy_prod', 'snake_case'],
    ['0', 'a migrated legacy slot'],
    ['9', 'the last legacy slot'],
    ['a1', 'letter then digit'],
    ['1a', 'digit then letter'],
    ['x', 'single character'],
    ['a-b_c-d', 'mixed separators'],
  ])('accepts %p (%s)', (alias) => {
    expect(isValidAlias(alias)).toBe(true);
  });

  it.each([
    ['Mem', 'uppercase'],
    ['MEM', 'all caps'],
    ['-p', 'leading hyphen would collide with a flag'],
    ['--watch', 'leading double hyphen would collide with a flag'],
    ['_x', 'leading underscore'],
    ['', 'empty string'],
    ['my cmd', 'contains a space'],
    ['a.b', 'contains a dot'],
    ['a/b', 'contains a slash'],
    ['a:b', 'contains a colon'],
    ['écho', 'non-ASCII'],
    ['a\tb', 'contains a tab'],
    ['a\nb', 'contains a newline'],
  ])('rejects %p (%s)', (alias) => {
    expect(isValidAlias(alias)).toBe(false);
  });

  it('rejects a leading hyphen so flags can never be read as aliases', () => {
    // This is the property the argv grammar depends on: `inw -p mem` must never
    // parse `-p` as the alias.
    expect(isValidAlias('-p')).toBe(false);
    expect(isValidAlias('-g')).toBe(false);
  });
});

describe('validateAlias', () => {
  it('returns ok for a valid alias', () => {
    expect(validateAlias('build-watch')).toEqual({ ok: true });
  });

  it('names the empty-input rule', () => {
    const result = validateAlias('');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/empty/i);
  });

  it('names uppercase specifically rather than printing a regex', () => {
    const result = validateAlias('Deploy');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toMatch(/lowercase/i);
    expect(result.reason).not.toContain('^[a-z0-9]');
  });

  it('names the leading-character rule for a leading hyphen', () => {
    const result = validateAlias('-p');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toMatch(/start/i);
  });

  it('names the leading-character rule for a leading underscore', () => {
    const result = validateAlias('_x');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toMatch(/start/i);
  });

  it('names the allowed character set for an interior violation', () => {
    const result = validateAlias('my cmd');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toMatch(/letters|digits|hyphen|underscore/i);
  });

  it('always explains why, never just "invalid"', () => {
    for (const bad of ['', 'Mem', '-p', '_x', 'a.b']) {
      const result = validateAlias(bad);
      if (result.ok) throw new Error(`expected ${bad} to fail`);
      expect(result.reason.length).toBeGreaterThan(15);
      expect(result.reason.toLowerCase()).not.toBe('invalid alias');
    }
  });
});

describe('ALIAS_PATTERN', () => {
  it('is exported so no other module re-declares the rule', () => {
    expect(ALIAS_PATTERN.source).toBe('^[a-z0-9][a-z0-9_-]*$');
  });
});
