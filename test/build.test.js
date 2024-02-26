import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';

import { FileCell, AutoInput, Input, Target, hash } from '../src/build.js';
import { Channel } from '../src/channel.js';
import { Cell } from '../src/core.js';

/** @typedef {import('node:fs').PathLike} PathLike */

/** @typedef {import('../src/build.js').Message} Message */

describe('Output', () => {
  /** @type {AbortController} */
  let ac;
  /** @type {string} */
  let dirname;

  before(async () => {
    ac = new AbortController();
    dirname = await fs.mkdtemp(path.join(os.tmpdir(), 'incr-build-test-'));
  });

  after(async () => {
    ac.abort();
    await fs.rm(dirname, { recursive: true });
  });

  it('should build and rebuild from a Cell', async () => {
    const cellContents = { tag: 'foo', value: 'Hello, world!' };
    const cell = new Cell(cellContents);

    const jsonPath = path.join(dirname, 'out.json');
    const jsonFile = new Target([cell], async (a) => {
      const contents = JSON.stringify(await a.value);
      await fs.writeFile(jsonPath, contents);
      return hash(contents);
    }).compute();

    const jsonFileHash = await jsonFile.value;
    const jsonFileContents = await fs.readFile(jsonPath, 'utf8');
    assert.equal(hash(jsonFileContents), jsonFileHash);
    assert.deepEqual(JSON.parse(jsonFileContents), cellContents);
    assert.equal(jsonFile.shouldRebuild, false);

    cell.value = { ...cell.value, value: 'Goodbye, world!' };
    assert.equal(jsonFile.shouldRebuild, true);

    const jsonFileHashUpdated = await jsonFile.compute().value;
    const jsonFileContentsUpdated = await fs.readFile(jsonPath, 'utf8');
    assert.equal(hash(jsonFileContentsUpdated), jsonFileHashUpdated);
    assert.deepEqual(JSON.parse(jsonFileContentsUpdated), cell.value);
  });
});

describe('Input', () => {
  /** @type {string} */
  let dirname;

  before(async () => {
    dirname = await fs.mkdtemp(path.join(os.tmpdir(), 'incr-build-test-'));
  });

  after(async () => {
    await fs.rm(dirname, { recursive: true });
  });

  it('can be used with Target to build and rebuild a file', async () => {
    const hello = path.join(dirname, 'hello.txt');
    const world = path.join(dirname, 'world.txt');
    const out = path.join(dirname, 'out.txt');
    const helloContents = 'Hello, ';
    const worldContents = 'world!';
    await fs.writeFile(hello, helloContents);
    await fs.writeFile(world, worldContents);

    /** @type {Channel<Message>} */
    const notifications = new Channel();
    const consumer = (async () => {
      for await (const message of notifications.receive()) {
        if (message?.filename === hello) break;
      }
      return true;
    })();

    const helloInput = await Input.of(hello, notifications);
    const worldInput = await Input.of(world, notifications);
    assert.equal(helloInput.value, hash(helloContents));
    assert.equal(worldInput.value, hash(worldContents));

    const outTarget = new Target(
      [helloInput, worldInput],
      async (a, b) => {
        const helloContents = await fs.readFile(a.key);
        const worldContents = await fs.readFile(b.key);
        const contents = `${helloContents}${worldContents}`;
        await fs.writeFile(out, contents);
        return hash(contents);
      },
      out,
    ).compute();

    assert.deepEqual(helloInput.parents, [outTarget]);
    assert.deepEqual(worldInput.parents, [outTarget]);
    assert.deepEqual(outTarget.children, [helloInput, worldInput]);

    const outHash = await outTarget.value;
    const outContents = await fs.readFile(out);
    assert.equal(hash(outContents), outHash);
    assert.equal(outContents.toString(), 'Hello, world!');

    await fs.writeFile(hello, 'Goodbye, ');
    const received = await consumer;
    assert.ok(received);

    const outHashUpdated = await outTarget.compute().value;
    const outContentsUpdated = await fs.readFile(out);
    assert.equal(hash(outContentsUpdated), outHashUpdated);
    assert.equal(outContentsUpdated.toString(), 'Goodbye, world!');
    assert.notEqual(outHash, outHashUpdated);

    notifications.close();
    await Promise.all([helloInput.close(), worldInput.close()]);
  });

  it('.from() can be used to convert a FileCell to an Input', async () => {
    const foo = path.join(dirname, 'foo.txt');
    const out = path.join(dirname, 'out.txt');
    const helloContents = 'Hello, world!';
    await fs.writeFile(foo, helloContents);
    const file = await FileCell.of(foo);
    const target = new Target(
      [file],
      async (a) => {
        const contents = await fs.readFile(a.key);
        await fs.writeFile(out, contents);
        return hash(contents);
      },
      out,
    ).compute();

    await target.value;
    assert.deepEqual(file.parents, [target]);
    assert.deepEqual(target.children, [file]);

    const input = Input.from(file);
    assert.deepEqual(file.parents, []);
    assert.deepEqual(target.children, [input]);
    assert.deepEqual(input.parents, [target]);

    await input.close();
  });
});

