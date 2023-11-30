import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, before, after } from 'node:test';

import { Message, WatchGroup } from '../src/watch.js';

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
    await fs.writeFile(filename, 'test');

    const { signal } = ac;
    const group = new WatchGroup(signal);
    group.add(dirname);

    const channel = group.watches.find((watch) => watch.filename === dirname)?.channel;
    assert.notEqual(channel, undefined);

    const messages: Message[] = [];

    const consumer = (async () => {
      for await (const message of channel!.receive()) {
        if (message === undefined) continue;
        messages.push(message);
      }
    })();

    group.open();

    await fs.writeFile(filename, 'changed');

    channel?.close();
    await consumer;
    ac.abort();
    await group.close();

    assert.deepStrictEqual(messages, [
      { filename: dirname, event: { eventType: 'change', filename: path.basename(filename) } },
    ]);
  });
});
