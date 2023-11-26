import assert from 'node:assert';
import test from 'node:test';

import { Leaf, Target } from '../src/index.js';

test('basic', () => {
  let count = 0;

  const y = new Leaf(2);
  const z = new Leaf(3);
  const x = new Target([y, z], function (this: any, a, b): number {
    count += 1;
    return a.value + b.value;
  });

  assert.deepStrictEqual(x.children, [y, z]);
  assert.deepStrictEqual(y.parents, [x]);
  assert.deepStrictEqual(z.parents, [x]);

  assert.strictEqual(x.value, undefined);
  x.update();
  assert.strictEqual(x.value, 5);

  y.value = 4;
  y.update();
  assert.strictEqual(x.value, 7);

  z.value = 5;
  z.update();
  assert.strictEqual(x.value, 9);

  assert.strictEqual(count, 3);
});

test('compound', () => {
  const z = new Leaf(3);
  const y = new Leaf(2);
  const x = new Target(
    [y, z],
    function (this: any, a, b): number {
      return a.value + b.value;
    },
    'foo',
  );
  const w = new Leaf('bar');
  const v = new Target([w, x], (a, b) => `foo${a.value}-${b.value}`);

  assert.strictEqual(x.id, 'foo');

  assert.deepStrictEqual(x.parents, [v]);
  assert.deepStrictEqual(v.children, [w, x]);
  x.update();
  assert.strictEqual(v.value, 'foobar-5');

  y.accept({
    visitLeaf: (l: Leaf<number>) => {
      l.value = 1;
    },
    visitTarget: (_: Target<number>) => {
      return;
    },
  });
  v.build();
  assert.strictEqual(v.value, 'foobar-4');
});
