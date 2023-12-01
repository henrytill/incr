import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';

import { AutoInput, Input, Target, hash } from '../src/build.js';
import { Cell } from '../src/core.js';
import { PathLike } from 'node:fs';

describe('Output', () => {
  let ac: AbortController;
  let dirname: string;

  before(async () => {
    ac = new AbortController();
    dirname = await fs.mkdtemp(path.join(os.tmpdir(), 'incr-build-test-'));
  });

  after(async () => {
    ac.abort();
    await fs.rm(dirname, { recursive: true });
  });

  it('should build and rebuild from a Cell', async () => {
    const json = path.join(dirname, 'out.json');

    const contents = { tag: 'foo', value: 'Hello, world!' };

    const cell = new Cell(contents);

    const jsonFile = new Target([cell], async (a) => {
      const contents = JSON.stringify(await a.value);
      await fs.writeFile(json, contents);
      return hash(contents);
    }).compute();

    const jsonFileHash = await jsonFile.value;

    const jsonFileContents = await fs.readFile(json, 'utf8');
    assert.strictEqual(hash(jsonFileContents), jsonFileHash);
    assert.deepStrictEqual(JSON.parse(jsonFileContents), contents);

    assert.strictEqual(jsonFile.shouldRebuild, false);

    cell.value = { ...cell.value, value: 'Goodbye, world!' };

    assert.strictEqual(jsonFile.shouldRebuild, true);

    const jsonFileHashUpdated = await jsonFile.compute().value;

    const jsonFileContentsUpdated = await fs.readFile(json, 'utf8');
    assert.strictEqual(hash(jsonFileContentsUpdated), jsonFileHashUpdated);
    assert.deepStrictEqual(JSON.parse(jsonFileContentsUpdated), cell.value);
  });
});

describe('Input', () => {
  let dirname: string;

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

    const helloInput = await Input.of(hello);
    const worldInput = await Input.of(world);

    const consumer = (async () => {
      for await (const message of helloInput.notifications.receive()) {
        if (message?.filename === hello) break;
      }
      return true;
    })();

    assert.strictEqual(helloInput.value, hash(helloContents));
    assert.strictEqual(worldInput.value, hash(worldContents));

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

    assert.deepStrictEqual(helloInput.parents, [outTarget]);
    assert.deepStrictEqual(worldInput.parents, [outTarget]);
    assert.deepStrictEqual(outTarget.children, [helloInput, worldInput]);

    const outHash = await outTarget.value;
    const outContents = await fs.readFile(out);
    assert.strictEqual(hash(outContents), outHash);
    assert.strictEqual(outContents.toString(), 'Hello, world!');

    await fs.writeFile(hello, 'Goodbye, ');
    const received = await consumer;
    assert.ok(received);

    const outHashUpdated = await outTarget.compute().value;
    const outContentsUpdated = await fs.readFile(out);
    assert.strictEqual(hash(outContentsUpdated), outHashUpdated);
    assert.strictEqual(outContentsUpdated.toString(), 'Goodbye, world!');
    assert.notStrictEqual(outHash, outHashUpdated);

    await Promise.all([helloInput.close(), worldInput.close()]);
  });
});

describe('AutoInput', () => {
  let dirname: string;

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

    const helloInput = await AutoInput.of(hello);
    const worldInput = await AutoInput.of(world);

    const consumer = (async () => {
      for await (const message of helloInput.notifications.receive()) {
        if (message?.filename === hello) break;
      }
      return true;
    })();

    assert.strictEqual(helloInput.value, hash(helloContents));
    assert.strictEqual(worldInput.value, hash(worldContents));

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
    assert.strictEqual(hash(outContents), outHash);
    assert.strictEqual(outContents.toString(), 'Hello, world!');
    assert.strictEqual(helloInput.value, hash(helloContents));

    const goodbye = 'Goodbye, ';

    await fs.writeFile(hello, goodbye);
    const received = await consumer;
    assert.ok(received);

    assert.strictEqual(helloInput.value, hash(goodbye));

    const outHashUpdated = await outTarget.value;
    const outContentsUpdated = await fs.readFile(outTarget.key);
    assert.strictEqual(hash(outContentsUpdated), outHashUpdated);
    assert.strictEqual(outContentsUpdated.toString(), 'Goodbye, world!');
    assert.notStrictEqual(outHash, outHashUpdated);

    await Promise.all([helloInput.close(), worldInput.close()]);
  });

  it('can be instantiated n times to watch for file changes', async () => {
    const n = 100;

    const files: string[] = Array.from({ length: n }, (_, i) =>
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
      assert.strictEqual(watched.input.value, hash(`goodbye-${i.toString().padStart(3, '0')}`));
    }

    await Promise.all(watchedInputs.map((watched) => watched.close()));
  });
});

class WatchedInput {
  constructor(
    readonly input: AutoInput,
    readonly consumer: Promise<void>,
  ) {}

  static async of(filename: PathLike): Promise<WatchedInput> {
    const input = await AutoInput.of(filename);
    const consumer = (async () => {
      for await (const message of input.notifications.receive()) {
        if (message?.filename === filename) break;
      }
    })();
    return new WatchedInput(input, consumer);
  }

  async close(): Promise<void> {
    this.input.close();
    await this.consumer;
  }
}
