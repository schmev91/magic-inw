import { deleteCharBefore, deleteWordBefore, printableInput } from '../../src/core/text-edit.js';

describe('deleteCharBefore', () => {
  it('removes the last character', () => {
    expect(deleteCharBefore('npm')).toBe('np');
  });

  it('is a no-op on an empty string', () => {
    expect(deleteCharBefore('')).toBe('');
  });

  it('removes a trailing space', () => {
    expect(deleteCharBefore('npm ')).toBe('npm');
  });
});

describe('deleteWordBefore', () => {
  it.each([
    ['npm run build', 'npm run '],
    ['npm run ', 'npm '],
    ['npm', ''],
    ['npm   ', ''],
    ['', ''],
    ['   ', ''],
    ['one', ''],
    ['a b', 'a '],
  ])('turns %p into %p', (input, expected) => {
    expect(deleteWordBefore(input)).toBe(expected);
  });

  it('collapses the same word whether or not it has trailing space', () => {
    expect(deleteWordBefore('npm run')).toBe(deleteWordBefore('npm run '));
  });

  it('treats punctuation as part of the word', () => {
    expect(deleteWordBefore('./scripts/deploy.sh staging')).toBe('./scripts/deploy.sh ');
  });

  it('removes only one word per call', () => {
    expect(deleteWordBefore(deleteWordBefore('a b c'))).toBe('a ');
  });
});

describe('printableInput', () => {
  it('passes through an ordinary character', () => {
    expect(printableInput('a', {})).toBe('a');
  });

  it('passes through a multi-character paste', () => {
    expect(printableInput('npm test', {})).toBe('npm test');
  });

  it('rejects a Ctrl combo even though ink reports the bare letter', () => {
    // Ctrl+W arrives as "w" with ctrl set. Testing the string alone would type
    // a "w" every time the user asked to delete a word.
    expect(printableInput('w', { ctrl: true })).toBe('');
  });

  it('rejects a Meta/Alt combo', () => {
    expect(printableInput('b', { meta: true })).toBe('');
  });

  it.each([['return'], ['escape'], ['tab']])('rejects %s', (flag) => {
    expect(printableInput('x', { [flag]: true })).toBe('');
  });

  it('strips control characters from a chunk', () => {
    expect(printableInput('a\x00b\x7fc', {})).toBe('abc');
  });

  it('returns empty for the empty input ink sends with special keys', () => {
    expect(printableInput('', {})).toBe('');
  });

  it('keeps spaces, which are legitimate search characters', () => {
    expect(printableInput(' ', {})).toBe(' ');
  });
});
