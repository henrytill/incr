import crypto, { BinaryLike } from 'node:crypto';
import { PathLike } from 'node:fs';
import fs from 'node:fs/promises';

import { Channel } from './channel.js';
import { NodeVisitor, Cell, Computable } from './tree.js';
import { debounce } from './watch.js';

export type HashDigest = string;

type BuildVisitor<A> = NodeVisitor<Promise<HashDigest>, A>;

const findRootsVisitor: BuildVisitor<Target[]> = {
  visitCell: (node) => {
    if (node.parents.length === 0) {
      return [];
    } else {
      return node.parents.flatMap((parent) => parent.accept(findRootsVisitor));
    }
  },
  visitComputable: (node) => {
    if (node.parents.length === 0) {
      return [node];
    } else {
      return node.parents.flatMap((parent) => parent.accept(findRootsVisitor));
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
        root.compute();
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

export class Input extends Cell<Promise<HashDigest>> {
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
    const ret = new Input(value, filename.toString(), signal);
    return ret;
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

export class Target extends Computable<Promise<HashDigest>> {}
