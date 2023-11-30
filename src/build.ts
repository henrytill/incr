import crypto, { BinaryLike } from 'node:crypto';
import { PathLike } from 'node:fs';
import fs, { FileChangeInfo } from 'node:fs/promises';

import { Channel } from './channel.js';
import { AsyncComputable, AutoCell, Cell } from './core.js';

export type HashDigest = string;

export type Message = {
  filename: PathLike;
  event: FileChangeInfo<string>;
};

export class Input extends Cell<HashDigest> {
  watcher: Promise<void>;
  notifications: Channel<Message> = new Channel();

  private constructor(value: HashDigest, key: string, signal: AbortSignal) {
    super(value, key);
    this.watcher = watch(this, signal);
  }

  static async of(filename: PathLike, signal: AbortSignal): Promise<Input> {
    const value = await fs.readFile(filename).then(hash);
    const ret = new Input(value, filename.toString(), signal);
    return ret;
  }
}

export class AutoInput extends AutoCell<HashDigest> {
  watcher: Promise<void>;
  notifications: Channel<Message> = new Channel();

  private constructor(value: HashDigest, key: string, signal: AbortSignal) {
    super(value, key);
    this.watcher = watch(this, signal);
  }

  static async of(filename: PathLike, signal: AbortSignal): Promise<AutoInput> {
    const value = await fs.readFile(filename).then(hash);
    const ret = new AutoInput(value, filename.toString(), signal);
    return ret;
  }
}

export class Target extends AsyncComputable<HashDigest> {}

export function hash(input: BinaryLike): HashDigest {
  const hash = crypto.createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
}

/** Implements leading-edge debounce on an asynchronous event stream. */
async function* debounce<T>(events: AsyncIterable<T>, delay: number): AsyncGenerator<T> {
  let begin = Date.now() - delay; // allow first event to pass through
  for await (const event of events) {
    const now = Date.now();
    if (now - begin >= delay) {
      begin = now;
      yield event;
    }
  }
}

async function watch(input: Input, signal: AbortSignal): Promise<void> {
  const filename = input.key;
  try {
    const watcher = fs.watch(filename, { signal });
    for await (const event of debounce(watcher, 1000)) {
      input.value = await fs.readFile(filename).then(hash);
      input.notifications.send({ filename, event });
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return;
    }
    throw err;
  }
}
