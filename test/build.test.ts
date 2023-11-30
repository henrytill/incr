import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';

import { AsyncCell } from '../src/async.js';
import { Input, Target, hash } from '../src/build.js';

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

    const helloInput = Input.of(hello, signal);
    const worldInput = Input.of(world, signal);

    const consumer = (async () => {
      for await (const filename of helloInput.notifications.receive()) {
        if (filename === hello) break;
      }
    })();

    const helloHash = await helloInput.value;
    const worldHash = await worldInput.value;
    assert.strictEqual(helloHash, hash(helloContents));
    assert.strictEqual(worldHash, hash(worldContents));

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
    await consumer;

    const outHashUpdated = await outTarget.value;
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

    const cell = AsyncCell.resolve(contents);

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

    cell.value = cell.value.then((contents) => {
      return { ...contents, value: 'Goodbye, world!' };
    });

    const contentsUpdated = await cell.value;

    assert.strictEqual(jsonFile.shouldRebuild, true);

    const jsonFileHashUpdated = await jsonFile.compute().value;

    const jsonFileContentsUpdated = await fs.readFile(json, 'utf8');
    assert.strictEqual(hash(jsonFileContentsUpdated), jsonFileHashUpdated);
    assert.deepStrictEqual(JSON.parse(jsonFileContentsUpdated), contentsUpdated);
  });
});
