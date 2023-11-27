import assert from 'node:assert';
import { PathLike } from 'node:fs';
import fs, { FileChangeInfo } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, before, after } from 'node:test';

import { WatchFunction, WatchGroup } from '../src/index.js';

import { sleep } from './common.js';

const kSleepDuration = 1001;

const pause = sleep.bind(null, kSleepDuration);

describe('WatchGroup', () => {
  let ac: AbortController;
  let dirname: string;

  before(async () => {
    ac = new AbortController();
    dirname = await fs.mkdtemp(path.join(os.tmpdir(), 'incr-watch-test-'));
  });

  after(async () => {
    ac.abort();
    await fs.rm(dirname, { recursive: true });
  });

  it('should watch a file', async () => {
    const filename = dirname + '/test.txt';

    const events: [PathLike, FileChangeInfo<string>][] = [];
    const f: WatchFunction<void> = async (filename, event) => {
      events.push([filename, event]);
    };

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
  });
});
