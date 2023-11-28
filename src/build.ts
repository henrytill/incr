import crypto, { BinaryLike } from 'node:crypto';
import { PathLike } from 'node:fs';
import fs from 'node:fs/promises';

import { Channel } from './channel.js';
import { DependencyVisitor, Leaf, Target } from './tree.js';
import { debounce } from './watch.js';

export type HashDigest = string;

type BuildVisitor<A> = DependencyVisitor<Promise<HashDigest>, A>;

const findRootsVisitor: BuildVisitor<Output[]> = {
  leaf: (input) => {
    if (input.parents.length === 0) {
      return [];
    } else {
      return input.parents.flatMap((parent) => parent.accept(findRootsVisitor));
    }
  },
  target: (output) => {
    if (output.parents.length === 0) {
      return [output];
    } else {
      return output.parents.flatMap((parent) => parent.accept(findRootsVisitor));
    }
  },
};

export function hash(input: BinaryLike): HashDigest {
  const hash = crypto.createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
}

async function watch(input: Input, signal: AbortSignal): Promise<void> {
  const filename = input.key;
  try {
    const watcher = fs.watch(filename, { signal });
    console.debug('Watching for changes to', filename);
    for await (const _event of debounce(watcher, 1000)) {
      input.value = fs.readFile(filename).then(hash);
      console.debug('Updating', filename);
      await input.value;
      const roots = input.accept(findRootsVisitor);
      console.debug('Rebuilding', roots.map((root) => root.key).join(', '));
      for (const root of roots) {
        root.build();
      }
      input.notifications.send(filename);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.debug('Aborting watch of', filename);
      return;
    }
    throw err;
  }
}

export class Input extends Leaf<Promise<HashDigest>> {
  watcher: Promise<void>;
  notifications: Channel<string> = new Channel();

  private constructor(value: Promise<HashDigest>, key: string, signal: AbortSignal) {
    super(value, key);
    this.watcher = watch(this, signal);
  }

  static of(filename: PathLike, signal: AbortSignal): Input {
    if (typeof filename !== 'string') {
      throw new TypeError('filename must be a string');
    }
    const value = fs.readFile(filename).then(hash);
    const leaf = new Input(value, filename.toString(), signal);
    return leaf;
  }

  override set value(value: Promise<HashDigest>) {
    this._value = Promise.all([this._value, value]).then(([curr, next]) => {
      if (curr !== next) {
        this.update();
      }
      return next;
    });
  }

  override get value(): Promise<HashDigest> {
    return super.value;
  }
}

export class Output extends Target<Promise<HashDigest>> {}
