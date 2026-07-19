import { resolveClipboardCommand, CLIPBOARD_CANDIDATES } from '../../src/core/clipboard.js';

/** Build a probe that reports only the named binaries as present. */
const probeFor = (...available: string[]) => (bin: string) => available.includes(bin);

describe('resolveClipboardCommand', () => {
  it('picks clip.exe on WSL even when Linux tools are also present', () => {
    const resolved = resolveClipboardCommand(probeFor('clip.exe', 'xclip', 'xsel'));

    expect(resolved.ok).toBe(true);
    expect(resolved.ok && resolved.command.bin).toBe('clip.exe');
  });

  it('picks pbcopy on macOS', () => {
    const resolved = resolveClipboardCommand(probeFor('pbcopy'));

    expect(resolved.ok && resolved.command.bin).toBe('pbcopy');
  });

  it('prefers wl-copy over xclip on Wayland', () => {
    const resolved = resolveClipboardCommand(probeFor('wl-copy', 'xclip', 'xsel'));

    expect(resolved.ok && resolved.command.bin).toBe('wl-copy');
  });

  it('prefers xclip over xsel', () => {
    const resolved = resolveClipboardCommand(probeFor('xclip', 'xsel'));

    expect(resolved.ok && resolved.command.bin).toBe('xclip');
  });

  it('falls all the way through to xsel', () => {
    const resolved = resolveClipboardCommand(probeFor('xsel'));

    expect(resolved.ok && resolved.command.bin).toBe('xsel');
  });

  it('walks the candidate list in the documented order', () => {
    const probed: string[] = [];
    resolveClipboardCommand((bin) => {
      probed.push(bin);
      return false;
    });

    expect(probed).toEqual(CLIPBOARD_CANDIDATES.map((c) => c.bin));
  });

  it('returns a structured failure rather than throwing when nothing is available', () => {
    const resolved = resolveClipboardCommand(probeFor());

    expect(resolved.ok).toBe(false);
    expect(resolved.ok === false && resolved.reason).toMatch(/clipboard/i);
  });

  it('names the tools it looked for so the user can install one', () => {
    const resolved = resolveClipboardCommand(probeFor());

    if (resolved.ok) throw new Error('expected failure');
    expect(resolved.reason).toContain('xclip');
    expect(resolved.reason).toContain('pbcopy');
  });

  it('passes the clipboard selection argument to xclip', () => {
    // A bare `xclip` writes to the PRIMARY selection, which looks to the user
    // like the copy silently did nothing.
    const resolved = resolveClipboardCommand(probeFor('xclip'));

    expect(resolved.ok && resolved.command.args).toEqual(['-selection', 'clipboard']);
  });

  it('passes the clipboard selection argument to xsel', () => {
    const resolved = resolveClipboardCommand(probeFor('xsel'));

    expect(resolved.ok && resolved.command.args).toEqual(['--clipboard', '--input']);
  });

  it('passes no arguments to clip.exe or pbcopy, which need none', () => {
    const clip = resolveClipboardCommand(probeFor('clip.exe'));
    const pb = resolveClipboardCommand(probeFor('pbcopy'));

    expect(clip.ok && clip.command.args).toEqual([]);
    expect(pb.ok && pb.command.args).toEqual([]);
  });
});
