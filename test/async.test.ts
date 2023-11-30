import assert from 'node:assert';
import { describe, it } from 'node:test';

import { AsyncCell, AsyncAutoCell, AsyncComputable } from '../src/async.js';
import { Cell } from '../src/core.js';

describe('AsyncComputable', () => {
  it('works with Cell', async () => {
    const z = new Cell(1);
    const y = new Cell(2);

    const x = new AsyncComputable([y, z], async (a, b) => {
      return a.value + b.value;
    });

    const w = new Cell(3);
    const v = new AsyncComputable([w, x], async (a, b) => {
      return a.value + (await b.value);
    });

    const u = new Cell(4);
    const t = new AsyncComputable([u, v], async (a, b) => {
      return a.value + (await b.value);
    });

    assert.strictEqual(await t.compute().value, 10);

    z.value = 2;

    assert.strictEqual(await t.compute().value, 11);
  });

  it('works with AsyncCell', async () => {
    const z = AsyncCell.resolve(1);
    const y = AsyncCell.resolve(2);

    const x = new AsyncComputable([y, z], async (a, b) => {
      return await Promise.all([a.value, b.value]).then(([x, y]) => x + y);
    });

    const w = AsyncCell.resolve(3);
    const v = new AsyncComputable([w, x], async (a, b) => {
      return await Promise.all([a.value, b.value]).then(([x, y]) => x + y);
    });

    const u = AsyncCell.resolve(4);
    const t = new AsyncComputable([u, v], async (a, b) => {
      return await Promise.all([a.value, b.value]).then(([x, y]) => x + y);
    });

    assert.strictEqual(await t.compute().value, 10);

    z.value = Promise.resolve(2);
    await z.value;

    assert.strictEqual(await t.compute().value, 11);
  });

  it('works with AsyncAutoCell', async () => {
    const z = AsyncAutoCell.resolve(1);
    const y = AsyncAutoCell.resolve(2);

    const x = new AsyncComputable([y, z], async (a, b) => {
      return await Promise.all([a.value, b.value]).then(([x, y]) => x + y);
    });

    const w = AsyncAutoCell.resolve(3);
    const v = new AsyncComputable([w, x], async (a, b) => {
      return await Promise.all([a.value, b.value]).then(([x, y]) => x + y);
    });

    const u = AsyncAutoCell.resolve(4);
    const t = new AsyncComputable([u, v], async (a, b) => {
      return await Promise.all([a.value, b.value]).then(([x, y]) => x + y);
    });

    assert.strictEqual(await t.compute().value, 10);

    z.value = Promise.resolve(2);
    await z.value;

    assert.strictEqual(await t.value, 11);
  });
});
