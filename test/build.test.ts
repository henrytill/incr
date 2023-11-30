import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';

import { AutoInput, Input, Target, hash } from '../src/build.js';
import { Cell } from '../src/core.js';

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

  it('should build and rebuild a file', async () => {
    const hello = path.join(dirname, 'hello.txt');
    const world = path.join(dirname, 'world.txt');
    const out = path.join(dirname, 'out.txt');

    const helloContents = 'Hello, ';
    const worldContents = 'world!';

    await fs.writeFile(hello, helloContents);
    await fs.writeFile(world, worldContents);

    const { signal } = ac;

    const helloInput = await Input.of(hello, signal);
    const worldInput = await Input.of(world, signal);

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

    helloInput.notifications.close();
    ac.abort();
    await Promise.all([helloInput.watcher, worldInput.watcher]);
  });

  it('should build and rebuild a file from a non-file leaf node', async () => {
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

describe('AutoInput', () => {
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

  it('should build and rebuild a file automatically', async () => {
    const hello = path.join(dirname, 'hello.txt');
    const world = path.join(dirname, 'world.txt');
    const out = path.join(dirname, 'out.txt');

    const helloContents = 'Hello, ';
    const worldContents = 'world!';

    await fs.writeFile(hello, helloContents);
    await fs.writeFile(world, worldContents);

    const { signal } = ac;

    const helloInput = await AutoInput.of(hello, signal);
    const worldInput = await AutoInput.of(world, signal);

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
  });
});
