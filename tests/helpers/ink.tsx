import { EventEmitter } from 'node:events';
import { ReactElement } from 'react';
import { render as inkRender } from 'ink';

/**
 * Minimal Ink test harness.
 *
 * ink-testing-library's fake stdin lacks `ref`/`unref`, which ink 4's
 * useInput calls on mount — the component throws "stdin.ref is not a function"
 * and renders an error frame instead of the UI. (magic-onw hit this and left
 * its ListView test as a placeholder that asserts nothing.)
 *
 * Providing a stdin that satisfies the full interface ink expects makes the
 * picker genuinely testable, keystrokes included.
 */

class FakeStdin extends EventEmitter {
  isTTY = true;
  private queue: string[] = [];

  setRawMode() { return this; }
  ref() { return this; }
  unref() { return this; }
  resume() { return this; }
  pause() { return this; }
  setEncoding() { return this; }

  /**
   * Ink 4 drains input with the readable/read() pattern rather than listening
   * for 'data', so the fake has to buffer and serve chunks the same way.
   */
  read(): string | null {
    return this.queue.shift() ?? null;
  }

  /** Feed keystrokes to the component under test. */
  send(data: string) {
    this.queue.push(data);
    this.emit('readable');
  }
}

class FakeStdout extends EventEmitter {
  columns = 100;
  rows = 40;
  frames: string[] = [];

  write(frame: string) {
    this.frames.push(frame);
    return true;
  }

  get lastFrame() {
    return this.frames[this.frames.length - 1] ?? '';
  }
}

export interface InkTestResult {
  lastFrame: () => string;
  frames: string[];
  write: (input: string) => void;
  unmount: () => void;
}

export function renderInk(element: ReactElement): InkTestResult {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();

  const instance = inkRender(element, {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  return {
    lastFrame: () => stdout.lastFrame,
    frames: stdout.frames,
    write: (input: string) => stdin.send(input),
    unmount: () => instance.unmount(),
  };
}

/** Let Ink flush a render pass. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 30));


/** Key sequences, by the name a user would call them. */
export const KEYS = {
  enter: '\r',
  escape: '\x1b',
  backspace: '\x7f',
  backspaceBS: '\x08',
  altBackspace: '\x1b\x7f',
  altBackspaceBS: '\x1b\x08',
  deleteKey: '\x1b[3~',
  up: '\x1b[A',
  down: '\x1b[B',
  ctrlU: '\x15',
  ctrlW: '\x17',
  ctrlY: '\x19',
  ctrlE: '\x05',
  ctrlX: '\x18',
} as const;
