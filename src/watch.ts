import { PathLike } from 'node:fs';
import fs, { FileChangeInfo } from 'node:fs/promises';

export type WatchFunction<A> = (filename: PathLike, event: FileChangeInfo<string>) => Promise<A>;

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

export async function watch(
  filename: PathLike,
  signal: AbortSignal,
  f: WatchFunction<void>,
): Promise<void> {
  try {
    const watcher = fs.watch(filename, { signal });
    console.debug('Watching for changes to', filename);
    for await (const event of debounce(watcher, 1000)) {
      await f(filename, event);
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
  readonly watched: Set<PathLike> = new Set();

  private pending: Promise<void>[] = [];

  private signal: AbortSignal;

  private f: WatchFunction<void>;

  constructor(signal: AbortSignal, f: WatchFunction<void>) {
    this.signal = signal;
    this.f = f;
  }

  add(filename: PathLike): void {
    if (this.watched.has(filename)) return;
    this.watched.add(filename);
  }

  open(): void {
    for (const filename of this.watched) {
      this.pending.push(watch(filename, this.signal, this.f));
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.pending);
  }
}
