import assert from 'node:assert';
import { PathLike } from 'node:fs';
import fs, { FileChangeInfo } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';

import { WatchFunction, WatchGroup } from '../src/index.js';

function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}

const kSleepDuration = 1001;

const pause = sleep.bind(null, kSleepDuration);

test('basic', async () => {
  const dirname = await fs.mkdtemp(path.join(os.tmpdir(), 'incr-watch-test-'));
  const filename = dirname + '/test.txt';

  const events: [PathLike, FileChangeInfo<string>][] = [];
  const f: WatchFunction<void> = async (filename, event) => {
    events.push([filename, event]);
  };

  const ac = new AbortController();
  const { signal } = ac;
  const group = new WatchGroup(signal, f);

  group.add(dirname);

  assert.deepStrictEqual(group.watched, new Set([dirname]));

  await fs.writeFile(filename, 'initial');
  {
    group.open();
    await fs.writeFile(filename, 'changed');
    await pause();
    await fs.writeFile(filename, 'changed again');
    ac.abort();
    await group.close();
  }
  await pause();
  await fs.writeFile(filename, 'changed again again');

  assert.deepStrictEqual(events, [
    [dirname, { eventType: 'change', filename: path.basename(filename) }],
    [dirname, { eventType: 'change', filename: path.basename(filename) }],
  ]);

  await fs.rm(dirname, { recursive: true });
});
