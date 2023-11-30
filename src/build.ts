import crypto, { BinaryLike } from 'node:crypto';
import { PathLike } from 'node:fs';
import fs from 'node:fs/promises';

import { AsyncComputable } from './async.js';
import { Channel } from './channel.js';
import { debounce, Message } from './watch.js';
import { Cell } from './core.js';

export type HashDigest = string;

export function hash(input: BinaryLike): HashDigest {
  const hash = crypto.createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
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

export class Input extends Cell<HashDigest> {
  watcher: Promise<void>;
  notifications: Channel<Message> = new Channel();

  private constructor(value: HashDigest, key: string, signal: AbortSignal) {
    super(value, key);
    this.watcher = watch(this, signal);
  }

  static async of(filename: PathLike, signal: AbortSignal): Promise<Input> {
    if (typeof filename !== 'string') throw new TypeError('filename must be a string');
    const value = await fs.readFile(filename).then(hash);
    const ret = new Input(value, filename.toString(), signal);
    return ret;
  }
}

export class Target extends AsyncComputable<HashDigest> {}
