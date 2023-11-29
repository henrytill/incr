import assert from 'node:assert';
import test from 'node:test';

import { AsyncAutoCell, AsyncComputable } from '../src/async.js';

test('AsyncAutoCell', async () => {
  const x = AsyncAutoCell.resolve(1);
  const y = AsyncAutoCell.resolve(2);

  const z = new AsyncComputable([x, y], async (a, b) => {
    const [x, y] = await Promise.all([a.value, b.value]);
    return x + y;
  }).compute();

  assert.strictEqual(await z.value, 3);

  x.value = Promise.resolve(2);
  await x.value;

  assert.strictEqual(await z.value, 4);
});
