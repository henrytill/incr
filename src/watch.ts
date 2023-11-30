import { PathLike } from 'node:fs';
import fs, { FileChangeInfo } from 'node:fs/promises';

import { Channel } from './channel.js';

export type Message = {
  filename: PathLike;
  event: FileChangeInfo<string>;
};

type Watch = {
  filename: PathLike;
  channel: Channel<Message>;
  watcher?: Promise<void>;
};

/**
 * Implements leading-edge debounce on an asynchronous event stream.
 */
export async function* debounce<T>(events: AsyncIterable<T>, delay: number): AsyncGenerator<T> {
  let begin = Date.now() - delay; // allow first event to pass through
  for await (const event of events) {
    const now = Date.now();
    if (now - begin >= delay) {
      begin = now;
      yield event;
    }
  }
}

type WatchInput = Pick<Watch, 'filename' | 'channel'>;

async function watch(input: WatchInput, signal: AbortSignal): Promise<void> {
  const { filename, channel } = input;
  try {
    const watcher = fs.watch(filename, { signal });
    for await (const event of debounce(watcher, 1000)) {
      channel.send({ filename, event });
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return;
    }
    throw err;
  }
}

export class WatchGroup {
  private signal: AbortSignal;
  readonly watches: Watch[] = [];

  constructor(signal: AbortSignal) {
    this.signal = signal;
  }

  add(filename: PathLike): void {
    if (isWatched(this, filename)) return;
    const channel: Channel<Message> = new Channel();
    this.watches.push({ filename, channel });
  }

  open(): void {
    for (const w of this.watches) {
      w.watcher = watch(w, this.signal);
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.watches.map((w) => w.watcher));
  }
}

function isWatched(group: WatchGroup, filename: PathLike): boolean {
  return group.watches.find((watch) => watch.filename === filename) !== undefined;
}