describe('AutoInput', () => {
  /** @type {string} */
  let dirname;

  before(async () => {
    dirname = await fs.mkdtemp(path.join(os.tmpdir(), 'incr-build-test-'));
  });

  after(async () => {
    await fs.rm(dirname, { recursive: true });
  });

  it('can be used with Target to build and automatically rebuild a file', async () => {
    const hello = path.join(dirname, 'hello.txt');
    const world = path.join(dirname, 'world.txt');
    const out = path.join(dirname, 'out.txt');
    const helloContents = 'Hello, ';
    const worldContents = 'world!';
    await fs.writeFile(hello, helloContents);
    await fs.writeFile(world, worldContents);

    /** @type {Channel<Message>} */
    const notifications = new Channel();
    const consumer = (async () => {
      for await (const message of notifications.receive()) {
        if (message?.filename === hello) break;
      }
      return true;
    })();

    const helloInput = await AutoInput.of(hello, notifications);
    const worldInput = await AutoInput.of(world, notifications);
    assert.equal(helloInput.value, hash(helloContents));
    assert.equal(worldInput.value, hash(worldContents));

    const outTarget = new Target(
      [helloInput, worldInput],
      async (a, b) => {
        const helloContents = await fs.readFile(a.key);
        const worldContents = await fs.readFile(b.key);
        const contents = `${helloContents}${worldContents}`;
        await fs.writeFile(out, contents);
        return hash(contents);
      },
      out,
    ).compute();

    const outHash = await outTarget.value;
    const outContents = await fs.readFile(outTarget.key);
    assert.equal(hash(outContents), outHash);
    assert.equal(outContents.toString(), 'Hello, world!');
    assert.equal(helloInput.value, hash(helloContents));

    const goodbye = 'Goodbye, ';

    await fs.writeFile(hello, goodbye);
    const received = await consumer;
    assert.ok(received);
    assert.equal(helloInput.value, hash(goodbye));

    const outHashUpdated = await outTarget.value;
    const outContentsUpdated = await fs.readFile(outTarget.key);
    assert.equal(hash(outContentsUpdated), outHashUpdated);
    assert.equal(outContentsUpdated.toString(), 'Goodbye, world!');
    assert.notEqual(outHash, outHashUpdated);

    notifications.close();
    await Promise.all([helloInput.close(), worldInput.close()]);
  });

  it('.from() can be used to convert a FileCell to an AutoInput', async () => {
    const bar = path.join(dirname, 'bar.txt');
    const out = path.join(dirname, 'out.txt');
    const helloContents = 'Hello, world!';
    await fs.writeFile(bar, helloContents);

    const file = await FileCell.of(bar);

    const target = new Target(
      [file],
      async (a) => {
        const contents = await fs.readFile(a.key);
        await fs.writeFile(out, contents);
        return hash(contents);
      },
      out,
    ).compute();

    await target.value;
    assert.deepEqual(file.parents, [target]);
    assert.deepEqual(target.children, [file]);

    const autoInput = AutoInput.from(file);
    assert.deepEqual(autoInput.parents, [target]);
    assert.deepEqual(target.children, [autoInput]);
    assert.deepEqual(file.parents, []);

    await autoInput.close();
  });

  it('can be instantiated n times to watch for file changes', async () => {
    const length = 100;

    /** @type {string[]} */
    const files = Array.from({ length }, (_, i) =>
      path.join(dirname, `test-${i.toString().padStart(3, '0')}.txt`),
    );

    await Promise.all(
      files.map((file, i) => fs.writeFile(file, `hello-${i.toString().padStart(3, '0')}`)),
    );

    const watchedInputs = await Promise.all(files.map((file) => WatchedInput.of(file)));

    await Promise.all(
      files.map((file, i) => fs.writeFile(file, `goodbye-${i.toString().padStart(3, '0')}`)),
    );

    await Promise.all(watchedInputs.map((watched) => watched.consumer));

    for (const [i, watched] of watchedInputs.entries()) {
      assert.equal(watched.input.value, hash(`goodbye-${i.toString().padStart(3, '0')}`));
    }

    await Promise.all(watchedInputs.map((watched) => watched.close()));
  });
});

class WatchedInput {
  /**
   * @readonly
   * @type {AutoInput}
   */
  input;

  /**
   * @readonly
   * @type {Promise<void>}
   */
  consumer;

  /**
   * @param {AutoInput} input
   * @param {Promise<void>} consumer
   */
  constructor(input, consumer) {
    this.input = input;
    this.consumer = consumer;
  }

  /**
   * @param {PathLike} filename
   * @returns {Promise<WatchedInput>}
   */
  static async of(filename) {
    /** @type {Channel<Message>} */
    const notifications = new Channel();
    const input = await AutoInput.of(filename, notifications);
    const consumer = (async () => {
      for await (const message of notifications.receive()) {
        if (message?.filename === filename) break;
      }
    })();
    return new WatchedInput(input, consumer);
  }

  /** @returns {Promise<void>} */
  async close() {
    this.input.notifications?.close();
    this.input.close();
    await this.consumer;
  }
}
