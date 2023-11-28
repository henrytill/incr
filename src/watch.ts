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

function isWatched(group: WatchGroup, filename: PathLike): boolean {
  return group.watches.find((watch) => watch.filename === filename) !== undefined;
}

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

async function makeWatcher(
  input: Pick<Watch, 'filename' | 'channel'>,
  signal: AbortSignal,
): Promise<void> {
  const { filename, channel } = input;
  try {
    const watcher = fs.watch(filename, { signal });
    console.debug('Watching for changes to', filename);
    for await (const event of debounce(watcher, 1000)) {
      channel.send({ filename, event });
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.debug('Aborting watch of', filename);
      return;
    }
    throw err;
  }
}

export class WatchGroup {
  readonly watches: Watch[] = [];

  private signal: AbortSignal;

  constructor(signal: AbortSignal) {
    this.signal = signal;
  }

  add(filename: PathLike): void {
    if (isWatched(this, filename)) {
      return;
    }
    const channel: Channel<Message> = new Channel();
    this.watches.push({ filename, channel });
  }

  open(): void {
    for (const w of this.watches) {
      w.watcher = makeWatcher(w, this.signal);
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.watches.map((watch) => watch.watcher));
  }
}
